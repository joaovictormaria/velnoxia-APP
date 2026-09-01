// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { exigirRecurso } from "@/server/billing/guarda-de-recurso";
import { numeros } from "./serializar";
import { decimalToNumber } from "../utils/decimal-converter";
import { reportRepository } from "@/server/repositories/report-repository";

function serializeItem(item: any) {
  return {
    ...item,
    quantityOnHand: Number(item.quantityOnHand ?? 0),
    quantityReserved: Number(item.quantityReserved ?? 0),
    quantityAvailable: Number(item.quantityAvailable ?? 0),
    quantityUsedInRecipes: Number(item.quantityUsedInRecipes ?? 0),
    maximumQuantity: Number(item.maximumQuantity ?? 0),
    contentSize: item.contentSize ? Number(item.contentSize) : null,
    purchasePackSize: item.purchasePackSize ? Number(item.purchasePackSize) : null,
    cost: item.cost ? Number(item.cost) : null,
    minimumThreshold: item.minimumThreshold ? Number(item.minimumThreshold) : null,
    idealQuantity: item.idealQuantity ? Number(item.idealQuantity) : null,
    maximumCapacity: item.maximumCapacity ? Number(item.maximumCapacity) : null,
  };
}

export const adminGetStockReport = createServerFn({ method: "POST" })
  .handler(async ({ data }: any) => {
    const admin = await requireAdminSession();

    const sortBy = (data?.sortBy || "name") as any;
    const limit = parseInt(data?.limit || "100") || 100;
    const includeInactive = data?.includeInactive === true;

    const items = await reportRepository.getStockLevelsByStore(admin.storeId, { sortBy, limit, includeInactive });
    return items.map(serializeItem);
  });

export const adminGetLowStockAlerts2 = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await exigirRecurso("ESTOQUE");

    return reportRepository.getLowStockItems(admin.storeId);
  });

export const adminGetMovementHistory = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await exigirRecurso("ESTOQUE");

    const data = context?.data || {};
    const limit = parseInt(data.limit || "100") || 100;

    const movements = await reportRepository.getMovementHistory(admin.storeId, {
      itemId: data.itemId || undefined,
      type: data.type || undefined,
      // O repositorio ja aceitava recorte por data; o wrapper e que descartava.
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      limit,
    });

    /*
     * O REPLACER QUE ESTAVA AQUI NUNCA FUNCIONOU, POR DOIS MOTIVOS INDEPENDENTES.
     *
     * 1. `JSON.stringify` chama `toJSON()` ANTES de passar o valor ao replacer.
     *    O Decimal do Prisma tem `toJSON`, então o replacer recebia uma STRING —
     *    e o teste `typeof value === 'object'` era falso para todos eles.
     *
     * 2. Mesmo que recebesse o objeto, `constructor.name` do Decimal do Prisma 7
     *    é `Decimal2`, não `Decimal`. A comparação nunca casaria.
     *
     * O efeito não era visível porque o repositório converte à mão os campos que
     * as telas leem. Mas ele converte 3 dos 10 campos Decimal do item, e nenhum
     * dos dois de `originalMovement`: os outros nove atravessavam a fronteira
     * como string, esperando o primeiro código que fizesse conta com eles.
     *
     * `numeros` é o mesmo walker recursivo que serve as funções de custo. Ele
     * identifica o Decimal pelo `toNumber()` — comportamento, não nome de classe
     * — e preserva Date, que o round-trip de JSON transformava em string.
     */
    return numeros(movements);
  });

export const adminGetCostAnalysis = createServerFn({ method: "POST" })
  .validator(z.object({
    type: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const admin = await exigirRecurso("ESTOQUE");

    return reportRepository.getMovementCostAnalysis(admin.storeId, { type: data.type || undefined });
  });

export const adminGetCompositionUsageReport = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await exigirRecurso("RECEITAS");

    return reportRepository.getCompositionUsageReport(admin.storeId);
  });

export const adminGetMovementStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await exigirRecurso("ESTOQUE");

    return reportRepository.getMovementStats(admin.storeId);
  });

export const adminGetOrderFulfillmentStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await exigirRecurso("RELATORIOS");

    return reportRepository.getOrderFulfillmentStats(admin.storeId);
  });

export const adminGetInventoryValueReport = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await exigirRecurso("ESTOQUE");

    const relatorio = await reportRepository.getInventoryValue(admin.storeId);

    /*
     * Decimal do Prisma não atravessa a fronteira da server function: o
     * Seroval estoura com "[object Decimal] cannot be parsed/serialized".
     * Ficou dormindo enquanto nenhuma tela chamava isto; a aba Gráficos
     * passou a chamar e o erro apareceu inteiro na cara do usuário.
     *
     * CONVERSÃO EXPLÍCITA, e não um replacer de JSON.stringify.
     *
     * O replacer que a função vizinha usa NÃO CONVERTE NADA, e vale registrar
     * por que: `JSON.stringify` chama o `toJSON()` do valor ANTES de passar
     * pelo replacer, então o que chega lá já é a string do Decimal — e o
     * `typeof === "object"` nunca bate. O crash some porque string serializa,
     * mas os números chegam ao gráfico como texto.
     *
     * (O `constructor.name` também não ajudaria: o bundler renomeia a classe
     * para `Decimal2`.)
     */
    return {
      totalValue: decimalToNumber(relatorio.totalValue),
      itemCount: relatorio.itemCount,
      breakdown: relatorio.breakdown.map((linha: any) => ({
        id: linha.id,
        name: linha.name,
        quantity: decimalToNumber(linha.quantity),
        cost: decimalToNumber(linha.cost),
        value: decimalToNumber(linha.value),
      })),
    };
  });

