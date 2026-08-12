import { NextResponse } from "next/server";
import { jsonError, parseBody, audit, RouteContext } from "@/lib/api";
import { getSupabase } from "@/lib/supabase.server";
import { uuidSchema, criterioSchema } from "@/lib/validators";
import { fromReal, toReal } from "@/lib/money";
import type { BonusType, MetricType, PessoaOrigem } from "@/lib/types";

export async function POST(req: Request, ctx: RouteContext) {
  const { id: sectorId } = await ctx.params;
  if (!uuidSchema.safeParse(sectorId).success) return jsonError("ID inválido.");

  const { data, error } = await parseBody(req, criterioSchema);
  if (error) return error;

  if (data!.sector_id !== sectorId) return jsonError("sector_id não corresponde à URL.");

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
    return jsonError("Critérios 'por faixa' exigem uma métrica (agendamentos, atendimentos ou valor faturado).");
  }

  const db = await getSupabase();
  const valorReais = data!.valor != null ? toReal(fromReal(data!.valor)) : null;
  const { data: criado, error: err } = await db
    .from("bonus_criteria")
    .insert({
      sector_id: sectorId,
      nome: data!.nome,
      descricao: data!.descricao ?? null,
      tipo: data!.tipo as BonusType,
      valor: valorReais,
      metrica: data!.metrica as MetricType,
      pessoa_origem: data!.pessoa_origem as PessoaOrigem,
      ativo: data!.ativo,
      ordem: data!.ordem,
    })
    .select()
    .single();
  if (err) return jsonError("Erro ao criar critério.", 500, err.message);

  if (data!.tiers && data!.tiers.length > 0) {
    const tiers = data!.tiers.map((t) => ({
      criteria_id: criado!.id,
      a_partir_de: t.a_partir_de ?? 0,
      ate: t.ate ?? null,
      a_cada: t.a_cada ?? null,
      valor: toReal(fromReal(t.valor)),
      ordem: t.ordem ?? 0,
    }));
    const { error: errT } = await db.from("bonus_criteria_tiers").insert(tiers);
    if (errT) return jsonError("Erro ao salvar faixas do critério.", 500, errT.message);
  }

  await audit("bono_criterio.criado", "bonus_criteria", criado!.id, { nome: criado!.nome, sector_id: sectorId });
  return NextResponse.json(criado, { status: 201 });
}