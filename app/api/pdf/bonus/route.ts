import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { sessionPdfSchema } from "@/lib/validators";
import { formatBRL } from "@/lib/money";

export async function POST(req: Request) {
  const { data, error } = await parseBody(req, sessionPdfSchema);
  if (error) return error;

  const { mes, arquivo, avisos, itens, totais, faturamentoTotal } = data!;

  const pdfkit = await import("pdfkit");
  const Doc = pdfkit.default ?? pdfkit;
  const doc = new Doc({ size: "A4", margin: 40 });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  doc.fontSize(16).text(`Relatório de Bonificação — ${mes}`, { align: "center" });
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor("#666").text(
    [arquivo ? `Sessão: ${arquivo}` : "", faturamentoTotal != null ? `Faturamento do mês: ${formatBRL(faturamentoTotal)}` : ""]
      .filter(Boolean)
      .join("  ·  "),
    { align: "center" }
  );
  doc.moveDown(1);

  const porEmp = new Map<string, { nome: string; setor: string; itens: typeof itens }>();
  for (const i of itens) {
    const e = porEmp.get(i.employeeId) ?? { nome: i.nomeColaborador, setor: i.setorTitulo, itens: [] as typeof itens };
    e.itens.push(i);
    porEmp.set(i.employeeId, e);
  }

  const totalGeral = { bruto: 0, final: 0 };
  let idx = 0;
  for (const e of porEmp.values()) {
    idx++;
    const totalEmp = e.itens.reduce(
      (acc, i) => {
        acc.bruto += i.bonusBruto;
        acc.final += i.bonusFinal;
        return acc;
      },
      { bruto: 0, final: 0 }
    );
    totalGeral.bruto += totalEmp.bruto;
    totalGeral.final += totalEmp.final;

    doc.fillColor("#0b5394").font("Helvetica-Bold").fontSize(11).text(`${idx}. ${e.nome} (${e.setor})`);
    doc.fillColor("#111").font("Helvetica").fontSize(9);
    for (const i of e.itens) {
      let linha = `${i.criterio.nome}: ${formatBRL(i.bonusBruto)}`;
      if (i.pontos > 0) linha += ` — ${i.pontos} pts → ${i.percentualManter}%`;
      linha += ` = ${formatBRL(i.bonusFinal)}`;
      doc.text(`  ${linha}`);
    }
    doc.fillColor("#0b5394").font("Helvetica-Bold").fontSize(9.5).text(`  TOTAL: ${formatBRL(totalEmp.final)}`);
    doc.fillColor("#111").font("Helvetica").moveDown(0.6);
  }

  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#bbb").stroke();
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111").text(
    `Totais  •  Bruto: ${formatBRL(totalGeral.bruto)}  •  Descontos: ${formatBRL(totais.descontos)}  •  Final: ${formatBRL(totalGeral.final)}`
  );

  if (avisos.length > 0) {
    doc.moveDown(0.8);
    doc.fillColor("#b45309").fontSize(9).text(`Avisos — nomes sem correspondência no mês (${avisos.length}):`);
    doc.fillColor("#666").font("Helvetica").fontSize(8);
    for (const a of avisos.slice(0, 25)) {
      doc.text(`  • ${a.nome} — ${a.qtdLinhas} linha(s) (${a.coluna === "quem_agendou" ? "quem agendou" : "quem atendeu"})`);
    }
  }

  doc.end();
  await done;
  const pdf = Buffer.concat(chunks);

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="bonificacao-${mes}.pdf"`,
    },
  });
}