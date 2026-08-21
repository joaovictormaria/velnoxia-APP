import { prisma } from "@/server/db/client";
import { Prisma, InventoryMovementType } from "@prisma/client";

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
    
    const withAvailable = items.map((item) => ({
      ...item,
      quantityAvailable: item.quantityOnHand - item.quantityReserved,
    }));

    if (options?.sortBy === "name") withAvailable.sort((a, b) => a.name.localeCompare(b.name));
    else if (options?.sortBy === "quantity") withAvailable.sort((a, b) => Number(b.quantityOnHand) - Number(a.quantityOnHand));
    
    return withAvailable;
  },

  async getLowStockItems(storeId: string) {
    const items = await prisma.inventoryItem.findMany({
      where: { storeId, isActive: true, minimumThreshold: { not: null } },
      select: { id: true, name: true, quantityOnHand: true, minimumThreshold: true, baseUnit: true, cost: true },
    });
    return items.filter((item) => item.minimumThreshold && item.quantityOnHand < item.minimumThreshold);
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

    return prisma.inventoryMovement.findMany({
      where,
      include: { item: true, unit: true, originalMovement: true },
      orderBy: { createdAt: options?.orderBy === "asc" ? "asc" : "desc" },
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
    });
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
        const value = item.quantityOnHand * item.cost;
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
        const cost = Math.abs(Number(movement.quantity)) * itemCost;
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
