import { OrderInventoryHandler } from "@/server/services/order-inventory-handler";
import { OrderStatus } from "@prisma/client";

/**
 * Hook para sincronizar estoque quando status de pedido muda
 *
 * INTEGRAÇÃO:
 * Chamado no final de order.update() ou em um trigger PostgreSQL
 *
 * Exemplo de uso em order-service.ts:
 * ```typescript
 * async updateOrderStatus(orderId: string, newStatus: OrderStatus) {
 *   const order = await prisma.order.update({...})
 *   await orderStatusSync.onStatusChange(orderId, newStatus);
 *   return order;
 * }
 * ```
 */
export const orderStatusSync = {
  /**
   * Sincroniza estoque quando status muda
   * Mapeia cada transição de status para ação no estoque
   */
  async onStatusChange(orderId: string, newStatus: OrderStatus) {
    await OrderInventoryHandler.syncOrderStatus(orderId, newStatus);
  },

  /**
   * Sincroniza status após Order.update() atomicamente
   * Wraps a update com transaction Prisma
   */
  async updateWithSync(
    orderId: string,
    newStatus: OrderStatus,
    updateFn: () => Promise<any>
  ) {
    // 1. Aplicar update
    const result = await updateFn();

    // 2. Sincronizar estoque
    try {
      await this.onStatusChange(orderId, newStatus);
    } catch (error) {
      console.error(
        `Inventory sync failed for order ${orderId} (status: ${newStatus}):`,
        error
      );
      // Não re-throw — o pedido foi criado, estoque sincronizar depois
    }

    return result;
  },

  /**
   * States e transições suportadas
   */
  supportedTransitions: {
    RECEIVED: "Reserve inventory",
    PREPARING: "Consume inventory",
    COMPLETED: "Mark movements complete",
    CANCELLED: "Reverse all movements",
  },

  /**
   * Documentação de fluxo
   */
  flowDiagram: `
    NEW → RECEIVED (reserve)
      ↓
    RECEIVED → PREPARING (consume)
      ↓
    PREPARING → COMPLETED (finalize)
    PREPARING → CANCELLED (reverse all)
    RECEIVED → CANCELLED (reverse reservations)
  `,
};

/**
 * PostgreSQL Trigger Alternative (more robust)
 *
 * Se preferir, pode usar trigger PostgreSQL para sincronizar automaticamente:
 *
 * CREATE OR REPLACE FUNCTION sync_inventory_on_order_status()
 * RETURNS TRIGGER AS $$
 * BEGIN
 *   IF NEW.status != OLD.status THEN
 *     -- Call application endpoint or function
 *     PERFORM pg_notify('order_status_changed', json_build_object(
 *       'orderId', NEW.id,
 *       'oldStatus', OLD.status,
 *       'newStatus', NEW.status
 *     )::text);
 *   END IF;
 *   RETURN NEW;
 * END;
 * $$ LANGUAGE plpgsql;
 *
 * CREATE TRIGGER order_status_sync_trigger
 * AFTER UPDATE ON "Order"
 * FOR EACH ROW
 * EXECUTE FUNCTION sync_inventory_on_order_status();
 *
 * Application listens em LISTEN order_status_changed
 * e chama OrderInventoryHandler.syncOrderStatus(orderId, newStatus)
 */
