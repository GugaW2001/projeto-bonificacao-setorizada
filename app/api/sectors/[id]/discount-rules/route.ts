import { NextResponse } from "next/server";
import { jsonError, parseBody, audit, RouteContext } from "@/lib/api";
import { getSupabase } from "@/lib/supabase.server";
import { uuidSchema, discountRulesSchema } from "@/lib/validators";

export async function PUT(req: Request, ctx: RouteContext) {
  const { id: sectorId } = await ctx.params;
  if (!uuidSchema.safeParse(sectorId).success) return jsonError("ID inválido.");

  const { data, error } = await parseBody(req, discountRulesSchema);
  if (error) return error;

  // Validação de sobreposição de faixas
  const ordenadas = [...data!.rules].sort((a, b) => a.min_pontos - b.min_pontos);
  for (let i = 0; i < ordenadas.length; i++) {
    const atual = ordenadas[i];
    const prox = ordenadas[i + 1];
    if (atual.max_pontos != null && prox && atual.max_pontos >= prox.min_pontos) {
      return jsonError("Faixas de desconto não podem se sobrepor.");
    }
    if (atual.max_pontos == null && prox) {
      return jsonError("A última faixa deve ser aberta (sem limite superior); as demais precisam de max_pontos.");
    }
  }
  if (ordenadas.length > 0 && ordenadas[ordenadas.length - 1].max_pontos != null) {
    return jsonError("A última faixa deve ter limite superior aberto (null).");
  }

  const db = await getSupabase();
  const { error: errDel } = await db.from("sector_discount_rules").delete().eq("sector_id", sectorId);
  if (errDel) return jsonError("Erro ao substituir regras.", 500, errDel.message);

  const { error: errIns } = await db.from("sector_discount_rules").insert(
    data!.rules.map((r, i) => ({
      sector_id: sectorId,
      min_pontos: r.min_pontos,
      max_pontos: r.max_pontos ?? null,
      percentual_manter: r.percentual_manter,
      ordem: r.ordem ?? i,
    }))
  );
  if (errIns) return jsonError("Erro ao salvar regras de desconto.", 500, errIns.message);

  await audit("sector.regras_desconto", "sectors", sectorId, { rules: data!.rules });
  return NextResponse.json({ ok: true });
}