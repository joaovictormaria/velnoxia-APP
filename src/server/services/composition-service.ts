import { prisma } from "@/server/db/client";
import {
  productCompositionRepository,
  compositionItemRepository,
  inventoryUnitRepository,
  inventoryItemRepository,
} from "@/server/repositories";
import type {
  CreateProductCompositionInput,
  UpdateProductCompositionInput,
} from "@/lib/estoque-schemas";

export class CompositionService {
  /**
   * Create a new product composition (recipe)
   * Validates all items and units exist, creates version
   */
  static async createComposition(
    storeId: string,
    productId: string,
    data: CreateProductCompositionInput
  ) {
    // Validate product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new Error("Product not found");
    }

    // Validate all items and units exist
    for (const item of data.items) {
      const inventoryItem = await inventoryItemRepository.findById(
        storeId,
        item.inventoryItemId
      );
      if (!inventoryItem) {
        throw new Error(`Inventory item not found: ${item.inventoryItemId}`);
      }

      const unit = await inventoryUnitRepository.findById(item.unitId);
      if (!unit) {
        throw new Error(`Unit not found: ${item.unitId}`);
      }
    }

    // Get next version number
    const nextVersion = await productCompositionRepository.getNextVersion(
      productId
    );

    return prisma.$transaction(async (tx) => {
      // Deactivate previous active version
      await tx.productComposition.updateMany({
        where: { productId, isActive: true },
        data: { isActive: false },
      });

      // Create new composition
      const composition = await tx.productComposition.create({
        data: {
          storeId,
          productId,
          version: nextVersion,
          isActive: data.isActive ?? true,
        },
      });

      // Create composition items
      if (data.items.length > 0) {
        await tx.compositionItem.createMany({
          data: data.items.map((item, idx) => ({
            compositionId: composition.id,
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitId: item.unitId,
            sortOrder: item.sortOrder ?? idx,
          })),
        });
      }

      return tx.productComposition.findUnique({
        where: { id: composition.id },
        include: {
          items: {
            include: { inventoryItem: true, unit: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
    });
  }

  /**
   * Update a composition (only if not yet used)
   */
  static async updateComposition(
    storeId: string,
    compositionId: string,
    data: UpdateProductCompositionInput
  ) {
    const composition =
      await productCompositionRepository.findById(storeId, compositionId);
    if (!composition) {
      throw new Error("Composition not found");
    }

    // Check if can be edited
    if (composition.firstUsedAt) {
      throw new Error("Cannot update composition that has been used");
    }

    // If items provided, replace all
    if (data.items) {
      // Validate all items
      for (const item of data.items) {
        const invItem = await inventoryItemRepository.findById(
          storeId,
          item.inventoryItemId
        );
        if (!invItem) {
          throw new Error(
            `Inventory item not found: ${item.inventoryItemId}`
          );
        }

        const unit = await inventoryUnitRepository.findById(item.unitId);
        if (!unit) {
          throw new Error(`Unit not found: ${item.unitId}`);
        }
      }

      return prisma.$transaction(async (tx) => {
        // Delete old items
        await tx.compositionItem.deleteMany({
          where: { compositionId },
        });

        // Create new items
        await tx.compositionItem.createMany({
          data: data.items!.map((item, idx) => ({
            compositionId,
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitId: item.unitId,
            sortOrder: item.sortOrder ?? idx,
          })),
        });

        return tx.productComposition.findUnique({
          where: { id: compositionId },
          include: {
            items: {
              include: { inventoryItem: true, unit: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        });
      });
    }

    // Just update isActive
    await productCompositionRepository.update(compositionId, {
      isActive: data.isActive,
    });

    return productCompositionRepository.findById(storeId, compositionId);
  }

  /**
   * Get active composition for a product
   */
  static async getActiveComposition(storeId: string, productId: string) {
    return productCompositionRepository.findActiveForProduct(storeId, productId);
  }

  /**
   * Get all versions of a product
   */
  static async getProductVersions(storeId: string, productId: string) {
    return productCompositionRepository.findAllVersions(storeId, productId);
  }

  /**
   * Activate a specific version (deactivate others)
   */
  static async activateVersion(storeId: string, compositionId: string) {
    const composition =
      await productCompositionRepository.findById(storeId, compositionId);
    if (!composition) {
      throw new Error("Composition not found");
    }

    return prisma.$transaction(async (tx) => {
      // Deactivate all other versions
      await tx.productComposition.updateMany({
        where: { productId: composition.productId, isActive: true },
        data: { isActive: false },
      });

      // Activate this version
      return tx.productComposition.update({
        where: { id: compositionId },
        data: { isActive: true },
        include: {
          items: {
            include: { inventoryItem: true, unit: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
    });
  }

  /**
   * Calculate total cost of a composition
   */
  static async calculateCost(storeId: string, compositionId: string) {
    const composition =
      await productCompositionRepository.findById(storeId, compositionId);
    if (!composition) {
      throw new Error("Composition not found");
    }

    return compositionItemRepository.calculateTotalCost(compositionId);
  }

  /**
   * Delete a composition (only if never used)
   */
  static async deleteComposition(storeId: string, compositionId: string) {
    const composition =
      await productCompositionRepository.findById(storeId, compositionId);
    if (!composition) {
      throw new Error("Composition not found");
    }

    if (composition.firstUsedAt) {
      throw new Error("Cannot delete composition that has been used");
    }

    // Don't delete, just deactivate
    return productCompositionRepository.deactivate(storeId, compositionId);
  }

  /**
   * Mark composition as used (freezes it, prevents edits)
   * Called when composition is first used in a movement
   */
  static async markAsUsed(compositionId: string) {
    return productCompositionRepository.markAsUsed(compositionId);
  }
}
