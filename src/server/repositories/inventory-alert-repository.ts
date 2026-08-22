import { prisma } from "@/server/db/client";

export const InventoryAlertRepository = {
  async findLowStockItems(storeId: string) {
    const items = await prisma.inventoryItem.findMany({
      where: {
        storeId,
        maximumQuantity: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        quantityOnHand: true,
        maximumQuantity: true,
      },
    });

    return items
      .filter((item) => {
        const alertThreshold = Number(item.maximumQuantity) * 0.3;
        return Number(item.quantityOnHand) < alertThreshold;
      })
      .map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        quantityOnHand: Number(item.quantityOnHand),
        maximumQuantity: Number(item.maximumQuantity),
        alertThreshold: Number(item.maximumQuantity) * 0.3,
      }));
  },

  async updateMaximumQuantityIfNeeded(
    inventoryItemId: string,
    currentQuantity: number
  ) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      select: { maximumQuantity: true },
    });

    if (!item) return;

    const max = Number(item.maximumQuantity);
    if (currentQuantity > max) {
      await prisma.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { maximumQuantity: currentQuantity },
      });
    }
  },
};
