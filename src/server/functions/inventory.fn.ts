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
 * Serialize InventoryItem Decimals to Numbers
 */
function serializeInventoryItem(item: any) {
  return {
    ...item,
    quantityOnHand: Number(item.quantityOnHand ?? 0),
    quantityReserved: Number(item.quantityReserved ?? 0),
    quantityAvailable: Number(item.quantityAvailable ?? 0),
    cost: item.cost ? Number(item.cost) : null,
    minimumThreshold: item.minimumThreshold ? Number(item.minimumThreshold) : null,
    idealQuantity: item.idealQuantity ? Number(item.idealQuantity) : null,
    maximumQuantity: item.maximumQuantity ? Number(item.maximumQuantity) : null,
    contentSize: item.contentSize ? Number(item.contentSize) : null,
  };
}

/**
 * Admin only: Create a new inventory item
 */
export const adminCreateInventoryItem = createServerFn({ method: "POST" })
  .handler(async ({ data }: any) => {
    const admin = await requireAdminSession();
    const itemData = data?.data || data;

    // Gerar valores padrão se não fornecidos
    const baseUnitId = itemData?.baseUnitId || "kg";
    const itemType = itemData?.itemType || "INGREDIENT";

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
    const sku = itemData?.sku || generateSKU(itemType);

    // Usar SKU como nome se não fornecido
    const name = itemData?.name || sku;

    const createData = createInventoryItemSchema.parse({
      name: name,
      sku: sku,
      barcode: itemData?.barcode || null,
      baseUnitId: unitId,
      cost: itemData?.cost ? parseFloat(itemData.cost) : undefined,
      itemType: itemType,
    });

    const result = await InventoryService.createItem(admin.storeId, createData);
    return serializeInventoryItem(result);
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
      isActive: data.isActive !== undefined ? data.isActive === "true" : undefined,
    });

    const result = await InventoryService.updateItem(admin.storeId, data.itemId, validated);
    return serializeInventoryItem(result);
  });

/**
 * Admin only: Record a movement (PURCHASE, LOSS, ADJUSTMENT, etc)
 */
export const adminRecordMovement = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    const validated = createInventoryMovementSchema.parse({
      itemId: data?.itemId,
      type: data?.type,
      quantity: data?.quantity ? parseFloat(data.quantity) : 0,
      unitId: data?.unitId,
      reference: data?.reference || undefined,
      referenceType: data?.referenceType || undefined,
      note: data?.note || undefined,
      authorType: "ADMIN",
      authorId: admin.id,
      authorName: admin.name,
    });

    // Generate idempotency key - use timestamp for manual movements (no reference)
    const timestamp = Date.now();
    const idempotencyKey = data.reference
      ? `${admin.storeId}#${data.referenceType}#${data.reference}#${data.type}#${data.itemId}`
      : `${admin.storeId}#MANUAL#${data.type}#${data.itemId}#${timestamp}`;

    const result = await InventoryService.recordMovement(admin.storeId, {
      ...validated,
      idempotencyKey,
    });

    // Serialize Decimal values - convert ALL numeric fields
    return {
      id: result.id,
      storeId: result.storeId,
      itemId: result.itemId,
      type: result.type,
      quantity: Number(result.quantity ?? 0),
      unitId: result.unitId,
      reference: result.reference,
      referenceType: result.referenceType,
      originalMovementId: result.originalMovementId,
      compositionId: result.compositionId,
      costAtTime: result.costAtTime ? Number(result.costAtTime) : null,
      note: result.note,
      authorType: result.authorType,
      authorId: result.authorId,
      authorName: result.authorName,
      idempotencyKey: result.idempotencyKey,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
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

    return inventoryItemRepository.findAll(admin.storeId, { includeInactive: false });
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

    return inventoryItemRepository.getSummary(admin.storeId, data.itemId);
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
