"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Select, Tabela, Empty, Badge, Alert } from "./ui";
import type { SetorUi, ColaboradorUi, OcorrenciaUi } from "./types";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const corpo = await res.json().catch(() => null);
  if (!res.ok) throw new Error(corpo?.error ?? `Erro ${res.status}`);
  return corpo as T;
}

export default function TabOcorrencias() {
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaUi[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorUi[]>([]);
  const [setores, setSetores] = useState<SetorUi[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));

  const [employeeId, setEmployeeId] = useState("");
  const [data, setData] = useState("");
  const [gravidade, setGravidade] = useState(1);
  const [criteriaIds, setCriteriaIds] = useState<string[]>([]);
  const [obs, setObs] = useState("");

  const carregar = useCallback(async () => {
    try {
      const url = mes ? `/api/occurrences?mes=${mes}` : "/api/occurrences";
      const [ocs, emps, ss] = await Promise.all([
        api<OcorrenciaUi[]>(url),
        api<ColaboradorUi[]>("/api/employees?ativo=1"),
        api<SetorUi[]>("/api/sectors"),
      ]);
      setOcorrencias(ocs);
      setColaboradores(emps);
      setSetores(ss);
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [mes]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const setorDoEmp = (empId: string) => colaboradores.find((c) => c.id === empId)?.sector_id ?? "";
  const criteriosDoEmp = (empId: string) => setores.find((s) => s.id === setorDoEmp(empId))?.criterios ?? [];

  const selecionarEmp = (empId: string) => {
    setEmployeeId(empId);
    setCriteriaIds([]);
  };

  const criar = async () => {
    setErro("");
    if (!employeeId || !data || criteriaIds.length === 0) return;
    try {
      await api("/api/occurrences", {
        method: "POST",
        body: JSON.stringify({ employee_id: employeeId, data, gravidade, criteria_ids: criteriaIds, observacoes: obs || null }),
      });
      setObs("");
      setCriteriaIds([]);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir esta ocorrência?")) return;
    try {
      await api(`/api/occurrences/${id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const toneGrav = (g: number) => (g === 3 ? "red" : g === 2 ? "amber" : "green") as "red" | "amber" | "green";

  if (carregando) return <div className="text-sm text-slate-400">Carregando ocorrências…</div>;

  return (
    <div className="space-y-6">
      {erro && <Alert>{erro}</Alert>}

      <div className="flex gap-2 items-end">
        <div>
          <label className="text-xs text-slate-500">Mês</label>
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-40" />
        </div>
        <Button variant="ghost" onClick={() => void carregar()}>Atualizar</Button>
      </div>

      <Card title="Nova ocorrência">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
          <Select value={employeeId} onChange={(e) => selecionarEmp(e.target.value)}>
            <option value="">Colaborador…</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </Select>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <Select value={gravidade} onChange={(e) => setGravidade(Number(e.target.value))}>
            <option value={1}>Gravidade 1 — leve</option>
            <option value={2}>Gravidade 2 — média</option>
            <option value={3}>Gravidade 3 — grave</option>
          </Select>
          <div className="md:col-span-2">
            <p className="text-xs text-slate-500 mb-1.5">Critérios afetados — pode marcar vários</p>
            {employeeId && criteriosDoEmp(employeeId).length === 0 ? (
              <p className="text-xs text-slate-400">Nenhum critério cadastrado para o setor deste colaborador.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {employeeId &&
                  criteriosDoEmp(employeeId).map((c) => {
                    const marcado = criteriaIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border cursor-pointer select-none ${
                          marcado ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          checked={marcado}
                          onChange={() =>
                            setCriteriaIds((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                          }
                        />
                        {c.nome}
                      </label>
                    );
                  })}
              </div>
            )}
          </div>
          <Input placeholder="Observações (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} className="md:col-span-2" />
        </div>
        <Button className="mt-3" onClick={criar} disabled={!employeeId || !data || criteriaIds.length === 0}>
          Registrar ocorrência
        </Button>
      </Card>

      <Card title={`Ocorrências de ${mes} (${ocorrencias.length})`} actions={<a href={`/api/pdf/occurrences?mes=${mes}`} target="_blank"><Button variant="ghost">PDF</Button></a>}>
        {ocorrencias.length === 0 ? (
          <Empty>Nenhuma ocorrência no período.</Empty>
        ) : (
          <Tabela head={["Data", "Colaborador", "Setor", "Gravidade", "Critérios", "Obs.", ""]}>
            {ocorrencias.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2 whitespace-nowrap">{o.data}</td>
                <td className="px-3 py-2 font-medium">{o.nome_colaborador}</td>
                <td className="px-3 py-2">{o.nome_setor}</td>
                <td className="px-3 py-2"><Badge tone={toneGrav(o.gravidade)}>{o.gravidade}</Badge></td>
                <td className="px-3 py-2 text-xs">{o.criterios.map((c) => c.nome).join(", ")}</td>
                <td className="px-3 py-2 text-xs text-slate-500 max-w-40 truncate">{o.observacoes ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="danger" onClick={() => void excluir(o.id)}>Excluir</Button>
                </td>
              </tr>
            ))}
          </Tabela>
        )}
      </Card>
    </div>
  );
}