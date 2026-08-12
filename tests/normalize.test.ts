import { describe, it, expect } from "vitest";
import { normalizeNome } from "../lib/normalize";

describe("normalizeNome", () => {
  it("Eloisy SUmar ≡ Eloisy Sumar (diferença de capitalização)", () => {
    expect(normalizeNome("Eloisy SUmar")).toBe(normalizeNome("Eloisy Sumar"));
  });

  it("remove acentos", () => {
    expect(normalizeNome("Jéssica Thays Coelho dos Santos")).toBe("jessica thays coelho dos santos");
    expect(normalizeNome("Letícia Eduarda Rimoldi")).toBe("leticia eduarda rimoldi");
  });

  it("colapsa espaços duplicados e trim", () => {
    expect(normalizeNome("  Maria   da   Silva  ")).toBe("maria da silva");
  });

  it("remove pontuação e caracteres especiais", () => {
    expect(normalizeNome("Vanessa Pretenko de Oliveira")).toBe("vanessa pretenko de oliveira");
    expect(normalizeNome("Sr. João da-Silva, Jr.")).toBe("sr joao da silva jr");
  });

  it("minúsculas", () => {
    expect(normalizeNome("BRITNEY Vitoria de liz ANJOS")).toBe("britney vitoria de liz anjos");
  });

  it("vazio permanece vazio", () => {
    expect(normalizeNome("  ")).toBe("");
    expect(normalizeNome("")).toBe("");
  });
});