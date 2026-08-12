/**
 * Motor de cálculo de bonificação — puro, determinístico e testável sem interface.
 * Regras:
 *  - FIXA: paga o valor definido a colaboradores ativos do setor no mês; redução via pontos
 *    de ocorrências do próprio critério.
 *  - POR RESULTADO: valor × métrica (agendamentos / atendimentos / faturamento).
 *  - POR FAIXA: métrica sempre o FATURAMENTO TOTAL do mês (sem origem); dois modos em bonus_criteria_tiers:
 *      (a) INTERVALO (a_cada preenchido): floor(métrica ÷ a_cada) × valor
 *          ex.: R$ 100 a cada R$ 100.000 faturados → 250.000 → R$ 200.
 *      (b) FAIXAS PROGRESSIVAS NÃO CUMULATIVAS (ate preenchido): valor da faixa atingida.
 *  - Desconto por ocorrências é aplicado POR CRITÉRIO individualmente (nunca pontuação global).
 */

import { Cents, CENTS_ZERO, fromReal, floorDivInt, mulCents, pctOf } from "./money";

export type BonusType = "fixa" | "por_resultado" | "por_faixa";
export type MetricType = "agendamentos" | "atendimentos" | "valor_faturado" | "nenhuma";
export type PessoaOrigem = "quem_atendeu" | "quem_agendou" | null;

export interface TierConfig {
  id: string;
  aPartirDe: number; // 0 por padrão; unidade da métrica (contagem ou centavos)
  ate: number | null;
  aCada: number | null;
  valor: Cents;
  ordem: number;
}

export interface CriteriaConfig {
  id: string;
  nome: string;
  tipo: BonusType;
  valor: Cents | null; // null ⇒ usar tiers (por_faixa)
  metrica: MetricType;
  pessoaOrigem: PessoaOrigem;
  tiers: TierConfig[];
}

export interface DiscountRuleConfig {
  minPontos: number;
  maxPontos: number | null;
  percentualManter: number; // 0..100
}

export interface EmployeeMetrics {
  agendamentos: number;
  atendimentos: number;
  valorFaturado: Cents;
}

/** Ponto de ocorrência acumulado por critério, para um colaborador, no mês de referência. */
export type OcorrenciasPorCriterio = Record<string, number>;

export interface CriterionResult {
  criteriaId: string;
  criterioNome: string;
  tipo: BonusType;
  resultado: number; // contagem ou centavos (valor_faturado)
  unidade: string; // "agendamentos" | "atendimentos" | "R$" | "-"
  bonusBruto: Cents;
  pontos: number;
  percentualManter: number;
  bonusDescontado: Cents;
}

export function unidadeDe(metrica: MetricType): string {
  switch (metrica) {
    case "agendamentos": return "agendamentos";
    case "atendimentos": return "atendimentos";
    case "valor_faturado": return "R$";
    default: return "-";
  }
}

/**
 * Converte uma faixa como vem do banco (limites na unidade da métrica — reais quando
 * metrica é valor_faturado, contagem caso contrário; `valor` sempre em reais) para a
 * unidade interna do motor (limites em centavos para dinheiro; `valor` em centavos).
 * Garante que limites e métrica sejam comparados na MESMA unidade dentro do motor.
 */
export function tierConfigDoBanco(
  metrica: MetricType,
  t: { id: string; a_partir_de: number; ate: number | null; a_cada: number | null; valor: number; ordem: number }
): TierConfig {
  const limite = (v: number | null): number | null =>
    v == null ? null : metrica === "valor_faturado" ? fromReal(v) : v;
  return {
    id: t.id,
    aPartirDe: limite(t.a_partir_de) ?? 0,
    ate: limite(t.ate),
    aCada: limite(t.a_cada),
    valor: fromReal(t.valor),
    ordem: t.ordem,
  };
}

