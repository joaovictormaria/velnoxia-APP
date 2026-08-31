import { prisma } from "@/server/db/client";
import { statusDoEstoque } from "@/lib/status-do-estoque";
import { Prisma, InventoryMovementType } from "@prisma/client";
import {
  converterParaUnidadeBase,
  montarMapaDeConversoes,
} from "@/lib/conversao-de-unidade";

export const reportRepository = {
  async getStockLevelsByStore(storeId: string, options?: any) {
    const where: Prisma.InventoryItemWhereInput = { storeId };
    if (!options?.includeInactive) where.isActive = true;
    if (options?.itemType) where.itemType = options.itemType;

    const items = await prisma.inventoryItem.findMany({
      where,
      include: { baseUnit: true },
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0
    });

    /*
     * QUANTO DE CADA INSUMO ESTÁ CONFIGURADO NAS FICHAS ATIVAS.
     *
     * CONVERTE ANTES DE SOMAR, e a ordem é o conserto.
     *
     * Antes daqui se somava `CompositionItem.quantity` cru e se colava nele o
     * código da unidade BASE do item. São duas línguas diferentes: uma ficha de
     * 200 g de farinha aparecia como "200 kg", e 90 ml de óleo num item contado
     * em garrafas aparecia como "90 un" — noventa garrafas. Mil vezes e
     * novecentas vezes o valor real, sem erro nenhum na tela.
     *
     * O `unitId` nem era selecionado: a informação que resolve o problema nunca
     * saía do banco.
     *
     * Cada linha passa pelo MESMO motor que a venda usa. Somar depois também é
     * o que torna correta a ficha mista — um produto pedindo o insumo em `g` e
     * outro em `kg` deixam de ser somados como se fossem o mesmo número.
     */
    const usageByItem = new Map<string, number>();
    const compositions = await prisma.compositionItem.findMany({
      where: {
        composition: { storeId, isActive: true }
      },
      select: { inventoryItemId: true, quantity: true, unitId: true }
    });

    if (compositions.length > 0) {
      const conversoes = montarMapaDeConversoes(
        await prisma.inventoryUnitConversion.findMany({
          select: { fromUnitId: true, toUnitId: true, conversionFactor: true },
        }),
      );
      /*
       * Os itens já vieram na consulta acima, com `contentSize` e `contentUnit`
       * — que é o que permite converter ml para garrafa. Um índice evita
       * varrer a lista por linha de ficha.
       */
      const porId = new Map(items.map((i) => [i.id, i]));

      for (const comp of compositions) {
        const item = porId.get(comp.inventoryItemId);
        // Insumo fora desta página (ou inativo): não há base para converter.
        if (!item) continue;
        try {
          const naBase = converterParaUnidadeBase(
            Number(comp.quantity || 0),
            comp.unitId,
            item,
            conversoes,
          );
          usageByItem.set(comp.inventoryItemId, (usageByItem.get(comp.inventoryItemId) || 0) + naBase);
        } catch {
          /*
           * A linha não converte — massa contra volume, ou embalagem sem
           * conteúdo declarado. FICA DE FORA em vez de entrar pelo número cru.
           *
           * A guarda de `validarInsumos` impede que uma ficha assim nasça hoje;
           * o que pode existir é linha anterior a ela. Somar o número cru seria
           * repetir exatamente o defeito que este bloco conserta, e este é um
           * relatório: derrubar a lista inteira de estoque por causa de uma
           * ficha torta seria pior que mostrá-la sem essa linha.
           */
          continue;
        }
      }
    }

    const withAvailable = items.map((item) => ({
      ...item,
      quantityAvailable: Number(item.quantityOnHand) - Number(item.quantityReserved),
      quantityUsedInRecipes: usageByItem.get(item.id) || 0,
    }));

    if (options?.sortBy === "name") withAvailable.sort((a, b) => a.name.localeCompare(b.name));
    else if (options?.sortBy === "quantity") withAvailable.sort((a, b) => Number(b.quantityOnHand) - Number(a.quantityOnHand));

    return withAvailable;
  },

  async getLowStockItems(storeId: string) {
    /*
     * `quantityReserved` entrou no `select`, e é o que faltava: sem ele a
     * regra só enxergava o saldo físico. E a comparação crua entre dois
     * `Decimal` saiu — ela fazia comparação de STRING, respondendo que 10 é
     * menor que 9.
     */
    const items = await prisma.inventoryItem.findMany({
      where: { storeId, isActive: true },
      select: {
        id: true,
        name: true,
        quantityOnHand: true,
        quantityReserved: true,
        minimumThreshold: true,
        baseUnit: true,
        cost: true,
      },
    });
    return items.filter((item) => statusDoEstoque(item).status !== "NORMAL");
  },

  async getMovementHistory(storeId: string, options?: any) {
    const where: Prisma.InventoryMovementWhereInput = { storeId };
    if (options?.itemId) where.itemId = options.itemId;
    if (options?.type) where.type = options.type as InventoryMovementType;
    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options?.startDate) (where.createdAt as any).gte = options.startDate;
      if (options?.endDate) (where.createdAt as any).lte = options.endDate;
    }

    const movements = await prisma.inventoryMovement.findMany({
      where,
      include: { item: true, unit: true, originalMovement: true },
      orderBy: { createdAt: options?.orderBy === "asc" ? "asc" : "desc" },
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
    });

    // Serialize Decimal to Number
    return movements.map(mov => ({
      ...mov,
      quantity: Number(mov.quantity ?? 0),
      costAtTime: mov.costAtTime ? Number(mov.costAtTime) : null,
      item: mov.item ? {
        ...mov.item,
        quantityOnHand: Number(mov.item.quantityOnHand ?? 0),
        quantityReserved: Number(mov.item.quantityReserved ?? 0),
        cost: mov.item.cost ? Number(mov.item.cost) : null,
      } : null,
    }));
  },

  async getInventoryValue(storeId: string) {
    const items = await prisma.inventoryItem.findMany({
      where: { storeId, isActive: true },
      select: { id: true, name: true, quantityOnHand: true, cost: true }
    });

    let totalValue = 0;
    const breakdown: any[] = [];

    for (const item of items) {
      if (item.cost) {
        const value = Number(item.quantityOnHand) * Number(item.cost);
        totalValue = totalValue + value;
        breakdown.push({ id: item.id, name: item.name, quantity: item.quantityOnHand, cost: item.cost, value });
      }
    }

    return { totalValue, itemCount: items.length, breakdown: breakdown.sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 10) };
  },

  async getMovementCostAnalysis(storeId: string, options?: any) {
    const movements = await prisma.inventoryMovement.findMany({
      where: { storeId, ...(options?.type && { type: options.type as InventoryMovementType }) },
      include: { item: { select: { name: true, cost: true } } },
    });

    let totalCost = 0;
    const byItem: any = {};

    for (const movement of movements) {
      const itemCost = movement.costAtTime || movement.item.cost;
      if (itemCost) {
        const cost = Math.abs(Number(movement.quantity)) * Number(itemCost);
        totalCost = totalCost + cost;
        if (!byItem[movement.itemId]) byItem[movement.itemId] = { name: movement.item.name, cost: 0 };
        byItem[movement.itemId].cost = byItem[movement.itemId].cost + cost;
      }
    }

    return { totalMovements: movements.length, totalCost, breakdown: Object.entries(byItem).map(([id, data]: any) => ({ id, ...data })).sort((a: any, b: any) => Number(b.cost) - Number(a.cost)).slice(0, 10) };
  },

  async getCompositionUsageReport(storeId: string) {
    const compositions = await prisma.productComposition.findMany({
      where: { storeId },
      include: { product: true },
      orderBy: { usageCount: "desc" },
    });
    return compositions.map((comp) => ({ id: comp.id, productId: comp.productId, productName: comp.product.name, version: comp.version, isActive: comp.isActive, usageCount: comp.usageCount }));
  },

  async getMovementStats(storeId: string) {
    const movements = await prisma.inventoryMovement.groupBy({
      by: ["type"],
      where: { storeId },
      _count: { id: true },
      _sum: { quantity: true },
    });
    return movements.map((stat) => ({ type: stat.type, count: stat._count.id, totalQuantity: stat._sum.quantity || 0 }));
  },

  async getOrderFulfillmentStats(storeId: string) {
    const movements = await prisma.inventoryMovement.findMany({
      where: { storeId, referenceType: "ORDER" },
      select: { reference: true, type: true },
    });
    const byOrder: any = {};
    for (const movement of movements) {
      const orderId = movement.reference || "unknown";
      if (!byOrder[orderId]) byOrder[orderId] = { hasReservation: false, hasConsumption: false, hasReversal: false };
      if (movement.type === "RESERVATION") byOrder[orderId].hasReservation = true;
      if (movement.type === "CONSUMPTION") byOrder[orderId].hasConsumption = true;
      if (movement.type === "REVERSAL") byOrder[orderId].hasReversal = true;
    }
    const fullyFulfilled = Object.values(byOrder).filter((o: any) => o.hasReservation && o.hasConsumption).length;
    const cancelled = Object.values(byOrder).filter((o: any) => o.hasReversal).length;
    return {
      totalOrders: Object.keys(byOrder).length,
      fullyFulfilled,
      partiallyFulfilled: Object.keys(byOrder).length - fullyFulfilled - cancelled,
      cancelled,
    };
  },
};
