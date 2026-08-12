/**
 * Cálculo por sessão: a planilha é parseada em memória, os nomes são casados
 * automaticamente (exato → alias → fuzzy), as métricas Q/R/X são agregadas por
 * colaborador e o motor de bonificação roda na hora. Nada é persistido no banco —
 * apenas setores/critérios, colaboradores e ocorrências permanecem armazenados.
 */

import { parseSpreadsheet, detectHeaderRow, normalizeRow, type NormalizedRow } from "./import";
import { matchName, type EmployeeCandidate, type AliasEntry } from "./matching";
import { calcularCriterio, type CriteriaConfig, type DiscountRuleConfig, type BonusType } from "./bonusCalculationService";
import type { Cents } from "./money";

export interface SessaoEmpregado extends EmployeeCandidate {
  sectorId: string;
  sectorTitulo: string;
}

export interface SessaoInput {
  mes: string; // YYYY-MM
  criteriosPorSetor: Record<string, { titulo: string; criterios: CriteriaConfig[] }>;
  regrasPorSetor: Record<string, DiscountRuleConfig[]>;
  /** Colaboradores ativos do banco (chave normalizada em `chave`). */
  employees: SessaoEmpregado[];
  aliases: AliasEntry[];
  /** Pontos de ocorrência do mês: employeeId → criteriaId → soma de gravidade. */
  pontosPorCriterio: Record<string, Record<string, number>>;
}

export interface ItemSessao {
  employeeId: string;
  nomeColaborador: string;
  sectorId: string;
  setorTitulo: string;
  criterio: { id: string; nome: string; tipo: BonusType };
  resultado: number;
  unidade: string;
  bonusBruto: Cents;
  pontos: number;
  percentualManter: number;
  bonusFinal: Cents;
}

export interface AvisoSessao {
  coluna: "quem_agendou" | "quem_atendeu";
  nome: string;
  qtdLinhas: number;
}

export interface ResultadoSessao {
  mes: string;
  arquivo: string;
  headerRow: number;
  linhasMes: number;
  /** Soma de X (Valor Faturado) de todas as linhas únicas do mês — base dos critérios por faixa. */
  faturamentoTotal: Cents;
  avisos: AvisoSessao[];
  itens: ItemSessao[];
  totais: { bruto: Cents; descontos: Cents; final: Cents };
}

interface MetricasEmp {
  agendamentos: number;
  atendimentos: number;
  valorAgendou: Cents;
  valorAtendeu: Cents;
}

const METRICAS_ZERO: MetricasEmp = { agendamentos: 0, atendimentos: 0, valorAgendou: 0, valorAtendeu: 0 };
const STATUS_COMPUTADOS = ["exato", "alias", "fuzzy"];

