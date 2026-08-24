// import { action } from "@solidjs/router";
import { prisma } from "@/server/db/client";
import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { inventoryMovementRepository } from "@/server/repositories";
const action = (fn: any) => fn;

/**
 * System: Sincronizar estoque quando pedido é recebido
 * Chamado após Order.status = RECEIVED
 */
export const systemSyncOrderReceived = action(async (formData: FormData) => {
  const orderId = formData.get("orderId") as string;

  return OrderInventoryHandler.onOrderReceived(orderId);
});

/**
 * System: Sincronizar estoque quando pedido começar preparação
 * Chamado após Order.status = PREPARING
 */
export const systemSyncOrderPreparing = action(async (formData: FormData) => {
  const orderId = formData.get("orderId") as string;

  return OrderInventoryHandler.onOrderPreparing(orderId);
});

/**
 * System: Sincronizar estoque quando pedido é completado
 * Chamado após Order.status = COMPLETED
 */
export const systemSyncOrderCompleted = action(async (formData: FormData) => {
  const orderId = formData.get("orderId") as string;

  return OrderInventoryHandler.onOrderCompleted(orderId);
});

/**
 * System: Revert all inventory when order is cancelled
 * Chamado após Order.status = CANCELLED
 */
export const systemSyncOrderCancelled = action(async (formData: FormData) => {
  const orderId = formData.get("orderId") as string;

  return OrderInventoryHandler.onOrderCancelled(orderId);
});

/**
 * Admin: Obter histórico de movimentos de um pedido
 * Útil para auditar o que aconteceu com estoque
 */
export const adminGetOrderMovements = action(async (formData: FormData) => {
  const orderId = formData.get("orderId") as string;
  const storeId = formData.get("storeId") as string;

  return inventoryMovementRepository.findByReference(
    storeId,
    "ORDER",
    orderId
  );
});

/**
 * Admin: Get order inventory status (reserved vs consumed)
 */
export const adminGetOrderInventoryStatus = action(
  async (formData: FormData) => {
    const orderId = formData.get("orderId") as string;
    const storeId = formData.get("storeId") as string;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    if (!order || order.storeId !== storeId) {
      throw new Error("Order not found");
    }

    // Get all movements for this order
    const movements = await inventoryMovementRepository.findByReference(
      storeId,
      "ORDER",
      orderId
    );

    // Organize by type
    const reservations = movements.filter((m) => m.type === "RESERVATION");
    const consumptions = movements.filter((m) => m.type === "CONSUMPTION");
    const reversals = movements.filter((m) => m.type === "REVERSAL");

    return {
      order: {
        id: order.id,
        status: order.status,
        totalItems: order.items.length,
      },
      inventory: {
        reservations: {
          count: reservations.length,
          items: reservations,
          totalQuantity: reservations.reduce(
            (sum, m) => sum + Number(m.quantity),
            0
          ),
        },
        consumptions: {
          count: consumptions.length,
          items: consumptions,
          totalQuantity: consumptions.reduce(
            (sum, m) => sum + Math.abs(Number(m.quantity)),
            0
          ),
        },
        reversals: {
          count: reversals.length,
          items: reversals,
        },
      },
      summary: {
        isFullyReserved:
          reservations.length === order.items.length,
        isFullyConsumed:
          consumptions.length === order.items.length,
        hasPendingReversals: reversals.length > 0,
      },
    };
  }
);

/**
 * Admin: Manually trigger inventory sync (for recovery)
 * Útil se algo deu errado e precisa resincronizar
 */
export const adminTriggerInventorySync = action(async (formData: FormData) => {
  const orderId = formData.get("orderId") as string;
  const status = formData.get("status") as string;

  return OrderInventoryHandler.syncOrderStatus(orderId, status);
});
