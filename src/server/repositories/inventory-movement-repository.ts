import { prisma } from "@/server/db/client";
import { Prisma, InventoryMovementType } from "@prisma/client";

export type CreateInventoryMovementInput = Prisma.InventoryMovementCreateInput;

export const inventoryMovementRepository = {
  /**
   * Find movement by ID (store-scoped)
   */
  async findById(storeId: string, movementId: string) {
    return prisma.inventoryMovement.findFirst({
      where: { id: movementId, storeId },
      include: {
        item: true,
        unit: true,
        originalMovement: true,
        composition: true,
      },
    });
  },

  /**
   * Find by idempotencyKey (CRITICAL: prevents duplicates)
   */
  async findByIdempotencyKey(key: string) {
    return prisma.inventoryMovement.findUnique({
      where: { idempotencyKey: key },
      include: {
        item: true,
        unit: true,
        originalMovement: true,
      },
    });
  },

  /**
   * Create a movement (INSERT ONLY, never update)
   * Should be wrapped in transaction
   */
  async create(storeId: string, data: CreateInventoryMovementInput) {
    return prisma.inventoryMovement.create({
      data: {
        ...data,
        storeId,
      },
      include: {
        item: true,
        unit: true,
        originalMovement: true,
        composition: true,
      },
    });
  },

  /**
   * Find all movements for an item (audit trail)
   */
  async findByItem(
    storeId: string,
    itemId: string,
    options?: {
      limit?: number;
      offset?: number;
      orderBy?: "asc" | "desc";
    }
  ) {
    return prisma.inventoryMovement.findMany({
      where: { storeId, itemId },
      include: {
        unit: true,
        originalMovement: true,
        composition: true,
      },
      orderBy: { createdAt: options?.orderBy === "asc" ? "asc" : "desc" },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
  },

  /**
   * Find movements by reference (order, production batch, etc)
   * For audit trail: "which movements are linked to order #123?"
   */
  async findByReference(
    storeId: string,
    referenceType: string,
    referenceId: string
  ) {
    return prisma.inventoryMovement.findMany({
      where: {
        storeId,
        referenceType,
        reference: referenceId,
      },
      include: {
        item: true,
        unit: true,
        composition: true,
      },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Find movements of a specific type in a store
   */
  async findByType(
    storeId: string,
    type: InventoryMovementType,
    options?: {
      limit?: number;
      offset?: number;
    }
  ) {
    return prisma.inventoryMovement.findMany({
      where: { storeId, type },
      include: { item: true, unit: true },
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
  },

  /**
   * Find all REVERSAL movements (for audit)
   */
  async findReversals(storeId: string) {
    return prisma.inventoryMovement.findMany({
      where: {
        storeId,
        type: "REVERSAL",
      },
      include: {
        item: true,
        originalMovement: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Check if a movement has been reversed
   * (There should be at most 1 REVERSAL per movement)
   */
  async findReversal(storeId: string, originalMovementId: string) {
    return prisma.inventoryMovement.findFirst({
      where: {
        storeId,
        type: "REVERSAL",
        originalMovementId,
      },
    });
  },

  /**
   * Get total quantity changes for an item in a date range
   * Useful for reports
   */
  async getTotalByType(
    storeId: string,
    itemId: string,
    type: InventoryMovementType,
    options?: {
      from?: Date;
      to?: Date;
    }
  ) {
    const where: Prisma.InventoryMovementWhereInput = {
      storeId,
      itemId,
      type,
    };

    if (options?.from || options?.to) {
      where.createdAt = {};
      if (options.from) {
        (where.createdAt as any).gte = options.from;
      }
      if (options.to) {
        (where.createdAt as any).lte = options.to;
      }
    }

    const result = await prisma.inventoryMovement.aggregate({
      where,
      _sum: { quantity: true },
    });

    return result._sum.quantity ?? 0;
  },

  /**
   * Count movements in store (for pagination)
   */
  async count(storeId: string, itemId?: string) {
    return prisma.inventoryMovement.count({
      where: {
        storeId,
        ...(itemId && { itemId }),
      },
    });
  },
};

