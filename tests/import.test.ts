import { describe, it, expect } from "vitest";
import {
  detectHeaderRow, normalizeRow, computePreviewStats, parsePastedText,
  COLUNAS_REFERENCIA, COL_IDX,
} from "../lib/import";

/** Linha de cabeçalho igual à planilha real (linha 3 do arquivo). */
function headerRow(): string[] {
  return [...COLUNAS_REFERENCIA];
}

describe("detecção de cabeçalho", () => {
  it("detecta cabeçalho mesmo com linha vazia e linha de título antes (planilha real)", () => {
    const linhas = [
      [],
      ["Estatísticas Agendamentos"],
      headerRow(),
      ["RESSONANCIA", "02/07/26", "08:00"],
      ["TOMOGRAFIA", "03/07/26", "09:00"],
    ];
    const det = detectHeaderRow(linhas);
    expect(det).not.toBeNull();
    expect(det!.headerRow).toBe(2);
    expect(det!.mapping[0]).toBe(0); // Nome Agenda
    expect(det!.mapping[16]).toBe(16); // Quem Agendou
    expect(det!.mapping[17]).toBe(17); // Quem Atendeu
    expect(det!.mapping[22]).toBe(22); // Valor Provisionado
  });

  it("detecta cabeçalho na primeira linha quando não há título", () => {
    const det = detectHeaderRow([headerRow(), ["X", "01/07/26"]]);
    expect(det!.headerRow).toBe(0);
  });

  it("matching tolera cabeçalhos com caixa/acentos diferentes", () => {
    const linhas = [[...headerRow().map((h, i) => (i === 16 ? "QUEM AGENDOU" : h))]];
    const det = detectHeaderRow(linhas);
    expect(det!.mapping[16]).toBe(16);
  });
});

describe("normalização de linha", () => {
  const mapping: Record<number, number> = {};
  headerRow().forEach((_, i) => (mapping[i] = i));

  it("converte moeda BR, data dd/mm/aa e normaliza nomes", () => {
    const linha = ["RESSONANCIA", "02/07/26", "08:00", "", "", "", "", "", "", "", "", "", "", "", "", "", "Eloisy SUmar", "Samanta da Silva", "", "", "", "", "480,00", "", "", "", "", "", ""];
    const r = normalizeRow(linha, mapping, 4)!;
    expect(r).not.toBeNull();
    expect(r.dataISO).toBe("2026-07-02");
    expect(r.dataChave).toBe("2026-07");
    expect(r.valorFaturado).toBe(48000);
    expect(r.chaveAgendou).toBe("eloisy sumar");
    expect(r.chaveAtendeu).toBe("samanta da silva");
    expect(r.erros).toEqual([]);
    expect(r.raw.length).toBe(29);
  });

  it("flutuação vs moeda: '1.234,56' → 123456 centavos", () => {
    const linha = Array(29).fill("");
    linha[0] = "X"; linha[1] = "01/07/26"; linha[22] = "1.234,56";
    const r = normalizeRow(linha, mapping, 5)!;
    expect(r.valorFaturado).toBe(123456);
  });

  it("valor inválido gera erro, mas a linha é preservada", () => {
    const linha = Array(29).fill("");
    linha[1] = "01/07/26"; linha[22] = "abc";
    const r = normalizeRow(linha, mapping, 6)!;
    expect(r.erros).toHaveLength(1);
    expect(r.valorFaturado).toBe(0);
  });

  it("linha totalmente vazia → null", () => {
    expect(normalizeRow(Array(29).fill(""), mapping, 7)).toBeNull();
  });

  it("sem Q/R/X preenchidos mas com data → linha normalizada (sem dono)", () => {
    const linha = Array(29).fill("");
    linha[1] = "05/07/26";
    const r = normalizeRow(linha, mapping, 8);
    expect(r).not.toBeNull();
    expect(r!.nomeAgendou).toBeNull();
    expect(r!.nomeAtendeu).toBeNull();
  });

  it("ignora colunas sem cabeçalho detectado", () => {
    const r = normalizeRow(["A", "01/07/26", "ERRO"], { 0: 0, 1: 1 }, 9);
    expect(r).not.toBeNull();
  });
});

describe("preview stats e colagem", () => {
  it("acumula estatísticas", () => {
    const mapping: Record<number, number> = {};
    headerRow().forEach((_, i) => (mapping[i] = i));
    const l1 = Array(29).fill(""); l1[1] = "02/07/26"; l1[16] = "João"; l1[22] = "100,00";
    const l2 = Array(29).fill(""); l2[1] = "03/07/26"; l2[16] = "João"; l2[22] = "bad";
    const stats = computePreviewStats([normalizeRow(l1, mapping, 1)!, normalizeRow(l2, mapping, 2)!]);
    expect(stats.total).toBe(2);
    expect(stats.invalidas).toBe(1);
    expect(stats.meses).toEqual(["2026-07"]);
  });

  it("parsePastedText converte tabs em linhas", () => {
    const linhas = parsePastedText("Nome Agenda\tData\tQuem Agendou\nRESSONANCIA\t02/07/26\tEloisy SUMAR");
    expect(linhas).toHaveLength(2);
    expect(linhas[1][2]).toBe("Eloisy SUMAR");
  });

  it("colunas de referência contêm Q=16, R=17, W=22", () => {
    expect(COL_IDX.quemAgendou).toBe(16);
    expect(COL_IDX.quemAtendeu).toBe(17);
    expect(COL_IDX.valorFaturado).toBe(22);
  });
});