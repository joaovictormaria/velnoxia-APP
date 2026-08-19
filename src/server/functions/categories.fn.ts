import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import {
  countProductsInCategory,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../repositories/category-repository";

const categorySchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífens."),
  badge: z.string().nullish(),
  headline: z.string().nullish(),
  subhead: z.string().nullish(),
  icon: z.string().nullish(),
  imageUrl: z.string().nullish(),
  kind: z.enum(["PIZZA", "SIMPLE"]),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean(),
  /**
   * Os tamanhos que a categoria oferece, na ordem. Ficam aqui e não no
   * produto porque a meia a meia procura o mesmo tamanho em dois sabores —
   * se cada produto nomeasse os seus, "Grande" e "grande" seriam diferentes.
   */
  sizes: z
    .array(z.string().trim().min(1, "O tamanho precisa de um nome.").max(24))
    .max(8, "No máximo 8 tamanhos por categoria.")
    .optional(),
  /**
   * As perguntas feitas ao pedir: sabor, ponto da carne, complementos.
   *
   * min/max/free cobrem o que cada ramo precisa sem um campo por caso:
   * obrigatório é min>=1, escolha única é max=1, e "3 grátis depois paga"
   * é free=3.
   */
  optionGroups: z
    .array(
      z.object({
        name: z.string().trim().min(1, "O grupo precisa de um nome.").max(40),
        minChoices: z.number().int().min(0).max(20),
        maxChoices: z.number().int().min(1).max(20),
        freeChoices: z.number().int().min(0).max(20),
        options: z
          .array(
            z.object({
              name: z.string().trim().min(1, "A opção precisa de um nome.").max(40),
              price: z.number().nonnegative(),
            }),
          )
          .max(40),
      }),
    )
    .max(6, "No máximo 6 grupos por categoria.")
    .optional(),
});

export const listCategoriesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return listCategories(storeId);
});

export const saveCategoryFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().nullish(), data: categorySchema }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const category = data.id
      ? await updateCategory(storeId, data.id, data.data)
      : await createCategory(storeId, data.data);
    return { ok: true as const, category };
  });

export const deleteCategoryFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    // Products cascade-delete with the category, so refuse while any exist.
    const count = await countProductsInCategory(storeId, data.id);
    if (count > 0) {
      return {
        ok: false as const,
        error: `Esta categoria tem ${count} produto(s). Mova ou exclua os produtos antes.`,
      };
    }
    await deleteCategory(storeId, data.id);
    return { ok: true as const };
  });
