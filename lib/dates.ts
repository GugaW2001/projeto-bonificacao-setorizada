/**
 * Datas no formato brasileiro e chaves de mês.
 */

/** Converte "02/07/26" ou "02/07/2026" (dd/mm/aa) em Date (UTC à meia-noite). Ano com 2 dígitos: <70 ⇒ 20yy, senão 19yy. */
export function parseBRDate(texto: string): Date | null {
  const t = (texto ?? "").trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = Number(m[3]);
  if (ano >= 70 && ano < 100) ano += 1900;
  else if (ano < 70 && ano < 100) ano += 2000;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d;
}

/** Formata Date como dd/mm/aaaa. */
export function formatBRDate(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${data.getUTCFullYear()}`;
}

/** Converte Date em chave de mês "YYYY-MM". */
export function monthKey(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-07" → Date do dia 1 (UTC). */
export function monthStart(chave: string): Date {
  const [y, m] = chave.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Chave de mês inválida: ${chave}`);
  return new Date(Date.UTC(y, m - 1, 1));
}

/** "2026-07" → Date do primeiro dia do mês seguinte (limite exclusivo). */
export function monthEnd(chave: string): Date {
  const [y, m] = chave.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Chave de mês inválida: ${chave}`);
  return new Date(Date.UTC(y, m, 1));
}

/** Chave "YYYY-MM" do mês atual (UTC). */
export function currentMonthKey(): string {
  return monthKey(new Date());
}

/** Formata chave "2026-07" como texto "Julho/2026". */
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function monthLabel(chave: string): string {
  const [y, m] = chave.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return chave;
  return `${MESES[m - 1]}/${y}`;
}