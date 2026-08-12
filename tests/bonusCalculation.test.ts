import { describe, it, expect } from "vitest";
import {
  calculaBrutoCritério, percentualParaPontos, calcularCriterio, calcularColaborador, mesRange,
  tierConfigDoBanco,
  type CriteriaConfig, type TierConfig, type DiscountRuleConfig, type EmployeeMetrics,
} from "../lib/bonusCalculationService";
import { fromReal } from "../lib/money";

function criterio(over: Partial<CriteriaConfig> & { nome: string }): CriteriaConfig {
  return {
    id: over.nome,
    tipo: "por_resultado",
    valor: null,
    metrica: "agendamentos",
    pessoaOrigem: "quem_atendeu",
    tiers: [],
    ...over,
  };
}

function tier(over: Partial<TierConfig>): TierConfig {
  return { id: "t1", aPartirDe: 0, ate: null, aCada: null, valor: 0, ordem: 0, ...over };
}

const REGRAS_PADRAO: DiscountRuleConfig[] = [
  { minPontos: 0, maxPontos: 4, percentualManter: 100 },
  { minPontos: 5, maxPontos: 6, percentualManter: 50 },
  { minPontos: 7, maxPontos: null, percentualManter: 0 },
];

describe("bonificação — tipos de critério", () => {
  it("bônus fixo independe da quantidade de resultados", () => {
    const c = criterio({ nome: "Assiduidade", tipo: "fixa", valor: fromReal(100), metrica: "nenhuma" });
    expect(calculaBrutoCritério(c, 0)).toBe(10000);
    expect(calculaBrutoCritério(c, 500)).toBe(10000);
  });

  it("bônus fixo não depende da origem (null)", () => {
    const c = criterio({ nome: "Assiduidade", tipo: "fixa", valor: fromReal(150), metrica: "nenhuma", pessoaOrigem: null });
    const r = calcularCriterio({ criterio: c, metrica: 0, pontos: 0, regrasDesconto: [] });
    expect(r.bonusBruto).toBe(fromReal(150));
  });

  it("bônus por resultado: R$ 0,50 × 200 agendamentos = R$ 100", () => {
    const c = criterio({ nome: "Agendamentos", valor: fromReal(0.5), metrica: "agendamentos" });
    expect(calculaBrutoCritério(c, 200)).toBe(10000);
  });

  it("bônus por faturamento em faixa intervalo: floor(250.000/100.000) × 100 = 200", () => {
    const c = criterio({
      nome: "Faturamento", tipo: "por_faixa", metrica: "valor_faturado",
      tiers: [tier({ aCada: fromReal(100000), valor: fromReal(100) })],
    });
    expect(calculaBrutoCritério(c, fromReal(250000))).toBe(20000);
    expect(calculaBrutoCritério(c, fromReal(99999.99))).toBe(0);
    expect(calculaBrutoCritério(c, fromReal(100000))).toBe(10000);
    expect(calculaBrutoCritério(c, fromReal(350000))).toBe(30000);
  });

  it("faixa progressiva não cumulativa: valor da faixa atingida", () => {
    const c = criterio({
      nome: "Produtividade", tipo: "por_faixa", metrica: "atendimentos",
      tiers: [
        tier({ aPartirDe: 0, ate: 100, valor: fromReal(0) }),
        tier({ aPartirDe: 100, ate: 200, valor: fromReal(50) }),
        tier({ aPartirDe: 200, ate: null, valor: fromReal(150) }),
      ],
    });
    expect(calculaBrutoCritério(c, 50)).toBe(0);
    expect(calculaBrutoCritério(c, 100)).toBe(5000);
    expect(calculaBrutoCritério(c, 199)).toBe(5000);
    expect(calculaBrutoCritério(c, 250)).toBe(15000);
  });
});

