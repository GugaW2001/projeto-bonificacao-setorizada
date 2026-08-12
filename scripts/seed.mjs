/**
 * Seed de demonstração: setores, critérios, regras de desconto, colaboradores
 * e ocorrências de exemplo no mês 2026-07 (mesmo mês da planilha real).
 *
 * Uso:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed.mjs
 *
 * Seguro rodar mais de uma vez (upsert por chave única; critérios/ocorrências criados
 * somente quando o setor/colaborador ainda não existia).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const MES = "2026-07";

const nomeNormalizado = (n) =>
  n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function upsertSector(titulo) {
  const { data: existente } = await db.from("sectors").select("id, titulo").eq("titulo", titulo).maybeSingle();
  if (existente) return existente;
  const { data, error } = await db
    .from("sectors")
    .insert({ titulo, ativo: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function upsertEmployee(nome, sectorId) {
  const chave = nomeNormalizado(nome);
  const { data: existente } = await db
    .from("employees")
    .select("id")
    .eq("chave_normalizada", chave)
    .maybeSingle();
  if (existente) return existente;
  const { data, error } = await db
    .from("employees")
    .insert({ nome, chave_normalizada: chave, sector_id: sectorId, ativo: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function createCriterio(sectorId, nome, tipo, valor, metrica, pessoa_origem, tiers = []) {
  const { data, error } = await db
    .from("bonus_criteria")
    .insert({
      sector_id: sectorId,
      nome,
      tipo,
      valor: tipo === "por_faixa" ? null : valor,
      metrica,
      pessoa_origem: tipo === "por_resultado" ? pessoa_origem : null,
      ativo: true,
      ordem: 0,
    })
    .select()
    .single();
  if (error) throw error;
  if (tiers.length > 0) {
    const { error: errT } = await db.from("bonus_criteria_tiers").insert(
      tiers.map((t, i) => ({ criteria_id: data.id, ...t, ordem: i }))
    );
    if (errT) throw errT;
  }
  return data;
}

async function setDiscountRules(sectorId) {
  const { error: del } = await db.from("sector_discount_rules").delete().eq("sector_id", sectorId);
  if (del) throw del;
  const { error } = await db.from("sector_discount_rules").insert([
    { sector_id: sectorId, min_pontos: 0, max_pontos: 4, percentual_manter: 100 },
    { sector_id: sectorId, min_pontos: 5, max_pontos: 6, percentual_manter: 50 },
    { sector_id: sectorId, min_pontos: 7, max_pontos: null, percentual_manter: 0 },
  ]);
  if (error) throw error;
}

const setorRecepcao = await upsertSector("Recepção");
const setorTecnicos = await upsertSector("Técnicos");

const regras = await Promise.all([setDiscountRules(setorRecepcao.id), setDiscountRules(setorTecnicos.id)]);
await Promise.all(regras);

const { data: crits } = await db.from("bonus_criteria").select("id, sector_id, nome");
const jaTem = (sectorId, nome) => (crits ?? []).some((c) => c.sector_id === sectorId && c.nome === nome);

const criterioAgendamentos = jaTem(setorRecepcao.id, "Agendamentos realizados")
  ? null
  : await createCriterio(setorRecepcao.id, "Agendamentos realizados", "por_resultado", 0.5, "agendamentos", "quem_agendou");
const criterioAssiduidade = jaTem(setorRecepcao.id, "Assiduidade")
  ? null
  : await createCriterio(setorRecepcao.id, "Assiduidade", "fixa", 150, "nenhuma", "quem_atendeu");
const criterioFaturamentoTec = jaTem(setorTecnicos.id, "Faturamento por faixa")
  ? null
  : await createCriterio(setorTecnicos.id, "Faturamento por faixa", "por_faixa", null, "valor_faturado", "quem_atendeu", [
      { a_partir_de: 0, a_cada: null, ate: 100000, valor: 100 },
      { a_partir_de: 100000, a_cada: null, ate: 200000, valor: 200 },
      { a_partir_de: 200000, a_cada: null, ate: null, valor: 350 },
    ]);
const criterioAtendimentos = jaTem(setorTecnicos.id, "Atendimentos realizados")
  ? null
  : await createCriterio(setorTecnicos.id, "Atendimentos realizados", "por_resultado", 0.75, "atendimentos", "quem_atendeu");

// Colaboradores — nomes próximos dos encontrados na planilha (inclui variação de caixa)
const recepcao = [
  "Eloisy Sumar",
  "Jeyce Wuintt da Silva",
  "Britney Vitoria de Liz Anjos",
  "Camila Ferreira Souza",
  "Ana Paula Ribeiro",
];
const tecnicos = [
  "Marcos Vinícius Nogueira",
  "Tatiane Oliveira Santos",
  "Rodrigo Almeida Lima",
  "Larissa Castro Mendes",
  "Gabriel Henrique Pinto",
];

const empRece = [];
for (const nome of recepcao) empRece.push(await upsertEmployee(nome, setorRecepcao.id));
const empTec = [];
for (const nome of tecnicos) empTec.push(await upsertEmployee(nome, setorTecnicos.id));

const emps = [...empRece, ...empTec];
const { data: ocr } = await db.from("occurrences").select("id");

// Ocorrências de exemplo (apenas se nenhuma existir ainda)
if ((ocr ?? []).length === 0) {
  const criterios = [
    criterioAgendamentos ?? (await db.from("bonus_criteria").select("id").eq("sector_id", setorRecepcao.id).eq("nome", "Agendamentos realizados").single()).data,
    criterioAssiduidade ?? (await db.from("bonus_criteria").select("id").eq("sector_id", setorRecepcao.id).eq("nome", "Assiduidade").single()).data,
    criterioFaturamentoTec ?? (await db.from("bonus_criteria").select("id").eq("sector_id", setorTecnicos.id).eq("nome", "Faturamento por faixa").single()).data,
    criterioAtendimentos ?? (await db.from("bonus_criteria").select("id").eq("sector_id", setorTecnicos.id).eq("nome", "Atendimentos realizados").single()).data,
  ];

  const ocorrenciasDemo = [
    { emp: empRece[3], data: "2026-07-03", gravidade: 1, criterios: [criterios[1].id], obs: "Atraso de 15 minutos no início do turno." },
    { emp: empRece[3], data: "2026-07-18", gravidade: 2, criterios: [criterios[1].id], obs: "Faltou sem justificativa." },
    { emp: empTec[2], data: "2026-07-10", gravidade: 2, criterios: [criterios[3].id], obs: "Recusa de atendimento." },
    { emp: empTec[4], data: "2026-07-21", gravidade: 3, criterios: [criterios[2].id, criterios[3].id], obs: "Descumprimento reiterado de protocolo." },
  ];

  for (const o of ocorrenciasDemo) {
    const { data: ocorrencia, error: errO } = await db
      .from("occurrences")
      .insert({
        employee_id: o.emp.id,
        data: o.data,
        gravidade: o.gravidade,
        observacoes: o.obs,
      })
      .select()
      .single();
    if (errO) throw errO;
    const { error: errL } = await db.from("occurrence_criteria").insert(
      o.criterios.map((cid) => ({ occurrence_id: ocorrencia.id, criteria_id: cid }))
    );
    if (errL) throw errL;
  }
}

console.log(`Seed concluído:
- Setores: ${setorRecepcao.titulo}, ${setorTecnicos.titulo}
- Colaboradores: ${emps.length}
- Critérios: agendamentos/assiduidade (recepção), faturamento/atendimentos (técnicos)
- Regras de desconto padrão aplicadas
- Ocorrências de exemplo no mês ${MES}`);