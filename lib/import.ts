/**
 * Processamento de planilhas de agendamentos (CSV/XLSX/.xls ou colagem tabular).
 *
 * A planilha real pode ter linhas de título antes do cabeçalho (ex.: linha 1 vazia,
 * linha 2 com "Estatísticas Agendamentos", linha 3 com os 29 cabeçalhos).
 * Portanto o cabeçalho é DETECTADO por similaridade fuzzy nas primeiras linhas.
 *
 * Apenas as colunas Q (Quem Agendou), R (Quem Atendeu) e W (Valor Provisionado) são
 * utilizadas como métrica; a linha original é preservada em `raw` para auditoria.
 */

import { parseBRMoney, type Cents } from "./money";
import { parseBRDate, monthKey } from "./dates";
import { normalizeNome } from "./normalize";

export const COLUNAS_REFERENCIA = [
  "Nome Agenda", "Data", "Hora", "Convênio", "Plano", "Procedimento", "Modalidade",
  "Executante", "Solicitante", "Paciente", "Idade", "Sexo", "Cidade Paciente",
  "Encaminhamento", "Local", "Onde Conheceu a Clínica", "Quem Agendou", "Quem Atendeu",
  "Data Agendou", "Hora Agendou", "Técnico Executante", "Técnico Pré Ficha",
  "Valor Provisionado", "Valor Faturado", "Valor Recebido", "Valor Fat. Proc",
  "Valor Fat. Mat/Med/DeT", "Valor Fat. Pacote Proc", "Valor Fat. Pacote Mat/Med/DeT",
] as const;

/** Índices (0-based) das colunas de referência de 0 a 28 (A–AC). */
export const COL_IDX = {
  nomeAgenda: 0, data: 1, hora: 2, convenio: 3, plano: 4, procedimento: 5, modalidade: 6,
  executante: 7, solicitante: 8, paciente: 9, idade: 10, sexo: 11, cidadePaciente: 12,
  encaminhamento: 13, local: 14, ondeConheceu: 15,
  quemAgendou: 16, quemAtendeu: 17, dataAgendou: 18, horaAgendou: 19,
  tecnicoExecutante: 20, tecnicoPreFicha: 21,
  valorProvisionado: 22, valorFaturado: 22, valorRecebido: 24,
  valorFatProc: 25, valorFatMatMed: 26, valorFatPacoteProc: 27, valorFatPacoteMatMed: 28,
} as const;

/** Mapeia posição da coluna detectada (0-based) → índice da coluna de referência. */
export type ColumnMapping = Record<number, number>;

export interface ParsedSheet {
  linhas: string[][];
  headerRow: number | null;
  mapping: ColumnMapping;
  avisos: string[];
}

