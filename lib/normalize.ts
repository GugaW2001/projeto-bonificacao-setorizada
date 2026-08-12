/**
 * Normalização de nomes próprios para matching determinístico.
 * Regras: remove acentos (NFD), minúsculas, pontuação → espaço, colapsa espaços, trim.
 */

export function normalizeNome(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Chave para deduplicação de linhas de agendamento. */
export function linhaSignature(linha: Record<string, unknown>): string {
  const ordenado = Object.keys(linha)
    .sort()
    .map((k) => `${k}=${String(linha[k] ?? "").trim()}`)
    .join("|");
  return ordenado;
}