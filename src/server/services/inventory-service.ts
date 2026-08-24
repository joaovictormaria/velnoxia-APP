import { prisma } from "@/server/db/client";
import {
  inventoryItemRepository,
  inventoryMovementRepository,
  inventoryUnitRepository,
} from "@/server/repositories";
import type {
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
} from "@/lib/estoque-schemas";
import type { CreateInventoryMovementInput } from "@/server/repositories";

export class InventoryService {
  private static serializeItem(item: any) {
    return {
      ...item,
      quantityOnHand: Number(item.quantityOnHand ?? 0),
      quantityReserved: Number(item.quantityReserved ?? 0),
      cost: item.cost ? Number(item.cost) : null,
      minimumThreshold: item.minimumThreshold ? Number(item.minimumThreshold) : null,
      idealQuantity: item.idealQuantity ? Number(item.idealQuantity) : null,
      maximumCapacity: item.maximumCapacity ? Number(item.maximumCapacity) : null,
    };
  }

  /**
   * Create a new inventory item
   * Validates baseUnitId exists
   */
  static async createItem(storeId: string, data: CreateInventoryItemInput) {
    // Validate baseUnit exists
    const baseUnit = await inventoryUnitRepository.findById(data.baseUnitId);
    if (!baseUnit) {
      throw new Error("Invalid baseUnitId");
    }

    // Check for duplicate SKU/barcode
    if (
      await inventoryItemRepository.skuOrBarcodeExists(
        storeId,
        data.sku ?? undefined,
        data.barcode ?? undefined
      )
    ) {
      throw new Error("SKU or barcode already exists in this store");
    }

    const item = await inventoryItemRepository.create(storeId, {
      name: data.name,
      sku: data.sku,
      barcode: data.barcode,
      itemType: data.itemType,
      baseUnitId: data.baseUnitId,
      cost: data.cost,
      minimumThreshold: data.minimumThreshold,
      idealQuantity: data.idealQuantity,
      maximumCapacity: data.maximumCapacity,
    } as any);

    return this.serializeItem(item);
  }

  /**
   * Update an existing item
   * Cannot update quantityOnHand/quantityReserved directly
   */
  static async updateItem(
    storeId: string,
    itemId: string,
    data: UpdateInventoryItemInput
  ) {
    const item = await inventoryItemRepository.findById(storeId, itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // If changing SKU/barcode, check for duplicates
    if (
      (data.sku !== undefined || data.barcode !== undefined) &&
      (await inventoryItemRepository.skuOrBarcodeExists(
        storeId,
        data.sku ?? item.sku ?? undefined,
        data.barcode ?? item.barcode ?? undefined,
        itemId
      ))
    ) {
      throw new Error("SKU or barcode already exists in this store");
    }

    await inventoryItemRepository.update(storeId, itemId, data);
    return inventoryItemRepository.findById(storeId, itemId);
  }

  /**
   * Record a movement (INSERT ONLY)
   * Handles idempotency, updates quantities, maintains atomicity
   */
  static async recordMovement(
    storeId: string,
    data: CreateInventoryMovementInput & { idempotencyKey: string }
  ) {
    // 1. Check idempotency: if key exists, return existing
    const existing = await inventoryMovementRepository.findByIdempotencyKey(
      data.idempotencyKey
    );
    if (existing) {
      return existing;
    }

    // 2. Validate item exists
    const item = await inventoryItemRepository.findById(storeId, (data as any).itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // 3. Validate unit exists
    const unit = await inventoryUnitRepository.findById((data as any).unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }

    // 4. Validate REVERSAL constraints
    if (data.type === "REVERSAL") {
      if (!(data as any).originalMovementId) {
        throw new Error("REVERSAL requires originalMovementId");
      }

      const original = await inventoryMovementRepository.findById(
        storeId,
        (data as any).originalMovementId
      );
      if (!original) {
        throw new Error("Original movement not found");
      }

      // Cannot reverse a REVERSAL
      if (original.type === "REVERSAL") {
        throw new Error("Cannot reverse a REVERSAL movement");
      }

      // Check if already reversed
      const existingReversal = await inventoryMovementRepository.findReversal(
        storeId,
        (data as any).originalMovementId
      );
      if (existingReversal) {
        throw new Error("Movement has already been reversed");
      }
    }

    // 5. Create movement and update quantities (ATOMIC)
    return prisma.$transaction(async (tx) => {
        // Create the movement
        const movement = await tx.inventoryMovement.create({
        data: {
          storeId,
          idempotencyKey: data.idempotencyKey,
          itemId: (data as any).itemId,
          type: data.type,
          quantity: data.quantity,
          unitId: (data as any).unitId,
          reference: data.reference,
          referenceType: data.referenceType,
          originalMovementId: (data as any).originalMovementId,
          compositionId: (data as any).compositionId,
          costAtTime: item.cost, // Congelar custo no momento da movimentação
          note: data.note,
          authorType: data.authorType,
          authorId: data.authorId,
          authorName: data.authorName,
        },
        include: { item: true, unit: true },
      });

      // Update item quantities based on movement type
      const updates = this.calculateQuantityUpdates(
        item,
        data.type,
        Number(data.quantity)
      );

      if (Object.keys(updates).length > 0) {
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: updates,
        });
      }

      return movement;
    });
  }

