"use client";

import { useState } from "react";
import TabSetores from "@/components/TabSetores";
import TabColaboradores from "@/components/TabColaboradores";
import TabOcorrencias from "@/components/TabOcorrencias";
import TabBonificacao from "@/components/TabBonificacao";

const ABAS = ["Setores", "Colaboradores", "Ocorrências", "Bonificação"] as const;
type Aba = (typeof ABAS)[number];

export default function Home() {
  const [aba, setAba] = useState<Aba>("Setores");

  return (
    <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Bonificação por Desempenho</h1>
        <p className="text-sm text-slate-500">Agendamentos, atendimentos e faturamento — cálculo mensal automático.</p>
      </header>

      <nav className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md whitespace-nowrap transition-colors ${
              aba === a ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {a}
          </button>
        ))}
      </nav>

      {aba === "Setores" && <TabSetores />}
      {aba === "Colaboradores" && <TabColaboradores />}
      {aba === "Ocorrências" && <TabOcorrencias />}
      {aba === "Bonificação" && <TabBonificacao />}
    </main>
  );
}