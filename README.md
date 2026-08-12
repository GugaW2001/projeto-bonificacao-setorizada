# Bonificação por Desempenho

Sistema web para cálculo mensal de bonificação por desempenho em clínicas, a partir das
planilhas de agendamentos já utilizadas na rotina do setor.

## Como funciona

1. **Sessão de cálculo** — arraste a planilha do mês (.xls/.xlsx/.csv) e escolha o mês de
   referência. O cabeçalho é detectado automaticamente (mesmo com linhas de título antes);
   apenas as colunas **Quem Agendou (Q)**, **Quem Atendeu (R)** e **Valor Faturado (X)**
   são usadas como métrica.
2. **Matching de nomes** — os nomes da planilha são casados automaticamente com os
   colaboradores cadastrados (exato → alias → similaridade). Nomes sem correspondência
   entram como aviso no resultado (não computam).
3. **Configuração** — setores com critérios de bonificação (por resultado com atribuição
   por "quem agendou" ou "quem atendeu"; fixa e por faixa **sem origem** — por faixa sobre o
   **faturamento total do mês**) e regras de desconto por pontos de ocorrência editáveis na
   interface (ex.: 0–4 pts = 100%, 5–6 = 50%, ≥7 = 0%). Uma ocorrência pode afetar **vários
   critérios** ao mesmo tempo.
4. **Resultado** — por colaborador e por critério, com totais, ocorrências do mês aplicadas
   e baixa do relatório em PDF.

Tudo roda **em memória**: a planilha nunca é persistida e cada sessão produz um resultado
novo — não há histórico de importações nem de cálculos no banco. Persistem apenas setores,
critérios, colaboradores, aliases e ocorrências.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind CSS 4
- Supabase (Postgres) — acesso via `service_role` somente no servidor; RLS habilitado sem
  acesso anônimo
- Motor de cálculo, matching, parsing e sessão 100% testados (Vitest)

## Configuração

1. Aplique as migrations em `supabase/migrations/` (o projeto Supabase já está com elas
   aplicadas via console).
2. `cp .env.example .env` e preencha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
3. `npm install && npm run dev` — ou rode o seed demo:
   `node scripts/seed.mjs` (cria setores, critérios, colaboradores e ocorrências de exemplo).

## Deploy (EasyPanel / Docker)

- `Dockerfile` multi-estágio com `next start` standalone (`PORT` configurável; o app escuta
  em `0.0.0.0`).
- Variáveis de ambiente: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_TELEMETRY_DISABLED=1` (opcional).

## Segurança

- A planilha de produção contém dados de pacientes: **não commitar** (`.gitignore` bloqueia
  `*.xls`/`*.xlsx`) e ela é processada apenas em memória, sendo descartada ao fim da sessão.
- Sem autenticação de usuário (uso interno); a auditoria grava cada alteração em
  `audit_logs` como usuário `admin`.