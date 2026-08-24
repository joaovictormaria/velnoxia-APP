import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { deleteExtra, listExtras, saveExtra } from "../repositories/extra-repository";
import { listActiveCategories } from "../repositories/category-repository";
import { listProducts } from "../repositories/product-repository";

const extraSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome."),
  price: z.number().nonnegative(),
  isActive: z.boolean(),
  /// Onde ele vale. Categoria pega o cardÃ¡pio inteiro daquele grupo; produto
  /// pega sÃ³ aquele item.
  categoryIds: z.array(z.string()).max(200).default([]),
  productIds: z.array(z.string()).max(500).default([]),
});

/**
 * Os adicionais e o cardÃ¡pio na mesma resposta.
 *
 * A tela precisa dos trÃªs juntos: os adicionais para listar, e categorias e
 * produtos para poder agrupÃ¡-los por onde valem e para oferecer a escolha ao
 * editar. TrÃªs chamadas separadas mostrariam a tela em pedaÃ§os, com o
 * agrupamento aparecendo depois da lista.
 */
export const listExtrasFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  const [extras, categories, products] = await Promise.all([
    listExtras(storeId),
    listActiveCategories(storeId),
    listProducts(storeId),
  ]);
  return {
    extras,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      categoryId: p.categoryId,
      categoryName: p.category.name,
    })),
  };
});

export const saveExtraFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().nullish(), data: extraSchema }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const { categoryIds, productIds, ...campos } = data.data;

    /*
     * Um adicional sem alcance nenhum nÃ£o apareceria em lugar algum, e o dono
     * ficaria olhando um cadastro que existe e nÃ£o funciona. Recusar aqui Ã© o
     * que transforma isso numa frase na tela em vez de num mistÃ©rio.
     */
    if (categoryIds.length === 0 && productIds.length === 0) {
      return {
        ok: false as const,
        error: "Escolha ao menos uma categoria ou um produto onde este adicional pode ser pedido.",
      };
    }

    const id = await saveExtra(storeId, data.id ?? null, campos, { categoryIds, productIds });
    if (!id) return { ok: false as const, error: "Adicional nÃ£o encontrado." };
    return { ok: true as const, id };
  });

export const deleteExtraFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const ok = await deleteExtra(storeId, data.id);
    return ok ? { ok: true as const } : { ok: false as const, error: "Adicional nÃ£o encontrado." };
  });
