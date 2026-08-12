import { NextResponse } from "next/server";
import { jsonError, isoDate } from "@/lib/api";
import { getSupabase } from "@/lib/supabase.server";
import { calcularSessaoDoArquivo, type SessaoInput, type SessaoEmpregado } from "@/lib/session";
import { mesRange, tierConfigDoBanco, type CriteriaConfig, type DiscountRuleConfig, type TierConfig } from "@/lib/bonusCalculationService";
import { fromReal } from "@/lib/money";
import type { BonusType, MetricType, PessoaOrigem, TierRow, DiscountRuleRow } from "@/lib/types";

const MES_PATTERN = /^\d{4}-\d{2}$/;
const TAMANHO_MAXIMO = 20 * 1024 * 1024; // 20 MB

/**
 * Cálculo por sessão: recebe a planilha via multipart, processa tudo em memória
 * (parse, matching automático, métricas, motor de bonificação) e devolve o
 * resultado. Nenhum dado da planilha é persistido no banco.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Corpo da requisição inválido (multipart esperado).");
  }

  const arquivo = form.get("file");
  const mes = form.get("mes_referencia");
  if (!(arquivo instanceof File) || typeof mes !== "string") {
    return jsonError("Envie a planilha (campo `file`) e o mês de referência (campo `mes_referencia`).");
  }
  if (!MES_PATTERN.test(mes)) return jsonError("mes_referencia deve estar no formato AAAA-MM (ex.: 2026-07).");
  if (arquivo.size > TAMANHO_MAXIMO) return jsonError("Arquivo muito grande (máximo de 20 MB).");

  const db = await getSupabase();

  // 1. Configuração: setores ativos + critérios ativos + faixas + regras de desconto
  const [setores, criterios, tiers, regras] = await Promise.all([
    db.from("sectors").select("*").eq("ativo", true),
    db.from("bonus_criteria").select("*").eq("ativo", true).order("ordem"),
    db.from("bonus_criteria_tiers").select("*").order("ordem"),
    db.from("sector_discount_rules").select("*").order("min_pontos"),
  ]);
  if (setores.error || criterios.error || tiers.error || regras.error || !setores.data || !criterios.data) {
    return jsonError("Erro ao carregar a configuração de setores.", 500, (setores.error ?? criterios.error ?? tiers.error ?? regras.error)?.message);
  }
  if (setores.data.length === 0 || criterios.data.length === 0) {
    return jsonError("Configure ao menos um setor com critérios ativos antes de calcular.", 422);
  }

  // 2. Colaboradores ativos + aliases de nomes
  const [emps, aliasesDb] = await Promise.all([
    db.from("employees").select("id, nome, sector_id, chave_normalizada, sectors(titulo)").eq("ativo", true),
    db.from("employee_name_aliases").select("employee_id, chave_normalizada"),
  ]);
  if (emps.error || aliasesDb.error) return jsonError("Erro ao carregar colaboradores.", 500, (emps.error ?? aliasesDb.error)?.message);
  if (!emps.data || emps.data.length === 0) return jsonError("Nenhum colaborador ativo cadastrado.", 422);

  // 3. Ocorrências do mês: (employee, criteria) → soma de gravidade
  const { inicio, fim } = mesRange(mes);
  const { data: ocorrencias, error: errOcor } = await db
    .from("occurrences")
    .select("employee_id, gravidade, occurrence_criteria(criteria_id)")
    .gte("data", isoDate(inicio))
    .lt("data", isoDate(fim));
  if (errOcor) return jsonError("Erro ao carregar ocorrências.", 500, errOcor.message);

  const pontosPorCriterio: Record<string, Record<string, number>> = {};
  for (const o of ocorrencias ?? []) {
    const empId = o.employee_id as string;
    const m = (pontosPorCriterio[empId] ??= {});
    for (const lig of (o.occurrence_criteria as unknown as { criteria_id: string }[]) ?? []) {
      m[lig.criteria_id] = (m[lig.criteria_id] ?? 0) + (o.gravidade ?? 0);
    }
  }

  // 4. Monta configuração por setor (mesma semântica do motor: tiers convertidos p/ centavos)
  const criteriosPorSetor: Record<string, { titulo: string; criterios: CriteriaConfig[] }> = {};
  for (const s of setores.data) {
    criteriosPorSetor[s.id] = { titulo: s.titulo, criterios: [] };
  }
  for (const cri of criterios.data) {
    const setor = criteriosPorSetor[cri.sector_id as string];
    if (!setor) continue;
    const listaTiers: TierConfig[] = (tiers.data ?? [])
      .filter((t: TierRow) => t.criteria_id === cri.id)
      .sort((a, b) => (a.a_partir_de ?? 0) - (b.a_partir_de ?? 0) || (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((t) =>
        tierConfigDoBanco(cri.metrica as MetricType, {
          id: t.id,
          a_partir_de: t.a_partir_de ?? 0,
          ate: t.ate == null ? null : t.ate,
          a_cada: t.a_cada == null ? null : t.a_cada,
          valor: t.valor,
          ordem: t.ordem ?? 0,
        })
      );
    setor.criterios.push({
      id: cri.id,
      nome: cri.nome,
      tipo: cri.tipo as BonusType,
      valor: cri.valor == null ? null : Math.round(fromReal(cri.valor)),
      metrica: cri.metrica as MetricType,
      pessoaOrigem: (cri.pessoa_origem ?? null) as PessoaOrigem,
      tiers: listaTiers,
    });
  }

  const regrasPorSetor: Record<string, DiscountRuleConfig[]> = {};
  for (const r of (regras.data ?? []) as DiscountRuleRow[]) {
    (regrasPorSetor[r.sector_id] ??= []).push({
      minPontos: r.min_pontos,
      maxPontos: r.max_pontos,
      percentualManter: r.percentual_manter,
    });
  }

  // 5. Executa a sessão (parse + matching + motor) em memória
  const employees: SessaoEmpregado[] = (emps.data ?? []).map((e) => ({
    id: e.id as string,
    nome: e.nome as string,
    chave: e.chave_normalizada as string,
    sectorId: e.sector_id as string,
    sectorTitulo: ((e.sectors as { titulo?: string } | null)?.titulo) ?? "Setor",
  }));
  const input: SessaoInput = {
    mes,
    criteriosPorSetor,
    regrasPorSetor,
    employees,
    aliases: (aliasesDb.data ?? []).map((a) => ({ employeeId: a.employee_id as string, chave: a.chave_normalizada as string })),
    pontosPorCriterio,
  };

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  try {
    const resultado = await calcularSessaoDoArquivo(bytes, arquivo.name, input);
    return NextResponse.json(resultado);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Falha ao processar a planilha.", 422);
  }
}