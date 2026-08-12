import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseBody, audit, RouteContext } from "@/lib/api";
import { getSupabase } from "@/lib/supabase.server";
import { uuidSchema, sectorSchema } from "@/lib/validators";

const patchSchema = sectorSchema.partial();
export type SectorPatchInput = z.infer<typeof patchSchema>;

export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) return jsonError("ID inválido.");

  const { data, error } = await parseBody(req, patchSchema);
  if (error) return error;

  const db = await getSupabase();
  const { data: atualizado, error: err } = await db
    .from("sectors")
    .update({ titulo: data!.titulo, ativo: data!.ativo })
    .eq("id", id)
    .select()
    .single();
  if (err) {
    if (err.code === "23505") return jsonError("Já existe um setor com esse título.");
    return jsonError("Erro ao atualizar setor.", 500, err.message);
  }
  await audit("sector.alterado", "sectors", id, data!);
  return NextResponse.json(atualizado);
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) return jsonError("ID inválido.");

  const db = await getSupabase();
  const { data: antes, error: err0 } = await db.from("sectors").select("titulo").eq("id", id).maybeSingle();
  if (err0) return jsonError("Erro ao consultar setor.", 500, err0.message);
  if (!antes) return jsonError("Setor não encontrado.", 404);

  const { error: err1 } = await db.from("sectors").delete().eq("id", id);
  if (err1) {
    if (err1.code === "23503") return jsonError("Setor possui colaboradores vinculados — mova ou inative-os antes de excluir.");
    return jsonError("Erro ao excluir setor.", 500, err1.message);
  }
  await audit("sector.excluido", "sectors", id, antes);
  return NextResponse.json({ ok: true });
}