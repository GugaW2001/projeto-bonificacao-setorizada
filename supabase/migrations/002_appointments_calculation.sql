-- Importações de planilhas de agendamentos
create table if not exists appointment_imports (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text not null,
  arquivo_sha256 text not null,
  total_linhas integer not null default 0,
  linhas_importadas integer not null default 0,
  linhas_duplicadas integer not null default 0,
  linhas_invalidas integer not null default 0,
  status text not null default 'processado' check (status in ('processado', 'revisao')),
  criado_por text not null default 'admin',
  created_at timestamptz not null default now()
);

create unique index if not exists appointment_imports_sha_unq on appointment_imports (arquivo_sha256);

-- Agendamentos (apenas Q/R/X utilizados como métrica; linha original preservada em raw)
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references appointment_imports(id) on delete cascade,
  linha integer not null,
  data date not null,
  nome_agendou text,
  chave_agendou text,
  nome_atendeu text,
  chave_atendeu text,
  valor_faturado numeric(14,2) not null default 0,
  employee_agendou_id uuid references employees(id) on delete set null,
  employee_atendeu_id uuid references employees(id) on delete set null,
  match_status_agendou text not null default 'vazio' check (match_status_agendou in ('exato','alias','fuzzy','revisar','nao_encontrado','vazio')),
  match_status_atendeu text not null default 'vazio' check (match_status_atendeu in ('exato','alias','fuzzy','revisar','nao_encontrado','vazio')),
  raw jsonb not null,
  record_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists appointments_record_hash_unq on appointments (record_hash);
create index if not exists appointments_data_idx on appointments (data);
create index if not exists appointments_chave_agendou_idx on appointments (chave_agendou);
create index if not exists appointments_chave_atendeu_idx on appointments (chave_atendeu);
create index if not exists appointments_employee_agendou_idx on appointments (employee_agendou_id);
create index if not exists appointments_employee_atendeu_idx on appointments (employee_atendeu_id);
create index if not exists appointments_import_idx on appointments (import_id);

-- Revisões de possíveis correspondências de nomes
create table if not exists name_match_reviews (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references appointment_imports(id) on delete cascade,
  coluna text not null check (coluna in ('quem_agendou','quem_atendeu')),
  nome_importado text not null,
  chave_normalizada text not null,
  employee_id uuid references employees(id) on delete cascade,
  similaridade numeric(6,4),
  status text not null default 'pendente' check (status in ('pendente','aprovado','rejeitado')),
  qtd_linhas integer not null default 0,
  criado_por text not null default 'admin',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists name_match_reviews_pendente_idx on name_match_reviews (status) where status = 'pendente';
create index if not exists name_match_reviews_import_idx on name_match_reviews (import_id);

-- Cálculos de bonificação (histórico preservado; um registro por execução)
create table if not exists bonus_calculations (
  id uuid primary key default gen_random_uuid(),
  mes_referencia date not null,
  status text not null default 'rascunho' check (status in ('rascunho','finalizado')),
  total_bruto numeric(14,2) not null default 0,
  total_descontos numeric(14,2) not null default 0,
  total_ajustes numeric(14,2) not null default 0,
  total_final numeric(14,2) not null default 0,
  criado_por text not null default 'admin',
  created_at timestamptz not null default now()
);

create index if not exists bonus_calculations_mes_idx on bonus_calculations (mes_referencia desc, created_at desc);

-- Itens do cálculo: snapshot das regras usadas naquele momento (histórico imutável)
create table if not exists bonus_calculation_items (
  id uuid primary key default gen_random_uuid(),
  calculation_id uuid not null references bonus_calculations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  sector_id uuid not null references sectors(id) on delete cascade,
  criteria_id uuid references bonus_criteria(id) on delete set null,
  snapshot jsonb not null,
  resultado numeric(14,2) not null default 0,
  unidade text not null default '',
  bonus_bruto numeric(14,2) not null default 0,
  pontos integer not null default 0,
  percentual_manter smallint not null default 100,
  bonus_descontado numeric(14,2) not null default 0,
  bonus_final numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists bonus_calculation_items_calc_idx on bonus_calculation_items (calculation_id);
create index if not exists bonus_calculation_items_employee_idx on bonus_calculation_items (employee_id);

-- Ajustes manuais por colaborador no cálculo
create table if not exists bonus_calculation_adjustments (
  id uuid primary key default gen_random_uuid(),
  calculation_id uuid not null references bonus_calculations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  valor numeric(14,2) not null default 0,
  observacao text,
  ajustado_por text not null default 'admin',
  ajustado_em timestamptz not null default now(),
  unique (calculation_id, employee_id)
);

create index if not exists bonus_calculation_adjustments_calc_idx on bonus_calculation_adjustments (calculation_id);

-- RLS: habilitado, sem políticas (acesso via service_role)
alter table appointment_imports enable row level security;
alter table appointments enable row level security;
alter table name_match_reviews enable row level security;
alter table bonus_calculations enable row level security;
alter table bonus_calculation_items enable row level security;
alter table bonus_calculation_adjustments enable row level security;