function limpaCabecalho(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function similaridadeTrigram(a: string, b: string): number {
  const tg = (s: string) => {
    const t = `  ${s}  `;
    const out: string[] = [];
    for (let i = 0; i + 2 < t.length; i++) out.push(t.slice(i, i + 3));
    return out;
  };
  const ta = tg(a);
  const tb = new Set(tg(b));
  if (ta.length === 0) return a === b ? 1 : 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const uniao = ta.length + tb.size - inter;
  return uniao <= 0 ? 0 : inter / uniao;
}

const CABECALHOS_LIMPOS = COLUNAS_REFERENCIA.map(limpaCabecalho);

/** Detecta a linha de cabeçalho: a que reconhece ≥ 60% das colunas de referência. */
export function detectHeaderRow(linhas: string[][]): { headerRow: number; mapping: ColumnMapping } | null {
  let melhor: { headerRow: number; mapping: ColumnMapping } | null = null;
  let melhorScore = 0;

  const limite = Math.min(linhas.length, 10);
  for (let r = 0; r < limite; r++) {
    const linha = linhas[r];
    const mapping: ColumnMapping = {};
    let acertos = 0;
    for (let c = 0; c < linha.length; c++) {
      const limpo = limpaCabecalho(linha[c]);
      if (!limpo) continue;
      let bestIdx = -1;
      let bestScore = 0;
      for (let i = 0; i < CABECALHOS_LIMPOS.length; i++) {
        const s = similaridadeTrigram(limpo, CABECALHOS_LIMPOS[i]);
        if (s > bestScore) {
          bestScore = s;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestScore >= 0.75) {
        mapping[c] = bestIdx;
        acertos++;
      }
    }
    const score = acertos / CABECALHOS_LIMPOS.length;
    if (score >= 0.6 && score > melhorScore) {
      melhorScore = score;
      melhor = { headerRow: r, mapping };
    }
  }
  return melhor;
}

export interface NormalizedRow {
  dataISO: string | null; // YYYY-MM-DD
  dataChave: string | null; // YYYY-MM
  nomeAgendou: string | null;
  chaveAgendou: string | null;
  nomeAtendeu: string | null;
  chaveAtendeu: string | null;
  valorFaturado: Cents;
  raw: (string)[];
  numeroLinha: number;
  erros: string[];
  hashLinha: string;
}

function hashLinha(linha: string[]): string {
  return linha.map((v) => String(v ?? "").trim()).join("|");
}

/** Busca o valor da coluna de referência `colRef` na linha, via mapeamento. */
export function colunaValor(linha: string[], mapping: ColumnMapping, colRef: number): string {
  for (const [pos, ref] of Object.entries(mapping)) {
    if (ref === colRef) return (linha[Number(pos)] ?? "").trim();
  }
  return "";
}

/**
 * Normaliza uma linha de dados conforme o mapeamento. Linhas totalmente vazias → null.
 */
export function normalizeRow(
  linha: string[],
  mapping: ColumnMapping,
  numeroLinha: number
): NormalizedRow | null {
  const dataTexto = colunaValor(linha, mapping, COL_IDX.data);
  const q = colunaValor(linha, mapping, COL_IDX.quemAgendou);
  const r = colunaValor(linha, mapping, COL_IDX.quemAtendeu);
  const x = colunaValor(linha, mapping, COL_IDX.valorFaturado);

  const data = dataTexto ? parseBRDate(dataTexto) : null;
  const valor = x ? parseBRMoney(x) : null;

  const erros: string[] = [];
  if (x && valor === null) erros.push(`Valor Faturado inválido: "${x}"`);
  if (dataTexto && data === null) erros.push(`Data inválida: "${dataTexto}"`);

  if (!q && !r && !x && !dataTexto) return null;

  return {
    dataISO: data ? data.toISOString().slice(0, 10) : null,
    dataChave: data ? monthKey(data) : null,
    nomeAgendou: q || null,
    chaveAgendou: q ? normalizeNome(q) : null,
    nomeAtendeu: r || null,
    chaveAtendeu: r ? normalizeNome(r) : null,
    valorFaturado: valor ?? 0,
    raw: linha.map((v) => String(v ?? "").trim()),
    numeroLinha,
    erros,
    hashLinha: hashLinha(linha),
  };
}

export interface PreviewStats {
  total: number;
  invalidas: number;
  semAgendou: number;
  semAtendeu: number;
  meses: string[];
  valoresInvalidos: number;
  datasInvalidas: number;
}

export function computePreviewStats(rows: NormalizedRow[]): PreviewStats {
  const stats: PreviewStats = {
    total: rows.length,
    invalidas: rows.filter((r) => r.erros.length > 0).length,
    semAgendou: rows.filter((r) => !r.nomeAgendou).length,
    semAtendeu: rows.filter((r) => !r.nomeAtendeu).length,
    meses: Array.from(new Set(rows.map((r) => r.dataChave).filter((m): m is string => !!m))).sort(),
    valoresInvalidos: rows.filter((r) => r.erros.some((e) => e.startsWith("Valor"))).length,
    datasInvalidas: rows.filter((r) => r.erros.some((e) => e.startsWith("Data"))).length,
  };
  return stats;
}

/** Parseia arquivo (bytes) em linhas de strings — usa xlsx (SheetJS), server-side. */
export async function parseSpreadsheet(arquivo: Buffer): Promise<string[][]> {
  const xlsx = await import("xlsx");
  const wb = xlsx.read(arquivo, { type: "buffer" });
  const nomeAba = wb.SheetNames[0];
  const ws = wb.Sheets[nomeAba];
  const rows = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  return rows.map((row) => (Array.isArray(row) ? row.map((v) => String(v ?? "")) : []));
}

/** Converte texto colado (separado por tabulações) em linhas de strings. */
export function parsePastedText(texto: string): string[][] {
  return texto
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.split("\t").map((c) => c.trim()))
    .filter((l) => l.some((c) => c !== ""));
}