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
  .handler(async ({ data }: any) => {
    const admin = await requireAdminSession();

    console.log("📦 adminCreateInventoryItem received:", { data });

    // Gerar valores padrão se não fornecidos
    const baseUnitId = data?.baseUnitId || "kg";
    const itemType = data?.itemType || "INGREDIENT";

    // Converter código da unidade para ID
    let unitId = baseUnitId;
    if (!baseUnitId.includes('-')) {
      const unit = await inventoryUnitRepository.findByCode(baseUnitId);
      if (!unit) {
        throw new Error(`Unit "${baseUnitId}" not found`);
      }
      unitId = unit.id;
    }

    // Gerar SKU automaticamente
    const sku = data?.sku || generateSKU(itemType);

    // Usar SKU como nome se não fornecido
    const name = data?.name || sku;

    const itemData = createInventoryItemSchema.parse({
      name: name,
      sku: sku,
      barcode: data?.barcode || null,
      baseUnitId: unitId,
      cost: data?.cost ? parseFloat(data.cost) : undefined,
      itemType: itemType,
    });

    return InventoryService.createItem(admin.storeId, itemData);
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
    const admin = await requireAdminSession();

    const validated = updateInventoryItemSchema.parse({
      name: data.name || undefined,
      sku: data.sku ? data.sku : undefined,
      barcode: data.barcode ? data.barcode : undefined,
      cost: data.cost ? parseFloat(data.cost) : undefined,
      isActive: data.isActive === "true",
    });

    return InventoryService.updateItem(admin.storeId, data.itemId, validated);
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
    const admin = await requireAdminSession();

    const validated = createInventoryMovementSchema.parse({
      itemId: data.itemId,
      type: data.type,
      quantity: parseFloat(data.quantity),
      unitId: data.unitId,
      reference: data.reference || undefined,
      referenceType: data.referenceType || undefined,
      note: data.note || undefined,
      authorType: "ADMIN",
      authorId: admin.id,
      authorName: admin.name,
    });

    // Generate idempotency key
    const idempotencyKey = `${admin.storeId}#${data.referenceType}#${data.reference}#${data.type}#${data.itemId}#0`;

    return InventoryService.recordMovement(admin.storeId, {
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
    const admin = await requireAdminSession();

    const validated = createReversalSchema.parse({
      originalMovementId: data.originalMovementId,
      authorType: "ADMIN",
      authorId: admin.id,
      authorName: admin.name,
    });

    return InventoryService.reverseMovement(admin.storeId, validated.originalMovementId, {
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
    const admin = await requireAdminSession();

    return InventoryService.reserveForOrder(
      admin.storeId,
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
    const admin = await requireAdminSession();

    return InventoryService.consumeForOrder(
      admin.storeId,
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
    const admin = await requireAdminSession();
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
    const admin = await requireAdminSession();
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
    const admin = await requireAdminSession();

    const items = await inventoryItemRepository.findAll(admin.storeId, {
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
    const admin = await requireAdminSession();

    const items = await inventoryItemRepository.findAll(admin.storeId, {
      includeInactive: false,
    });

    return items.filter((item) => {
      if (!item.minimumThreshold) return false;
      return item.quantityOnHand <= item.minimumThreshold;
    });
  });
