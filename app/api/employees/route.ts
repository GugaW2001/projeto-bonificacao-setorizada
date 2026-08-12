import { NextResponse } from "next/server";
import { jsonError, parseBody, audit } from "@/lib/api";
import { getSupabase } from "@/lib/supabase.server";
import { employeeSchema } from "@/lib/validators";
import { normalizeNome } from "@/lib/normalize";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ativo = url.searchParams.get("ativo");
  const sectorId = url.searchParams.get("sector_id");

  const db = await getSupabase();
  let query = db.from("employees").select("*, sectors(titulo)").order("nome");
  if (ativo === "1") query = query.eq("ativo", true);
  if (ativo === "0") query = query.eq("ativo", false);
  if (sectorId) query = query.eq("sector_id", sectorId);

  const { data, error } = await query;
  if (error) return jsonError("Erro ao listar colaboradores.", 500, error.message);

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const { data, error } = await parseBody(req, employeeSchema);
  if (error) return error;

  const db = await getSupabase();
  const chaveNormalizada = normalizeNome(data!.nome);
  const { data: criado, error: err } = await db
    .from("employees")
    .insert({
      nome: data!.nome,
      chave_normalizada: chaveNormalizada,
      sector_id: data!.sector_id,
      data_entrada: data!.data_entrada ?? null,
      ativo: data!.ativo,
    })
    .select()
    .single();
  if (err) {
    if (err.code === "23505") return jsonError("Já existe um colaborador com esse nome.");
    if (err.code === "23503") return jsonError("Setor inválido.");
    return jsonError("Erro ao criar colaborador.", 500, err.message);
  }
  await audit("colaborador.criado", "employees", criado!.id, { nome: criado!.nome });
  return NextResponse.json(criado, { status: 201 });
}