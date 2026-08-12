import { describe, it, expect } from "vitest";
import { matchName, trigramSimilarity, type EmployeeCandidate, type AliasEntry } from "../lib/matching";
import { normalizeNome } from "../lib/normalize";

function emp(nome: string, id = nome, ativo = true): EmployeeCandidate {
  return { id, nome, chave: normalizeNome(nome), ativo };
}

const COLABORADORES = [
  emp("Eloisy Sumar", "e1"),
  emp("Samanta da Silva", "e2"),
  emp("Jéssica Thays Coelho dos Santos", "e3"),
  emp("Matheus Cabral Vieira", "e4"),
  emp("jeyce Wuintt da Silva", "e5"),
  emp("Luciana Akemi Otaki Kono", "e6"),
  emp("Britney Vitória de Liz Anjos", "e7"),
];

describe("matching de nomes", () => {
  it("Eloisy SUmar → correspondência exata com Eloisy Sumar", () => {
    const r = matchName("Eloisy SUmar", COLABORADORES);
    expect(r.status).toBe("exato");
    expect(r.employeeId).toBe("e1");
  });

  it("diferença de acento (Jéssica vs Jessica) → exata após normalização", () => {
    const r = matchName("Jessica Thays Coelho dos Santos", COLABORADORES);
    expect(r.status).toBe("exato");
    expect(r.employeeId).toBe("e3");
  });

  it("espaços duplicados são tolerados", () => {
    const r = matchName("  Eloisy   Sumar  ", COLABORADORES);
    expect(r.status).toBe("exato");
    expect(r.employeeId).toBe("e1");
  });

  it("typo pequeno (Matheus Cabral Vieirra) → fuzzy automático", () => {
    const r = matchName("Matheus Cabral Vieirra", COLABORADORES);
    expect(r.status).toBe("fuzzy");
    expect(r.employeeId).toBe("e4");
  });

  it("nome com diferença de acento (Britney Vitoria de Liz Anjos) → exata após normalização", () => {
    const r = matchName("Britney vitoria de liz Anjos", COLABORADORES);
    expect(r.status).toBe("exato");
    expect(r.employeeId).toBe("e7");
  });

  it("nome não cadastrado (convênio) → nao_encontrado, sem travar", () => {
    const r = matchName("SARAR SAUDE", COLABORADORES);
    expect(r.status).toBe("nao_encontrado");
    expect(r.employeeId).toBeNull();
  });

  it("campo vazio → status vazio", () => {
    const r = matchName("   ", COLABORADORES);
    expect(r.status).toBe("vazio");
  });

  it("nomes ambíguos vão para revisão em vez de matching cego", () => {
    const parecidos = [emp("Joana Maria Silva", "a"), emp("Joana Maria Silveira", "b")];
    const r = matchName("Joana Maria Silv", parecidos);
    expect(r.status).toBe("revisar");
    expect(r.employeeId).toBeNull();
  });

  it("alias confirmado é reutilizado (variante que não é o nome exato)", () => {
    const alias: AliasEntry[] = [{ employeeId: "e5", chave: normalizeNome("Jeyce Wuintt") }];
    const r = matchName("JEYCE WUINTT", COLABORADORES, alias);
    expect(r.status).toBe("alias");
    expect(r.employeeId).toBe("e5");
  });

  it("similaridade trigrama é simétrica e 1 para idênticos", () => {
    expect(trigramSimilarity("eloisy sumar", "eloisy sumar")).toBe(1);
    expect(trigramSimilarity("abc", "def")).toBe(0);
    const a = trigramSimilarity("jeyce wuintt da silva", "jeyce wuintt da silva");
    expect(a).toBe(1);
  });
});