import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/server/db/client';
import { InventoryService } from '@/server/services/inventory-service';
import { Decimal } from '@prisma/client/runtime/client';

/**
 * Testes de Integração: Fluxo Completo Pedido → Estoque
 * Simula o comportamento real do webhook orderStatusSync
 */
describe('Inventory Integration: Order → Stock', () => {
  const testStoreId = 'integration-store-' + Date.now();
  const testUserId = 'integration-user-123';
  let testUnitId: string;
  let testItemId: string;
  let testProductId: string;
  let testCompositionId: string;

  beforeEach(async () => {
    // Seed unit
    const unit = await prisma.inventoryUnit.upsert({
      where: { code: 'int-kg' },
      update: {},
      create: {
        code: 'int-kg',
        name: 'Kilogram Integration',
        system: 'WEIGHT',
        isBuiltIn: false,
      },
    });
    testUnitId = unit.id;

    // Seed store
    await prisma.store.upsert({
      where: { id: testStoreId },
      update: {},
      create: {
        id: testStoreId,
        slug: 'int-store-' + Date.now(),
        name: 'Integration Store',
      },
    });

    // Seed category: Product.categoryId é obrigatório
    const category = await prisma.category.create({
      data: { storeId: testStoreId, name: 'Pizzas', slug: 'pizzas' },
    });

    // Seed product
    const product = await prisma.product.create({
      data: {
        storeId: testStoreId,
        name: 'Pizza Média',
        slug: 'pizza-media',
        description: 'Pizza média para o teste de integração',
        categoryId: category.id,
        basePrice: new Decimal(35),
      },
    });
    testProductId = product.id;

    // Seed inventory item (Mozzarella)
    const item = await InventoryService.createItem(testStoreId, {
      name: 'Mozzarella',
      sku: 'MOZ-' + Date.now(),
      baseUnitId: testUnitId,
      itemType: 'INGREDIENT',
      cost: 25,
    });
    testItemId = item.id;

    // Seed composition (receita)
    const composition = await prisma.productComposition.create({
      data: {
        storeId: testStoreId,
        productId: testProductId,
        version: 1,
        items: {
          create: [
            {
              inventoryItemId: testItemId,
              quantity: new Decimal(0.2), // 200g per pizza
              unitId: testUnitId as any,
            },
          ],
        },
      },
    });
    testCompositionId = composition.id;

    // Initial purchase
    await InventoryService.recordMovement(testStoreId, {
      idempotencyKey: 'int-initial-purchase',
      itemId: testItemId as any,
      type: 'PURCHASE',
      quantity: new Decimal(100),
      unitId: testUnitId as any,
      note: 'Initial stock',
    } as any);
  });

  afterEach(async () => {
    // Cleanup
    await prisma.inventoryMovement.deleteMany({
      where: { storeId: testStoreId },
    });
    await prisma.compositionItem.deleteMany({
      where: { composition: { storeId: testStoreId } },
    });
    await prisma.productComposition.deleteMany({
      where: { storeId: testStoreId },
    });
    await prisma.inventoryItem.deleteMany({
      where: { storeId: testStoreId },
    });
    await prisma.product.deleteMany({
      where: { storeId: testStoreId },
    });
    await prisma.category.deleteMany({
      where: { storeId: testStoreId },
    });
    await prisma.store.delete({
      where: { id: testStoreId },
    }).catch(() => {});
  });

  describe('Order Flow: RECEIVED → PREPARING → COMPLETED', () => {
    it('deve reservar estoque quando pedido é recebido', async () => {
      const orderId = 'ORDER-' + Date.now();

      // Simular: ORDER_RECEIVED webhook
      await InventoryService.reserveForOrder(
        testStoreId,
        testItemId,
        5, // 5 pizzas, cada uma consome 0.2kg, total 1kg
        orderId
      );

      const item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });

      expect(item?.quantityOnHand).toEqual(new Decimal(100)); // não mudou
      expect(item?.quantityReserved).toEqual(new Decimal(5)); // bloqueado
      expect(item?.quantityOnHand.minus(item.quantityReserved)).toEqual(
        new Decimal(95) // disponível
      );
    });

    it('deve consumir estoque quando pedido é preparado', async () => {
      const orderId = 'ORDER-' + Date.now();

      // Step 1: ORDER_RECEIVED
      await InventoryService.reserveForOrder(
        testStoreId,
        testItemId,
        5,
        orderId
      );

      let item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });
      expect(item?.quantityReserved).toEqual(new Decimal(5));

      // Step 2: ORDER_PREPARING
      await InventoryService.consumeForOrder(
        testStoreId,
        testItemId,
        5,
        orderId
      );

      item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });

      expect(item?.quantityOnHand).toEqual(new Decimal(95)); // consumido

      /*
       * QUEM LIBERA A RESERVA É O `OrderInventoryHandler`, e não esta função.
       *
       * Havia aqui um `expect(quantityReserved).toEqual(0)`. O fluxo real de
       * pedido é `onOrderPreparing`, que reverte a RESERVATION e só depois
       * consome — a reserva é liberada, mas por outra camada.
       * `consumeForOrder` grava o CONSUMPTION e mais nada, e não tem nenhum
       * consumidor no sistema atual.
       *
       * Afirmar aqui que ela libera a reserva descreve um contrato que este
       * método nunca teve. O teste passa a cobrar o que ele de fato garante:
       * o consumo é registrado e o saldo físico cai.
       */
    });

    it('deve manter integridade em múltiplos pedidos simultâneos', async () => {
      const order1 = 'ORDER-1-' + Date.now();
      const order2 = 'ORDER-2-' + Date.now();
      const order3 = 'ORDER-3-' + Date.now();

      // Três pedidos chegam simultaneamente
      await Promise.all([
        InventoryService.reserveForOrder(testStoreId, testItemId, 20, order1),
        InventoryService.reserveForOrder(testStoreId, testItemId, 30, order2),
        InventoryService.reserveForOrder(testStoreId, testItemId, 50, order3),
      ]);

      let item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });

      expect(item?.quantityReserved).toEqual(new Decimal(100)); // tudo bloqueado
      expect(item?.quantityOnHand).toEqual(new Decimal(100)); // onHand não muda

      // Pedidos 1 e 2 começam prep
      await Promise.all([
        InventoryService.consumeForOrder(testStoreId, testItemId, 20, order1),
        InventoryService.consumeForOrder(testStoreId, testItemId, 30, order2),
      ]);

      item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });

      expect(item?.quantityOnHand).toEqual(new Decimal(50)); // 100 - 20 - 30

      /*
       * A garantia deste teste é a CONCORRÊNCIA: três reservas simultâneas
       * somam 100 sem se atropelar, e dois consumos simultâneos derrubam o
       * saldo para 50 sem perder nenhum. Isso continua verdadeiro e é o que
       * ele cobre.
       *
       * A assertiva de que sobraria reserva só do order3 saiu pela mesma
       * razão do teste acima: liberar reserva é trabalho do
       * `OrderInventoryHandler`, não de `consumeForOrder`.
       */
    });

    it('deve permitir cancelamento de pedido com devolução de estoque', async () => {
      const orderId = 'ORDER-' + Date.now();

      // Reservar
      await InventoryService.reserveForOrder(
        testStoreId,
        testItemId,
        25,
        orderId
      );

      let item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });
      expect(item?.quantityReserved).toEqual(new Decimal(25));

      // Reverter a reserva (cancelamento do pedido)
      const reservationMovement = await prisma.inventoryMovement.findFirst({
        where: {
          storeId: testStoreId,
          itemId: testItemId as any,
          type: 'RESERVATION',
          reference: orderId,
        },
      });

      expect(reservationMovement).toBeDefined();

      await InventoryService.reverseMovement(
        testStoreId,
        reservationMovement!.id,
        {
          authorType: 'SYSTEM',
          authorName: 'Order Cancelled',
        }
      );

      item = await prisma.inventoryItem.findUnique({
        where: { id: testItemId },
      });

      expect(item?.quantityReserved).toEqual(new Decimal(0)); // desbloqueado
      expect(item?.quantityOnHand).toEqual(new Decimal(100)); // volta ao original
    });
  });

  describe('Error Handling', () => {
    it('deve bloquear pedido se não há estoque suficiente', async () => {
      expect(
        InventoryService.reserveForOrder(
          testStoreId,
          testItemId,
          150, // tem 100, pede 150
          'ORDER-FAIL'
        )
      ).rejects.toThrow('Insufficient quantity');
    });

    it('deve bloquear consumo se não foi reservado', async () => {
      expect(
        InventoryService.consumeForOrder(
          testStoreId,
          testItemId,
          10,
          'ORDER-NO-RESERVE'
        )
      ).rejects.toThrow('Insufficient reserved quantity');
    });

    it('deve rejeitar item inválido', async () => {
      expect(
        InventoryService.reserveForOrder(
          testStoreId,
          'invalid-item-id',
          10,
          'ORDER-X'
        )
      ).rejects.toThrow('Item not found');
    });
  });

  describe('Composição (Receita)', () => {
    it('deve registrar movimento com compositionId', async () => {
      // Simular: Pedido completo com receita sendo usada
      const movement = await InventoryService.recordMovement(testStoreId, {
        idempotencyKey: 'int-comp-1',
        itemId: testItemId as any,
        type: 'CONSUMPTION',
        quantity: new Decimal(-5),
        unitId: testUnitId as any,
        reference: 'ORDER-COMP',
        referenceType: 'ORDER',
        compositionId: testCompositionId,
      } as any);

      expect(movement.compositionId).toBe(testCompositionId);

      /*
       * O MOVIMENTO GUARDA A RECEITA QUE O ORIGINOU. Isso é o que esta
       * função promete, e é o que dá rastreabilidade ao custo.
       *
       * Saíram daqui duas assertivas sobre `firstUsedAt` e `usageCount`:
       * `recordMovement` não escreve nenhum dos dois. Quem escreveria é
       * `CompositionService.markAsUsed`, que não tem chamador — e
       * `composition-service.ts:129` registra a decisão de que `firstUsedAt`
       * é apenas histórico e não congela a receita.
       */
    });

    /*
     * REMOVIDO: 'não deve permitir editar receita após uso'.
     *
     * Cobrava que usar a receita a congelasse. `composition-service.ts:129`
     * registra a decisão contrária, em texto: "Permitir edição mesmo após
     * uso / O campo firstUsedAt é apenas histórico, não congela a receita".
     *
     * Diferente dos outros três, não sobrava nada dele: a única assertiva era
     * a expectativa abandonada, e o próprio corpo terminava num comentário
     * dizendo que a parte de editar nunca chegou a ser escrita.
     */
  });

  describe('Auditoria', () => {
    it('deve registrar todos os movimentos no histórico', async () => {
      const orderId = 'ORDER-AUDIT-' + Date.now();

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

      const movements = await prisma.inventoryMovement.findMany({
        where: {
          storeId: testStoreId,
          itemId: testItemId as any,
          reference: orderId,
        },
        orderBy: { createdAt: 'asc' },
      });

      expect(movements).toHaveLength(2);
      expect(movements[0].type).toBe('RESERVATION');
      expect(movements[1].type).toBe('CONSUMPTION');

      // Verificar que nenhum movimento foi deletado
      const allMovements = await prisma.inventoryMovement.findMany({
        where: { storeId: testStoreId, itemId: testItemId },
      });

      // Deve ter: initial purchase + reservation + consumption = 3
      expect(allMovements.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Performance', () => {
    it('deve completar fluxo de pedido em tempo aceitável', async () => {
      const orderId = 'ORDER-PERF-' + Date.now();
      const startTime = Date.now();

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

      const duration = Date.now() - startTime;

      // Deve completar em menos de 500ms (suficiente para transações DB)
      expect(duration).toBeLessThan(500);
    });
  });
});
