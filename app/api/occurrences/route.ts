import { NextResponse } from "next/server";
import { jsonError, parseBody, audit } from "@/lib/api";
import { getSupabase } from "@/lib/supabase.server";
import { occurrenceSchema } from "@/lib/validators";
import type { OccurrenceDetail } from "@/lib/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mes = url.searchParams.get("mes");
  const employeeId = url.searchParams.get("employee_id");

  const db = await getSupabase();
  let query = db
    .from("occurrences")
    .select("*, employees(nome, sector_id, sectors(titulo)), occurrence_criteria(bonus_criteria(id, nome))")
    .order("data", { ascending: false });
  if (mes) query = query.gte("data", `${mes}-01`).lte("data", `${mes}-31`);
  if (employeeId) query = query.eq("employee_id", employeeId);

  const { data, error } = await query;
  if (error) return jsonError("Erro ao listar ocorrências.", 500, error.message);

  const detalhes: OccurrenceDetail[] = (data ?? []).map((o) => ({
    ...o,
    nome_colaborador: o.employees?.nome ?? "Colaborador removido",
    nome_setor: o.employees?.sectors?.titulo ?? "",
    criterios: (o.occurrence_criteria ?? []).map((oc: { bonus_criteria: { id: string; nome: string } }) => ({
      id: oc.bonus_criteria.id,
      nome: oc.bonus_criteria.nome,
    })),
  }));

  return NextResponse.json(detalhes);
}

export async function POST(req: Request) {
  const { data, error } = await parseBody(req, occurrenceSchema);
  if (error) return error;

  const db = await getSupabase();

  // Valida: o colaborador existe e os critérios pertencem ao setor dele
  const { data: emp, error: errEmp } = await db
    .from("employees")
    .select("sector_id, sectors(titulo)")
    .eq("id", data!.employee_id)
    .single();
  if (errEmp) return jsonError("Colaborador não encontrado.", 404);

  const empRaw = emp as { sector_id: string; sectors?: { titulo: string }[] | { titulo: string } };
  const sectorId = empRaw.sector_id;
  if (!sectorId) return jsonError("Colaborador não pertence a um setor.");
  const tituloSetor = Array.isArray(empRaw.sectors) ? empRaw.sectors[0]?.titulo : empRaw.sectors?.titulo;

  const { data: criterios, error: errC } = await db
    .from("bonus_criteria")
    .select("id, sector_id, nome")
    .in("id", data!.criteria_ids);
  if (errC) return jsonError("Erro ao validar critérios.", 500, errC.message);

  const idsValidos = new Set<string>();
  const incompativeis: string[] = [];
  for (const c of criterios ?? []) {
    if (c.sector_id === sectorId) idsValidos.add(c.id as string);
    else incompativeis.push(c.nome);
  }
  if (incompativeis.length > 0) {
    return jsonError(
      `Critérios de outro setor: ${incompativeis.join(", ")} — ocorrência deve usar critérios do setor ${tituloSetor ?? ""}.`
    );
  }
  if (idsValidos.size === 0) return jsonError("Nenhum critério válido para o setor do colaborador.");

  const { data: criada, error: errOcc } = await db
    .from("occurrences")
    .insert({
      employee_id: data!.employee_id,
      data: data!.data,
      gravidade: data!.gravidade,
      observacoes: data!.observacoes ?? null,
    })
    .select()
    .single();
  if (errOcc) return jsonError("Erro ao registrar ocorrência.", 500, errOcc.message);

  const { error: errLig } = await db.from("occurrence_criteria").insert(
    [...idsValidos].map((cid) => ({ occurrence_id: criada!.id, criteria_id: cid }))
  );
  if (errLig) return jsonError("Erro ao vincular critérios.", 500, errLig.message);

  await audit("ocorrencia.criada", "occurrences", criada!.id, {
    employee_id: data!.employee_id,
    gravidade: data!.gravidade,
    criteria_ids: [...idsValidos],
  });
  return NextResponse.json(criada, { status: 201 });
}