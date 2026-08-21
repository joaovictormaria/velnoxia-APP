import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { InventoryService } from "@/server/services/inventory-service";
import {
  createInventoryItemClientSchema,
  createInventoryItemSchema,
  updateInventoryItemSchema,
  createInventoryMovementSchema,
  createReversalSchema,
  createReservationSchema,
  createConsumptionSchema,
  createAdjustmentSchema,
} from "@/lib/estoque-schemas";
import { inventoryItemRepository, inventoryUnitRepository } from "@/server/repositories";

/**
 * Generate unique SKU automatically
 * Format: {ITEMTYPE}-{TIMESTAMP}-{RANDOM}
 * Example: ING-1724272800-A7K9
 */
function generateSKU(itemType: string): string {
  const typePrefix = {
    INGREDIENT: "ING",
    RESALE: "RSL",
    PRODUCED: "PRD",
    PACKAGING: "PKG",
  }[itemType] || "ITM";

  const timestamp = Math.floor(Date.now() / 1000);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();

  return `${typePrefix}-${timestamp}-${random}`;
}

/**
 * Admin only: Create a new inventory item
 */
export const adminCreateInventoryItem = createServerFn({ method: "POST" })
  .validator(createInventoryItemClientSchema)
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store?.adminUser) {
      throw new Error("Not authenticated");
    }

    // Converter código da unidade (ex: "kg") para ID se necessário
    let unitId = data.baseUnitId;
    if (!data.baseUnitId.includes('-')) { // Se for um código (não UUID)
      const unit = await inventoryUnitRepository.findByCode(data.baseUnitId);
      if (!unit) {
        throw new Error(`Unit "${data.baseUnitId}" not found`);
      }
      unitId = unit.id;
    }

    // Gerar SKU automaticamente se não fornecido
    const sku = data.sku || generateSKU(data.itemType);

    const itemData = createInventoryItemSchema.parse({
      name: data.name,
      sku: sku,
      barcode: data.barcode || null,
      baseUnitId: unitId,
      cost: data.cost ? parseFloat(data.cost) : undefined,
      itemType: data.itemType,
    });

    return InventoryService.createItem(store.id, itemData);
  });

/**
 * Admin only: Update inventory item
 */
export const adminUpdateInventoryItem = createServerFn({ method: "POST" })
  .validator(z.object({
    itemId: z.string(),
    name: z.string().optional(),
    sku: z.string().optional(),
    barcode: z.string().optional(),
    cost: z.string().optional(),
    isActive: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store?.adminUser) {
      throw new Error("Not authenticated");
    }

    const validated = updateInventoryItemSchema.parse({
      name: data.name || undefined,
      sku: data.sku ? data.sku : undefined,
      barcode: data.barcode ? data.barcode : undefined,
      cost: data.cost ? parseFloat(data.cost) : undefined,
      isActive: data.isActive === "true",
    });

    return InventoryService.updateItem(store.id, data.itemId, validated);
  });

/**
 * Admin only: Record a movement (PURCHASE, LOSS, ADJUSTMENT, etc)
 */
export const adminRecordMovement = createServerFn({ method: "POST" })
  .validator(z.object({
    itemId: z.string(),
    type: z.string(),
    quantity: z.string(),
    unitId: z.string(),
    reference: z.string().optional(),
    referenceType: z.string().optional(),
    note: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store?.adminUser) {
      throw new Error("Not authenticated");
    }

    const validated = createInventoryMovementSchema.parse({
      itemId: data.itemId,
      type: data.type,
      quantity: parseFloat(data.quantity),
      unitId: data.unitId,
      reference: data.reference || undefined,
      referenceType: data.referenceType || undefined,
      note: data.note || undefined,
      authorType: "ADMIN",
      authorId: store.adminUser.id,
      authorName: store.adminUser.name,
    });

    // Generate idempotency key
    const idempotencyKey = `${store.id}#${data.referenceType}#${data.reference}#${data.type}#${data.itemId}#0`;

    return InventoryService.recordMovement(store.id, {
      ...validated,
      idempotencyKey,
    });
  });

/**
 * Admin only: Reverse a movement
 */
export const adminReverseMovement = createServerFn({ method: "POST" })
  .validator(z.object({
    originalMovementId: z.string(),
  }))
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store?.adminUser) {
      throw new Error("Not authenticated");
    }

    const validated = createReversalSchema.parse({
      originalMovementId: data.originalMovementId,
      authorType: "ADMIN",
      authorId: store.adminUser.id,
      authorName: store.adminUser.name,
    });

    return InventoryService.reverseMovement(store.id, validated.originalMovementId, {
      authorType: validated.authorType,
      authorId: validated.authorId,
      authorName: validated.authorName,
    });
  });

/**
 * System: Reserve quantity for an order (called on ORDER RECEIVED)
 */
export const systemReserveForOrder = createServerFn({ method: "POST" })
  .validator(z.object({
    itemId: z.string(),
    quantity: z.string(),
    orderId: z.string(),
  }))
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryService.reserveForOrder(
      store.id,
      data.itemId,
      parseFloat(data.quantity),
      data.orderId
    );
  });

/**
 * System: Consume quantity for an order (called on PREPARING)
 */
export const systemConsumeForOrder = createServerFn({ method: "POST" })
  .validator(z.object({
    itemId: z.string(),
    quantity: z.string(),
    orderId: z.string(),
  }))
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryService.consumeForOrder(
      store.id,
      data.itemId,
      parseFloat(data.quantity),
      data.orderId
    );
  });

/**
 * Public: Get store inventory (active items only)
 */
export const getStoreInventory = createServerFn({ method: "GET" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return inventoryItemRepository.findAll(store.id, { includeInactive: false });
  });

/**
 * Public: Get item details with quantities
 */
export const getItemDetails = createServerFn({ method: "POST" })
  .validator(z.object({
    itemId: z.string(),
  }))
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return inventoryItemRepository.getSummary(store.id, data.itemId);
  });

/**
 * Admin only: Get total inventory value
 */
export const adminGetInventoryValue = createServerFn({ method: "POST" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store?.adminUser) {
      throw new Error("Not authenticated");
    }

    const items = await inventoryItemRepository.findAll(store.id, {
      includeInactive: false,
    });

    const totalValue = items.reduce((sum, item) => {
      return sum + (item.quantityOnHand * (item.cost || 0));
    }, 0);

    return { totalValue };
  });

/**
 * Admin only: Get low stock alerts
 */
export const adminGetLowStockAlerts = createServerFn({ method: "POST" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store?.adminUser) {
      throw new Error("Not authenticated");
    }

    const items = await inventoryItemRepository.findAll(store.id, {
      includeInactive: false,
    });

    return items.filter((item) => {
      if (!item.minimumThreshold) return false;
      return item.quantityOnHand <= item.minimumThreshold;
    });
  });
