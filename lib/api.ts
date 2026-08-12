/** Helpers de API, auditoria e conversão de tipos. */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabase } from "./supabase.server";

export function jsonError(mensagem: string, status = 400, detalhes?: unknown): NextResponse {
  return NextResponse.json({ error: mensagem, detalhes }, { status });
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<{ data?: T; error?: NextResponse }> {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return { error: jsonError("Corpo da requisição inválido (JSON esperado).") };
  }
  const parsed = schema.safeParse(corpo);
  if (!parsed.success) {
    const primeiro = parsed.error.issues[0];
    return { error: jsonError(primeiro?.message ?? "Validação falhou", 422, parsed.error.flatten()) };
  }
  return { data: parsed.data };
}

/** Registra uma ação de auditoria. */
export async function audit(acao: string, entidade: string, entidadeId: string | null, detalhes?: Record<string, unknown>): Promise<void> {
  try {
    const db = await getSupabase();
    await db.from("audit_logs").insert({
      acao,
      entidade,
      entidade_id: entidadeId,
      detalhes: detalhes ?? null,
      usuario: "admin",
    });
  } catch (e) {
    console.error(`Falha ao registrar auditoria (${acao}):`, e);
  }
}

/** Common: número (string|number) do PostgREST → number. */
export function num(v: string | number | null | undefined, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  return Number(v);
}

/** Date ISO → "YYYY-MM-DD". */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Contexto de parâmetros de rota dinâmica ([id]) — type local até o next gerar o RouteContext global. */
export type RouteContext = { params: Promise<Record<string, string>> };