  /**
   * Create a REVERSAL for a movement
   * Automatically calculates inverse quantities
   */
  static async reverseMovement(
    storeId: string,
    originalMovementId: string,
    authorData?: {
      authorType?: string;
      authorId?: string;
      authorName?: string;
    }
  ) {
    const original = await inventoryMovementRepository.findById(
      storeId,
      originalMovementId
    );
    if (!original) {
      throw new Error("Original movement not found");
    }

    // Check if already reversed
    const existingReversal = await inventoryMovementRepository.findReversal(
      storeId,
      originalMovementId
    );
    if (existingReversal) {
      throw new Error("Movement has already been reversed");
    }

    // Cannot reverse a REVERSAL
    if (original.type === "REVERSAL") {
      throw new Error("Cannot reverse a REVERSAL movement");
    }

    const reversalKey = `${storeId}#REVERSAL#${originalMovementId}`;

    return this.recordMovement(storeId, {
      idempotencyKey: reversalKey,
      itemId: original.itemId,
      type: "REVERSAL",
      quantity: Number(original.quantity) * -1,
      unitId: original.unitId,
      originalMovementId: originalMovementId,
      reference: original.reference,
      referenceType: original.referenceType,
      authorType: authorData?.authorType,
      authorId: authorData?.authorId,
      authorName: authorData?.authorName,
    } as any);
  }

  /**
   * Get item summary (quantities + availability)
   */
  static async getItemSummary(storeId: string, itemId: string) {
    return inventoryItemRepository.getSummary(storeId, itemId);
  }

  /**
   * Reserve quantity for an order (RESERVATION is a flag, not physical movement)
   */
  static async reserveForOrder(
    storeId: string,
    itemId: string,
    quantity: number,
    orderId: string
  ) {
    const item = await inventoryItemRepository.findById(storeId, itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // Check availability
    const quantityAvailable = Number(item.quantityOnHand) - Number(item.quantityReserved);
    if (quantityAvailable < quantity) {
      throw new Error(
        `Insufficient quantity. Available: ${quantityAvailable}, Requested: ${quantity}`
      );
    }

    // Create RESERVATION movement (flag)
    const reservationKey = `${storeId}#ORDER#${orderId}#RESERVATION#${itemId}#0`;

    return this.recordMovement(storeId, {
      idempotencyKey: reservationKey,
      itemId,
      type: "RESERVATION",
      quantity,
      unitId: item.baseUnitId,
      reference: orderId,
      referenceType: "ORDER",
      authorType: "SYSTEM",
    } as any);
  }

  /**
   * Consume (deduct) quantity from order preparation (CONSUMPTION is physical)
   */
  static async consumeForOrder(
    storeId: string,
    itemId: string,
    quantity: number,
    orderId: string
  ) {
    const item = await inventoryItemRepository.findById(storeId, itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // Check if reserved (quantityReserved >= quantity)
    if (Number(item.quantityReserved) < quantity) {
      throw new Error(
        `Insufficient reserved quantity. Reserved: ${item.quantityReserved}, Requested: ${quantity}`
      );
    }

    const consumptionKey = `${storeId}#ORDER#${orderId}#CONSUMPTION#${itemId}#0`;

    return this.recordMovement(storeId, {
      idempotencyKey: consumptionKey,
      itemId,
      type: "CONSUMPTION",
      quantity: -quantity,
      unitId: item.baseUnitId,
      reference: orderId,
      referenceType: "ORDER",
      authorType: "SYSTEM",
    } as any);
  }

  /**
   * Calculate how quantities should change based on movement type
   * Returns { quantityOnHand?, quantityReserved? }
   * Throws error if quantities would go negative
   */
  private static calculateQuantityUpdates(
    item: { quantityOnHand: any; quantityReserved: any },
    type: string,
    quantity: number
  ): Record<string, any> {
    const updates: Record<string, any> = {};

    // Convert Decimals to Numbers for arithmetic operations
    const currentQuantity = Number(item.quantityOnHand ?? 0);
    const currentReserved = Number(item.quantityReserved ?? 0);

    switch (type) {
      case "PURCHASE":
      case "RETURN":
      case "PRODUCTION":
        // Increase quantityOnHand
        updates.quantityOnHand = currentQuantity + quantity;
        break;

      case "CONSUMPTION":
        // Decrease only quantityOnHand (for recipe consumption)
        const newOnHand = currentQuantity + quantity; // quantity is negative

        if (newOnHand < 0) {
          throw new Error(`Não há estoque suficiente. Disponível: ${currentQuantity}, Solicitado: ${Math.abs(quantity)}`);
        }

        updates.quantityOnHand = newOnHand;
        // quantityReserved é apenas para reservas de pedidos, não afeta consumo de receitas
        break;

      case "LOSS":
        // Decrease quantityOnHand for losses
        const newLossOnHand = currentQuantity - quantity;
        if (newLossOnHand < 0) {
          throw new Error(`Não há estoque suficiente para perda. Disponível: ${currentQuantity}, Solicitado: ${quantity}`);
        }
        updates.quantityOnHand = newLossOnHand;
        break;

      case "ADJUSTMENT":
        // Direct change to quantityOnHand (quantity can be positive or negative)
        const newAdjustment = currentQuantity + quantity;
        if (newAdjustment < 0) {
          throw new Error(`Ajuste resultaria em quantidade negativa. Atual: ${currentQuantity}, Ajuste: ${quantity}`);
        }
        updates.quantityOnHand = newAdjustment;
        break;

      case "RESERVATION":
        // Increase quantityReserved only (no physical change)
        const newReservation = currentReserved + quantity;
        if (newReservation < 0) {
          throw new Error(`Quantidade reservada não pode ser negativa. Atual: ${currentReserved}, Movimento: ${quantity}`);
        }
        updates.quantityReserved = newReservation;
        break;

      case "REVERSAL":
        // Reverse uses calculateQuantityUpdates with inverse quantity
        // This is a recursive case but handled by caller
        break;
    }

    return updates;
  }
}
