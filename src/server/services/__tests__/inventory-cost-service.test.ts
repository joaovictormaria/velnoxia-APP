import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/server/db/client';
import { InventoryCostService } from '../inventory-cost-service';
import { InventoryService } from '../inventory-service';
import { Decimal } from '@prisma/client/runtime/library';

describe('InventoryCostService', () => {
  const testStoreId = 'cost-store-' + Date.now();
  let testUnitId: string;
  let testItemId: string;

  beforeEach(async () => {
    // Setup
    const unit = await prisma.inventoryUnit.upsert({
      where: { code: 'cost-kg' },
      update: {},
      create: {
        code: 'cost-kg',
        name: 'Kilogram Cost Test',
        system: 'WEIGHT',
        isBuiltIn: false,
      },
    });
    testUnitId = unit.id;

    await prisma.store.upsert({
      where: { id: testStoreId },
      update: {},
      create: {
        id: testStoreId,
        slug: 'cost-store-' + Date.now(),
        name: 'Cost Store',
      },
    });

    // Item com custo
    const item = await InventoryService.createItem(testStoreId, {
      name: 'Farinha Premium',
      baseUnitId: testUnitId,
      itemType: 'INGREDIENT',
      cost: 10.5,
    });
    testItemId = item.id;

    // Compra inicial
    await InventoryService.recordMovement(testStoreId, {
      idempotencyKey: 'cost-purchase-1',
      itemId: testItemId,
      type: 'PURCHASE',
      quantity: new Decimal(100),
      unitId: testUnitId,
    });
  });

  afterEach(async () => {
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

  describe('calculateOrderCost', () => {
    it('deve calcular custo total de um pedido', async () => {
      const orderId = 'ORDER-COST-' + Date.now();

      // Registrar consumo
      await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'cost-consumption-1',
        itemId: testItemId,
        type: 'CONSUMPTION',
        quantity: new Decimal(-5),
        unitId: testUnitId,
        reference: orderId,
        referenceType: 'ORDER',
      });

      const cost = await InventoryCostService.calculateOrderCost(
        testStoreId,
        orderId
      );

      expect(cost.orderId).toBe(orderId);
      expect(cost.totalItems).toBe(1);
      // 5 unidades * R$ 10.50 = R$ 52.50
      expect(cost.totalCost).toEqual(new Decimal(52.5));
      expect(cost.costBreakdown[0].totalCost).toEqual(new Decimal(52.5));
    });

    it('deve somar múltiplos itens no pedido', async () => {
      const orderId = 'ORDER-MULTI-' + Date.now();

      // Criar segundo item
      const item2 = await InventoryService.createItem(testStoreId, {
        name: 'Queijo',
        baseUnitId: testUnitId,
        itemType: 'INGREDIENT',
        cost: 25,
      });

      // Compra inicial item 2
      await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'cost-purchase-2',
        itemId: item2.id,
        type: 'PURCHASE',
        quantity: new Decimal(50),
        unitId: testUnitId,
      });

      // Consumir ambos
      await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'cost-consumption-2',
        itemId: testItemId,
        type: 'CONSUMPTION',
        quantity: new Decimal(-10),
        unitId: testUnitId,
        reference: orderId,
        referenceType: 'ORDER',
      });

      await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'cost-consumption-3',
        itemId: item2.id,
        type: 'CONSUMPTION',
        quantity: new Decimal(-5),
        unitId: testUnitId,
        reference: orderId,
        referenceType: 'ORDER',
      });

      const cost = await InventoryCostService.calculateOrderCost(
        testStoreId,
        orderId
      );

      // 10 * 10.50 + 5 * 25 = 105 + 125 = 230
      expect(cost.totalItems).toBe(2);
      expect(cost.totalCost).toEqual(new Decimal(230));
    });
  });

  describe('calculateMargin', () => {
    it('deve calcular margem de lucro', () => {
      const margin = InventoryCostService.calculateMargin(
        new Decimal(100), // Preço de venda
        new Decimal(60)   // Custo
      );

      expect(margin.profitAmount).toEqual(new Decimal(40)); // 100 - 60
      expect(margin.marginPercent).toEqual(new Decimal(40)); // 40 / 100 * 100
    });

    it('deve calcular margem em 50%', () => {
      const margin = InventoryCostService.calculateMargin(
        new Decimal(100),
        new Decimal(50)
      );

      expect(margin.marginPercent).toEqual(new Decimal(50));
    });

    it('deve calcular margem negativa', () => {
      const margin = InventoryCostService.calculateMargin(
        new Decimal(80),
        new Decimal(100) // Custo maior que venda
      );

      expect(margin.marginPercent).toBeLessThan(0);
      expect(margin.profitAmount).toBeLessThan(0);
    });
  });

  describe('getCostReport', () => {
    it('deve gerar relatório de custos do período', async () => {
      const orderId = 'ORDER-REPORT-' + Date.now();

      await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'cost-report-1',
        itemId: testItemId,
        type: 'CONSUMPTION',
        quantity: new Decimal(-8),
        unitId: testUnitId,
        reference: orderId,
        referenceType: 'ORDER',
      });

      const now = new Date();
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 dia atrás
      const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 dia depois

      const report = await InventoryCostService.getCostReport(
        testStoreId,
        startDate,
        endDate
      );

      expect(report.summary.totalOrders).toBeGreaterThan(0);
      expect(report.summary.totalCost).toEqual(new Decimal(84)); // 8 * 10.50
      expect(report.topExpensiveItems).toHaveLength(1);
      expect(report.topExpensiveItems[0].itemName).toBe('Farinha Premium');
    });
  });
});
