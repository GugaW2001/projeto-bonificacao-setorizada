import { NextResponse } from "next/server";
import { jsonError, parseBody, audit, RouteContext } from "@/lib/api";
import { getSupabase } from "@/lib/supabase.server";
import { uuidSchema, employeeSchema } from "@/lib/validators";
import { normalizeNome } from "@/lib/normalize";

const patchSchema = employeeSchema.partial();

export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) return jsonError("ID inválido.");

  const { data, error } = await parseBody(req, patchSchema);
  if (error) return error;

  const db = await getSupabase();
  const payload: Record<string, unknown> = {};
  if (data!.nome !== undefined) {
    payload.nome = data!.nome;
    payload.chave_normalizada = normalizeNome(data!.nome!);
  }
  if (data!.sector_id !== undefined) payload.sector_id = data!.sector_id;
  if (data!.data_entrada !== undefined) payload.data_entrada = data!.data_entrada ?? null;
  if (data!.ativo !== undefined) payload.ativo = data!.ativo;

  const { data: atualizado, error: err } = await db.from("employees").update(payload).eq("id", id).select().single();
  if (err) {
    if (err.code === "23505") return jsonError("Já existe um colaborador com esse nome.");
    if (err.code === "23503") return jsonError("Setor inválido.");
    return jsonError("Erro ao atualizar colaborador.", 500, err.message);
  }
  await audit("colaborador.alterado", "employees", id, payload);
  return NextResponse.json(atualizado);
}

/**
 * Exclusão com cascata: ocorrências e aliases do colaborador são removidos pelas FKs
 * (on delete cascade). Nada de planilha ou cálculo é persistido no fluxo de sessão.
 */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) return jsonError("ID inválido.");

  const db = await getSupabase();
  const { data: antes, error: err0 } = await db.from("employees").select("nome").eq("id", id).maybeSingle();
  if (err0) return jsonError("Erro ao consultar colaborador.", 500, err0.message);
  if (!antes) return jsonError("Colaborador não encontrado.", 404);

  const { error: err1 } = await db.from("employees").delete().eq("id", id);
  if (err1) return jsonError("Erro ao excluir colaborador.", 500, err1.message);

  await audit("colaborador.excluido", "employees", id, antes);
  return NextResponse.json({ ok: true });
}