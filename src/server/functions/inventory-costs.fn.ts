import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { exigirRecurso } from "@/server/billing/guarda-de-recurso";
import { InventoryCostService } from "@/server/services/inventory-cost-service";
import { Decimal } from "@prisma/client/runtime/client";
import { numeros } from "./serializar";


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
    const store = await exigirRecurso("FINANCEIRO");
    if (!store) {
      throw new Error("Not authenticated");
    }

    return numeros(await InventoryCostService.calculateOrderCost(store.storeId, data.orderId));
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
    const store = await exigirRecurso("FINANCEIRO");
    if (!store) {
      throw new Error("Not authenticated");
    }

    return numeros(await InventoryCostService.getCostReport(
      store.storeId,
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
    /*
      ESTA FUNÇÃO NÃO TINHA SESSÃO NENHUMA, e agora tem.
      Ela é uma calculadora pura — recebe dois números e devolve a margem —,
      então não vazava dado de loja alguma. Mas é um endpoint do módulo
      financeiro, e gatear por recurso exige saber de quem é a sessão. O efeito
      colateral é que ela passa a exigir login, que é o comportamento correto e
      não quebra ninguém: ela não tem nenhum consumidor de interface.
    */
    await exigirRecurso("FINANCEIRO");
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
    const store = await exigirRecurso("FINANCEIRO");
    if (!store) {
      throw new Error("Not authenticated");
    }

    return numeros(await InventoryCostService.getProductProfitability(
      store.storeId,
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
    const store = await exigirRecurso("FINANCEIRO");
    if (!store) {
      throw new Error("Not authenticated");
    }

    return numeros(await InventoryCostService.getFinancialKPIs(store.storeId, data.days || 30));
  });

/**
 * Os pedidos cuja baixa de estoque não fechou.
 *
 * `Order.inventoryInconsistentAt` era gravado em quatro lugares do sistema e
 * lido em NENHUM: o aviso existia no banco e não chegava a ninguém. Um pedido
 * podia concluir sem consumo registrado, sair da apuração e derrubar a
 * cobertura em silêncio.
 *
 * A VENDA CONTINUA VÁLIDA. Estes pedidos estão dentro do faturamento, do
 * histórico e dos relatórios — nada é escondido. O que a marca diz é que o
 * CUSTO deles pode estar incompleto, e que o estoque precisa de contagem.
 *
 * O RECORTE NÃO MORA AQUI. Quem define o universo é
 * `InventoryCostService.pedidosComEstoqueInconsistente`, que passa pelo mesmo
 * carregador dos KPIs — é o que garante que o número do cabeçalho e as linhas
 * da lista falem do mesmo conjunto de pedidos.
 */
export const getPedidosComEstoqueInconsistente = createServerFn({ method: "POST" })
  .validator(z.object({ days: z.number().int().positive().optional() }))
  .handler(async ({ data }) => {
    // `storeId` da sessão, nunca do cliente — o recorte de loja é o mesmo do
    // resto do financeiro.
    const store = await exigirRecurso("FINANCEIRO");
    if (!store) throw new Error("Not authenticated");

    return numeros(
      await InventoryCostService.pedidosComEstoqueInconsistente(
        store.storeId,
        data.days || 30,
      ),
    );
  });

/** As perdas do período, para a tela poder abrir o total em linhas. */
export const getPerdas = createServerFn({ method: "POST" })
  .validator(z.object({ days: z.number().int().positive().optional() }))
  .handler(async ({ data }) => {
    const store = await exigirRecurso("FINANCEIRO");
    if (!store) throw new Error("Not authenticated");

    const dias = data.days || 30;
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - dias);

    return numeros(await InventoryCostService.perdasNoPeriodo(store.storeId, inicio, fim));
  });
