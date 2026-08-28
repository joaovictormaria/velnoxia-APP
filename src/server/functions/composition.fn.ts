// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/server/auth/session";
import { CompositionService } from "@/server/services/composition-service";
import {
  createProductCompositionSchema,
  updateProductCompositionSchema,
} from "@/lib/estoque-schemas";
import { productCompositionRepository } from "@/server/repositories";
import { prisma } from "@/server/db/client";
import { numeros } from "./serializar";

/**
 * Admin only: Create a new recipe/composition
 */
export const adminCreateComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    const items = data?.items || [];
    const productName = data?.productId;
    const categoryIdOrName = data?.categoryId;

    console.log("ðŸ” [adminCreateComposition] Recebeu", items.length, "itens para produto:", productName, "categoria:", categoryIdOrName);

    // Buscar ou criar o produto pelo nome
    let product = await prisma.product.findFirst({
      where: { storeId: admin.storeId, name: productName },
    });

    if (!product) {
      console.log(`ðŸ“¦ Produto "${productName}" nÃ£o encontrado. Criando...`);

      // Procurar ou criar categoria
      let category = await prisma.category.findFirst({
        where: { storeId: admin.storeId, id: categoryIdOrName },
      });

      // Se nÃ£o encontrou por ID, procura por nome (categoria nova)
      if (!category && categoryIdOrName) {
        category = await prisma.category.findFirst({
          where: { storeId: admin.storeId, name: categoryIdOrName },
        });

        // Se ainda nÃ£o encontrou, criar categoria nova
        if (!category) {
          const categorySlug = categoryIdOrName.toLowerCase().replace(/\s+/g, "-");
          category = await prisma.category.create({
            data: {
              storeId: admin.storeId,
              name: categoryIdOrName,
              slug: categorySlug,
              kind: "SIMPLE",
              sortOrder: 0,
            },
          });
          console.log(`âœ… Categoria "${categoryIdOrName}" criada`);
        }
      }

      // Se ainda nÃ£o tem categoria, usar primeira disponÃ­vel ou criar padrÃ£o
      if (!category) {
        category = await prisma.category.findFirst({
          where: { storeId: admin.storeId },
        });

        if (!category) {
          category = await prisma.category.create({
            data: {
              storeId: admin.storeId,
              name: "Bebidas",
              slug: "bebidas",
              kind: "SIMPLE",
              sortOrder: 0,
            },
          });
        }
      }

      // Gerar slug Ãºnico
      let baseSlug = productName.toLowerCase().replace(/\s+/g, "-");
      let slug = baseSlug;
      let counter = 1;

      while (await prisma.product.findFirst({
        where: { storeId: admin.storeId, slug }
      })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      // Criar novo produto
      product = await prisma.product.create({
        data: {
          storeId: admin.storeId,
          categoryId: category.id,
          name: productName,
          slug,
          description: `Produto ${productName} criado automaticamente`,
          basePrice: 0,
          sortOrder: 0,
        },
      });

      console.log(`âœ… Produto "${productName}" criado com ID: ${product.id}`);
    }

    const validated = createProductCompositionSchema.parse({
      productId: product.id,
      items,
      isActive: data?.isActive !== false,
    });

    return numeros(await CompositionService.createComposition(admin.storeId, product.id, validated));
  });

/**
 * Admin only: Update a recipe (only if not yet used)
 */
