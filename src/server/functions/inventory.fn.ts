// @ts-nocheck
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

/**
 * As unidades de medida disponíveis.
 *
 * A tela precisa delas para oferecer o id certo. Antes as opções eram fixas no
 * componente — inclusive "m" e "cm", que não existem no banco — e o que ia para
 * o servidor era o código, não o id.
 */
export const adminListarUnidades = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireAdminSession();
    const unidades = await inventoryUnitRepository.findAll();
    return unidades.map((u: any) => ({ id: u.id, code: u.code, name: u.name }));
  },
);

export const adminCreateInventoryItem = createServerFn({ method: "POST" })
  .handler(async ({ data }: any) => {
    const admin = await requireAdminSession();
    const itemData = data?.data || data;

    const itemType = itemData?.itemType || "INGREDIENT";

    /*
     * A tela manda o ID da unidade, não o código.
     *
     * Aqui existia uma tradução código → id com a heurística
     * `if (!baseUnitId.includes('-'))` — "sem hífen, deve ser código" —
     * desenhada para UUID, formato que este projeto não usa. Ela quebrava dos
     * dois lados: `"kg"` só funcionava por acidente, e o id real `unit_kg`
     * também não tem hífen, então era tratado como código e morria em
     * `Unit "unit_kg" not found`.
     *
     * Adivinhar o que o cliente mandou é o problema. A tela agora carrega as
     * unidades do banco e manda o id; quem não existir é recusado pelo
     * `findById` do serviço, com mensagem clara.
     */
    const unitId = itemData?.baseUnitId;
    if (!unitId) {
      throw new Error("Escolha a unidade em que este item é contado.");
    }

    // Gerar SKU automaticamente
    const sku = itemData?.sku || generateSKU(itemType);

    // Usar SKU como nome se nÃ£o fornecido
    const name = itemData?.name || sku;

    const createData = createInventoryItemSchema.parse({
      name: name,
      sku: sku,
      barcode: itemData?.barcode || null,
      baseUnitId: unitId,
      cost: itemData?.cost ? parseFloat(itemData.cost) : undefined,
      itemType: itemType,
    });

    /*
     * A quantidade inicial faz parte da criação, e por isso vai na MESMA
     * chamada. A tela fazia duas: criava o item e depois registrava a entrada,
     * engolindo o erro da segunda num `console.error`. O item ficava com saldo
     * zero e o operador via "criado com sucesso".
     */
    const inicial = itemData?.initialQuantity
      ? parseFloat(String(itemData.initialQuantity))
      : 0;

    const result = await InventoryService.criarItemComSaldoInicial(
      admin.storeId,
      createData,
      inicial > 0 ? { quantidade: inicial, unitId } : undefined,
    );
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

    const quantity = data?.quantity ? parseFloat(data.quantity) : 0;

    /*
     * O formulário pergunta o valor TOTAL pago, porque é o que está na nota:
     * "5,2 kg — R$ 41,60". A divisão acontece aqui, não na cabeça do operador,
     * que é onde nasce erro de digitação.
     *
     * Só vale para compra. Perda e ajuste não têm valor pago, e um total
     * enviado por engano num desses tipos é ignorado em vez de virar custo.
     */
    const totalPago = data?.totalPaid ? parseFloat(data.totalPaid) : null;
    const custoUnitario =
      data?.type === "PURCHASE" && totalPago != null && totalPago > 0 && quantity > 0
        ? totalPago / quantity
        : undefined;

    const validated = createInventoryMovementSchema.parse({
      itemId: data?.itemId,
      type: data?.type,
      quantity,
      unitId: data?.unitId,
      reference: data?.reference || undefined,
      referenceType: data?.referenceType || undefined,
      note: data?.note || undefined,
      costAtTime: custoUnitario,
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
      return sum + (Number(item.quantityOnHand) * (item.cost || 0));
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


