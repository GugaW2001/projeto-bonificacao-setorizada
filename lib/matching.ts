/**
 * Matching de nomes de colaboradores com tolerância a variações.
 *
 * Fluxo: exato (chave normalizada) → alias confirmado → fuzzy (similaridade trigrama).
 * Limiares (configuráveis via constantes):
 *  - FUZZY_AUTO >= 0.85 com folga >= 0.10 sobre o segundo candidato → correspondência automática
 *  - FUZZY_REVIEW >= 0.60 → possível correspondência (exige revisão humana)
 *  - Ambiguidade (dois candidatos com diferença < 0.10) → revisão
 */

import { normalizeNome } from "./normalize";

export type MatchStatus = "exato" | "alias" | "fuzzy" | "revisar" | "nao_encontrado" | "vazio";

export interface EmployeeCandidate {
  id: string;
  nome: string;
  chave: string;
  /** Usado pelo fluxo antigo de importação; o cálculo por sessão já filtra ativos no banco. */
  ativo?: boolean;
}

export interface AliasEntry {
  employeeId: string;
  chave: string;
}

export interface MatchCandidate {
  employeeId: string;
  nome: string;
  similaridade: number;
}

export interface MatchResult {
  status: MatchStatus;
  employeeId: string | null;
  similaridade: number;
  candidatos: MatchCandidate[];
}

export const FUZZY_AUTO = 0.85;
export const FUZZY_REVIEW = 0.6;
export const AMBIGUIDADE_FOLGA = 0.1;

function trigramas(s: string): string[] {
  const texto = `  ${s}  `;
  const out: string[] = [];
  for (let i = 0; i + 2 < texto.length; i++) out.push(texto.slice(i, i + 3));
  return out;
}

/** Similaridade Jaccard entre conjuntos de trigramas: 0..1 */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigramas(a);
  const tb = trigramas(b);
  if (ta.length === 0 || tb.length === 0) return a === b ? 1 : 0;
  const setB = new Set(tb);
  let interseccao = 0;
  for (const t of ta) if (setB.has(t)) interseccao++;
  const uniao = ta.length + tb.length - interseccao;
  if (uniao <= 0) return 0;
  return interseccao / uniao;
}

/**
 * Encontra a melhor correspondência do nome informado.
 * Nomes muito curtos (< 4 caracteres) só casam por chave exata ou alias.
 */
export function matchName(
  nomeOriginal: string,
  employees: EmployeeCandidate[],
  aliases: AliasEntry[] = []
): MatchResult {
  const chave = normalizeNome(nomeOriginal);
  if (!chave) {
    return { status: "vazio", employeeId: null, similaridade: 0, candidatos: [] };
  }

  const exato = employees.find((e) => e.chave === chave);
  if (exato) {
    return { status: "exato", employeeId: exato.id, similaridade: 1, candidatos: [{ employeeId: exato.id, nome: exato.nome, similaridade: 1 }] };
  }

  const alias = aliases.find((a) => a.chave === chave);
  if (alias) {
    return { status: "alias", employeeId: alias.employeeId, similaridade: 1, candidatos: [] };
  }

  if (chave.length < 4) {
    return { status: "nao_encontrado", employeeId: null, similaridade: 0, candidatos: [] };
  }

  const pontuados: MatchCandidate[] = employees
    .map((e) => ({ employeeId: e.id, nome: e.nome, similaridade: trigramSimilarity(chave, e.chave) }))
    .sort((a, b) => b.similaridade - a.similaridade);

  if (pontuados.length === 0 || pontuados[0].similaridade < FUZZY_REVIEW) {
    return { status: "nao_encontrado", employeeId: null, similaridade: pontuados[0]?.similaridade ?? 0, candidatos: [] };
  }

  const [melhor, segundo] = pontuados;
  const folga = melhor.similaridade - (segundo?.similaridade ?? 0);
  const ambíguo = !!segundo && Math.abs(segundo.similaridade - melhor.similaridade) < AMBIGUIDADE_FOLGA && segundo.similaridade >= FUZZY_REVIEW;

  if (ambíguo) {
    return { status: "revisar", employeeId: null, similaridade: melhor.similaridade, candidatos: pontuados.filter((c) => c.similaridade >= FUZZY_REVIEW).slice(0, 3) };
  }

  if (melhor.similaridade >= FUZZY_AUTO && folga >= AMBIGUIDADE_FOLGA) {
    return { status: "fuzzy", employeeId: melhor.employeeId, similaridade: melhor.similaridade, candidatos: [melhor] };
  }

  return { status: "revisar", employeeId: null, similaridade: melhor.similaridade, candidatos: [melhor] };
}

export function statusLabel(status: MatchStatus): string {
  switch (status) {
    case "exato": return "Correspondência exata";
    case "alias": return "Alias confirmado";
    case "fuzzy": return "Correspondência aproximada";
    case "revisar": return "Possível correspondência";
    case "nao_encontrado": return "Não encontrado";
    case "vazio": return "Sem nome";
  }
}