"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Select, Tabela, Empty, Badge, Alert } from "./ui";
import type { SetorUi, ColaboradorUi } from "./types";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const corpo = await res.json().catch(() => null);
  if (!res.ok) throw new Error(corpo?.error ?? `Erro ${res.status}`);
  return corpo as T;
}

export default function TabColaboradores() {
  const [colaboradores, setColaboradores] = useState<ColaboradorUi[]>([]);
  const [setores, setSetores] = useState<SetorUi[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState("");

  const [nome, setNome] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [dataEntrada, setDataEntrada] = useState("");

  const carregar = async () => {
    try {
      const [cs, ss] = await Promise.all([api<ColaboradorUi[]>("/api/employees"), api<SetorUi[]>("/api/sectors")]);
      setColaboradores(cs);
      setSetores(ss);
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => {
    void carregar();
  }, []);

  const criar = async () => {
    setErro("");
    if (!nome.trim() || !sectorId) return;
    try {
      await api("/api/employees", {
        method: "POST",
        body: JSON.stringify({ nome: nome.trim(), sector_id: sectorId, data_entrada: dataEntrada || null }),
      });
      setNome("");
      setDataEntrada("");
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const alternarAtivo = async (c: ColaboradorUi) => {
    try {
      await api(`/api/employees/${c.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !c.ativo }) });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const excluir = async (c: ColaboradorUi) => {
    if (!confirm(`Excluir "${c.nome}"? Ocorrências e itens de cálculos vinculados também serão removidos e os totais recalculados.`)) return;
    setErro("");
    try {
      await api(`/api/employees/${c.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const nomeSetor = (c: ColaboradorUi) => {
    const s = c.sectors;
    return Array.isArray(s) ? s[0]?.titulo ?? "" : s?.titulo ?? "";
  };

  const filtrados = colaboradores.filter((c) => c.nome.toLowerCase().includes(filtro.toLowerCase()));

  if (carregando) return <div className="text-sm text-slate-400">Carregando colaboradores…</div>;

  return (
    <div className="space-y-6">
      {erro && <Alert>{erro}</Alert>}

      <Card title="Novo colaborador">
        <div className="flex gap-2 max-w-3xl flex-wrap">
          <Input placeholder="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} className="md:flex-1" />
          <Select value={sectorId} onChange={(e) => setSectorId(e.target.value)} className="md:w-48">
            <option value="">Setor…</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>{s.titulo}</option>
            ))}
          </Select>
          <Input type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} className="md:w-40" />
          <Button onClick={criar}>Adicionar</Button>
        </div>
      </Card>

      <Card
        title={`Colaboradores (${filtrados.length})`}
        actions={<Input placeholder="Buscar por nome…" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="w-56" />}
      >
        {filtrados.length === 0 ? (
          <Empty>Nenhum colaborador encontrado.</Empty>
        ) : (
          <Tabela head={["Nome", "Setor", "Entrada", "Status", ""]}>
            {filtrados.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 font-medium">{c.nome}</td>
                <td className="px-3 py-2">{nomeSetor(c)}</td>
                <td className="px-3 py-2">{c.data_entrada ?? "—"}</td>
                <td className="px-3 py-2">{c.ativo ? <Badge tone="green">ativo</Badge> : <Badge tone="red">inativo</Badge>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" onClick={() => void alternarAtivo(c)}>
                    {c.ativo ? "Inativar" : "Ativar"}
                  </Button>
                  <Button variant="danger" className="ml-2" onClick={() => void excluir(c)}>
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
          </Tabela>
        )}
      </Card>
    </div>
  );
}