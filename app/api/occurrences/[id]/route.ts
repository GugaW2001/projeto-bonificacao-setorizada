import { NextResponse } from "next/server";
import { jsonError, parseBody, audit, RouteContext } from "@/lib/api";
import { getSupabase } from "@/lib/supabase.server";
import { uuidSchema, occurrenceSchema } from "@/lib/validators";

const patchSchema = occurrenceSchema.partial();

export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) return jsonError("ID inválido.");

  const { data, error } = await parseBody(req, patchSchema);
  if (error) return error;

  const db = await getSupabase();

  let status: string | null = null;
  if (data!.criteria_ids !== undefined) {
    const { data: emp, error: errEmp } = await db
      .from("employees")
      .select("sector_id")
      .eq("id", data!.employee_id!)
      .single();
    if (errEmp) return jsonError("Colaborador não encontrado.", 404);
    const { data: criterios, error: errC } = await db
      .from("bonus_criteria")
      .select("id, sector_id, nome")
      .in("id", data!.criteria_ids);
    if (errC) return jsonError("Erro ao validar critérios.", 500, errC.message);

    const idsValidos = [...new Set((criterios ?? []).filter((c) => c.sector_id === emp!.sector_id).map((c) => c.id as string))];
    if (idsValidos.length === 0) return jsonError("Nenhum critério válido para o setor do colaborador.");

    const { error: errLig } = await db.from("occurrence_criteria").delete().eq("occurrence_id", id);
    if (errLig) return jsonError("Erro ao redefinir critérios.", 500, errLig.message);
    const { error: errIns } = await db.from("occurrence_criteria").insert(
      idsValidos.map((cid) => ({ occurrence_id: id, criteria_id: cid }))
    );
    if (errIns) return jsonError("Erro ao salvar critérios.", 500, errIns.message);
    status = `criteria_ids=${JSON.stringify(idsValidos)}`;
  }

  const payload: Record<string, unknown> = {};
  if (data!.data !== undefined) payload.data = data!.data;
  if (data!.gravidade !== undefined) payload.gravidade = data!.gravidade;
  if (data!.observacoes !== undefined) payload.observacoes = data!.observacoes ?? null;
  if (data!.employee_id !== undefined) payload.employee_id = data!.employee_id;

  const { data: atualizada, error: errOcc } = await db.from("occurrences").update(payload).eq("id", id).select().single();
  if (errOcc) return jsonError("Erro ao atualizar ocorrência.", 500, errOcc.message);

  await audit("ocorrencia.alterada", "occurrences", id, { ...payload, status });
  return NextResponse.json(atualizada);
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) return jsonError("ID inválido.");

  const db = await getSupabase();
  const { error } = await db.from("occurrences").delete().eq("id", id);
  if (error) return jsonError("Erro ao excluir ocorrência.", 500, error.message);
  await audit("ocorrencia.excluida", "occurrences", id);
  return NextResponse.json({ ok: true });
}