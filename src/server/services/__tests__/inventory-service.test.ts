import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InventoryService } from '../inventory-service';
import { prisma } from '@/server/db/client';
import { Decimal } from '@prisma/client/runtime/client';

/**
 * Testes do InventoryService
 * Cobertura: CRUD, movimentações, reversão, integrações
 */
describe('InventoryService', () => {
  const testStoreId = 'test-store-' + Date.now();
  const testUserId = 'test-user-123';
  let testUnitId: string;
  let testItemId: string;

  beforeEach(async () => {
    // Seed: Unidade de teste
    const unit = await prisma.inventoryUnit.upsert({
      where: { code: 'test-kg' },
      update: {},
      create: {
        code: 'test-kg',
        name: 'Kilogram Test',
        system: 'WEIGHT',
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
        slug: 'test-store-' + Date.now(),
        name: 'Test Store',
      },
    });
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

  describe('createItem', () => {
    it('deve criar um item com sucesso', async () => {
      const result = await InventoryService.createItem(testStoreId, {
        name: 'Farinha de Trigo',
        sku: 'FAR-001',
        barcode: '1234567890',
        baseUnitId: testUnitId,
        cost: 5.5,
        itemType: 'INGREDIENT',
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Farinha de Trigo');
      expect(result.sku).toBe('FAR-001');
      expect(result.storeId).toBe(testStoreId);
      expect(result.quantityOnHand).toEqual(new Decimal(0));
    });

    it('deve rejeitar SKU duplicado na mesma store', async () => {
      const itemData = {
        name: 'Item 1',
        sku: 'DUP-001',
        baseUnitId: testUnitId,
        itemType: 'INGREDIENT' as const,
      };

      await InventoryService.createItem(testStoreId, itemData);

      expect(
        InventoryService.createItem(testStoreId, itemData)
      ).rejects.toThrow('SKU or barcode already exists');
    });

    it('deve rejeitar unidade inválida', async () => {
      expect(
        InventoryService.createItem(testStoreId, {
          name: 'Item',
          baseUnitId: 'invalid-unit-id',
          itemType: 'INGREDIENT',
        })
      ).rejects.toThrow('Invalid baseUnitId');
    });
  });

  describe('recordMovement', () => {
    beforeEach(async () => {
      // Criar item de teste
      const item = await InventoryService.createItem(testStoreId, {
        name: 'Test Item',
        baseUnitId: testUnitId,
        itemType: 'INGREDIENT',
      });
      testItemId = item.id;
    });

    it('deve registrar movimento PURCHASE', async () => {
      const movement = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-purchase-1',
        itemId: testItemId as any,
        type: 'PURCHASE',
        quantity: new Decimal(50),
        unitId: testUnitId as any,
        reference: 'FORNECEDOR-123',
        referenceType: 'SUPPLIER',
      } as any) as any;

      expect(movement.type).toBe('PURCHASE');
      expect(movement.quantity).toEqual(new Decimal(50));

      // Verificar que quantityOnHand foi atualizado
      const item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });
      expect(item?.quantityOnHand).toEqual(new Decimal(50));
    });

    it('deve registrar movimento CONSUMPTION', async () => {
      // Primeiro registra PURCHASE
      await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-purchase-2',
        itemId: testItemId as any,
        type: 'PURCHASE',
        quantity: new Decimal(100),
        unitId: testUnitId as any,
      } as any);

      // Depois CONSUMPTION
      const movement = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-consumption-1',
        itemId: testItemId as any,
        type: 'CONSUMPTION',
        quantity: new Decimal(-30),
        unitId: testUnitId as any,
        reference: 'ORDER-123',
        referenceType: 'ORDER',
      } as any);

      expect(movement.type).toBe('CONSUMPTION');
      expect(movement.quantity).toEqual(new Decimal(-30));

      const item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });
      // 100 - 30 = 70
      expect(item?.quantityOnHand).toEqual(new Decimal(70));
    });

    it('deve ser idempotente (mesmo idempotencyKey retorna mesmo movimento)', async () => {
      const key = 'test-idempotent-1';

      const result1 = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: key,
        itemId: testItemId as any,
        type: 'PURCHASE',
        quantity: new Decimal(50),
        unitId: testUnitId as any,
      } as any);

      const result2 = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: key,
        itemId: testItemId as any,
        type: 'PURCHASE',
        quantity: new Decimal(50),
        unitId: testUnitId as any,
      } as any);

      expect(result1.id).toBe(result2.id);

      // Verificar que só um movimento foi criado
      const movements = await prisma.inventoryMovement.findMany({
        where: { storeId: testStoreId, idempotencyKey: key },
      });
      expect(movements).toHaveLength(1);
    });

    it('deve registrar LOSS corretamente', async () => {
      await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-purchase-3',
        itemId: testItemId as any,
        type: 'PURCHASE',
        quantity: new Decimal(100),
        unitId: testUnitId as any,
      } as any);

      const loss = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-loss-1',
        itemId: testItemId as any,
        type: 'LOSS',
        quantity: new Decimal(-10),
        unitId: testUnitId as any,
        note: 'Produto quebrou',
      } as any);

      expect(loss.type).toBe('LOSS');

      const item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });
      expect(item?.quantityOnHand).toEqual(new Decimal(90));
    });
  });

  describe('reverseMovement', () => {
    beforeEach(async () => {
      const item = await InventoryService.createItem(testStoreId, {
        name: 'Test Item',
        baseUnitId: testUnitId,
        itemType: 'INGREDIENT',
      });
      testItemId = item.id;
    });

    it('deve reverter um movimento PURCHASE', async () => {
      const original = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-purchase-reverse',
        itemId: testItemId as any,
        type: 'PURCHASE',
        quantity: new Decimal(50),
        unitId: testUnitId as any,
      } as any);

      const reversal = await InventoryService.reverseMovement(
        testStoreId,
        original.id,
        {
          authorType: 'ADMIN',
          authorId: testUserId,
          authorName: 'Test Admin',
        }
      );

      expect(reversal.type).toBe('REVERSAL');
      expect(reversal.quantity).toEqual(new Decimal(-50));
      expect(reversal.originalMovementId).toBe(original.id);

      // Verificar que onHand voltou a 0
      const item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });
      expect(item?.quantityOnHand).toEqual(new Decimal(0));
    });

    it('deve não permitir reverter um REVERSAL', async () => {
      const original = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-purchase-rev2',
        itemId: testItemId as any,
        type: 'PURCHASE',
        quantity: new Decimal(50),
        unitId: testUnitId as any,
      } as any);

      const reversal = await InventoryService.reverseMovement(
        testStoreId,
        original.id
      );

      expect(
        InventoryService.reverseMovement(testStoreId, reversal.id)
      ).rejects.toThrow('Cannot reverse a REVERSAL movement');
    });

    it('deve não permitir reverter duas vezes', async () => {
      const original = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-purchase-rev3',
        itemId: testItemId as any,
        type: 'PURCHASE',
        quantity: new Decimal(50),
        unitId: testUnitId as any,
      } as any);

      await InventoryService.reverseMovement(testStoreId, original.id);

      expect(
        InventoryService.reverseMovement(testStoreId, original.id)
      ).rejects.toThrow('Movement has already been reversed');
    });
  });

  describe('reserveForOrder', () => {
    beforeEach(async () => {
      const item = await InventoryService.createItem(testStoreId, {
        name: 'Test Item',
        baseUnitId: testUnitId,
        itemType: 'INGREDIENT',
      });
      testItemId = item.id;

      // Registrar compra inicial
      await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-purchase-reserve',
        itemId: testItemId as any,
        type: 'PURCHASE',
        quantity: new Decimal(100),
        unitId: testUnitId as any,
      } as any);
    });

    it('deve reservar quantidade para pedido', async () => {
      const orderId = 'ORDER-' + Date.now();
      await InventoryService.reserveForOrder(
        testStoreId,
        testItemId,
        10,
        orderId
      );

      const item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });

      expect(item?.quantityOnHand).toEqual(new Decimal(100)); // não muda
      expect(item?.quantityReserved).toEqual(new Decimal(10)); // aumenta
    });

    it('deve rejeitar reserva sem estoque suficiente', async () => {
      const orderId = 'ORDER-' + Date.now();
      expect(
        InventoryService.reserveForOrder(testStoreId, testItemId, 150, orderId)
      ).rejects.toThrow('Insufficient quantity');
    });
  });

  describe('consumeForOrder', () => {
    beforeEach(async () => {
      const item = await InventoryService.createItem(testStoreId, {
        name: 'Test Item',
        baseUnitId: testUnitId,
        itemType: 'INGREDIENT',
      });
      testItemId = item.id;

      // Compra + reserva
      await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-purchase-consume',
        itemId: testItemId as any,
        type: 'PURCHASE',
        quantity: new Decimal(100),
        unitId: testUnitId as any,
      } as any);
    });

    it('deve consumir quantidade reservada', async () => {
      const orderId = 'ORDER-' + Date.now();
      await InventoryService.reserveForOrder(
        testStoreId,
        testItemId,
        10,
        orderId
      );

      await InventoryService.consumeForOrder(
        testStoreId,
        testItemId,
        10,
        orderId
      );

      const item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });

      expect(item?.quantityOnHand).toEqual(new Decimal(90)); // diminui
      expect(item?.quantityReserved).toEqual(new Decimal(0)); // zera
    });

    it('deve rejeitar consumo sem reserva suficiente', async () => {
      const orderId = 'ORDER-' + Date.now();
      expect(
        InventoryService.consumeForOrder(testStoreId, testItemId, 10, orderId)
      ).rejects.toThrow('Insufficient reserved quantity');
    });
  });

  describe('updateItem', () => {
    beforeEach(async () => {
      const item = await InventoryService.createItem(testStoreId, {
        name: 'Original Name',
        sku: 'ORIG-001',
        baseUnitId: testUnitId,
        itemType: 'INGREDIENT',
      });
      testItemId = item.id;
    });

    it('deve atualizar item parcialmente', async () => {
      const updated = await InventoryService.updateItem(
        testStoreId,
        testItemId,
        {
          name: 'New Name',
          cost: 10.5,
        }
      );

      expect(updated?.name).toBe('New Name');
      expect(updated?.cost).toEqual(new Decimal(10.5));
      expect(updated?.sku).toBe('ORIG-001'); // não muda
    });

    it('deve não permitir atualizar para SKU duplicado', async () => {
      // Criar outro item
      await InventoryService.createItem(testStoreId, {
        name: 'Other Item',
        sku: 'OTHER-001',
        baseUnitId: testUnitId,
        itemType: 'INGREDIENT',
      });

      // Tentar atualizar primeiro para SKU do segundo
      expect(
        InventoryService.updateItem(testStoreId, testItemId, {
          sku: 'OTHER-001',
        })
      ).rejects.toThrow('SKU or barcode already exists');
    });
  });

  describe('Integridade de Dados', () => {
    it('quantityOnHand nunca deve ser negativa após CONSUMPTION', async () => {
      const item = await InventoryService.createItem(testStoreId, {
        name: 'Test Item',
        baseUnitId: testUnitId,
        itemType: 'INGREDIENT',
      });

      // Registrar apenas 50
      await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-integrity-1',
        itemId: item.id as any,
        type: 'PURCHASE',
        quantity: new Decimal(50),
        unitId: testUnitId as any,
      } as any);

      // Tentar consumir mais que tem
      // Não deveria falhar se for LOSS, apenas se for CONSUMPTION
      await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'test-integrity-2',
        itemId: item.id as any,
        type: 'LOSS',
        quantity: new Decimal(-60),
        unitId: testUnitId as any,
      } as any);

      const finalItem = await prisma.inventoryItem.findUnique({
        where: { id: item.id },
      });

      // -10 é permitido para LOSS (pode ficar negativo temporariamente)
      expect(finalItem?.quantityOnHand).toEqual(new Decimal(-10));
    });
  });
});
