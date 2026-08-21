import { action } from "@solidjs/router";
import { getStoreFromSession } from "@/server/auth/session";
import { InventoryService } from "@/server/services/inventory-service";
import {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  createInventoryMovementSchema,
  createReversalSchema,
  createReservationSchema,
  createConsumptionSchema,
  createAdjustmentSchema,
} from "@/lib/estoque-schemas";
import { inventoryItemRepository } from "@/server/repositories";

/**
 * Admin only: Create a new inventory item
 */
export const adminCreateInventoryItem = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) {
    throw new Error("Not authenticated");
  }

  const name = formData.get("name");
  const sku = formData.get("sku");
  const barcode = formData.get("barcode");
  const baseUnitId = formData.get("baseUnitId");
  const cost = formData.get("cost");
  const itemType = formData.get("itemType");

  const validated = createInventoryItemSchema.parse({
    name,
    sku: sku || null,
    barcode: barcode || null,
    baseUnitId,
    cost: cost ? parseFloat(cost as string) : undefined,
    itemType,
  });

  return InventoryService.createItem(store.id, validated);
});

/**
 * Admin only: Update inventory item
 */
export const adminUpdateInventoryItem = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) {
    throw new Error("Not authenticated");
  }

  const itemId = formData.get("itemId") as string;
  const name = formData.get("name");
  const sku = formData.get("sku");
  const barcode = formData.get("barcode");
  const cost = formData.get("cost");
  const isActive = formData.get("isActive");

  const validated = updateInventoryItemSchema.parse({
    name: name || undefined,
    sku: sku ? (sku as string) : undefined,
    barcode: barcode ? (barcode as string) : undefined,
    cost: cost ? parseFloat(cost as string) : undefined,
    isActive: isActive === "true",
  });

  return InventoryService.updateItem(store.id, itemId, validated);
});

/**
 * Admin only: Record a movement (PURCHASE, LOSS, ADJUSTMENT, etc)
 */
export const adminRecordMovement = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) {
    throw new Error("Not authenticated");
  }

  const itemId = formData.get("itemId") as string;
  const type = formData.get("type") as string;
  const quantity = formData.get("quantity") as string;
  const unitId = formData.get("unitId") as string;
  const reference = formData.get("reference");
  const referenceType = formData.get("referenceType");
  const note = formData.get("note");

  const validated = createInventoryMovementSchema.parse({
    itemId,
    type,
    quantity: parseFloat(quantity),
    unitId,
    reference: reference || undefined,
    referenceType: referenceType || undefined,
    note: note || undefined,
    authorType: "ADMIN",
    authorId: store.adminUser.id,
    authorName: store.adminUser.name,
  });

  // Generate idempotency key
  const idempotencyKey = `${store.id}#${referenceType}#${reference}#${type}#${itemId}#0`;

  return InventoryService.recordMovement(store.id, {
    ...validated,
    idempotencyKey,
  });
});

/**
 * Admin only: Reverse a movement
 */
export const adminReverseMovement = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) {
    throw new Error("Not authenticated");
  }

  const originalMovementId = formData.get("originalMovementId") as string;

  const validated = createReversalSchema.parse({
    originalMovementId,
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
export const systemReserveForOrder = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store) {
    throw new Error("Not authenticated");
  }

  const itemId = formData.get("itemId") as string;
  const quantity = formData.get("quantity") as string;
  const orderId = formData.get("orderId") as string;

  return InventoryService.reserveForOrder(
    store.id,
    itemId,
    parseFloat(quantity),
    orderId
  );
});

/**
 * System: Consume quantity for an order (called on PREPARING)
 */
export const systemConsumeForOrder = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store) {
    throw new Error("Not authenticated");
  }

  const itemId = formData.get("itemId") as string;
  const quantity = formData.get("quantity") as string;
  const orderId = formData.get("orderId") as string;

  return InventoryService.consumeForOrder(
    store.id,
    itemId,
    parseFloat(quantity),
    orderId
  );
});

/**
 * Public: Get store inventory (active items only)
 */
export const getStoreInventory = action(async () => {
  const store = await getStoreFromSession();
  if (!store) {
    throw new Error("Not authenticated");
  }

  return inventoryItemRepository.findAll(store.id, { includeInactive: false });
});

/**
 * Public: Get item details with quantities
 */
export const getItemDetails = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store) {
    throw new Error("Not authenticated");
  }

  const itemId = formData.get("itemId") as string;

  return inventoryItemRepository.getSummary(store.id, itemId);
});
