import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { InventoryCostService } from "@/server/services/inventory-cost-service";
import { Decimal } from "@prisma/client/runtime/client";

/**
 * Decimal não atravessa a fronteira da server function.
 *
 * O TanStack Start serializa o retorno do handler, e um `Decimal` do Prisma não
 * é um valor serializável — o compilador recusa o handler inteiro, e o tipo que
 * chega ao cliente colapsa para `{}`. Era essa a origem dos 29 erros do
 * CostAnalysis: não faltava tipagem no componente, faltava número no lugar de
 * objeto do outro lado do fio.
 *
 * Converter aqui, e não no componente, mantém o cálculo em Decimal onde ele
 * importa (dentro do serviço, somando centavos em laço) e entrega ao navegador
 * o que o navegador sabe formatar.
 */
/**
 * O mesmo formato, com `Decimal` trocado por `number`.
 *
 * O tipo precisa acompanhar a conversão: uma função genérica que devolvesse
 * `T` manteria `Decimal` na assinatura, e o compilador continuaria recusando o
 * handler mesmo com o valor já convertido em execução.
 */
type Serializado<T> =
  T extends Decimal ? number :
  T extends Date ? Date :
  T extends Array<infer U> ? Array<Serializado<U>> :
  T extends object ? { [K in keyof T]: Serializado<T[K]> } :
  T;
function numeros<T>(valor: T): Serializado<T> {
  if (valor === null || valor === undefined) return valor as Serializado<T>;
  if (typeof valor === "object") {
    const qualquer = valor as any;
    // Decimal do Prisma: tem toNumber() e não é Date nem array.
    if (typeof qualquer.toNumber === "function" && !(valor instanceof Date)) {
      return qualquer.toNumber();
    }
    if (Array.isArray(valor)) return valor.map(numeros) as Serializado<T>;
    if (valor instanceof Date) return valor as Serializado<T>;
    const saida: any = {};
    for (const [chave, v] of Object.entries(qualquer)) saida[chave] = numeros(v);
    return saida;
  }
  return valor as Serializado<T>;
}

/**
 * Calculate cost of a specific order
 */
export const getOrderCost = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orderId: z.string().cuid(),
    })
  )
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return numeros(await InventoryCostService.calculateOrderCost(store.id, data.orderId));
  });

/**
 * Get cost report for a period
 */
export const getCostReport = createServerFn({ method: "POST" })
  .validator(
    z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    })
  )
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return numeros(await InventoryCostService.getCostReport(
      store.id,
      new Date(data.startDate),
      new Date(data.endDate)
    ));
  });

/**
 * Calculate profit margin
 */
export const calculateMargin = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sellingPrice: z.string(), // Decimal as string
      costPrice: z.string(),
    })
  )
  .handler(async ({ data }) => {
    return numeros(InventoryCostService.calculateMargin(
      new Decimal(data.sellingPrice),
      new Decimal(data.costPrice)
    ));
  });

/**
 * Get product profitability analysis
 */
export const getProductProfitability = createServerFn({
  method: "POST",
})
  .validator(
    z.object({
      days: z.number().int().positive().optional(),
    })
  )
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return numeros(await InventoryCostService.getProductProfitability(
      store.id,
      data.days || 30
    ));
  });

/**
 * Get financial KPIs dashboard
 */
export const getFinancialKPIs = createServerFn({ method: "POST" })
  .validator(
    z.object({
      days: z.number().int().positive().optional(),
    })
  )
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return numeros(await InventoryCostService.getFinancialKPIs(store.id, data.days || 30));
  });
