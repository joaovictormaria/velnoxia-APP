import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { CompositionService } from "@/server/services/composition-service";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Sincroniza mudanças de status de pedido com estoque
 * Chamado quando Order.status muda
 */
export class OrderInventoryHandler {
  /**
   * Pedido recebido: RESERVAR itens (marca quantityReserved)
   * Chamado quando Order.status = RECEIVED
   */
  static async onOrderReceived(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      throw new Error("Order not found");
    }

    if (!order.storeId) {
      throw new Error("Order missing storeId");
    }

    // Para cada item do pedido, reservar quantidade
    for (const orderItem of order.items) {
      // Encontrar inventory item correspondente
      // Busca por linkagem product ↔ inventory (Fase 5)
      // Por enquanto, assume que product.id == inventoryItem.id (simplificação)

      const inventoryItem = await prisma.inventoryItem.findFirst({
        where: {
          storeId: order.storeId,
          // TODO: procurar por product.trackInventory = true quando implementar
        },
      });

      if (!inventoryItem) {
        // Item não tem controle de estoque, skip
        continue;
      }

      // Reservar quantidade
      try {
        await InventoryService.reserveForOrder(
          order.storeId,
          inventoryItem.id,
          Number(orderItem.quantity),
          orderId
        );
      } catch (error) {
        // Log, mas não falha o pedido (estoque pode ser negativo por enquanto)
        console.error(
          `Failed to reserve inventory for order ${orderId}:`,
          error
        );
      }
    }
  }

  /**
   * Pedido em preparação: CONSUMIR itens (reduz quantityOnHand)
   * Chamado quando Order.status = PREPARING
   */
  static async onOrderPreparing(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      throw new Error("Order not found");
    }

    if (!order.storeId) {
      throw new Error("Order missing storeId");
    }

    // Para cada item do pedido, consumir quantidade
    for (const orderItem of order.items) {
      const inventoryItem = await prisma.inventoryItem.findFirst({
        where: {
          storeId: order.storeId,
          // TODO: linkagem product.id
        },
      });

      if (!inventoryItem) {
        continue;
      }

      // Consumir quantidade (use composition se tiver receita)
      try {
        await InventoryService.consumeForOrder(
          order.storeId,
          inventoryItem.id,
          Number(orderItem.quantity),
          orderId
        );

        // Se produto tem composição, marcar como usada
        const composition = await prisma.productComposition.findFirst({
          where: {
            productId: orderItem.productId,
            isActive: true,
          },
        });

        if (composition && !composition.firstUsedAt) {
          await CompositionService.markAsUsed(composition.id);
        }
      } catch (error) {
        console.error(
          `Failed to consume inventory for order ${orderId}:`,
          error
        );
      }
    }
  }

  /**
   * Pedido completo: Atualizar referência do movimento
   * Chamado quando Order.status = COMPLETED
   */
  static async onOrderCompleted(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || !order.storeId) {
      return;
    }

    // Atualizar todos movimentos linked a este pedido
    await prisma.inventoryMovement.updateMany({
      where: {
        storeId: order.storeId,
        reference: orderId,
        referenceType: "ORDER",
      },
      data: {
        // Note: apenas atualizar metadata se necessário
        // (ex: marcar como completado, adicionar timestamp)
      },
    });
  }

  /**
   * Pedido cancelado: REVERTER movimentações
   * Chamado quando Order.status = CANCELLED
   */
  static async onOrderCancelled(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || !order.storeId) {
      return;
    }

    // Encontrar todos movimentos linked a este pedido
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        storeId: order.storeId,
        reference: orderId,
        referenceType: "ORDER",
        type: { in: ["RESERVATION", "CONSUMPTION"] },
      },
      orderBy: { createdAt: "desc" }, // Reverter em ordem inversa
    });

    // Reverter cada movimento
    for (const movement of movements) {
      try {
        // Verifica se já foi revertido
        const existingReversal =
          await prisma.inventoryMovement.findFirst({
            where: {
              originalMovementId: movement.id,
              type: "REVERSAL",
            },
          });

        if (!existingReversal) {
          // Criar reversal
          const reversalKey = `${order.storeId}#REVERSAL#${movement.id}`;

          await InventoryService.recordMovement(order.storeId, {
            idempotencyKey: reversalKey,
            itemId: movement.itemId,
            type: "REVERSAL",
            quantity: movement.quantity.mul(-1),
            unitId: movement.unitId,
            originalMovementId: movement.id,
            reference: orderId,
            referenceType: "ORDER_CANCELLATION",
            authorType: "SYSTEM",
            authorName: "Order Cancellation Handler",
          });
        }
      } catch (error) {
        console.error(
          `Failed to reverse movement ${movement.id} for cancelled order:`,
          error
        );
      }
    }
  }

  /**
   * Hook chamado quando Order status muda
   * Orquestra todos os handlers
   */
  static async syncOrderStatus(orderId: string, newStatus: string) {
    try {
      switch (newStatus) {
        case "RECEIVED":
          await this.onOrderReceived(orderId);
          break;

        case "PREPARING":
          await this.onOrderPreparing(orderId);
          break;

        case "COMPLETED":
          await this.onOrderCompleted(orderId);
          break;

        case "CANCELLED":
          await this.onOrderCancelled(orderId);
          break;

        default:
          // Outros estados não afetam estoque
          break;
      }
    } catch (error) {
      console.error(
        `Error syncing inventory for order ${orderId} (status ${newStatus}):`,
        error
      );
      // Não throws — log mas continua (pedido não deve falhar)
    }
  }
}
