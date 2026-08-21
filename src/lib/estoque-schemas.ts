import { z } from "zod";

/**
 * Schema de validação para InventoryItem
 */
export const createInventoryItemSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().max(50).nullable().optional(),
  barcode: z.string().max(50).nullable().optional(),
  baseUnitId: z.string().cuid(),
  cost: z.number().nonnegative().optional(),
  itemType: z
    .enum(["INGREDIENT", "RESALE", "PRODUCED", "PACKAGING"])
    .default("INGREDIENT"),
  minimumThreshold: z.number().nonnegative().optional(),
  idealQuantity: z.number().nonnegative().optional(),
  maximumCapacity: z.number().nonnegative().optional(),
});

export type CreateInventoryItemInput = z.infer<
  typeof createInventoryItemSchema
>;

export const updateInventoryItemSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  sku: z.string().max(50).nullable().optional(),
  barcode: z.string().max(50).nullable().optional(),
  cost: z.number().nonnegative().optional(),
  itemType: z
    .enum(["INGREDIENT", "RESALE", "PRODUCED", "PACKAGING"])
    .optional(),
  minimumThreshold: z.number().nonnegative().optional(),
  idealQuantity: z.number().nonnegative().optional(),
  maximumCapacity: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateInventoryItemInput = z.infer<
  typeof updateInventoryItemSchema
>;

/**
 * Schema de validação para InventoryMovement
 */
export const createInventoryMovementSchema = z
  .object({
    itemId: z.string().cuid(),
    type: z.enum([
      "PURCHASE",
      "RESERVATION",
      "CONSUMPTION",
      "PRODUCTION",
      "LOSS",
      "ADJUSTMENT",
      "RETURN",
      "REVERSAL",
    ]),
    quantity: z.number(), // Pode ser negativo ou positivo
    unitId: z.string().cuid(),
    reference: z.string().optional(),
    referenceType: z.string().optional(),
    originalMovementId: z.string().cuid().optional(), // Só se type=REVERSAL
    compositionId: z.string().cuid().optional(),
    note: z.string().max(500).optional(),
    authorType: z.enum(["ADMIN", "SYSTEM", "CUSTOMER"]).optional(),
    authorId: z.string().optional(),
    authorName: z.string().optional(),
  })
  .refine(
    (data) => {
      // Se type é REVERSAL, originalMovementId é obrigatório
      if (data.type === "REVERSAL" && !data.originalMovementId) {
        return false;
      }
      return true;
    },
    {
      message: "REVERSAL movements require originalMovementId",
      path: ["originalMovementId"],
    }
  );

export type CreateInventoryMovementInput = z.infer<
  typeof createInventoryMovementSchema
>;

/**
 * Schema para criar REVERSAL de um movimento
 */
export const createReversalSchema = z.object({
  originalMovementId: z.string().cuid(),
  authorType: z.enum(["ADMIN", "SYSTEM", "CUSTOMER"]).optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  note: z.string().max(500).optional(),
});

export type CreateReversalInput = z.infer<typeof createReversalSchema>;

/**
 * Schema para RESERVATION (pedido recebido)
 */
export const createReservationSchema = z.object({
  itemId: z.string().cuid(),
  quantity: z.number().positive(), // Reserva é sempre positiva
  unitId: z.string().cuid(),
  reference: z.string().cuid(), // Order ID
  referenceType: z.literal("ORDER"),
  authorType: z.enum(["SYSTEM", "CUSTOMER"]).default("SYSTEM"),
  authorName: z.string().optional(),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

/**
 * Schema para CONSUMPTION (pedido sendo preparado)
 */
export const createConsumptionSchema = z.object({
  itemId: z.string().cuid(),
  quantity: z.number().positive(), // Consumo é sempre positivo
  unitId: z.string().cuid(),
  reference: z.string().cuid(), // Order ID
  referenceType: z.literal("ORDER"),
  compositionId: z.string().cuid().optional(), // Qual receita?
  authorType: z.enum(["ADMIN", "SYSTEM"]).default("SYSTEM"),
  authorName: z.string().optional(),
});

export type CreateConsumptionInput = z.infer<typeof createConsumptionSchema>;

/**
 * Schema para ADJUSTMENT (contagem física)
 */
export const createAdjustmentSchema = z.object({
  itemId: z.string().cuid(),
  quantity: z.number(), // Pode ser positivo ou negativo (correção)
  unitId: z.string().cuid(),
  note: z.string().max(500),
  authorType: z.enum(["ADMIN"]).default("ADMIN"),
  authorId: z.string(),
  authorName: z.string(),
});

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

/**
 * Schema para CompositionItem (insumo de receita)
 */
export const compositionItemSchema = z.object({
  inventoryItemId: z.string().cuid(),
  quantity: z.number().positive(),
  unitId: z.string().cuid(),
  sortOrder: z.number().nonnegative().default(0),
});

export type CompositionItemInput = z.infer<typeof compositionItemSchema>;

/**
 * Schema para criar ProductComposition (receita nova)
 */
export const createProductCompositionSchema = z.object({
  productId: z.string().cuid(),
  items: z.array(compositionItemSchema).min(1),
  isActive: z.boolean().default(true),
});

export type CreateProductCompositionInput = z.infer<
  typeof createProductCompositionSchema
>;

/**
 * Schema para atualizar ProductComposition (só se não foi usada)
 */
export const updateProductCompositionSchema = z.object({
  items: z.array(compositionItemSchema).min(1).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateProductCompositionInput = z.infer<
  typeof updateProductCompositionSchema
>;
