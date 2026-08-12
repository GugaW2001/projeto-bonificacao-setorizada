import { describe, it, expect } from "vitest";
import { calcularSessaoDeLinhas, type SessaoInput } from "../lib/session";
import { normalizeNome } from "../lib/normalize";
import { COLUNAS_REFERENCIA } from "../lib/import";
import type { CriteriaConfig, DiscountRuleConfig } from "../lib/bonusCalculationService";

const CABECALHO = [...COLUNAS_REFERENCIA];

/** Linha de 29 colunas com Q(16), R(17) e X(23) preenchidos, imitando a planilha real. */
function linha(q: string, r: string, valor: string, data = "02/07/26"): string[] {
  const l = Array(29).fill("");
  l[1] = data;
  l[16] = q;
  l[17] = r;
  l[23] = valor;
  return l;
}

function emp(id: string, nome: string, sectorId: string, sectorTitulo: string) {
  return { id, nome, chave: normalizeNome(nome), sectorId, sectorTitulo };
}

function fixa(id: string, nome: string, valorCents: number, pessoaOrigem: "quem_atendeu" | "quem_agendou" | null = null): CriteriaConfig {
  return { id, nome, tipo: "fixa", valor: valorCents, metrica: "nenhuma", pessoaOrigem, tiers: [] };
}

function porResultado(id: string, nome: string, metrica: "agendamentos" | "atendimentos", valorCents: number): CriteriaConfig {
  return { id, nome, tipo: "por_resultado", valor: valorCents, metrica, pessoaOrigem: "quem_agendou", tiers: [] };
}

function inputBase(extra?: Partial<SessaoInput>): SessaoInput {
  return {
    mes: "2026-07",
    criteriosPorSetor: {},
    regrasPorSetor: {},
    employees: [],
    aliases: [],
    pontosPorCriterio: {},
    ...extra,
  };
}

