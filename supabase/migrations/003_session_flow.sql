-- Fluxo de sessão: a planilha de agendamentos é processada em memória a cada sessão e
-- nada dela (nem os resultados de cálculo) é persistido. Persistem apenas setores com
-- critérios, colaboradores, aliases e ocorrências. As tabelas abaixo deixam de existir.

drop table if exists bonus_calculation_adjustments;
drop table if exists bonus_calculation_items;
drop table if exists bonus_calculations;
drop table if exists name_match_reviews;
drop table if exists appointments;
drop table if exists appointment_imports;