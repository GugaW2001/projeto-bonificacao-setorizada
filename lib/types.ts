/** Tipos das linhas do banco (PostgREST devolve colunas snake_case; valores numéricos podem vir como string). */

export type BonusType = "fixa" | "por_resultado" | "por_faixa";
export type MetricType = "agendamentos" | "atendimentos" | "valor_faturado" | "nenhuma";
/** null = critério sem origem (fixa e por_faixa usam o faturamento total/nada). */
export type PessoaOrigem = "quem_atendeu" | "quem_agendou" | null;

export interface SectorRow {
  id: string;
  titulo: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CriteriaRow {
  id: string;
  sector_id: string;
  nome: string;
  descricao: string | null;
  tipo: BonusType;
  valor: string | number | null;
  metrica: MetricType;
  pessoa_origem: PessoaOrigem;
  ativo: boolean;
  ordem: number;
  created_at: string;
  updated_at: string;
}

export interface TierRow {
  id: string;
  criteria_id: string;
  a_partir_de: string | number;
  ate: string | number | null;
  a_cada: string | number | null;
  valor: string | number;
  ordem: number;
}

export interface DiscountRuleRow {
  id: string;
  sector_id: string;
  min_pontos: number;
  max_pontos: number | null;
  percentual_manter: number;
  ordem: number;
}

export interface EmployeeRow {
  id: string;
  nome: string;
  chave_normalizada: string;
  sector_id: string;
  data_entrada: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface OccurrenceRow {
  id: string;
  employee_id: string;
  data: string;
  gravidade: number;
  observacoes: string | null;
  criado_por: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  detalhes: Record<string, unknown> | null;
  usuario: string;
  created_at: string;
}

export type SectorDetail = SectorRow & {
  criterios: (CriteriaRow & { tiers: TierRow[] })[];
  regras_desconto: DiscountRuleRow[];
};

export type EmployeeDetail = EmployeeRow & { sector_titulo?: string };

export type OccurrenceDetail = OccurrenceRow & {
  nome_colaborador?: string;
  nome_setor?: string;
  criterios: { id: string; nome: string }[];
};