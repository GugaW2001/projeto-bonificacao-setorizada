-- Extensões para matching de nomes
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- Tipos enumerados
do $$ begin
  create type bonus_type as enum ('fixa', 'por_resultado', 'por_faixa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type criterio_metrica as enum ('agendamentos', 'atendimentos', 'valor_faturado', 'nenhuma');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pessoa_origem as enum ('quem_atendeu', 'quem_agendou');
exception when duplicate_object then null; end $$;

-- Setores
create table if not exists sectors (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sectors_titulo_unq on sectors (lower(titulo));

-- Critérios de bonificação
create table if not exists bonus_criteria (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references sectors(id) on delete cascade,
  nome text not null,
  descricao text,
  tipo bonus_type not null default 'por_resultado',
  valor numeric(14,2) check (valor is null or valor >= 0),
  metrica criterio_metrica not null default 'nenhuma',
  pessoa_origem pessoa_origem not null default 'quem_atendeu',
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bonus_criteria_sector_idx on bonus_criteria (sector_id);

-- Faixas de bonificação (por_faixa)
create table if not exists bonus_criteria_tiers (
  id uuid primary key default gen_random_uuid(),
  criteria_id uuid not null references bonus_criteria(id) on delete cascade,
  a_partir_de numeric(14,2) not null default 0,
  ate numeric(14,2),
  a_cada numeric(14,2),
  valor numeric(14,2) not null default 0 check (valor >= 0),
  ordem integer not null default 0,
  check (a_cada is null or a_cada > 0),
  check (ate is null or ate > a_partir_de)
);

create index if not exists bonus_criteria_tiers_criteria_idx on bonus_criteria_tiers (criteria_id);

-- Regras de desconto por pontuação de ocorrências (por setor)
create table if not exists sector_discount_rules (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references sectors(id) on delete cascade,
  min_pontos integer not null default 0 check (min_pontos >= 0),
  max_pontos integer check (max_pontos is null or max_pontos >= min_pontos),
  percentual_manter smallint not null default 100 check (percentual_manter between 0 and 100),
  ordem integer not null default 0
);

create index if not exists sector_discount_rules_sector_idx on sector_discount_rules (sector_id);

-- Colaboradores
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  chave_normalizada text not null,
  sector_id uuid not null references sectors(id) on delete restrict,
  data_entrada date,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists employees_chave_normalizada_unq on employees (chave_normalizada);
create index if not exists employees_sector_idx on employees (sector_id);

-- Ocorrências
create table if not exists occurrences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  data date not null,
  gravidade smallint not null check (gravidade between 1 and 3),
  observacoes text,
  criado_por text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists occurrences_employee_data_idx on occurrences (employee_id, data);

-- Critérios afetados por ocorrência
create table if not exists occurrence_criteria (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references occurrences(id) on delete cascade,
  criteria_id uuid not null references bonus_criteria(id) on delete cascade,
  unique (occurrence_id, criteria_id)
);

create index if not exists occurrence_criteria_criteria_idx on occurrence_criteria (criteria_id);

-- Aliases de nomes confirmados (reaproveitados em importações futuras)
create table if not exists employee_name_aliases (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  nome_variante text not null,
  chave_normalizada text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists employee_name_aliases_chave_unq on employee_name_aliases (chave_normalizada);

-- Auditoria
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  detalhes jsonb,
  usuario text not null default 'admin',
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entidade_idx on audit_logs (entidade, entidade_id);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);

-- RLS: habilitado sem políticas -> acesso direto anônimo bloqueado; aplicação acessa via service_role (bypass)
alter table sectors enable row level security;
alter table bonus_criteria enable row level security;
alter table bonus_criteria_tiers enable row level security;
alter table sector_discount_rules enable row level security;
alter table employees enable row level security;
alter table occurrences enable row level security;
alter table occurrence_criteria enable row level security;
alter table employee_name_aliases enable row level security;
alter table audit_logs enable row level security;