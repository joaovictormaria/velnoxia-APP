import { prisma } from "@/server/db/client";
import { Prisma } from "@prisma/client";

export type CreateCompositionItemInput = Prisma.CompositionItemCreateInput;

export const compositionItemRepository = {
  /**
   * Find item in composition by ID
   */
  async findById(compositionItemId: string) {
    return prisma.compositionItem.findUnique({
      where: { id: compositionItemId },
      include: {
        inventoryItem: true,
        unit: true,
      },
    });
  },

  /**
   * Find all items in a composition
   */
  async findByComposition(compositionId: string) {
    return prisma.compositionItem.findMany({
      where: { compositionId },
      include: {
        inventoryItem: true,
        unit: true,
      },
      orderBy: { sortOrder: "asc" },
    });
  },

  /**
   * Create composition item
   */
  async create(data: CreateCompositionItemInput) {
    return prisma.compositionItem.create({
      data,
      include: {
        inventoryItem: true,
        unit: true,
      },
    });
  },

  /**
   * Create multiple items (bulk insert)
   */
  async createMany(
    compositionId: string,
    items: Array<{
      inventoryItemId: string;
      quantity: number | Prisma.Decimal;
      unitId: string;
      sortOrder?: number;
    }>
  ) {
    return prisma.compositionItem.createMany({
      data: items.map((item, idx) => ({
        compositionId,
        inventoryItemId: item.inventoryItemId,
        quantity: item.quantity,
        unitId: item.unitId,
        sortOrder: item.sortOrder ?? idx,
      })),
    });
  },

  /**
   * Update composition item
   * Only allowed if composition not yet used
   */
  async update(
    itemId: string,
    data: {
      quantity?: number | Prisma.Decimal;
      unitId?: string;
      sortOrder?: number;
    }
  ) {
    return prisma.compositionItem.update({
      where: { id: itemId },
      data,
      include: {
        inventoryItem: true,
        unit: true,
      },
    });
  },

  /**
   * Delete composition item
   */
  async delete(itemId: string) {
    return prisma.compositionItem.delete({
      where: { id: itemId },
    });
  },

  /**
   * Delete all items in composition (for bulk update)
   */
  async deleteByComposition(compositionId: string) {
    return prisma.compositionItem.deleteMany({
      where: { compositionId },
    });
  },

  /**
   * Reorder items in composition
   */
  async reorder(
    items: Array<{
      id: string;
      sortOrder: number;
    }>
  ) {
    return prisma.$transaction(
      items.map((item) =>
        prisma.compositionItem.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );
  },

  /**
   * Count items in composition
   */
  async count(compositionId: string) {
    return prisma.compositionItem.count({
      where: { compositionId },
    });
  },

  /**
   * Get total cost of composition
   * Sums (quantity * inventoryItem.cost) for all items
   */
  async calculateTotalCost(compositionId: string) {
    const items = await prisma.compositionItem.findMany({
      where: { compositionId },
      include: { inventoryItem: true },
    });

    let totalCost = 0;
    for (const item of items) {
      if (item.inventoryItem.cost) {
        totalCost +=
          Number(item.quantity) * Number(item.inventoryItem.cost);
      }
    }

    return totalCost;
  },
};
