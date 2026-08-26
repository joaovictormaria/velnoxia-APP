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
  /**
   * Sincroniza estoque quando o status muda, com retentativa.
   *
   * O chamador dispara isto sem esperar (`fire-and-forget`), porque a criação do
   * pedido não pode ficar refém do estoque. O preço disso é que uma falha aqui
   * passava despercebida: ia para um `console.error` e o estoque ficava
   * divergente sem ninguém saber.
   *
   * As tentativas são seguras porque toda operação abaixo é idempotente — a
   * chave determinística mais o índice único fazem a segunda tentativa
   * reconhecer o que a primeira já gravou, em vez de descontar de novo.
   *
   * Esgotadas as tentativas, o pedido recebe uma marca legível. Não é o mesmo
   * que resolver, mas transforma uma falha silenciosa numa lista de pedidos que
   * precisam de olho humano.
   */
  async onStatusChange(orderId: string, newStatus: OrderStatus) {
    const esperas = [0, 1_000, 5_000];
    let ultimoErro: unknown = null;

    for (const espera of esperas) {
      if (espera > 0) await new Promise((r) => setTimeout(r, espera));
      try {
        await OrderInventoryHandler.syncOrderStatus(orderId, newStatus);
        return;
      } catch (erro) {
        ultimoErro = erro;
      }
    }

    const motivo =
      ultimoErro instanceof Error ? ultimoErro.message : "erro desconhecido";
    console.error(
      `[estoque] sincronizacao falhou apos ${esperas.length} tentativas`,
      { orderId, newStatus },
    );

    try {
      const { prisma } = await import("@/server/db/client");
      await prisma.order.update({
        where: { id: orderId },
        data: {
          inventoryInconsistentAt: new Date(),
          inventoryInconsistency:
            `A baixa de estoque nao pode ser concluida (status ${newStatus}): ${motivo}. ` +
            `O saldo deste pedido nao foi aplicado e precisa de conferencia manual.`,
        },
      });
    } catch {
      // Se nem a marca consegue ser gravada, o log acima e o que resta.
    }
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
