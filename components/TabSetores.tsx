"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Select, Tabela, Empty, Badge, Alert } from "./ui";
import type { SetorUi, CriterioUI, TierUI, RegraDescontoUI } from "./types";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const corpo = await res.json().catch(() => null);
  if (!res.ok) throw new Error(corpo?.error ?? `Erro ${res.status}`);
  return corpo as T;
}

const tierVazio = (): TierUI => ({ a_partir_de: 0, ate: null, a_cada: null, valor: 0, ordem: 0 });

const regraVazia = (): RegraDescontoUI => ({ min_pontos: 0, max_pontos: null, percentual_manter: 100, ordem: 0 });

export default function TabSetores() {
  const [setores, setSetores] = useState<SetorUi[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [novoSetor, setNovoSetor] = useState("");

  const [editando, setEditando] = useState<SetorUi | null>(null);
  const [nomeCriterio, setNomeCriterio] = useState("");
  const [tipoCriterio, setTipoCriterio] = useState<CriterioUI["tipo"]>("por_resultado");
  const [valorCriterio, setValorCriterio] = useState("");
  const [metricaCriterio, setMetricaCriterio] = useState<CriterioUI["metrica"]>("agendamentos");
  const [origemCriterio, setOrigemCriterio] = useState<"quem_atendeu" | "quem_agendou">("quem_atendeu");
  const [tiers, setTiers] = useState<TierUI[]>([tierVazio()]);
  const [regrasEmEdicao, setRegrasEmEdicao] = useState<string | null>(null);
  const [regrasDraft, setRegrasDraft] = useState<RegraDescontoUI[]>([]);

  const carregar = async () => {
    try {
      setSetores(await api<SetorUi[]>("/api/sectors"));
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

  const criarSetor = async () => {
    setErro("");
    if (!novoSetor.trim()) return;
    try {
      await api("/api/sectors", { method: "POST", body: JSON.stringify({ titulo: novoSetor.trim() }) });
      setNovoSetor("");
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const salvarCriterio = async () => {
    if (!editando) return;
    setErro("");
    try {
      const body = {
        sector_id: editando.id,
        nome: nomeCriterio,
        tipo: tipoCriterio,
        valor: tipoCriterio === "por_faixa" ? null : Number(valorCriterio),
        metrica: tipoCriterio === "fixa" ? "nenhuma" : tipoCriterio === "por_faixa" ? "valor_faturado" : metricaCriterio,
        pessoa_origem: tipoCriterio === "por_resultado" ? origemCriterio : null,
        tiers: tipoCriterio === "por_faixa" ? tiers : [],
      };
      await api("/api/sectors/" + editando.id + "/criteria", { method: "POST", body: JSON.stringify(body) });
      setEditando(null);
      setNomeCriterio("");
      setValorCriterio("");
      setTiers([tierVazio()]);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const iniciarEdicaoRegras = (s: SetorUi) => {
    setRegrasDraft((s.regras_desconto.length > 0 ? s.regras_desconto : [regraVazia()]).map((r) => ({ ...r })));
    setRegrasEmEdicao(s.id);
  };

  const atualizarRegra = (i: number, patch: Partial<RegraDescontoUI>) =>
    setRegrasDraft((d) => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const salvarRegras = async (s: SetorUi) => {
    setErro("");
    try {
      await api(`/api/sectors/${s.id}/discount-rules`, {
        method: "PUT",
        body: JSON.stringify({ rules: regrasDraft.map((r, i) => ({ ...r, ordem: i })) }),
      });
      setRegrasEmEdicao(null);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const alternarAtivo = async (s: SetorUi) => {
    setErro("");
    try {
      await api(`/api/sectors/${s.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !s.ativo }) });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const excluir = async (s: SetorUi) => {
    if (!confirm(`Excluir o setor "${s.titulo}" e seus critérios/regras?`)) return;
    setErro("");
    try {
      await api(`/api/sectors/${s.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const excluirCriterio = async (c: CriterioUI) => {
    if (!confirm(`Excluir o critério "${c.nome}"? Ele será removido do cadastro e das ocorrências que o citam.`)) return;
    setErro("");
    try {
      await api(`/api/criteria/${c.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  if (carregando) return <div className="text-sm text-slate-400">Carregando setores…</div>;

  return (
    <div className="space-y-6">
      {erro && <Alert>{erro}</Alert>}

      <Card title="Novo setor">
        <div className="flex gap-2 max-w-md">
          <Input placeholder="Título do setor (ex.: Recepção)" value={novoSetor} onChange={(e) => setNovoSetor(e.target.value)} />
          <Button onClick={criarSetor}>Criar</Button>
        </div>
      </Card>

      {setores.length === 0 && <Empty>Nenhum setor cadastrado.</Empty>}

      {setores.map((s) => (
        <Card
          key={s.id}
          title={`${s.titulo} ${s.ativo ? "" : "(inativo)"}`}
          actions={
            <>
              <Button variant="ghost" onClick={() => void alternarAtivo(s)}>
                {s.ativo ? "Inativar" : "Ativar"}
              </Button>
              <Button variant="danger" onClick={() => void excluir(s)}>
                Excluir
              </Button>
            </>
          }
        >
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-slate-600 mb-2">Critérios de bonificação</h4>
            {s.criterios.length === 0 && <p className="text-xs text-slate-400">Nenhum critério.</p>}
            <Tabela head={["Critério", "Tipo", "Métrica", "Origem", "Configuração", "Status", ""]}>
              {s.criterios.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">{c.nome}</td>
                  <td className="px-3 py-2">{c.tipo}</td>
                  <td className="px-3 py-2">{c.metrica}</td>
                  <td className="px-3 py-2">{c.pessoa_origem == null ? "—" : c.pessoa_origem}</td>
                  <td className="px-3 py-2 text-xs">
                    {c.tipo === "fixa" && `R$ ${c.valor}`}
                    {c.tipo === "por_resultado" && `R$ ${c.valor} por unidade`}
                    {c.tipo === "por_faixa" && c.tiers.map((t) => `${t.a_partir_de}–${t.ate ?? "∞"}: R$ ${t.valor}`).join(" | ")}
                  </td>
                  <td className="px-3 py-2">
                    {c.ativo ? <Badge tone="green">ativo</Badge> : <Badge tone="red">inativo</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="danger" onClick={() => void excluirCriterio(c)}>Excluir</Button>
                  </td>
                </tr>
              ))}
            </Tabela>
            {editando?.id === s.id ? (
              <div className="mt-3 p-3 rounded-md bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex gap-2">
                  <Input placeholder="Nome do critério" value={nomeCriterio} onChange={(e) => setNomeCriterio(e.target.value)} />
                  <Select value={tipoCriterio} onChange={(e) => setTipoCriterio(e.target.value as CriterioUI["tipo"])}>
                    <option value="fixa">Fixa</option>
                    <option value="por_resultado">Por resultado</option>
                    <option value="por_faixa">Por faixa</option>
                  </Select>
                </div>
                {tipoCriterio !== "por_faixa" && (
                  <Input placeholder="Valor (R$)" type="number" step="0.01" value={valorCriterio} onChange={(e) => setValorCriterio(e.target.value)} />
                )}
                {tipoCriterio === "por_resultado" && (
                  <div className="flex gap-2">
                    <Select value={metricaCriterio} onChange={(e) => setMetricaCriterio(e.target.value as CriterioUI["metrica"])}>
                      <option value="agendamentos">Agendamentos</option>
                      <option value="atendimentos">Atendimentos</option>
                      <option value="valor_faturado">Valor faturado</option>
                    </Select>
                    <Select value={origemCriterio} onChange={(e) => setOrigemCriterio(e.target.value as "quem_atendeu" | "quem_agendou")}>
                      <option value="quem_atendeu">Quem atendeu</option>
                      <option value="quem_agendou">Quem agendou</option>
                    </Select>
                  </div>
                )}
                {tipoCriterio === "por_faixa" && (
                  <p className="text-xs text-slate-500">
                    Métrica: Valor Faturado — usa o faturamento total do mês (sem origem).
                  </p>
                )}
                {tipoCriterio === "por_faixa" && (
                  <div className="space-y-2">
                    {tiers.map((t, i) => (
                      <div key={i} className="flex gap-2">
                        <Input type="number" placeholder="A partir de" value={t.a_partir_de} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, a_partir_de: Number(e.target.value) } : x)))} />
                        <Input type="number" placeholder="Até (vazio = aberto)" value={t.ate ?? ""} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, ate: e.target.value === "" ? null : Number(e.target.value) } : x)))} />
                        <Input type="number" placeholder="Valor (R$)" value={t.valor} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, valor: Number(e.target.value) } : x)))} />
                        <Button variant="ghost" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>×</Button>
                      </div>
                    ))}
                    <Button variant="ghost" onClick={() => setTiers([...tiers, tierVazio()])}>+ Faixa</Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={() => void salvarCriterio()}>Salvar critério</Button>
                  <Button variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" className="mt-2" onClick={() => { setEditando(s); setNomeCriterio(""); setValorCriterio(""); setTiers([tierVazio()]); }}>
                + Adicionar critério
              </Button>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-600">Regras de desconto por pontuação</h4>
              {regrasEmEdicao !== s.id && (
                <Button variant="ghost" onClick={() => iniciarEdicaoRegras(s)}>
                  Editar regras
                </Button>
              )}
            </div>

            {regrasEmEdicao === s.id ? (
              <div className="space-y-2">
                {regrasDraft.length === 0 && (
                  <p className="text-xs text-slate-400">Nenhuma faixa — sem ocorrências, mantém 100%.</p>
                )}
                {regrasDraft.map((r, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      type="number" min={0} className="w-24" placeholder="Pontos de"
                      value={r.min_pontos} onChange={(e) => atualizarRegra(i, { min_pontos: Number(e.target.value) })}
                    />
                    <Input
                      type="number" className="w-36" placeholder="até (vazio = aberto)"
                      value={r.max_pontos ?? ""} onChange={(e) => atualizarRegra(i, { max_pontos: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                    <Input
                      type="number" min={0} max={100} className="w-28" placeholder="% mantido"
                      value={r.percentual_manter} onChange={(e) => atualizarRegra(i, { percentual_manter: Number(e.target.value) })}
                    />
                    <Button variant="ghost" onClick={() => setRegrasDraft((d) => d.filter((_, j) => j !== i))}>×</Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setRegrasDraft((d) => [...d, regraVazia()])}>+ Faixa</Button>
                  <Button onClick={() => void salvarRegras(s)}>Salvar regras</Button>
                  <Button variant="ghost" onClick={() => setRegrasEmEdicao(null)}>Cancelar</Button>
                </div>
                <p className="text-xs text-slate-400">
                  Aplica-se a faixa com maior «Pontos de» atingido; lacuna sem regra mantém 100%. A última faixa deve ficar aberta (até vazio).
                </p>
              </div>
            ) : s.regras_desconto.length === 0 ? (
              <p className="text-xs text-slate-400">Sem regras — sem ocorrências, mantém 100%.</p>
            ) : (
              <Tabela head={["Pontos de", "Pontos até", "Percentual mantido"]}>
                {s.regras_desconto.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{r.min_pontos}</td>
                    <td className="px-3 py-2">{r.max_pontos ?? "∞"}</td>
                    <td className="px-3 py-2">{r.percentual_manter}%</td>
                  </tr>
                ))}
              </Tabela>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}