describe("descontos por ocorrências", () => {
  it("limites exatos: 0 → 100%, 4 → 100%", () => {
    expect(percentualParaPontos(0, REGRAS_PADRAO)).toBe(100);
    expect(percentualParaPontos(4, REGRAS_PADRAO)).toBe(100);
  });

  it("entre limites: 5 → 50%, 6 → 50%", () => {
    expect(percentualParaPontos(5, REGRAS_PADRAO)).toBe(50);
    expect(percentualParaPontos(6, REGRAS_PADRAO)).toBe(50);
  });

  it("acima do limite: 7 → 0% (desconto total)", () => {
    expect(percentualParaPontos(7, REGRAS_PADRAO)).toBe(0);
    expect(percentualParaPontos(20, REGRAS_PADRAO)).toBe(0);
  });

  it("sem regra aplicável (lacuna) → mantém 100%", () => {
    const regras: DiscountRuleConfig[] = [
      { minPontos: 0, maxPontos: 2, percentualManter: 100 },
      { minPontos: 5, maxPontos: null, percentualManter: 0 },
    ];
    expect(percentualParaPontos(3, regras)).toBe(100);
  });

  it("calcularCriterio aplica desconto: R$ 500 × 50% = R$ 250 (5 pontos)", () => {
    const c = criterio({ nome: "Agendamentos", valor: fromReal(0.5), metrica: "agendamentos" });
    const r = calcularCriterio({ criterio: c, metrica: 1000, pontos: 5, regrasDesconto: REGRAS_PADRAO });
    expect(r.bonusBruto).toBe(50000);
    expect(r.percentualManter).toBe(50);
    expect(r.bonusDescontado).toBe(25000);
  });
});

describe("cálculo por critério individual", () => {
  it("critério A sem desconto enquanto critério B desconta (pontuação independente)", () => {
    const a = criterio({ nome: "A", tipo: "fixa", valor: fromReal(100), metrica: "nenhuma" });
    const b = criterio({ nome: "B", valor: fromReal(1), metrica: "atendimentos" });
    const metricas: EmployeeMetrics = { agendamentos: 0, atendimentos: 100, valorFaturado: 0 };
    const resultado = calcularColaborador([a, b], metricas, { A: 3, B: 5 }, REGRAS_PADRAO);

    const ra = resultado.find((r) => r.criteriaId === "A")!;
    const rb = resultado.find((r) => r.criteriaId === "B")!;

    expect(ra.pontos).toBe(3);
    expect(ra.bonusDescontado).toBe(10000); // sem desconto
    expect(rb.pontos).toBe(5);
    expect(rb.percentualManter).toBe(50);
    expect(rb.bonusDescontado).toBe(5000); // 100 atendimentos × R$1 = R$100 → 50%
  });

  it("gravidades somam por critério (2+1+2 = 5)", () => {
    const c = criterio({ nome: "Agendamentos", valor: fromReal(1), metrica: "agendamentos" });
    const r = calcularCriterio({ criterio: c, metrica: 10, pontos: 5, regrasDesconto: REGRAS_PADRAO });
    expect(r.pontos).toBe(5);
    expect(r.bonusDescontado).toBe(500); // R$ 10 × 50%
  });

  it("por_faixa usa o faturamento total do mes, ignorando metricas do colaborador", () => {
    const f = criterio({
      nome: "Faturamento por faixa", tipo: "por_faixa", metrica: "valor_faturado",
      tiers: [tier({ aPartirDe: 1_000_000, ate: null, valor: fromReal(200) })],
    });
    const metricas: EmployeeMetrics = { agendamentos: 0, atendimentos: 0, valorFaturado: 0 };
    const resultado = calcularColaborador([f], metricas, {}, REGRAS_PADRAO, fromReal(120_000));

    expect(resultado[0].resultado).toBe(fromReal(120_000)); // métrica = total do mês
    expect(resultado[0].bonusBruto).toBe(fromReal(200)); // faixa atingida pelo total
  });
});

