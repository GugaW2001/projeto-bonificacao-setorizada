"use client";

import { useState } from "react";
import { Button, Card, Input, Tabela, Empty, Alert, Select } from "./ui";
import Dropzone from "./Dropzone";
import { formatBRL, formatCount } from "@/lib/money";
import { normalizeNome } from "@/lib/normalize";

interface ItemSessaoUi {
  employeeId: string;
  nomeColaborador: string;
  sectorId: string;
  setorTitulo: string;
  criterio: { id: string; nome: string; tipo: string };
  resultado: number;
  unidade: string;
  bonusBruto: number;
  pontos: number;
  percentualManter: number;
  bonusFinal: number;
}

interface ResultadoSessaoUi {
  mes: string;
  arquivo: string;
  headerRow: number;
  linhasMes: number;
  faturamentoTotal: number;
  avisos: { coluna: "quem_agendou" | "quem_atendeu"; nome: string; qtdLinhas: number }[];
  itens: ItemSessaoUi[];
  totais: { bruto: number; descontos: number; final: number };
}

const fmtResultado = (i: ItemSessaoUi) =>
  i.unidade === "R$" ? formatBRL(i.resultado) : `${formatCount(i.resultado)} ${i.unidade}`;

export default function TabBonificacao() {
  const [mes, setMes] = useState("2026-07");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSessaoUi | null>(null);
  const [filtroEmp, setFiltroEmp] = useState("");
  const [erro, setErro] = useState("");

  const calcular = async () => {
    if (!arquivo) return;
    setErro("");
    setResultado(null);
    setFiltroEmp("");
    setCarregando(true);
    try {
      const body = new FormData();
      body.append("file", arquivo);
      body.append("mes_referencia", mes);
      const res = await fetch("/api/session-calc", { method: "POST", body });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(corpo?.error ?? `Erro ${res.status}`);
      setResultado(corpo as ResultadoSessaoUi);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  const baixarPdf = async () => {
    if (!resultado) return;
    setErro("");
    setBaixando(true);
    try {
      const res = await fetch("/api/pdf/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...resultado, employeeId: filtroEmp || undefined }),
      });
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        throw new Error(corpo?.error ?? `Erro ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const nomeFiltro = filtroEmp ? resultado.itens.find((i) => i.employeeId === filtroEmp)?.nomeColaborador : undefined;
      const sufixo = nomeFiltro ? `-${normalizeNome(nomeFiltro).replace(/\s+/g, "-")}` : "";
      a.download = `bonificacao-${resultado.mes}${sufixo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBaixando(false);
    }
  };

  const itensTela = resultado && filtroEmp ? resultado.itens.filter((i) => i.employeeId === filtroEmp) : (resultado?.itens ?? []);
  const totaisTela = resultado && filtroEmp
    ? (() => {
        const bruto = itensTela.reduce((acc, i) => acc + i.bonusBruto, 0);
        const final = itensTela.reduce((acc, i) => acc + i.bonusFinal, 0);
        return { bruto, descontos: bruto - final, final };
      })()
    : resultado?.totais;
  const empOpcoes = [...new Map((resultado?.itens ?? []).map((i) => [i.employeeId, i.nomeColaborador])).entries()];

  const porEmpregado = new Map<string, { nome: string; setor: string; itens: ItemSessaoUi[] }>();
  for (const i of itensTela) {
    const e = porEmpregado.get(i.employeeId) ?? { nome: i.nomeColaborador, setor: i.setorTitulo, itens: [] as ItemSessaoUi[] };
    e.itens.push(i);
    porEmpregado.set(i.employeeId, e);
  }

  return (
    <div className="space-y-6">
      {erro && <Alert>{erro}</Alert>}

      <Card title="Nova sessão de cálculo">
        <div className="space-y-3 max-w-2xl">
          <Dropzone onFile={setArquivo} />
          <div className="flex gap-2 items-end">
            <div>
              <label className="text-xs text-slate-500">Mês de referência</label>
              <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-40" />
            </div>
            <Button onClick={() => void calcular()} disabled={!arquivo || carregando}>
              {carregando ? "Calculando…" : "Calcular bonificação"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          A planilha é processada em memória: nomes são casados automaticamente (exato → alias → fuzzy) e as
          ocorrências do mês são aplicadas. Nada da planilha é persistido — o resultado é novo a cada sessão.
        </p>
      </Card>

      {resultado && (
        <Card
          title={`Resultado da sessão — ${resultado.mes}`}
          actions={
            <Button onClick={() => void baixarPdf()} disabled={baixando}>
              {baixando ? "Gerando…" : "Baixar PDF"}
            </Button>
          }
        >
          <div className="flex gap-2 items-end mb-4">
            <div>
              <label className="text-xs text-slate-500">Filtrar por colaborador</label>
              <Select value={filtroEmp} onChange={(e) => setFiltroEmp(e.target.value)} className="w-64">
                <option value="">Todos os colaboradores</option>
                {empOpcoes.map(([id, nome]) => (
                  <option key={id} value={id}>{nome}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="p-3 rounded-md bg-slate-50"><p className="text-xs text-slate-500">Bônus bruto</p><p className="font-semibold">{formatBRL(totaisTela?.bruto ?? 0)}</p></div>
            <div className="p-3 rounded-md bg-slate-50"><p className="text-xs text-slate-500">Descontos</p><p className="font-semibold text-red-600">{formatBRL(totaisTela?.descontos ?? 0)}</p></div>
            <div className="p-3 rounded-md bg-blue-50"><p className="text-xs text-slate-500">Bônus final</p><p className="font-semibold text-blue-700">{formatBRL(totaisTela?.final ?? 0)}</p></div>
            <div className="p-3 rounded-md bg-slate-50"><p className="text-xs text-slate-500">Linhas do mês</p><p className="font-semibold">{formatCount(resultado.linhasMes)}</p></div>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            {resultado.arquivo} · cabeçalho na linha {resultado.headerRow} · faturamento do mês: {formatBRL(resultado.faturamentoTotal)}
          </p>

          {resultado.avisos.length > 0 && (
            <div className="mb-4 p-3 rounded-md border border-amber-200 bg-amber-50">
              <p className="text-xs font-medium text-amber-800 mb-1">
                Nomes sem correspondência automática ({resultado.avisos.length}) — não entraram no cálculo:
              </p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {resultado.avisos.slice(0, 15).map((a, k) => (
                  <li key={k}>
                    {a.nome} — {a.qtdLinhas} linha(s) ({a.coluna === "quem_agendou" ? "quem agendou" : "quem atendeu"})
                  </li>
                ))}
                {resultado.avisos.length > 15 && <li>… e mais {resultado.avisos.length - 15}</li>}
              </ul>
            </div>
          )}

          {itensTela.length === 0 ? (
            <Empty>Nenhum item calculado — verifique os critérios ativos dos setores.</Empty>
          ) : (
            [...porEmpregado.entries()].map(([empId, e]) => {
              const totalEmp = e.itens.reduce((acc, i) => acc + i.bonusFinal, 0);
              return (
                <div key={empId} className="mb-4 p-3 rounded-md border border-slate-200">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-medium text-sm">
                      {e.nome} <span className="text-xs text-slate-400">({e.setor})</span>
                    </p>
                    <p className="font-semibold text-sm">{formatBRL(totalEmp)}</p>
                  </div>
                  <Tabela head={["Critério", "Resultado", "Bônus bruto", "Pontos", "Mantido", "Final"]}>
                    {e.itens.map((i) => (
                      <tr key={i.criterio.id}>
                        <td className="px-3 py-1.5 text-xs">{i.criterio.nome}</td>
                        <td className="px-3 py-1.5 text-xs">{fmtResultado(i)}</td>
                        <td className="px-3 py-1.5 text-xs">{formatBRL(i.bonusBruto)}</td>
                        <td className="px-3 py-1.5 text-xs">{i.pontos}</td>
                        <td className="px-3 py-1.5 text-xs">{i.percentualManter}%</td>
                        <td className="px-3 py-1.5 text-xs font-medium">{formatBRL(i.bonusFinal)}</td>
                      </tr>
                    ))}
                  </Tabela>
                </div>
              );
            })
          )}
        </Card>
      )}
    </div>
  );
}