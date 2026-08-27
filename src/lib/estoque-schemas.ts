import { z } from "zod";

/**
 * Schema para input do cliente (antes de conversão de códigos para IDs)
 */
export const createInventoryItemClientSchema = z.object({
  name: z.string(),
  sku: z.string().nullish().optional(),
  barcode: z.string().nullish().optional(),
  baseUnitId: z.string(), // Pode ser código (kg, g, etc) ou UUID
  cost: z.string().nullish().optional(), // String vindo do input do usuário
  itemType: z.string(),
});

/**
 * Schema de validação para InventoryItem (após conversão)
 */
export const createInventoryItemSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().max(50).nullable().optional(),
  barcode: z.string().max(50).nullable().optional(),
  baseUnitId: z.string().cuid(),
  cost: z.number().nonnegative().optional(),
  itemType: z
    .enum(["INGREDIENT", "RESALE", "PREPARED", "PACKAGING"])
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
    .enum(["INGREDIENT", "RESALE", "PREPARED", "PACKAGING"])
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
    /**
     * Custo UNITÁRIO a congelar neste movimento.
     *
     * O formulário pergunta o valor TOTAL pago — é o que está na nota — e a
     * divisão pela quantidade acontece antes de chegar aqui. Guardar o unitário
     * é o que permite comparar compras de tamanhos diferentes.
     *
     * Opcional: sem ele, a compra é só entrada de quantidade e o custo do item
     * não muda. Cobre transferência, brinde e correção de contagem, onde não há
     * valor pago — e forçar um número nesses casos empurraria o operador a
     * inventar um, que é pior do que não ter.
     */
    costAtTime: z.number().nonnegative().optional(),
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
  inventoryItemId: z.string().min(1), // Aceita CUID, UUID, ou qualquer ID
  quantity: z.number().positive(),
  unitId: z.string().min(1), // Aceita CUID, UUID, ou qualquer ID
  sortOrder: z.number().nonnegative().default(0),
});

export type CompositionItemInput = z.infer<typeof compositionItemSchema>;

/**
 * Schema para criar ProductComposition (receita nova)
 */
export const createProductCompositionSchema = z.object({
  productId: z.string().min(1), // Pode ser qualquer string (ID do produto)
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

/**
 * Receita de PREPARADO.
 *
 * Schema próprio, e não um campo a mais no de produto, porque as duas fichas
 * respondem a perguntas diferentes. A de produto diz o que a Pizza consome; a
 * de preparado diz o que o Molho consome E QUANTO DE MOLHO ELA RENDE.
 *
 * O rendimento é obrigatório aqui e inexistente lá: sem ele não há fator de
 * escala, e produzir 8 kg de uma receita que ninguém sabe quanto rende é uma
 * conta sem denominador.
 */
export const criarReceitaDePreparadoSchema = z.object({
  items: z.array(compositionItemSchema).min(1),
  /** Quanto a receita rende. É a EXPECTATIVA; o real vem da balança. */
  yieldQuantity: z.number().positive(),
  yieldUnitId: z.string().min(1),
  isActive: z.boolean().default(true),
});

export type CriarReceitaDePreparadoInput = z.infer<
  typeof criarReceitaDePreparadoSchema
>;

export const atualizarReceitaDePreparadoSchema = z.object({
  items: z.array(compositionItemSchema).min(1).optional(),
  yieldQuantity: z.number().positive().optional(),
  yieldUnitId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export type AtualizarReceitaDePreparadoInput = z.infer<
  typeof atualizarReceitaDePreparadoSchema
>;
