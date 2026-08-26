import { prisma } from "@/server/db/client";
import {
  productCompositionRepository,
  compositionItemRepository,
  inventoryUnitRepository,
  inventoryItemRepository,
  inventoryMovementRepository,
} from "@/server/repositories";
import type {
  CreateProductCompositionInput,
  UpdateProductCompositionInput,
} from "@/lib/estoque-schemas";
import { InventoryService } from "./inventory-service";

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
    // productId é apenas um identificador para a receita, não precisa validar se existe na tabela Product

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

      const result = await tx.productComposition.findUnique({
        where: { id: composition.id },
        include: {
          items: {
            include: { inventoryItem: true, unit: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      // Serialize ALL Decimals to Numbers
      if (result) {
        return {
          ...result,
          items: (result?.items || []).map((item) => ({
            ...item,
            quantity: Number(item.quantity),
            inventoryItem: item.inventoryItem ? {
              ...item.inventoryItem,
              quantityOnHand: Number(item.inventoryItem.quantityOnHand ?? 0),
              quantityReserved: Number(item.inventoryItem.quantityReserved ?? 0),
              cost: item.inventoryItem.cost ? Number(item.inventoryItem.cost) : null,
              contentSize: item.inventoryItem.contentSize ? Number(item.inventoryItem.contentSize) : null,
              maximumQuantity: Number(item.inventoryItem.maximumQuantity ?? 0),
            } : null,
          })),
        };
      }

      return result;
    });
  }

  /**
   * Update a composition (can be edited even after being used)
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

    // Permitir edição mesmo após uso
    // O campo firstUsedAt é apenas histórico, não congela a receita

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

  /**
   * Consume ingredients from a composition (recipe)
   * Decreases inventory items based on recipe quantities
   * Handles unit conversion (e.g., grams to potes)
   */
  static async consumeComposition(
    storeId: string,
    compositionId: string,
    quantityToProduce: number = 1,
    authorData?: { authorType?: string; authorId?: string; authorName?: string },
    /**
     * Identifica esta execucao. E o que torna a chave de idempotencia estavel:
     * duas chamadas para o mesmo pedido geram a mesma chave, e a segunda e
     * reconhecida como repeticao em vez de descontar de novo.
     */
    referencia: string = "AVULSO",
  ) {
    const composition = await productCompositionRepository.findById(
      storeId,
      compositionId
    );
    if (!composition) {
      throw new Error("Composition not found");
    }

    if (!composition.items || composition.items.length === 0) {
      throw new Error("Composition has no items");
    }

    return prisma.$transaction(async (tx) => {
      // For each item in the composition, create a CONSUMPTION movement
      for (const compItem of composition.items) {
        const inventoryItem = await inventoryItemRepository.findById(
          storeId,
          compItem.inventoryItemId
        );
        if (!inventoryItem) continue;

        // Calculate quantity to consume
        // compItem.quantity is in the unit specified by compItem.unit
        // We need to convert to the inventory item's base unit if they differ
        let quantityToConsume = Number(compItem.quantity) * quantityToProduce;

        // If units are different, convert using contentSize
        if (compItem.unit.id !== inventoryItem.baseUnit.id) {
          // The composition specifies quantity in compItem.unit
          // But inventory is tracked in baseUnit
          // If contentSize exists, use it for conversion
          if (inventoryItem.contentSize) {
            // contentSize = how many base units are in 1 unit of the product
            // e.g., 1 pote = 500g, so contentSize = 500
            // If recipe uses 45g and product is in potes (500g/pote):
            // quantityToConsume in potes = 45 / 500 = 0.09 potes
            quantityToConsume = quantityToConsume / Number(inventoryItem.contentSize);
          }
        }

        // Record CONSUMPTION movement
        // Deterministica: Date.now() aqui anulava o indice unico — cada chamada
        // gerava chave nova, e uma retentativa descontava duas vezes.
        const idempotencyKey = `${storeId}#COMPOSITION#${compositionId}#${referencia}#${compItem.inventoryItemId}`;

        await InventoryService.recordMovement(storeId, {
          ...(compItem.inventoryItemId ? { item: { connect: { id: compItem.inventoryItemId } } } : {}),
          type: "CONSUMPTION",
          quantity: -quantityToConsume, // Negative for consumption
          unit: { connect: { id: inventoryItem.baseUnit.id } },
          reference: compositionId,
          referenceType: "COMPOSITION",
          note: `Consumido por receita (${quantityToProduce}x)`,
          authorType: authorData?.authorType || "SYSTEM",
          authorId: authorData?.authorId,
          authorName: authorData?.authorName,
          idempotencyKey,
          composition: { connect: { id: compositionId } },
        } as any);
      }

      // Nota: Não marcamos como usada aqui. A receita pode continuar sendo editada.
      // A marcação de "usada" apenas congela para edições, o que não queremos.

      return composition;
    });
  }
}
