import { describe, it, expect } from "vitest";
import {
  fromReal, toReal, parseBRMoney, sumCents, mulCents, pctOf, floorDivInt, formatBRL, CENTS_ZERO,
} from "../lib/money";

describe("money — precisão financeira", () => {
  it("0.1 + 0.2 não sofre erro de float quando tratado em centavos", () => {
    expect(fromReal(0.1) + fromReal(0.2)).toBe(30);
    expect(fromReal(0.1 + 0.2)).toBe(30); // arredondado corretamente
  });

  it("converte reais → centavos com arredondamento correto", () => {
    expect(fromReal(480)).toBe(48000);
    expect(fromReal(0.505)).toBe(51);
    expect(fromReal(1234.56)).toBe(123456);
  });

  it("parseBRMoney aceita formatos brasileiros", () => {
    expect(parseBRMoney("480,00")).toBe(48000);
    expect(parseBRMoney("1.234,56")).toBe(123456);
    expect(parseBRMoney("R$ 1.234,56")).toBe(123456);
    expect(parseBRMoney("1234.56")).toBe(123456);
    expect(parseBRMoney("1.234")).toBe(123400);
    expect(parseBRMoney("0,00")).toBe(0);
    expect(parseBRMoney("1020,00")).toBe(102000);
    expect(parseBRMoney("1.020,00")).toBe(102000);
  });

  it("parseBRMoney rejeita valores inválidos", () => {
    expect(parseBRMoney("")).toBeNull();
    expect(parseBRMoney("abc")).toBeNull();
    expect(parseBRMoney("12,34,56")).toBeNull();
    expect(parseBRMoney("--")).toBeNull();
  });

  it("multiplicação e percentuais arredondam no final", () => {
    expect(mulCents(50, 200)).toBe(10000); // R$ 0,50 × 200
    expect(pctOf(50000, 50)).toBe(25000);
    expect(pctOf(33333, 33)).toBe(11000); // 33% de R$ 333,33 → R$ 110,00 (arred.)
  });

  it("floorDivInt calcula faixas do tipo 'a cada'", () => {
    expect(floorDivInt(25000000, 10000000)).toBe(2); // R$ 250k / R$ 100k
    expect(floorDivInt(9999999, 10000000)).toBe(0);
    expect(floorDivInt(10000000, 10000000)).toBe(1);
  });

  it("soma de centavos é exata", () => {
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(sumCents([fromReal(0.1), fromReal(0.2), fromReal(0.3)])).toBe(60);
  });

  it("formata em moeda brasileira", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(CENTS_ZERO)).toBe("R$ 0,00");
    expect(toReal(123456)).toBeCloseTo(1234.56);
  });
});