/** Calcula a sessão a partir das linhas já parseadas (síncrono e testável). */
export function calcularSessaoDeLinhas(linhas: string[][], input: SessaoInput): ResultadoSessao {
  const detectado = detectHeaderRow(linhas);
  if (!detectado) {
    throw new Error(
      "Cabeçalho não reconhecido — confira se a planilha tem as colunas (ex.: Quem Agendou, Quem Atendeu, Valor Faturado)."
    );
  }

  const rows: NormalizedRow[] = [];
  for (let r = detectado.headerRow + 1; r < linhas.length; r++) {
    const nr = normalizeRow(linhas[r], detectado.mapping, r + 1);
    if (nr) rows.push(nr);
  }

  const doMes = rows.filter((r) => r.dataChave === input.mes);
  if (doMes.length === 0) {
    const semData = rows.filter((r) => r.dataChave === null).length;
    const outrosMes = rows.filter((r) => r.dataChave !== null && r.dataChave !== input.mes).length;
    throw new Error(`Nenhuma linha encontrada para ${input.mes}. Linhas sem data: ${semData}; de outros meses: ${outrosMes}.`);
  }

  // Dedupe de linhas idênticas (mesma assinatura)
  const vistos = new Set<string>();
  const unicos: NormalizedRow[] = [];
  for (const r of doMes) {
    if (vistos.has(r.hashLinha)) continue;
    vistos.add(r.hashLinha);
    unicos.push(r);
  }

  // Faturamento total do mês: cada linha única entra uma única vez (base dos critérios por faixa)
  const faturamentoTotal = unicos.reduce((acc, r) => acc + r.valorFaturado, 0);

  // 1. Métricas por colaborador + avisos de nomes sem correspondência
  const metricas = new Map<string, MetricasEmp>();
  const avisos = new Map<string, AvisoSessao>();
  const tocar = (empId: string): MetricasEmp => {
    let m = metricas.get(empId);
    if (!m) {
      m = { ...METRICAS_ZERO };
      metricas.set(empId, m);
    }
    return m;
  };
  const contaAviso = (coluna: "quem_agendou" | "quem_atendeu", nome: string, chave: string) => {
    const chaveAviso = `${coluna}:${chave}`;
    const a = avisos.get(chaveAviso);
    if (a) a.qtdLinhas++;
    else avisos.set(chaveAviso, { coluna, nome, qtdLinhas: 1 });
  };

  for (const r of unicos) {
    if (r.chaveAgendou) {
      const m = matchName(r.nomeAgendou!, input.employees, input.aliases);
      if (m.employeeId && STATUS_COMPUTADOS.includes(m.status)) {
        const emp = tocar(m.employeeId);
        emp.agendamentos++;
        emp.valorAgendou += r.valorFaturado;
      } else if (m.status === "revisar" || m.status === "nao_encontrado") {
        contaAviso("quem_agendou", r.nomeAgendou!, r.chaveAgendou);
      }
    }
    if (r.chaveAtendeu) {
      const m = matchName(r.nomeAtendeu!, input.employees, input.aliases);
      if (m.employeeId && STATUS_COMPUTADOS.includes(m.status)) {
        const emp = tocar(m.employeeId);
        emp.atendimentos++;
        emp.valorAtendeu += r.valorFaturado;
      } else if (m.status === "revisar" || m.status === "nao_encontrado") {
        contaAviso("quem_atendeu", r.nomeAtendeu!, r.chaveAtendeu);
      }
    }
  }

  // 2. Cálculo por colaborador × critério do setor
  const itens: ItemSessao[] = [];
  for (const emp of input.employees) {
    const setor = input.criteriosPorSetor[emp.sectorId];
    if (!setor || setor.criterios.length === 0) continue;
    const m = metricas.get(emp.id) ?? METRICAS_ZERO;
    const pontos = input.pontosPorCriterio[emp.id] ?? {};
    const regras = input.regrasPorSetor[emp.sectorId] ?? [];

    for (const c of setor.criterios) {
      const origemValor =
        c.pessoaOrigem === "quem_atendeu" ? m.valorAtendeu
        : c.pessoaOrigem === "quem_agendou" ? m.valorAgendou
        : 0;
      const metrica =
        c.tipo === "por_faixa" ? faturamentoTotal
        : c.metrica === "agendamentos" ? m.agendamentos
        : c.metrica === "atendimentos" ? m.atendimentos
        : c.metrica === "valor_faturado" ? origemValor
        : 0;
      const r = calcularCriterio({ criterio: c, metrica, pontos: pontos[c.id] ?? 0, regrasDesconto: regras });
      itens.push({
        employeeId: emp.id,
        nomeColaborador: emp.nome,
        sectorId: emp.sectorId,
        setorTitulo: setor.titulo,
        criterio: { id: c.id, nome: c.nome, tipo: c.tipo },
        resultado: r.resultado,
        unidade: r.unidade,
        bonusBruto: r.bonusBruto,
        pontos: r.pontos,
        percentualManter: r.percentualManter,
        bonusFinal: r.bonusDescontado,
      });
    }
  }

  // 3. Totais
  const bruto = itens.reduce((acc, i) => acc + i.bonusBruto, 0);
  const final = itens.reduce((acc, i) => acc + i.bonusFinal, 0);

  return {
    mes: input.mes,
    arquivo: "",
    headerRow: detectado.headerRow + 1,
    linhasMes: unicos.length,
    faturamentoTotal,
    avisos: [...avisos.values()].sort((a, b) => b.qtdLinhas - a.qtdLinhas),
    itens,
    totais: { bruto, descontos: bruto - final, final },
  };
}

/** Calcula a sessão a partir dos bytes do arquivo (parse via SheetJS, server-side). */
export async function calcularSessaoDoArquivo(bytes: Buffer, nomeArquivo: string, input: SessaoInput): Promise<ResultadoSessao> {
  const linhas = await parseSpreadsheet(bytes);
  const resultado = calcularSessaoDeLinhas(linhas, input);
  return { ...resultado, arquivo: nomeArquivo };
}