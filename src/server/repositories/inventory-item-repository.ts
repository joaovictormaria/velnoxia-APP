import { prisma } from "@/server/db/client";
import { Prisma } from "@prisma/client";

export type CreateInventoryItemInput = Prisma.InventoryItemCreateInput;
export type UpdateInventoryItemInput = Prisma.InventoryItemUpdateInput;

export const inventoryItemRepository = {
  /**
   * Find inventory item by ID
   */
  async findById(storeId: string, itemId: string) {
    return prisma.inventoryItem.findFirst({
      where: { id: itemId, storeId },
      include: { baseUnit: true },
    });
  },

  /**
   * Find inventory item by SKU (must be unique per store)
   */
  async findBySku(storeId: string, sku: string) {
    return prisma.inventoryItem.findFirst({
      where: { storeId, sku },
      include: { baseUnit: true },
    });
  },

  /**
   * Find inventory item by barcode (must be unique per store)
   */
  async findByBarcode(storeId: string, barcode: string) {
    return prisma.inventoryItem.findFirst({
      where: { storeId, barcode },
      include: { baseUnit: true },
    });
  },

  /**
   * Find all active items in a store with optional filters
   */
  async findAll(
    storeId: string,
    options?: {
      includeInactive?: boolean;
      itemType?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const where: Prisma.InventoryItemWhereInput = { storeId };

    if (!options?.includeInactive) {
      where.isActive = true;
    }

    if (options?.itemType) {
      where.itemType = options.itemType;
    }

    return prisma.inventoryItem.findMany({
      where,
      include: { baseUnit: true },
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Create a new inventory item
   */
  async create(storeId: string, data: CreateInventoryItemInput) {
    return prisma.inventoryItem.create({
      data: {
        ...data,
        storeId,
      },
      include: { baseUnit: true },
    });
  },

  /**
   * Update inventory item (excluding quantities)
   */
  async update(storeId: string, itemId: string, data: UpdateInventoryItemInput) {
    return prisma.inventoryItem.updateMany({
      where: { id: itemId, storeId },
      data,
    });
  },

  /**
   * Update quantities (quantityOnHand and/or quantityReserved)
   * Called after movement is recorded
   */
  async updateQuantities(
    itemId: string,
    updates: {
      quantityOnHand?: number;
      quantityReserved?: number;
    }
  ) {
    const data: Prisma.InventoryItemUpdateInput = {};

    if (updates.quantityOnHand !== undefined) {
      data.quantityOnHand = updates.quantityOnHand;
    }

    if (updates.quantityReserved !== undefined) {
      data.quantityReserved = updates.quantityReserved;
    }

    return prisma.inventoryItem.update({
      where: { id: itemId },
      data,
    });
  },

  /**
   * Soft delete: mark as inactive
   */
  async softDelete(storeId: string, itemId: string) {
    return prisma.inventoryItem.updateMany({
      where: { id: itemId, storeId },
      data: { isActive: false },
    });
  },

  /**
   * Get summary of an item (quantities + availability)
   */
  async getSummary(storeId: string, itemId: string) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, storeId },
      select: {
        id: true,
        name: true,
        quantityOnHand: true,
        quantityReserved: true,
        baseUnit: true,
      },
    });

    if (!item) {
      return null;
    }

    // quantityAvailable = quantityOnHand - quantityReserved
    const quantityAvailable = item.quantityOnHand - item.quantityReserved;

    return {
      ...item,
      quantityAvailable,
    };
  },

  /**
   * Check if SKU or barcode already exists in store
   */
  async skuOrBarcodeExists(
    storeId: string,
    sku?: string,
    barcode?: string,
    excludeItemId?: string
  ): Promise<boolean> {
    if (!sku && !barcode) {
      return false;
    }

    const where: Prisma.InventoryItemWhereInput = {
      storeId,
      AND: [],
    };

    if (excludeItemId) {
      (where.AND as Prisma.InventoryItemWhereInput[]).push({
        NOT: { id: excludeItemId },
      });
    }

    if (sku) {
      (where.OR as Prisma.InventoryItemWhereInput[]) ??= [];
      (where.OR as Prisma.InventoryItemWhereInput[]).push({ sku });
    }

    if (barcode) {
      (where.OR as Prisma.InventoryItemWhereInput[]) ??= [];
      (where.OR as Prisma.InventoryItemWhereInput[]).push({ barcode });
    }

    const count = await prisma.inventoryItem.count({ where });
    return count > 0;
  },
};
