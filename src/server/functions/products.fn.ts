import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
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
  /** Aponta para um tamanho da categoria; o repositório confere se é dela. */
  categorySizeId: z.string().min(1),
  price: z.number().nonnegative(),
  isAvailable: z.boolean(),
});

const productSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9\-áàâãéèêíïóôõöúçñ]+$/, "Use apenas letras, números e hífens."),
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
   * Perguntas só deste produto, somadas às que a categoria já faz. É o que
   * deixa o suco perguntar laranja ou maracujá sem obrigar o refrigerante da
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
