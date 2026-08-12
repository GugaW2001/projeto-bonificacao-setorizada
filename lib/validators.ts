/** Validações zod para todas as entradas da API. */

import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const sectorSchema = z.object({
  titulo: z.string().trim().min(1, "Título do setor é obrigatório").max(120),
  ativo: z.boolean().default(true),
});

export const tierSchema = z.object({
  id: z.string().uuid().optional(),
  a_partir_de: z.coerce.number().min(0).default(0),
  ate: z.coerce.number().positive().optional().nullable(),
  a_cada: z.coerce.number().positive().optional().nullable(),
  valor: z.coerce.number().min(0, "Valor da faixa inválido"),
  ordem: z.coerce.number().int().min(0).default(0),
});

export const criterioSchema = z
  .object({
    sector_id: uuidSchema,
    nome: z.string().trim().min(1, "Nome do critério é obrigatório").max(120),
    descricao: z.string().trim().max(500).nullish(),
    tipo: z.enum(["fixa", "por_resultado", "por_faixa"]),
    valor: z.coerce.number().min(0).nullish(),
    metrica: z.enum(["agendamentos", "atendimentos", "valor_faturado", "nenhuma"]).default("nenhuma"),
    pessoa_origem: z.enum(["quem_atendeu", "quem_agendou"]).nullable(),
    ativo: z.boolean().default(true),
    ordem: z.coerce.number().int().min(0).default(0),
    tiers: z.array(tierSchema).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === "por_faixa" && data.metrica !== "valor_faturado") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["metrica"],
        message: "Critérios 'por faixa' usam a métrica Valor Faturado (faturamento total do mês).",
      });
    }
    if (data.tipo === "por_resultado" && data.pessoa_origem == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pessoa_origem"],
        message: "Critérios 'por resultado' exigem origem (quem agendou ou quem atendeu).",
      });
    }
    if (data.tipo !== "por_resultado" && data.pessoa_origem != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pessoa_origem"],
        message: "Critérios 'fixa' e 'por faixa' não têm origem.",
      });
    }
  });

export const employeeSchema = z.object({
  nome: z.string().trim().min(1, "Nome do colaborador é obrigatório").max(160),
  sector_id: uuidSchema,
  data_entrada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullish(),
  ativo: z.boolean().default(true),
});

export const occurrenceSchema = z.object({
  employee_id: uuidSchema,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  gravidade: z.coerce.number().int().min(1, "Gravidade deve ser 1, 2 ou 3").max(3, "Gravidade deve ser 1, 2 ou 3"),
  observacoes: z.string().trim().max(2000).nullish(),
  criteria_ids: z.array(uuidSchema).min(1, "Selecione ao menos um critério afetado"),
});

export const discountRulesSchema = z.object({
  rules: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        min_pontos: z.coerce.number().int().min(0),
        max_pontos: z.coerce.number().int().optional().nullable(),
        percentual_manter: z.coerce.number().int().min(0).max(100),
        ordem: z.coerce.number().int().min(0).default(0),
      })
    )
    .min(1, "Defina ao menos uma faixa de desconto"),
});

export const occurrencesReportSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/, "Mês de referência inválido"),
  employee_id: uuidSchema.optional(),
});

export const sessionPdfSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/, "Mês de referência inválido"),
  faturamentoTotal: z.coerce.number().optional(),
  arquivo: z.string().max(255).default(""),
  avisos: z
    .array(
      z.object({
        coluna: z.enum(["quem_agendou", "quem_atendeu"]),
        nome: z.string(),
        qtdLinhas: z.coerce.number().int().min(0),
      })
    )
    .default([]),
  itens: z
    .array(
      z.object({
        employeeId: uuidSchema,
        nomeColaborador: z.string(),
        sectorId: uuidSchema,
        setorTitulo: z.string(),
        criterio: z.object({
          id: uuidSchema,
          nome: z.string(),
          tipo: z.enum(["fixa", "por_resultado", "por_faixa"]),
        }),
        resultado: z.coerce.number(),
        unidade: z.string(),
        bonusBruto: z.coerce.number(),
        pontos: z.coerce.number(),
        percentualManter: z.coerce.number(),
        bonusFinal: z.coerce.number(),
      })
    )
    .min(1, "Nenhum item no resultado"),
  totais: z.object({
    bruto: z.coerce.number(),
    descontos: z.coerce.number(),
    final: z.coerce.number(),
  }),
});