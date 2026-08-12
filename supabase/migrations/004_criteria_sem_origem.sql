-- Critérios fixa e por_faixa não têm origem (quem agendou/atendeu) — coluna passa a aceitar NULL.
-- Por_resultado continua exigindo origem, validado na API (zod).
alter table bonus_criteria alter column pessoa_origem drop not null;
alter table bonus_criteria alter column pessoa_origem drop default;