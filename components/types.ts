"use client";

/** Tipos compartilhados da UI (espelham as respostas das rotas de API). */

import type { BonusType, MetricType, PessoaOrigem } from "@/lib/types";

export interface TierUI {
  id?: string;
  a_partir_de: number;
  ate: number | null;
  a_cada: number | null;
  valor: number;
  ordem: number;
}

export interface CriterioUI {
  id: string;
  sector_id: string;
  nome: string;
  descricao: string | null;
  tipo: BonusType;
  valor: number | null;
  metrica: MetricType;
  pessoa_origem: PessoaOrigem;
  ativo: boolean;
  ordem: number;
  tiers: TierUI[];
}

export interface RegraDescontoUI {
  id?: string;
  min_pontos: number;
  max_pontos: number | null;
  percentual_manter: number;
  ordem: number;
}

export interface SetorUi {
  id: string;
  titulo: string;
  ativo: boolean;
  criterios: CriterioUI[];
  regras_desconto: RegraDescontoUI[];
}

export interface ColaboradorUi {
  id: string;
  nome: string;
  sector_id: string;
  data_entrada: string | null;
  ativo: boolean;
  sectors?: { titulo: string } | { titulo: string }[];
}

export interface OcorrenciaUi {
  id: string;
  employee_id: string;
  data: string;
  gravidade: number;
  observacoes: string | null;
  nome_colaborador: string;
  nome_setor: string;
  criterios: { id: string; nome: string }[];
}