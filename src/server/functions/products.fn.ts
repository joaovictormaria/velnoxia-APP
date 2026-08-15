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

const sizeSchema = z.object({
  size: z.enum(["BROTINHO", "MEDIA", "GRANDE", "GIGANTE"]),
  price: z.number().nonnegative(),
  isAvailable: z.boolean(),
});

const productSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífens."),
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
});

export const listProductsFn = createServerFn({ method: "GET" })
  .validator(
    z.object({ categoryId: z.string().optional(), search: z.string().optional() }).optional(),
  )
  .handler(async ({ data }) => {
    await requireAdminSession();
    const [products, categories] = await Promise.all([
      listProducts(data),
      listActiveCategories(),
    ]);
    return { products, categories };
  });

export const getProductFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireAdminSession();
    const [product, categories] = await Promise.all([
      getProductById(data.id),
      listActiveCategories(),
    ]);
    return { product, categories };
  });

export const getProductFormOptionsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdminSession();
  return { categories: await listActiveCategories() };
});

export const saveProductFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().nullish(), data: productSchema }))
  .handler(async ({ data }) => {
    await requireAdminSession();
    const product = data.id
      ? await updateProduct(data.id, data.data)
      : await createProduct(data.data);
    return { ok: true as const, product };
  });

export const setProductActiveFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), isActive: z.boolean() }))
  .handler(async ({ data }) => {
    await requireAdminSession();
    await setProductActive(data.id, data.isActive);
    return { ok: true as const };
  });

export const deleteProductFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireAdminSession();
    await deleteProduct(data.id);
    return { ok: true as const };
  });
