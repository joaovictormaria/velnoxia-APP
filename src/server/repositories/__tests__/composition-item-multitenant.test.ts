/**
 * Multi-tenant security test for compositionItemRepository
 * Ensures users cannot access composition items from other stores
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { compositionItemRepository } from "../composition-item-repository";

describe("Composition Item Multi-Tenant Security", () => {
  const storeA = "store-a-" + Date.now();
  const storeB = "store-b-" + Date.now();
  let compositionAId: string;
  let compositionBId: string;
  let itemAId: string;
  let itemBId: string;

  beforeAll(async () => {
    // Create stores
    const [compA, compB] = await Promise.all([
      prisma.composition.create({
        data: {
          storeId: storeA,
          name: "Composition A",
          description: "Belongs to store A",
        },
      }),
      prisma.composition.create({
        data: {
          storeId: storeB,
          name: "Composition B",
          description: "Belongs to store B",
        },
      }),
    ]);

    compositionAId = compA.id;
    compositionBId = compB.id;

    // Create inventory items and composition items
    const [invA, invB] = await Promise.all([
      prisma.inventoryItem.create({
        data: {
          storeId: storeA,
          name: "Item A",
          sku: "SKU-A",
          quantity: 100,
          cost: 1.5,
        },
      }),
      prisma.inventoryItem.create({
        data: {
          storeId: storeB,
          name: "Item B",
          sku: "SKU-B",
          quantity: 100,
          cost: 2.5,
        },
      }),
    ]);

    const unitId = (
      await prisma.inventoryUnit.findFirst({ where: { storeId: storeA } })
    )?.id;
    if (!unitId) throw new Error("No unit found");

    // Create composition items
    const [compItemA, compItemB] = await Promise.all([
      prisma.compositionItem.create({
        data: {
          compositionId: compositionAId,
          inventoryItemId: invA.id,
          quantity: 1,
          unitId,
        },
      }),
      prisma.compositionItem.create({
        data: {
          compositionId: compositionBId,
          inventoryItemId: invB.id,
          quantity: 1,
          unitId,
        },
      }),
    ]);

    itemAId = compItemA.id;
    itemBId = compItemB.id;
  });

  afterAll(async () => {
    await Promise.all([
      prisma.compositionItem.deleteMany({ where: { compositionId: compositionAId } }),
      prisma.compositionItem.deleteMany({ where: { compositionId: compositionBId } }),
      prisma.composition.deleteMany({ where: { storeId: storeA } }),
      prisma.composition.deleteMany({ where: { storeId: storeB } }),
      prisma.inventoryItem.deleteMany({ where: { storeId: storeA } }),
      prisma.inventoryItem.deleteMany({ where: { storeId: storeB } }),
    ]);
  });

  it("should return null when finding item from different store", async () => {
    // User from storeA tries to access item from storeB
    const result = await compositionItemRepository.findById(itemBId, storeA);
    expect(result).toBeNull();
  });

  it("should find item for correct store", async () => {
    const result = await compositionItemRepository.findById(itemAId, storeA);
    expect(result?.id).toBe(itemAId);
  });

  it("should throw when updating item from different store", async () => {
    // User from storeA tries to update item from storeB
    await expect(
      compositionItemRepository.update(itemBId, { quantity: 5 }, storeA)
    ).rejects.toThrow("access denied");
  });

  it("should throw when deleting item from different store", async () => {
    // User from storeA tries to delete item from storeB
    await expect(
      compositionItemRepository.delete(itemBId, storeA)
    ).rejects.toThrow("access denied");
  });

  it("should return empty array when listing composition from different store", async () => {
    const result = await compositionItemRepository.findByComposition(compositionBId, storeA);
    expect(result).toEqual([]);
  });
});
