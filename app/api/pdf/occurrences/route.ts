import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabase } from "@/lib/supabase.server";
import { occurrencesReportSchema } from "@/lib/validators";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = occurrencesReportSchema.safeParse({
    mes: url.searchParams.get("mes"),
    employee_id: url.searchParams.get("employee_id") ?? undefined,
  });
  if (!parsed.success) return jsonError("Parâmetros inválidos (formato AAAA-MM).");

  const { mes, employee_id } = parsed.data;
  const db = await getSupabase();

  let query = db
    .from("occurrences")
    .select("*, employees(nome, sector_id, sectors(titulo)), occurrence_criteria(bonus_criteria(id, nome))")
    .gte("data", `${mes}-01`)
    .lte("data", `${mes}-31`)
    .order("data", { ascending: false });
  if (employee_id) query = query.eq("employee_id", employee_id);
  const { data: ocorrencias, error } = await query;
  if (error) return jsonError("Erro ao gerar relatório.", 500, error.message);

  const pdfkit = await import("pdfkit");
  const Doc = pdfkit.default ?? pdfkit;
  const doc = new Doc({ size: "A4", margin: 40 });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  doc.fontSize(16).text(`Relatório de Ocorrências — ${mes}`, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor("#666").text(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`, { align: "center" });
  doc.moveDown(1);

  const rows = (ocorrencias ?? []).map((o) => ({
    data: String(o.data),
    colaborador: (o as { employees?: { nome?: string; sectors?: { titulo?: string }[] | { titulo?: string } } }).employees?.nome ?? "—",
    setor: (() => {
      const s = (o as { employees?: { sectors?: { titulo?: string }[] | { titulo?: string } } }).employees?.sectors;
      return s ? (Array.isArray(s) ? s[0]?.titulo ?? "" : s.titulo) : "";
    })(),
    gravidade: o.gravidade as number,
    criterios: (o as { occurrence_criteria?: { bonus_criteria: { nome: string } }[] }).occurrence_criteria
      ?.map((c) => c.bonus_criteria.nome)
      .join(", ") ?? "",
    observacoes: o.observacoes ?? "",
  }));

  if (rows.length === 0) {
    doc.fontSize(11).text("Nenhuma ocorrência no período.");
  } else {
    const grav = (g: number) => (g === 3 ? "#dc2626" : g === 2 ? "#f59e0b" : "#16a34a");
    rows.forEach((r) => {
      doc.fontSize(10).fillColor("#111");
      doc.text(`${r.data}  •  ${r.colaborador}  •  ${r.setor}`, { continued: false });
      doc.fillColor(grav(r.gravidade)).font("Helvetica-Bold").text(` Gravidade ${r.gravidade}`, { align: "right" });
      doc.fillColor("#444").font("Helvetica").fontSize(9).text(`Critérios: ${r.criterios}`);
      if (r.observacoes) doc.fillColor("#666").fontSize(8.5).text(`Obs.: ${r.observacoes}`);
      doc.moveDown(0.6);
    });
  }

  doc.end();
  await done;
  const pdf = Buffer.concat(chunks);

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ocorrencias-${mes}.pdf"`,
    },
  });
}