describe("cÃ¡lculo por sessÃ£o", () => {
  it("casa nomes automaticamente, agrega Q/R/X e calcula critÃ©rio fixa", () => {
    const input = inputBase({
      criteriosPorSetor: {
        s1: { titulo: "RessonÃ¢ncia", criterios: [fixa("c1", "BÃ´nus fixo", 10_000)] },
      },
      employees: [emp("e1", "Eloisy Sumar", "s1", "RessonÃ¢ncia")],
    });
    const linhas = [linha("Eloisy SUMAR", "Eloisy sumAR", "480,00"), linha("Eloisy Sumar", "Eloisy Sumar", "120,00")];

    const r = calcularSessaoDeLinhas([CABECALHO, ...linhas], input);

    expect(r.linhasMes).toBe(2);
    expect(r.headerRow).toBe(1);
    expect(r.avisos).toEqual([]);
    expect(r.itens).toHaveLength(1);
    const item = r.itens[0];
    expect(item.nomeColaborador).toBe("Eloisy Sumar");
    expect(item.bonusBruto).toBe(10_000);
    expect(item.bonusFinal).toBe(10_000);
    expect(r.totais.bruto).toBe(10_000);
    expect(r.totais.final).toBe(10_000);
  });

  it("por_faixa avalia o faturamento total do mes para todos (sem origem)", () => {
    const porFaixa: CriteriaConfig = {
      id: "c2",
      nome: "Faturamento",
      tipo: "por_faixa",
      valor: null,
      metrica: "valor_faturado",
      pessoaOrigem: null, // fixa/por_faixa não têm origem
      tiers: [
        { id: "t1", aPartirDe: 1_000_000, ate: null, aCada: null, valor: 200_000, ordem: 0 },
        { id: "t2", aPartirDe: 0, ate: 1_000_000, aCada: null, valor: 0, ordem: 1 },
      ],
    };

    const input = inputBase({
      criteriosPorSetor: { s1: { titulo: "Ressonancia", criterios: [porFaixa] } },
      employees: [emp("e1", "Ana Agendou", "s1", "Ressonancia"), emp("e2", "Bia Atendeu", "s1", "Ressonancia")],
    });
    // 10 linhas distintas de R$ 12.000 (datas variadas evitam o dedupe): total do mes = R$ 120.000
    const linhas = Array.from({ length: 10 }, (_, i) => linha("Ana Agendou", "Bia Atendeu", "12.000,00", `${String(i + 1).padStart(2, "0")}/07/26`));

    const r = calcularSessaoDeLinhas([CABECALHO, ...linhas], input);

    expect(r.linhasMes).toBe(10);
    expect(r.faturamentoTotal).toBe(12_000_000); // 10 × R$ 12.000 em centavos
    const ana = r.itens.find((i) => i.nomeColaborador === "Ana Agendou")!;
    const bia = r.itens.find((i) => i.nomeColaborador === "Bia Atendeu")!;
    expect(ana.bonusBruto).toBe(200_000); // mesma faixa para todos, independente da origem
    expect(bia.bonusBruto).toBe(200_000);
  });

  it("por_resultado com valor_faturado continua respeitando a origem", () => {
    const porResultadoFat: CriteriaConfig = {
      id: "c3",
      nome: "Faturamento individual",
      tipo: "por_resultado",
      valor: 1, // unidade do motor: 1 centavo de bonus por centavo faturado
      metrica: "valor_faturado",
      pessoaOrigem: "quem_atendeu",
      tiers: [],
    };

    const input = inputBase({
      criteriosPorSetor: { s1: { titulo: "Ressonancia", criterios: [porResultadoFat] } },
      employees: [emp("e1", "Ana Agendou", "s1", "Ressonancia"), emp("e2", "Bia Atendeu", "s1", "Ressonancia")],
    });
    // Ana agendou e Bia atendeu R$ 12.000; o criterio olha quem atendeu
    const linhas = [linha("Ana Agendou", "Bia Atendeu", "12.000,00")];

    const r = calcularSessaoDeLinhas([CABECALHO, ...linhas], input);

    const ana = r.itens.find((i) => i.nomeColaborador === "Ana Agendou")!;
    const bia = r.itens.find((i) => i.nomeColaborador === "Bia Atendeu")!;
    expect(ana.bonusBruto).toBe(0); // Ana so agendou
    expect(bia.bonusBruto).toBe(1_200_000); // R$ 12.000 em centavos × 1
  });

  it("alias casa nome alternativo", () => {
    const input = inputBase({
      criteriosPorSetor: { s1: { titulo: "RessonÃ¢ncia", criterios: [fixa("c1", "BÃ´nus fixo", 10_000)] } },
      employees: [emp("e1", "Carlos Medeiros", "s1", "RessonÃ¢ncia")],
      aliases: [{ employeeId: "e1", chave: "carlos m" }],
    });

    const r = calcularSessaoDeLinhas([CABECALHO, linha("Carlos M", "Carlos Medeiros", "80,00")], input);

    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].nomeColaborador).toBe("Carlos Medeiros");
  });

  it("nome sem correspondÃªncia vira aviso e nÃ£o computa", () => {
    const input = inputBase({
      criteriosPorSetor: { s1: { titulo: "RessonÃ¢ncia", criterios: [porResultado("c1", "Agendamentos", "agendamentos", 10_000)] } },
      employees: [emp("e1", "DÃ©bora Silva", "s1", "RessonÃ¢ncia")],
    });

    const r = calcularSessaoDeLinhas([CABECALHO, linha("Pessoa Errada", "DÃ©bora Silva", "50,00")], input);

    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].nome).toBe("Pessoa Errada");
    expect(r.avisos[0].coluna).toBe("quem_agendou");
    expect(r.avisos[0].qtdLinhas).toBe(1);
    expect(r.itens[0].resultado).toBe(0); // DÃ©bora nÃ£o agendou nenhuma linha
  });

  it("linhas de outros meses nÃ£o entram no cÃ¡lculo", () => {
    const input = inputBase({
      criteriosPorSetor: { s1: { titulo: "RessonÃ¢ncia", criterios: [porResultado("c1", "Agendamentos", "agendamentos", 10_000)] } },
      employees: [emp("e1", "Ã‰rika Souza", "s1", "RessonÃ¢ncia")],
    });

    const r = calcularSessaoDeLinhas(
      [CABECALHO, linha("Ã‰rika Souza", "Ã‰rika Souza", "10,00", "02/06/26"), linha("Ã‰rika Souza", "Ã‰rika Souza", "20,00")],
      input
    );

    expect(r.linhasMes).toBe(1);
    expect(r.itens[0].resultado).toBe(1); // sÃ³ a linha de 07/07 contou para agendamentos
    expect(r.itens[0].bonusBruto).toBe(10_000);
  });

  it("nenhuma linha do mÃªs lanÃ§a erro com detalhes", () => {
    const input = inputBase({
      criteriosPorSetor: { s1: { titulo: "RessonÃ¢ncia", criterios: [fixa("c1", "BÃ´nus fixo", 10_000)] } },
      employees: [emp("e1", "FÃ¡bio Lima", "s1", "RessonÃ¢ncia")],
    });

    expect(() => calcularSessaoDeLinhas([CABECALHO, linha("FÃ¡bio Lima", "FÃ¡bio Lima", "10,00", "02/06/26")], input)).toThrow(
      /Nenhuma linha encontrada para 2026-07/
    );
  });

  it("desconto por ocorrÃªncias Ã© aplicado por critÃ©rio (pontos do mÃªs)", () => {
    const regras: DiscountRuleConfig[] = [
      { minPontos: 0, maxPontos: 4, percentualManter: 100 },
      { minPontos: 5, maxPontos: 6, percentualManter: 50 },
      { minPontos: 7, maxPontos: null, percentualManter: 0 },
    ];
    const input = inputBase({
      criteriosPorSetor: { s1: { titulo: "RessonÃ¢ncia", criterios: [fixa("c1", "BÃ´nus fixo", 10_000)] } },
      regrasPorSetor: { s1: regras },
      employees: [emp("e1", "Gabriel Rocha", "s1", "RessonÃ¢ncia")],
      pontosPorCriterio: { e1: { c1: 5 } },
    });

    const r = calcularSessaoDeLinhas([CABECALHO, linha("Gabriel Rocha", "Gabriel Rocha", "30,00")], input);

    const item = r.itens[0];
    expect(item.pontos).toBe(5);
    expect(item.percentualManter).toBe(50);
    expect(item.bonusBruto).toBe(10_000);
    expect(item.bonusFinal).toBe(5_000);
    expect(r.totais.descontos).toBe(5_000);
  });

  it("linhas duplicadas idÃªnticas contam uma Ãºnica vez", () => {
    const input = inputBase({
      criteriosPorSetor: { s1: { titulo: "RessonÃ¢ncia", criterios: [porResultado("c1", "Agendamentos", "agendamentos", 10_000)] } },
      employees: [emp("e1", "HeloÃ­sa Nunes", "s1", "RessonÃ¢ncia")],
    });

    const r = calcularSessaoDeLinhas(
      [CABECALHO, linha("HeloÃ­sa Nunes", "HeloÃ­sa Nunes", "40,00"), linha("HeloÃ­sa Nunes", "HeloÃ­sa Nunes", "40,00")],
      input
    );

    expect(r.linhasMes).toBe(1);
    expect(r.itens[0].resultado).toBe(1);
  });
});