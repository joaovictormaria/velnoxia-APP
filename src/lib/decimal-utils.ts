// @ts-expect-error Decimal not exported from @prisma/client
import type { Decimal } from "@prisma/client";

/**
 * Converte Decimal ou número para number
 * Útil quando Prisma retorna Decimal mas funções esperam number
 */
export function toNumber(value: Decimal | number | null | undefined): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value && typeof value.toNumber === "function") return value.toNumber();
  return Number(value);
}

/**
 * Formata número com moeda BRL
 * Aceita Decimal ou number
 */
export function formatCurrency(value: Decimal | number | null | undefined): string {
  const num = toNumber(value);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

/**
 * Formata número simples (sem moeda)
 * Aceita Decimal ou number
 */
export function formatNumber(value: Decimal | number | null | undefined, decimals = 2): string {
  const num = toNumber(value);
  return num.toFixed(decimals);
}

/**
 * Converte Decimal para string (útil para inputs e componentes que esperam string)
 */
export function toStr(value: Decimal | number | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value.toString === "function") return value.toString();
  return String(value);
}
