import { prisma } from "@/server/db/client";
import { Prisma } from "@prisma/client";

export const productCompositionRepository = {
  /**
   * Find composition by ID
   */
  async findById(storeId: string, compositionId: string) {
    return prisma.productComposition.findFirst({
      where: { id: compositionId, storeId },
      include: {
        items: {
          include: { unit: true, inventoryItem: true },
          orderBy: { sortOrder: "asc" },
        },
        product: true,
      },
    });
  },

  /**
   * Find active composition for a product (should be only 1)
   */
  async findActiveForProduct(storeId: string, productId: string) {
    return prisma.productComposition.findFirst({
      where: {
        storeId,
        productId,
        isActive: true,
      },
      include: {
        items: {
          include: { unit: true, inventoryItem: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  },

  /**
   * Find all versions of a product composition
   */
  async findAllVersions(storeId: string, productId: string) {
    return prisma.productComposition.findMany({
      where: { storeId, productId },
      include: {
        items: {
          include: { unit: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { version: "desc" },
    });
  },

  /**
   * Get next version number for a product
   */
  async getNextVersion(productId: string): Promise<number> {
    const latest = await prisma.productComposition.findFirst({
      where: { productId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    return (latest?.version ?? 0) + 1;
  },

  /**
   * Create new composition
   */
  async create(
    storeId: string,
    productId: string,
    data: {
      version: number;
      isActive?: boolean;
    }
  ) {
    return prisma.productComposition.create({
      data: {
        storeId,
        productId,
        version: data.version,
        isActive: data.isActive ?? true,
      },
      include: { items: { include: { unit: true } } },
    });
  },

  /**
   * Update composition (only if not yet used)
   * If firstUsedAt is set, composition is frozen
   */
  async update(
    compositionId: string,
    data: {
      isActive?: boolean;
    }
  ) {
    const composition = await prisma.productComposition.findUnique({
      where: { id: compositionId },
    });

    if (composition?.firstUsedAt) {
      throw new Error("Cannot update composition that has been used");
    }

    return prisma.productComposition.update({
      where: { id: compositionId },
      data,
      include: { items: { include: { unit: true } } },
    });
  },

  /**
   * Mark composition as used and freeze it
   */
  async markAsUsed(compositionId: string) {
    return prisma.productComposition.update({
      where: { id: compositionId },
      data: {
        firstUsedAt: new Date(),
        usageCount: { increment: 1 },
      },
    });
  },

  /**
   * Increment usage count (called each time composition is used)
   */
  async incrementUsageCount(compositionId: string) {
    return prisma.productComposition.update({
      where: { id: compositionId },
      data: { usageCount: { increment: 1 } },
    });
  },

  /**
   * Deactivate a composition (creates new version)
   */
  async deactivate(storeId: string, compositionId: string) {
    const composition = await prisma.productComposition.findFirst({
      where: { id: compositionId, storeId },
    });

    if (!composition) {
      throw new Error("Composition not found");
    }

    return prisma.productComposition.update({
      where: { id: compositionId },
      data: { isActive: false },
    });
  },

  /**
   * Get all compositions in store (for admin)
   */
  async findAllByStore(
    storeId: string,
    options?: {
      activeOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ) {
    const where: Prisma.ProductCompositionWhereInput = { storeId };

    if (options?.activeOnly) {
      where.isActive = true;
    }

    return prisma.productComposition.findMany({
      where,
      include: {
        product: true,
        items: {
          include: { inventoryItem: true, unit: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit,
      skip: options?.offset,
    });
  },

  /**
   * Check if composition can be edited (not yet used)
   */
  async isEditable(compositionId: string): Promise<boolean> {
    const composition = await prisma.productComposition.findUnique({
      where: { id: compositionId },
      select: { firstUsedAt: true },
    });

    return composition?.firstUsedAt === null;
  },

  /**
   * Delete composition (soft delete if used, hard delete if not)
   */
  async delete(compositionId: string) {
    const composition = await prisma.productComposition.findUnique({
      where: { id: compositionId },
    });

    if (!composition) {
      throw new Error("Composition not found");
    }

    if (composition.firstUsedAt) {
      // Cannot delete if used - deactivate instead
      throw new Error(
        "Cannot delete used composition. Deactivate instead if needed."
      );
    }

    return prisma.productComposition.delete({
      where: { id: compositionId },
    });
  },
};