/** Bônus bruto de um critério dado o valor da métrica (unidade consistente, centavos p/ dinheiro). */
export function calculaBrutoCritério(crit: CriteriaConfig, metrica: number): Cents {
  switch (crit.tipo) {
    case "fixa":
      return crit.valor ?? CENTS_ZERO;

    case "por_resultado": {
      const valor = crit.valor ?? CENTS_ZERO;
      return mulCents(valor, metrica);
    }

    case "por_faixa": {
      const tiers = [...crit.tiers].sort((a, b) => a.aPartirDe - b.aPartirDe || a.ordem - b.ordem);
      const intervalo = tiers.find((t) => t.aCada != null);
      if (intervalo && intervalo.aCada != null) {
        const vezes = floorDivInt(metrica, intervalo.aCada);
        return mulCents(intervalo.valor, vezes);
      }
      const atendida = tiers.find(
        (t) => metrica >= t.aPartirDe && (t.ate == null || metrica < t.ate)
      );
      return atendida ? atendida.valor : CENTS_ZERO;
    }
  }
}

/**
 * Percentual a manter segundo as regras do setor.
 * Regra aplicada: aquela com maior min_pontos <= pontos; sem regra aplicável → 100%.
 */
export function percentualParaPontos(pontos: number, regras: DiscountRuleConfig[]): number {
  const aplicáveis = regras
    .filter((r) => pontos >= r.minPontos && (r.maxPontos == null || pontos <= r.maxPontos))
    .sort((a, b) => a.minPontos - b.minPontos);
  if (aplicáveis.length === 0) return 100;
  return aplicáveis[aplicáveis.length - 1].percentualManter;
}

export interface CalculateInput {
  criterio: CriteriaConfig;
  metrica: number; // valor da métrica para este colaborador
  pontos: number; // soma de gravidade das ocorrências que afetam este critério (mês)
  regrasDesconto: DiscountRuleConfig[];
}

export function calcularCriterio(input: CalculateInput): CriterionResult {
  const { criterio, metrica, pontos, regrasDesconto } = input;

  const bonusBruto = calculaBrutoCritério(criterio, metrica);
  const percentualManter = percentualParaPontos(pontos, regrasDesconto);
  const bonusDescontado = pctOf(bonusBruto, percentualManter);

  return {
    criteriaId: criterio.id,
    criterioNome: criterio.nome,
    tipo: criterio.tipo,
    resultado: metrica,
    unidade: unidadeDe(criterio.metrica),
    bonusBruto,
    pontos,
    percentualManter,
    bonusDescontado,
  };
}

/** Executa o cálculo de todos os critérios de um setor para um colaborador.
 * Critérios POR FAIXA avaliam o faturamento total do mês (faturamentoTotal),
 * não as métricas individuais — por isso não têm origem. */
export function calcularColaborador(
  critérios: CriteriaConfig[],
  metricas: EmployeeMetrics,
  ocorrenciasPorCriterio: OcorrenciasPorCriterio,
  regrasDesconto: DiscountRuleConfig[],
  faturamentoTotal?: number
): CriterionResult[] {
  return critérios
    .filter((c) => c.tipo !== undefined)
    .map((c) => {
      const metrica =
        c.tipo === "por_faixa" ? (faturamentoTotal ?? 0)
        : c.metrica === "agendamentos" ? metricas.agendamentos
        : c.metrica === "atendimentos" ? metricas.atendimentos
        : c.metrica === "valor_faturado" ? metricas.valorFaturado
        : 0;
      return calcularCriterio({
        criterio: c,
        metrica,
        pontos: ocorrenciasPorCriterio[c.id] ?? 0,
        regrasDesconto,
      });
    });
}

/** Período [início, fim) de um mês de referência (YYYY-MM-DD com dia 01). */
export function mesRange(mesReferencia: string): { inicio: Date; fim: Date } {
  const [y, m] = mesReferencia.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Mês de referência inválido: ${mesReferencia}`);
  const inicio = new Date(Date.UTC(y, m - 1, 1));
  const fim = new Date(Date.UTC(y, m, 1));
  return { inicio, fim };
}