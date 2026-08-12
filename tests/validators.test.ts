import { describe, it, expect } from "vitest";
import { criterioSchema, sessionPdfSchema } from "../lib/validators";

const valido = {
  sector_id: "12345678-1234-4123-8123-123456789abc",
  nome: "Critério",
  tipo: "por_resultado",
  metrica: "agendamentos",
  pessoa_origem: "quem_atendeu",
};

describe("criterioSchema — origem por tipo", () => {
  it("por_resultado exige origem", () => {
    expect(criterioSchema.safeParse({ ...valido, pessoa_origem: null }).success).toBe(false);
    expect(criterioSchema.safeParse({ ...valido, pessoa_origem: "quem_agendou" }).success).toBe(true);
  });

  it("fixa não aceita origem", () => {
    expect(
      criterioSchema.safeParse({ ...valido, tipo: "fixa", metrica: "nenhuma", pessoa_origem: "quem_atendeu" }).success
    ).toBe(false);
    expect(criterioSchema.safeParse({ ...valido, tipo: "fixa", metrica: "nenhuma", pessoa_origem: null }).success).toBe(true);
  });

  it("por_faixa não aceita origem e exige métrica valor_faturado", () => {
    const faixa = { ...valido, tipo: "por_faixa", valor: null, tiers: [] };
    expect(criterioSchema.safeParse({ ...faixa, metrica: "agendamentos", pessoa_origem: null }).success).toBe(false);
    expect(criterioSchema.safeParse({ ...faixa, metrica: "valor_faturado", pessoa_origem: null }).success).toBe(true);
    expect(criterioSchema.safeParse({ ...faixa, metrica: "valor_faturado", pessoa_origem: "quem_atendeu" }).success).toBe(false);
  });
});

describe("sessionPdfSchema — filtro por colaborador", () => {
  const base = {
    mes: "2026-07",
    arquivo: "planilha.xlsx",
    avisos: [],
    itens: [
      {
        employeeId: "12345678-1234-4123-8123-123456789abc",
        nomeColaborador: "Fulano",
        sectorId: "12345678-1234-4123-8123-123456789abc",
        setorTitulo: "Setor 1",
        criterio: { id: "12345678-1234-4123-8123-123456789abc", nome: "Critério", tipo: "fixa" },
        resultado: 1,
        unidade: "R$",
        bonusBruto: 100,
        pontos: 0,
        percentualManter: 100,
        bonusFinal: 100,
      },
    ],
    totais: { bruto: 100, descontos: 0, final: 100 },
  };

  it("aceita employeeId opcional válido", () => {
    expect(sessionPdfSchema.safeParse(base).success).toBe(true);
    expect(
      sessionPdfSchema.safeParse({ ...base, employeeId: "12345678-1234-4123-8123-123456789abc" }).success
    ).toBe(true);
  });

  it("rejeita employeeId que não é UUID", () => {
    expect(sessionPdfSchema.safeParse({ ...base, employeeId: "nao-e-uuid" }).success).toBe(false);
  });
});