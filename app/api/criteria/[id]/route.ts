import { NextResponse } from "next/server";
import { jsonError, parseBody, audit, RouteContext } from "@/lib/api";
import { getSupabase } from "@/lib/supabase.server";
import { uuidSchema, criterioSchema } from "@/lib/validators";
import { fromReal, toReal } from "@/lib/money";
import type { BonusType, MetricType, PessoaOrigem } from "@/lib/types";

export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) return jsonError("ID inválido.");

  const { data, error } = await parseBody(req, criterioSchema);
  if (error) return error;

  if (data!.tipo !== "por_faixa" && (!data!.valor || data!.valor < 0)) {
    return jsonError("Critérios fixa/por resultado exigem um valor de bonificação válido.");
  }
  if (data!.tipo !== "por_faixa" && (data!.tiers?.length ?? 0) > 0) {
    return jsonError("Faixas só são permitidas para critérios do tipo 'por faixa'.");
  }
  if (data!.tipo === "por_faixa" && (data!.tiers?.length ?? 0) === 0) {
    return jsonError("Critérios 'por faixa' exigem ao menos uma faixa.");
  }
  if (data!.tipo === "por_faixa" && data!.metrica === "nenhuma") {
    return jsonError("Critérios 'por faixa' exigem uma métrica.");
  }

  const db = await getSupabase();
  const valorReais = data!.valor != null ? toReal(fromReal(data!.valor)) : null;

  const { data: atualizado, error: err } = await db
    .from("bonus_criteria")
    .update({
      nome: data!.nome,
      descricao: data!.descricao ?? null,
      tipo: data!.tipo as BonusType,
      valor: valorReais,
      metrica: data!.metrica as MetricType,
      pessoa_origem: data!.pessoa_origem as PessoaOrigem,
      ativo: data!.ativo,
      ordem: data!.ordem,
    })
    .eq("id", id)
    .select()
    .single();
  if (err) return jsonError("Erro ao atualizar critério.", 500, err.message);

  // Substitui as faixas (tiers não possuem referências externas)
  const { error: errDel } = await db.from("bonus_criteria_tiers").delete().eq("criteria_id", id);
  if (errDel) return jsonError("Erro ao substituir faixas.", 500, errDel.message);

  if (data!.tiers && data!.tiers.length > 0) {
    const { error: errIns } = await db.from("bonus_criteria_tiers").insert(
      data!.tiers.map((t, i) => ({
        criteria_id: id,
        a_partir_de: t.a_partir_de ?? 0,
        ate: t.ate ?? null,
        a_cada: t.a_cada ?? null,
        valor: toReal(fromReal(t.valor)),
        ordem: t.ordem ?? i,
      }))
    );
    if (errIns) return jsonError("Erro ao salvar faixas do critério.", 500, errIns.message);
  }

  await audit("bono_criterio.alterado", "bonus_criteria", id, { nome: data!.nome });
  return NextResponse.json(atualizado);
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) return jsonError("ID inválido.");

  const db = await getSupabase();
  const { error } = await db.from("bonus_criteria").delete().eq("id", id);
  if (error) return jsonError("Erro ao excluir critério.", 500, error.message);
  await audit("bono_criterio.excluido", "bonus_criteria", id);
  return NextResponse.json({ ok: true });
}