import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/server/auth/session";
import { CompositionService } from "@/server/services/composition-service";
import {
  createProductCompositionSchema,
  updateProductCompositionSchema,
} from "@/lib/estoque-schemas";
import { productCompositionRepository } from "@/server/repositories";
import { prisma } from "@/server/db/client";

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

    console.log("🔍 [adminCreateComposition] Recebeu", items.length, "itens para produto:", productName, "categoria:", categoryIdOrName);

    // Buscar ou criar o produto pelo nome
    let product = await prisma.product.findFirst({
      where: { storeId: admin.storeId, name: productName },
    });

    if (!product) {
      console.log(`📦 Produto "${productName}" não encontrado. Criando...`);

      // Procurar ou criar categoria
      let category = await prisma.category.findFirst({
        where: { storeId: admin.storeId, id: categoryIdOrName },
      });

      // Se não encontrou por ID, procura por nome (categoria nova)
      if (!category && categoryIdOrName) {
        category = await prisma.category.findFirst({
          where: { storeId: admin.storeId, name: categoryIdOrName },
        });

        // Se ainda não encontrou, criar categoria nova
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
          console.log(`✅ Categoria "${categoryIdOrName}" criada`);
        }
      }

      // Se ainda não tem categoria, usar primeira disponível ou criar padrão
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

      // Gerar slug único
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

      console.log(`✅ Produto "${productName}" criado com ID: ${product.id}`);
    }

    const validated = createProductCompositionSchema.parse({
      productId: product.id,
      items,
      isActive: data?.isActive !== false,
    });

    return CompositionService.createComposition(admin.storeId, product.id, validated);
  });

/**
 * Admin only: Update a recipe (only if not yet used)
 */
function serializeComposition(comp: any) {
  return JSON.parse(JSON.stringify(comp, (key, value) => {
    if (value && typeof value === 'object' && value.constructor.name === 'Decimal') {
      return Number(value);
    }
    return value;
  }));
}

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

    return serializeComposition(result);
  });

/**
 * Admin only: Activate a specific version
 */
export const adminActivateVersion = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return CompositionService.activateVersion(admin.storeId, data.compositionId);
  });

/**
 * Admin only: Delete a composition (soft delete if used)
 */
export const adminDeleteComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return CompositionService.deleteComposition(admin.storeId, data.compositionId);
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
      throw new Error("Receita não encontrada");
    }

    if (composition.storeId !== admin.storeId) {
      throw new Error("Não autorizado");
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

    return productCompositionRepository.findById(admin.storeId, data.compositionId);
  });

/**
 * Admin only: Get all versions of a product
 */
export const adminGetProductVersions = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return productCompositionRepository.findAllVersions(admin.storeId, data.productId);
  });

/**
 * Admin only: Calculate composition cost
 */
export const adminCalculateCompositionCost = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return CompositionService.calculateCost(admin.storeId, data.compositionId);
  });

/**
 * Public: Get active composition for a product
 */
export const getActiveComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return CompositionService.getActiveComposition(admin.storeId, data.productId);
  });

/**
 * Public: Get all compositions for a store (for admin UI)
 */
export const adminGetAllCompositions = createServerFn({ method: "POST" })
  .handler(async () => {
    const admin = await requireAdminSession();

    return productCompositionRepository.findAllByStore(admin.storeId, {
      activeOnly: false,
    });
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
export const adminConsumeComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    const compositionId = data?.compositionId;
    const quantity = parseInt(data?.quantity || "1") || 1;

    if (!compositionId) {
      throw new Error("Composition ID is required");
    }

    return CompositionService.consumeComposition(
      admin.storeId,
      compositionId,
      quantity,
      {
        authorType: "ADMIN",
        authorId: admin.id,
        authorName: admin.name,
      }
    );
  });
