import { action } from "@solidjs/router";
import { getStoreFromSession } from "@/server/auth/session";
import { CompositionService } from "@/server/services/composition-service";
import {
  createProductCompositionSchema,
  updateProductCompositionSchema,
} from "@/lib/estoque-schemas";
import { productCompositionRepository } from "@/server/repositories";

/**
 * Admin only: Create a new recipe/composition
 */
export const adminCreateComposition = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) {
    throw new Error("Not authenticated");
  }

  const productId = formData.get("productId") as string;
  const itemsJson = formData.get("items") as string;
  const isActive = formData.get("isActive") === "true";

  const items = JSON.parse(itemsJson);

  const validated = createProductCompositionSchema.parse({
    productId,
    items,
    isActive,
  });

  return CompositionService.createComposition(store.id, productId, validated);
});

/**
 * Admin only: Update a recipe (only if not yet used)
 */
export const adminUpdateComposition = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) {
    throw new Error("Not authenticated");
  }

  const compositionId = formData.get("compositionId") as string;
  const itemsJson = formData.get("items");
  const isActive = formData.get("isActive");

  const data: any = {};

  if (itemsJson) {
    const items = JSON.parse(itemsJson as string);
    data.items = items;
  }

  if (isActive !== null) {
    data.isActive = isActive === "true";
  }

  const validated = updateProductCompositionSchema.parse(data);

  return CompositionService.updateComposition(
    store.id,
    compositionId,
    validated
  );
});

/**
 * Admin only: Activate a specific version
 */
export const adminActivateVersion = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) {
    throw new Error("Not authenticated");
  }

  const compositionId = formData.get("compositionId") as string;

  return CompositionService.activateVersion(store.id, compositionId);
});

/**
 * Admin only: Delete a composition (soft delete if used)
 */
export const adminDeleteComposition = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) {
    throw new Error("Not authenticated");
  }

  const compositionId = formData.get("compositionId") as string;

  return CompositionService.deleteComposition(store.id, compositionId);
});

/**
 * Admin only: Get composition details
 */
export const adminGetComposition = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) {
    throw new Error("Not authenticated");
  }

  const compositionId = formData.get("compositionId") as string;

  return productCompositionRepository.findById(store.id, compositionId);
});

/**
 * Admin only: Get all versions of a product
 */
export const adminGetProductVersions = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) {
    throw new Error("Not authenticated");
  }

  const productId = formData.get("productId") as string;

  return productCompositionRepository.findAllVersions(store.id, productId);
});

/**
 * Admin only: Calculate composition cost
 */
export const adminCalculateCompositionCost = action(
  async (formData: FormData) => {
    const store = await getStoreFromSession();
    if (!store?.adminUser) {
      throw new Error("Not authenticated");
    }

    const compositionId = formData.get("compositionId") as string;

    return CompositionService.calculateCost(store.id, compositionId);
  }
);

/**
 * Public: Get active composition for a product
 */
export const getActiveComposition = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store) {
    throw new Error("Not authenticated");
  }

  const productId = formData.get("productId") as string;

  return CompositionService.getActiveComposition(store.id, productId);
});

/**
 * Public: Get all compositions for a store (for admin UI)
 */
export const adminGetAllCompositions = action(async () => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) {
    throw new Error("Not authenticated");
  }

  return productCompositionRepository.findAllByStore(store.id, {
    activeOnly: false,
  });
});
