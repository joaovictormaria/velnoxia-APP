import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { InventoryService } from "../inventory-service";
import { inventoryUnitRepository } from "@/server/repositories";
import { prisma } from "@/server/db/client";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Testes para correções P0/P1
 */
describe("Inventory Corrections (P0/P1)", () => {
  const testStoreId = "test-store-corrections-" + Date.now();
  let testUnitId: string;
  let testItemId: string;

  beforeEach(async () => {
    // Seed: Unidade de teste
    const unit = await prisma.inventoryUnit.upsert({
      where: { code: "test-kg-corrections" },
      update: {},
      create: {
        code: "test-kg-corrections",
        name: "Kilogram Test",
        system: "WEIGHT",
        isBuiltIn: false,
      },
    });
    testUnitId = unit.id;

    // Seed: Store de teste
    await prisma.store.upsert({
      where: { id: testStoreId },
      update: {},
      create: {
        id: testStoreId,
        slug: "test-store-corrections-" + Date.now(),
        name: "Test Store Corrections",
      },
    });

    // Seed: Item de teste
    const item = await InventoryService.createItem(testStoreId, {
      name: "Test Item",
      baseUnitId: testUnitId,
      itemType: "INGREDIENT",
      cost: 10.5,
    });
    testItemId = item.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.inventoryMovement.deleteMany({
      where: { storeId: testStoreId },
    });
    await prisma.inventoryItem.deleteMany({
      where: { storeId: testStoreId },
    });
    await prisma.store.delete({
      where: { id: testStoreId },
    }).catch(() => {});
  });

  describe("P0.1: costAtTime é preenchido", () => {
    it("deve preencher costAtTime com custo do item no momento", async () => {
      const movement = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: "test-cost-at-time-1",
        itemId: testItemId,
        type: "PURCHASE",
        quantity: new Decimal(50),
        unitId: testUnitId,
      });

      // Verificar que costAtTime foi preenchido
      expect(movement.costAtTime).toEqual(new Decimal("10.50"));
    });

    it("costAtTime deve refletir custo no momento da movimentação", async () => {
      const item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });
      expect(item?.cost).toEqual(new Decimal("10.50"));

      // Criar movimento
      const movement = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: "test-cost-at-time-2",
        itemId: testItemId,
        type: "CONSUMPTION",
        quantity: new Decimal(-25),
        unitId: testUnitId,
      });

      expect(movement.costAtTime).toEqual(new Decimal("10.50"));
    });
  });

  describe("P0.2: Conversão validação", () => {
    let unitKg: any;
    let unitG: any;
    let unitMl: any;

    beforeEach(async () => {
      // Criar unidades para teste
      unitKg = await prisma.inventoryUnit.upsert({
        where: { code: "kg-conv-test" },
        update: {},
        create: {
          code: "kg-conv-test",
          name: "Kilogram",
          system: "WEIGHT",
          isBuiltIn: false,
        },
      });

      unitG = await prisma.inventoryUnit.upsert({
        where: { code: "g-conv-test" },
        update: {},
        create: {
          code: "g-conv-test",
          name: "Gram",
          system: "WEIGHT",
          isBuiltIn: false,
        },
      });

      unitMl = await prisma.inventoryUnit.upsert({
        where: { code: "ml-conv-test" },
        update: {},
        create: {
          code: "ml-conv-test",
          name: "Milliliter",
          system: "VOLUME",
          isBuiltIn: false,
        },
      });
    });

    it("deve rejeitar conversão entre diferentes sistemas", async () => {
      expect(
        inventoryUnitRepository.createConversion(
          unitKg.id, // WEIGHT
          unitMl.id, // VOLUME
          1000
        )
      ).rejects.toThrow(/different systems/i);
    });

    it("deve rejeitar conversão de unidade para si mesma", async () => {
      expect(
        inventoryUnitRepository.createConversion(unitKg.id, unitKg.id, 1)
      ).rejects.toThrow(/unit to itself/i);
    });

    it("deve permitir conversão válida (kg para g)", async () => {
      const conversion = await inventoryUnitRepository.createConversion(
        unitKg.id,
        unitG.id,
        1000
      );

      expect(conversion.conversionFactor).toEqual(new Decimal("1000"));
      expect(conversion.fromUnit.system).toBe("WEIGHT");
      expect(conversion.toUnit.system).toBe("WEIGHT");
    });

    it("deve rejeitar unidades inválidas", async () => {
      expect(
        inventoryUnitRepository.createConversion("invalid-id", unitG.id, 1000)
      ).rejects.toThrow(/fromUnit not found/i);
    });
  });

  describe("P0.3: InventoryMovement imutabilidade", () => {
    it("deve impedir UPDATE direto em InventoryMovement", async () => {
      const movement = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: "test-immutable-1",
        itemId: testItemId,
        type: "PURCHASE",
        quantity: new Decimal(100),
        unitId: testUnitId,
      });

      // Tentar atualizar deve falhar (constraint CHECK no BD)
      expect(
        prisma.inventoryMovement.update({
          where: { id: movement.id },
          data: { quantity: new Decimal(200) }, // Tentar mudar quantidade
        })
      ).rejects.toThrow();
    });
  });

  describe("P1.1: CompositionItem congelado", () => {
    let productId: string;
    let compositionId: string;

    beforeEach(async () => {
      // Criar produto
      const product = await prisma.product.create({
        data: {
          storeId: testStoreId,
          name: "Test Pizza",
          slug: "test-pizza",
          description: "Test",
          categoryId: (
            await prisma.category.create({
              data: {
                storeId: testStoreId,
                name: "Pizzas",
                slug: "pizzas",
              },
            })
          ).id,
          basePrice: 50,
        },
      });
      productId = product.id;

      // Criar composição
      const composition = await prisma.productComposition.create({
        data: {
          storeId: testStoreId,
          productId,
          version: 1,
          isActive: true,
          firstUsedAt: new Date(), // Já usada
        },
      });
      compositionId = composition.id;

      // Adicionar item
      await prisma.compositionItem.create({
        data: {
          compositionId,
          inventoryItemId: testItemId,
          quantity: new Decimal("200"),
          unitId: testUnitId,
        },
      });
    });

    it("deve rejeitar UPDATE em composição congelada", async () => {
      expect(async () => {
        await prisma.productComposition.update({
          where: { id: compositionId },
          data: { firstUsedAt: null }, // Tentar descongelar
        });
      }).rejects.toThrow();
    });
  });

  describe("P1.2: Built-in units", () => {
    it("deve rejeitar deactivação de built-in unit", async () => {
      const builtInUnit = await prisma.inventoryUnit.findFirst({
        where: { isBuiltIn: true },
      });

      if (builtInUnit) {
        expect(
          inventoryUnitRepository.deactivateUnit(builtInUnit.id)
        ).rejects.toThrow(/Cannot deactivate built-in/i);
      }
    });

    it("deve permitir deactivação de unidade não built-in", async () => {
      const customUnit = await prisma.inventoryUnit.create({
        data: {
          code: "custom-unit-" + Date.now(),
          name: "Custom Unit",
          system: "CUSTOM",
          isBuiltIn: false,
        },
      });

      // Não lançar erro
      const result = await inventoryUnitRepository.deactivateUnit(
        customUnit.id
      );
      expect(result).toBeDefined();
    });
  });

  describe("P1.3: Constraint originalMovementId", () => {
    it("deve rejeitar originalMovementId para movimento não-REVERSAL", async () => {
      expect(async () => {
        await prisma.inventoryMovement.create({
          data: {
            storeId: testStoreId,
            idempotencyKey: "test-invalid-original-" + Date.now(),
            itemId: testItemId,
            type: "PURCHASE",
            quantity: new Decimal(50),
            unitId: testUnitId,
            originalMovementId: "some-id", // NÃO DEVE permitir
          },
        });
      }).rejects.toThrow();
    });

    it("deve permitir originalMovementId apenas para REVERSAL", async () => {
      // Criar movimento original
      const original = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: "test-reversal-original",
        itemId: testItemId,
        type: "PURCHASE",
        quantity: new Decimal(100),
        unitId: testUnitId,
      });

      // Criar REVERSAL
      const reversal = await InventoryService.reverseMovement(
        testStoreId,
        original.id
      );

      expect(reversal.type).toBe("REVERSAL");
      expect(reversal.originalMovementId).toBe(original.id);
    });
  });
});
