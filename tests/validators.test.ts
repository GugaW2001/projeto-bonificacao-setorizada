import { describe, it, expect } from "vitest";
import { criterioSchema } from "../lib/validators";

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