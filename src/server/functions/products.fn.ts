// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { prisma } from "../db/client";
import {
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  setProductActive,
  updateProduct,
} from "../repositories/product-repository";
import { listActiveCategories } from "../repositories/category-repository";
import { optionGroupsSchema } from "../validation/option-group-schema";

const sizeSchema = z.object({
  /** Aponta para um tamanho da categoria; o repositÃ³rio confere se Ã© dela. */
  categorySizeId: z.string().min(1),
  price: z.number().nonnegative(),
  isAvailable: z.boolean(),
});

const productSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9\-Ã¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±]+$/, "Use apenas letras, nÃºmeros e hÃ­fens."),
  description: z.string().default(""),
  categoryId: z.string().min(1, "Escolha uma categoria."),
  basePrice: z.number().nonnegative(),
  imageUrl: z.string().nullish(),
  tag: z.string().nullish(),
  isActive: z.boolean(),
  allowHalfAndHalf: z.boolean(),
  halfPizzaPricingRule: z.enum(["HIGHEST_PRICE", "AVERAGE_PRICE"]),
  sortOrder: z.number().int().default(0),
  sizes: z.array(sizeSchema).default([]),
  /**
   * Perguntas sÃ³ deste produto, somadas Ã s que a categoria jÃ¡ faz. Ã‰ o que
   * deixa o suco perguntar laranja ou maracujÃ¡ sem obrigar o refrigerante da
   * mesma categoria a oferecer a mesma lista.
   */
  optionGroups: optionGroupsSchema,
});

export const listProductsFn = createServerFn({ method: "GET" })
  .validator(
    z.object({ categoryId: z.string().optional(), search: z.string().optional() }).optional(),
  )
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const [products, categories] = await Promise.all([
      listProducts(storeId, data),
      listActiveCategories(storeId),
    ]);
    return { products, categories };
  });

export const getProductFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const [product, categories] = await Promise.all([
      getProductById(storeId, data.id),
      listActiveCategories(storeId),
    ]);
    return { product, categories };
  });

export const getProductFormOptionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return { categories: await listActiveCategories(storeId) };
});

export const saveProductFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().nullish(), data: productSchema }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const product = data.id
      ? await updateProduct(storeId, data.id, data.data)
      : await createProduct(storeId, data.data);
    return { ok: true as const, product };
  });

export const setProductActiveFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), isActive: z.boolean() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    await setProductActive(storeId, data.id, data.isActive);
    return { ok: true as const };
  });

export const deleteProductFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    await deleteProduct(storeId, data.id);
    return { ok: true as const };
  });

export const adminCreateCategoryFn = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();

    // Verificar se categoria jÃ¡ existe
    let category = await prisma.category.findFirst({
      where: { storeId, name: data.name },
    });

    // Se nÃ£o existe, criar
    if (!category) {
      const slug = data.name.toLowerCase().replace(/\s+/g, "-");
      category = await prisma.category.create({
        data: {
          storeId,
          name: data.name,
          slug,
          kind: "SIMPLE",
          sortOrder: 0,
        },
      });
    }

    return category;
  });

export const adminDeleteCategoryFn = createServerFn({ method: "POST" })
  .validator(z.object({ categoryId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();

    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, storeId },
    });

    if (!category) {
      throw new Error("Categoria nÃ£o encontrada");
    }

    // Deletar apenas se nÃ£o tem produtos associados
    const productCount = await prisma.product.count({
      where: { categoryId: data.categoryId },
    });

    if (productCount === 0) {
      await prisma.category.delete({
        where: { id: data.categoryId },
      });
      return { success: true };
    }

    return { success: false, message: "Categoria tem produtos associados" };
  });

/**
 * Link a product to an inventory item for stock control
 */
export const adminLinkProductToInventory = createServerFn({ method: "POST" })
  .validator(z.object({
    productId: z.string(),
    inventoryItemId: z.string(),
  }))
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();

    const product = await prisma.product.findFirst({
      where: { id: data.productId, storeId: admin.storeId }
    });

    if (!product) {
      throw new Error("Produto nÃ£o encontrado");
    }

    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: { id: data.inventoryItemId, storeId: admin.storeId }
    });

    if (!inventoryItem) {
      throw new Error("Item de estoque nÃ£o encontrado");
    }

    const updated = await prisma.product.update({
      where: { id: data.productId },
      data: { inventoryItemId: data.inventoryItemId }
    });

    return { success: true, product: updated };
  });