describe("fronteira banco → motor (tierConfigDoBanco)", () => {
  const faixaBanco = (over: Partial<Parameters<typeof tierConfigDoBanco>[1]> = {}) => ({
    id: "t1",
    a_partir_de: 0,
    ate: 100000,
    a_cada: null,
    valor: 100,
    ordem: 0,
    ...over,
  });

  it("valor_faturado: limites reais → centavos e valor → centavos", () => {
    const t = tierConfigDoBanco("valor_faturado", faixaBanco({ a_partir_de: 100000, ate: 200000, a_cada: 50000, valor: 150.5 }));
    expect(t.aPartirDe).toBe(10000000);
    expect(t.ate).toBe(20000000);
    expect(t.aCada).toBe(5000000);
    expect(t.valor).toBe(15050);
  });

  it("métricas de contagem: limites permanecem como contagem; valor em centavos", () => {
    const t = tierConfigDoBanco("agendamentos", faixaBanco({ a_partir_de: 100, ate: 200, a_cada: null, valor: 50 }));
    expect(t.aPartirDe).toBe(100);
    expect(t.ate).toBe(200);
    expect(t.valor).toBe(5000);
  });

  it("limites nulos permanecem nulos", () => {
    const t = tierConfigDoBanco("valor_faturado", faixaBanco({ ate: null, a_cada: null }));
    expect(t.ate).toBeNull();
    expect(t.aCada).toBeNull();
  });

  it("REGRESSÃO: faturamento abaixo do limite não cai mais na faixa máxima", () => {
    // Faixas do seed: 0–100k → R$100; 100k–200k → R$200; 200k+ → R$350 (limites em REAIS no banco)
    const c: CriteriaConfig = {
      id: "Fat", nome: "Faturamento por faixa", tipo: "por_faixa", valor: null,
      metrica: "valor_faturado", pessoaOrigem: "quem_atendeu",
      tiers: [
        tierConfigDoBanco("valor_faturado", faixaBanco({ id: "t1", a_partir_de: 0, ate: 100000, valor: 100 })),
        tierConfigDoBanco("valor_faturado", faixaBanco({ id: "t2", a_partir_de: 100000, ate: 200000, valor: 200 })),
        tierConfigDoBanco("valor_faturado", faixaBanco({ id: "t3", a_partir_de: 200000, ate: null, valor: 350 })),
      ],
    };
    // Métrica em centavos (como o motor recebe): R$ 2.000 → 200.000 cents
    expect(calculaBrutoCritério(c, fromReal(2000))).toBe(fromReal(100)); // antes do fix: 350
    expect(calculaBrutoCritério(c, fromReal(99999.99))).toBe(fromReal(100));
    expect(calculaBrutoCritério(c, fromReal(100000))).toBe(fromReal(200));
    expect(calculaBrutoCritério(c, fromReal(150000))).toBe(fromReal(200));
    expect(calculaBrutoCritério(c, fromReal(200000))).toBe(fromReal(350));
  });

  it("REGRESSÃO: modo intervalo com a_cada em reais vs métrica em centavos", () => {
    const c: CriteriaConfig = {
      id: "Fat", nome: "Faturamento", tipo: "por_faixa", valor: null,
      metrica: "valor_faturado", pessoaOrigem: "quem_atendeu",
      tiers: [tierConfigDoBanco("valor_faturado", faixaBanco({ a_partir_de: 0, ate: null, a_cada: 100000, valor: 100 }))],
    };
    expect(calculaBrutoCritério(c, fromReal(250000))).toBe(fromReal(200));
    expect(calculaBrutoCritério(c, fromReal(100000))).toBe(fromReal(100));
    expect(calculaBrutoCritério(c, fromReal(99999.99))).toBe(fromReal(0));
  });
});

describe("mês de referência", () => {
  it("mesRange gera intervalo correto", () => {
    const { inicio, fim } = mesRange("2026-07");
    expect(inicio.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("mesRange valida mês", () => {
    expect(() => mesRange("2026-13")).toThrow();
  });
});