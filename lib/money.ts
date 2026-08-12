/**
 * Utilidades financeiras com precisão determinística.
 * Representação interna: CENTAVOS (inteiros) — nunca float para somas.
 */

export type Cents = number;

export const CENTS_ZERO = 0;

/** Converte reais (number) para centavos com arredondamento bancário-padrão (meio para cima). */
export function fromReal(reais: number): Cents {
  if (!Number.isFinite(reais)) throw new Error(`Valor monetário inválido: ${reais}`);
  return Math.round(reais * 100);
}

/** Converte centavos para reais (somente para persistência/exibição, nunca para somar). */
export function toReal(cents: Cents): number {
  return cents / 100;
}

/**
 * Converte texto monetário brasileiro para centavos.
 * Aceita: "480,00", "1.234,56", "R$ 1.234,56", "1234.56", "1.234", "0,00".
 * Retorna null quando o texto não representa um valor válido.
 */
export function parseBRMoney(texto: string): Cents | null {
  let t = (texto ?? "").trim();
  if (!t) return null;
  t = t.replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!t) return null;

  let normalizado: string;
  if (t.includes(",")) {
    // vírgula = separador decimal; pontos = milhares
    normalizado = t.replace(/\./g, "").replace(",", ".");
  } else if (t.includes(".")) {
    const partes = t.split(".");
    // Um único ponto com exatamente 2 dígitos após = decimal ("1234.56")
    if (partes.length === 2 && partes[1].length === 2) {
      normalizado = t;
    } else {
      // Caso contrário: pontos são milhares
      normalizado = t.replace(/\./g, "");
    }
  } else {
    normalizado = t;
  }

  if (!/^[-+]?\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  const num = Number(normalizado);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

/** Soma segura de centavos. */
export function sumCents(values: Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}

export function centsAdd(a: Cents, b: Cents): Cents {
  return a + b;
}

export function centsSub(a: Cents, b: Cents): Cents {
  return a - b;
}

/** Multiplicação com arredondamento final (ex.: valor × quantidade). */
export function mulCents(valor: Cents, fator: number): Cents {
  if (!Number.isFinite(fator)) throw new Error(`Fator inválido: ${fator}`);
  return Math.round(valor * fator);
}

/** Percentual sobre centavos com arredondamento final. */
export function pctOf(cents: Cents, percentual: number): Cents {
  if (percentual < 0 || percentual > 100) throw new Error(`Percentual inválido: ${percentual}`);
  return Math.round((cents * percentual) / 100);
}

/** Divisão inteira (piso) — usada em faixas do tipo "R$ 100 a cada R$ 100.000". */
export function floorDivInt(valor: number, divisor: number): number {
  if (!Number.isFinite(divisor) || divisor <= 0) throw new Error(`Divisor inválido: ${divisor}`);
  return Math.floor(valor / divisor);
}

/** Formata centavos como moeda brasileira: R$ 1.234,56 */
export function formatBRL(cents: Cents): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(toReal(cents))
    .replace(/\u00A0/g, " ");
}

/** Formata número inteiro/quantidade (unidade) com ponto de milhar BR. */
export function formatCount(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(valor);
}