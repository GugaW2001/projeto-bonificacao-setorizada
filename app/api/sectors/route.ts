import { NextResponse } from "next/server";
import { sectorSchema } from "@/lib/validators";
import { parseBody, jsonError, audit, num } from "@/lib/api";
import { getSupabase } from "@/lib/supabase.server";
import type { SectorDetail, SectorRow, CriteriaRow, TierRow, DiscountRuleRow } from "@/lib/types";

export async function GET() {
  const db = await getSupabase();

  const { data: setores, error } = await db.from("sectors").select("*").order("titulo");
  if (error) return jsonError("Erro ao listar setores.", 500, error.message);

  const criterios: CriteriaRow[] = [];
  const tiers: TierRow[] = [];
  const [c, t, r] = await Promise.all([
    db.from("bonus_criteria").select("*").order("ordem"),
    db.from("bonus_criteria_tiers").select("*").order("ordem"),
    db.from("sector_discount_rules").select("*").order("min_pontos"),
  ]);
  if (c.error || t.error || r.error) return jsonError("Erro ao carregar detalhes.", 500, (c.error ?? t.error ?? r.error)?.message);
  criterios.push(...(c.data ?? []));
  tiers.push(...(t.data ?? []));

  const detalhes: SectorDetail[] = (setores ?? []).map((s: SectorRow) => ({
    ...s,
    criterios: criterios
      .filter((cri) => cri.sector_id === s.id)
      .map((cri) => ({
        ...cri,
        valor: cri.valor === null ? null : num(cri.valor),
        tiers: tiers.filter((ti) => ti.criteria_id === cri.id).map((ti) => ({ ...ti, a_partir_de: num(ti.a_partir_de), ate: ti.ate === null ? null : num(ti.ate), a_cada: ti.a_cada === null ? null : num(ti.a_cada), valor: num(ti.valor) })),
      })),
    regras_desconto: (r.data ?? []).filter((rg) => rg.sector_id === s.id).map((rg: DiscountRuleRow) => ({ ...rg })),
  }));

  return NextResponse.json(detalhes);
}

export async function POST(req: Request) {
  const { data, error } = await parseBody(req, sectorSchema);
  if (error) return error;

  const db = await getSupabase();
  const { data: criado, error: err } = await db.from("sectors").insert({ titulo: data!.titulo, ativo: data!.ativo }).select().single();
  if (err) {
    if (err.code === "23505") return jsonError("Já existe um setor com esse título.");
    return jsonError("Erro ao criar setor.", 500, err.message);
  }
  await audit("sector.criado", "sectors", criado!.id, { titulo: criado!.titulo });
  return NextResponse.json(criado, { status: 201 });
}