/*
 * DECIMAL NÃO ATRAVESSA A FRONTEIRA DA SERVER FUNCTION.
 *
 * O seroval do TanStack Start não sabe serializar o Decimal do Prisma, e o
 * POST morre com "[object Decimal] cannot be parsed/serialized" — 500 na cara
 * do usuário, receita não salva.
 *
 * Havia duas tentativas de conserto aqui, e as duas vazavam:
 *
 *   1. Uma lista manual de campos em `composition-service`, convertendo cinco
 *      dos DEZ campos Decimal de InventoryItem. `purchasePackSize`,
 *      `averageCost`, `minimumThreshold`, `idealQuantity` e `maximumCapacity`
 *      passavam direto. Bastava um insumo comprado em embalagem para quebrar.
 *
 *   2. Um replacer com `constructor.name === 'Decimal'`. No Prisma 7 a classe
 *      se chama `Decimal2`, então nunca casava — e `JSON.stringify` chama
 *      `toJSON()` antes do replacer, então o valor nem chegava lá como Decimal.
 *
 * `numeros()` percorre o objeto inteiro e reconhece Decimal por ter
 * `toNumber()`, sem depender de nome de classe nem de lista de campos: campo
 * novo no schema já sai convertido, sem ninguém lembrar de atualizar nada.
 *
 * PRECISÃO: os campos são Decimal(15,4), (15,6) e (12,4) — no máximo 15 dígitos
 * significativos, dentro do que um double representa sem perder o valor decimal
 * na ida e volta. O Decimal continua sendo o tipo dentro do serviço e no banco,
 * que é onde soma de dinheiro acontece; a conversão é só na saída, para exibir.
 */

export const adminUpdateComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    const updateData: any = {};

    if (data?.items) {
      updateData.items = data.items;
    }

    if (data?.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    const validated = updateProductCompositionSchema.parse(updateData);

    const result = await CompositionService.updateComposition(
      admin.storeId,
      data.compositionId,
      validated
    );

    return numeros(result);
  });

/**
 * Admin only: Activate a specific version
 */
export const adminActivateVersion = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return numeros(await CompositionService.activateVersion(admin.storeId, data.compositionId));
  });

/**
 * Admin only: Delete a composition (soft delete if used)
 */
export const adminDeleteComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return numeros(await CompositionService.deleteComposition(admin.storeId, data.compositionId));
  });

/**
 * Admin only: Delete a specific composition version (recipe)
 */
export const adminDeleteCompositionVersion = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    const composition = await prisma.productComposition.findUnique({
      where: { id: data.compositionId },
    });

    if (!composition) {
      throw new Error("Receita nÃ£o encontrada");
    }

    if (composition.storeId !== admin.storeId) {
      throw new Error("NÃ£o autorizado");
    }

    await prisma.compositionItem.deleteMany({
      where: { compositionId: data.compositionId },
    });

    await prisma.productComposition.delete({
      where: { id: data.compositionId },
    });

    return { success: true };
  });

/**
 * Admin only: Get composition details
 */
export const adminGetComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return numeros(await productCompositionRepository.findById(admin.storeId, data.compositionId));
  });

/**
 * Admin only: Get all versions of a product
 */
export const adminGetProductVersions = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return numeros(await productCompositionRepository.findAllVersions(admin.storeId, data.productId));
  });

/**
 * Admin only: Calculate composition cost
 */
export const adminCalculateCompositionCost = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return numeros(await CompositionService.calculateCost(admin.storeId, data.compositionId));
  });

/**
 * Public: Get active composition for a product
 */
export const getActiveComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return numeros(await CompositionService.getActiveComposition(admin.storeId, data.productId));
  });

/**
 * Public: Get all compositions for a store (for admin UI)
 */
export const adminGetAllCompositions = createServerFn({ method: "POST" })
  .handler(async () => {
    const admin = await requireAdminSession();

    return numeros(
      await productCompositionRepository.findAllByStore(admin.storeId, {
        activeOnly: false,
      }),
    );
  });

/**
 * Admin: Get all products with compositions for a store
 */
export const adminGetAllProducts = createServerFn({ method: "POST" })
  .handler(async () => {
    const admin = await requireAdminSession();

    const products = await prisma.product.findMany({
      where: { storeId: admin.storeId },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    return products;
  });

/**
 * Admin: Consume a composition (recipe) and decrease inventory items
 * Handles unit conversion automatically
 */
