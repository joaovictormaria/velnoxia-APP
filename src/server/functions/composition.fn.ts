import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
    const productName = data?.productId; // Agora é um NOME, não um ID

    console.log("🔍 [adminCreateComposition] Recebeu", items.length, "itens para produto:", productName);

    // Buscar ou criar o produto pelo nome
    let product = await prisma.product.findFirst({
      where: { storeId: admin.storeId, name: productName },
    });

    if (!product) {
      console.log(`📦 Produto "${productName}" não encontrado. Criando...`);

      // Procurar ou criar categoria padrão
      let category = await prisma.category.findFirst({
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

      // Criar novo produto
      product = await prisma.product.create({
        data: {
          storeId: admin.storeId,
          categoryId: category.id,
          name: productName,
          slug: productName.toLowerCase().replace(/\s+/g, "-"),
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

    return CompositionService.updateComposition(
      admin.storeId,
      data.compositionId,
      validated
    );
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
    console.log("🔍 [adminGetProductVersions] Requisição iniciada");

    try {
      const admin = await requireAdminSession();
      console.log("✅ Admin autenticado:", admin.storeId);

      const data = context?.data?.data || context?.data;
      console.log("📦 ProductId:", data?.productId);

      const versions = await productCompositionRepository.findAllVersions(admin.storeId, data.productId);
      console.log("✅ Encontradas versões:", versions.length);

      return versions;
    } catch (error) {
      console.error("❌ ERRO:", error instanceof Error ? error.message : String(error));
      throw error;
    }
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
 * Admin only: Delete a composition (recipe)
 */
export const adminDeleteCompositionVersion = createServerFn({ method: "POST" })
  .validator(z.object({
    compositionId: z.string(),
  }))
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();

    const composition = await prisma.productComposition.findUnique({
      where: { id: data.compositionId },
    });

    if (!composition) {
      throw new Error("Receita não encontrada");
    }

    if (composition.storeId !== admin.storeId) {
      throw new Error("Não autorizado");
    }

    // Deletar items da composição
    await prisma.compositionItem.deleteMany({
      where: { compositionId: data.compositionId },
    });

    // Deletar a composição
    await prisma.productComposition.delete({
      where: { id: data.compositionId },
    });

    return { success: true };
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
 * Public: Get all compositions for a store (for admin UI)
 */
export const adminGetAllCompositions = createServerFn({ method: "POST" })
  .handler(async () => {
    const admin = await requireAdminSession();

    const compositions = await productCompositionRepository.findAllByStore(admin.storeId, {
      activeOnly: false,
    });

    // Serialize ALL Decimals to Numbers
    return (compositions as any[]).map((comp) => ({
      ...comp,
      items: (comp.items || []).map((item: any) => ({
        ...item,
        quantity: Number(item.quantity),
        inventoryItem: item.inventoryItem ? {
          ...item.inventoryItem,
          quantityOnHand: Number(item.inventoryItem.quantityOnHand ?? 0),
          quantityReserved: Number(item.inventoryItem.quantityReserved ?? 0),
          cost: item.inventoryItem.cost ? Number(item.inventoryItem.cost) : null,
          contentSize: item.inventoryItem.contentSize ? Number(item.inventoryItem.contentSize) : null,
          maximumQuantity: Number(item.inventoryItem.maximumQuantity ?? 0),
        } : null,
      })),
    }));
  });
