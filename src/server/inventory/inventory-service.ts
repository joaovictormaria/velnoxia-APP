import { prisma } from "../db/client";
import { AuditService } from "../audit/audit-service";
type Decimal = any;

/**
 * PRIORIDADE 12: EVOLUÇÃO DE ESTOQUE
 *
 * Tracking automático de quantidade, histórico de movimentação,
 * alertas de baixo estoque e validações antes de vender.
 *
 * Modelos:
 * - ProductInventory: Estoque atual (quantidade, lastRestocked, lowStockThreshold)
 * - InventoryMovement: Histórico imutável de entradas/saídas
 * - InventoryAlert: Alertas de estoque baixo
 *
 * Fluxo:
 * 1. createProduct() → cria ProductInventory com quantity=0
 * 2. restockProduct() → adiciona quantidade + registra movimento
 * 3. reserveStock() → valida e reserva para pedido (não deduz imediatamente)
 * 4. releaseReservation() → cancela reserva se pedido for cancelado
 * 5. consumeStock() → deduz quantidade após pedido confirmado
 * 6. getInventoryReport() → relatório por loja
 * 7. checkLowStockAlerts() → detecta produtos com estoque baixo (cron)
 */

export interface ProductInventory {
  productId: string;
  storeId: string;
  quantity: number;
  reserved: number; // Quantidade reservada (não disponível)
  available: number; // quantity - reserved
  lastRestocked: Date;
  lowStockThreshold: number;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  storeId: string;
  movementType: "RESTOCK" | "CONSUME" | "ADJUSTMENT" | "DAMAGE" | "RETURN";
  quantity: number; // Pode ser negativo para saídas
  reference?: string; // orderId, invoiceId, etc
  notes?: string;
  createdBy: string; // Usuário que fez a movimentação
  createdAt: Date;
}

export interface StockReservation {
  orderId: string;
  productId: string;
  quantity: number;
  reservedAt: Date;
  expiresAt: Date; // 30 minutos por padrão (tempo para confirmar pedido)
}

export interface InventoryAlert {
  productId: string;
  storeId: string;
  alertType: "LOW_STOCK" | "OUT_OF_STOCK" | "OVERSTOCKED";
  currentQuantity: number;
  threshold: number;
  createdAt: Date;
  acknowledged: boolean;
}

export class InventoryService {
  /**
   * Obter estoque atual de um produto
   */
  async getProductInventory(
    storeId: string,
    productId: string,
  ): Promise<ProductInventory | null> {
    const inventory = await (prisma as any).productInventory.findUnique({
      where: { productId },
    });

    if (!inventory || inventory.storeId !== storeId) {
      return null;
    }

    const reserved = await this.getReservedQuantity(productId);

    return {
      productId: inventory.productId,
      storeId: inventory.storeId,
      quantity: inventory.quantity,
      reserved,
      available: inventory.quantity - reserved,
      lastRestocked: inventory.lastRestocked,
      lowStockThreshold: inventory.lowStockThreshold,
    };
  }

  /**
   * Repor estoque (recebimento de mercadoria)
   */
  async restockProduct(
    storeId: string,
    productId: string,
    quantity: number,
    adminId: string,
    reference?: string,
  ): Promise<ProductInventory> {
    // Validar produto existe
    const product = await prisma.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!product) {
      throw new Error("Produto não encontrado");
    }

    if (quantity <= 0) {
      throw new Error("Quantidade deve ser maior que 0");
    }

    // Atualizar ou criar inventário
    const inventory = await (prisma as any).productInventory.upsert({
      where: { productId },
      update: {
        quantity: { increment: quantity },
        lastRestocked: new Date(),
      },
      create: {
        productId,
        storeId,
        quantity,
        lastRestocked: new Date(),
        lowStockThreshold: 10, // Padrão
      },
    });

    // Registrar movimento
    await prisma.inventoryMovement.create({
      data: {
        productId,
        storeId,
        movementType: "RESTOCK",
        quantity,
        reference,
        createdBy: adminId,
      },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: adminId,
      action: "RESTOCK",
      resource: "Inventory",
      resourceId: productId,
      newValue: { quantity, reference },
      reason: `Reposição de ${quantity} unidades`,
    });

    const reserved = await this.getReservedQuantity(productId);

    return {
      productId: inventory.productId,
      storeId: inventory.storeId,
      quantity: inventory.quantity,
      reserved,
      available: inventory.quantity - reserved,
      lastRestocked: inventory.lastRestocked,
      lowStockThreshold: inventory.lowStockThreshold,
    };
  }

  /**
   * Reservar estoque para pedido
   * Bloqueia quantidade sem deduzir (deduz quando pedido é confirmado)
   */
  async reserveStock(
    storeId: string,
    orderId: string,
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<{ success: boolean; unavailableItems?: string[] }> {
    const unavailable: string[] = [];

    // Validar disponibilidade
    for (const item of items) {
      const inventory = await (prisma as any).productInventory.findUnique({
        where: { productId: item.productId },
      });

      if (!inventory || inventory.storeId !== storeId) {
        unavailable.push(item.productId);
        continue;
      }

      const reserved = await this.getReservedQuantity(item.productId);
      const available = inventory.quantity - reserved;

      if (available < item.quantity) {
        unavailable.push(item.productId);
      }
    }

    if (unavailable.length > 0) {
      return { success: false, unavailableItems: unavailable };
    }

    // Criar reservas
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

    for (const item of items) {
      await (prisma as any).stockReservation.create({
        data: {
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          expiresAt,
        },
      });
    }

    return { success: true };
  }

  /**
   * Cancelar reserva (se pedido for cancelado)
   */
  async releaseReservation(orderId: string, adminId: string): Promise<void> {
    const reservations = await (prisma as any).stockReservation.findMany({
      where: { orderId },
    });

    await (prisma as any).stockReservation.deleteMany({
      where: { orderId },
    });

    // Auditar
    await AuditService.log({
      storeId: "", // Inferir do primeiro item
      userId: adminId,
      action: "RELEASE_RESERVATION",
      resource: "Inventory",
      resourceId: orderId,
      reason: `Cancelamento de ${reservations.length} reservas`,
    });
  }

  /**
   * Consumir estoque após pedido confirmado
   * Deduz quantidade do inventário
   */
  async consumeStock(
    storeId: string,
    orderId: string,
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<void> {
    for (const item of items) {
      // Validar produto existe
      const product = await prisma.product.findFirst({
        where: { id: item.productId, storeId, deletedAt: null },
      });

      if (!product) {
        throw new Error(`Produto ${item.productId} não encontrado`);
      }

      // Atualizar estoque
      const inventory = await (prisma as any).productInventory.updateMany({
        where: { productId: item.productId },
        data: {
          quantity: { decrement: item.quantity },
        },
      });

      if (inventory.count === 0) {
        throw new Error(`Estoque não encontrado para ${item.productId}`);
      }

      // Registrar movimento
      await prisma.inventoryMovement.create({
        data: {
          productId: item.productId,
          storeId,
          movementType: "CONSUME",
          quantity: -item.quantity, // Negativo para saída
          reference: orderId,
          createdBy: "system", // Consumo é automático
        },
      });

      // Remover reserva
      await (prisma as any).stockReservation.deleteMany({
        where: { orderId, productId: item.productId },
      });
    }

    // Auditar
    await AuditService.log({
      storeId,
      userId: "system",
      action: "CONSUME",
      resource: "Inventory",
      resourceId: orderId,
      newValue: { itemsConsumed: items.length },
      reason: `Consumo de estoque para pedido ${orderId}`,
    });
  }

  /**
   * Ajuste manual de estoque (dano, perda, etc)
   */
  async adjustStock(
    storeId: string,
    productId: string,
    quantity: number, // Positivo ou negativo
    reason: string,
    adminId: string,
  ): Promise<ProductInventory> {
    // Validar produto
    const product = await prisma.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
    });

    if (!product) {
      throw new Error("Produto não encontrado");
    }

    // Determinar tipo de movimento
    let movementType: "ADJUSTMENT" | "DAMAGE" | "RETURN" = "ADJUSTMENT";
    if (reason.toLowerCase().includes("dano")) movementType = "DAMAGE";
    if (reason.toLowerCase().includes("devolução")) movementType = "RETURN";

    // Atualizar estoque
    const inventory = await (prisma as any).productInventory.updateMany({
      where: { productId },
      data: {
        quantity: { increment: quantity },
      },
    });

    if (inventory.count === 0) {
      throw new Error("Estoque não encontrado");
    }

    // Registrar movimento
    await prisma.inventoryMovement.create({
      data: {
        productId,
        storeId,
        movementType,
        quantity,
        notes: reason,
        createdBy: adminId,
      },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: adminId,
      action: "ADJUST",
      resource: "Inventory",
      resourceId: productId,
      newValue: { quantity, reason },
      reason: `Ajuste manual: ${reason}`,
    });

    return this.getProductInventory(storeId, productId) as Promise<ProductInventory>;
  }

  /**
   * Definir threshold de alerta de baixo estoque
   */
  async setLowStockThreshold(
    storeId: string,
    productId: string,
    threshold: number,
    adminId: string,
  ): Promise<void> {
    const product = await prisma.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
    });

    if (!product) {
      throw new Error("Produto não encontrado");
    }

    if (threshold < 0) {
      throw new Error("Threshold não pode ser negativo");
    }

    await (prisma as any).productInventory.upsert({
      where: { productId },
      update: { lowStockThreshold: threshold },
      create: {
        productId,
        storeId,
        quantity: 0,
        lowStockThreshold: threshold,
        lastRestocked: new Date(),
      },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: adminId,
      action: "UPDATE",
      resource: "Inventory",
      resourceId: productId,
      newValue: { lowStockThreshold: threshold },
      reason: `Threshold de alerta alterado para ${threshold}`,
    });
  }

  /**
   * Verificar alertas de estoque baixo (executar via cron)
   */
  async checkLowStockAlerts(storeId: string): Promise<InventoryAlert[]> {
    const alerts: InventoryAlert[] = [];

    const inventories = await (prisma as any).productInventory.findMany({
      where: { storeId },
    });

    for (const inv of inventories) {
      const reserved = await this.getReservedQuantity(inv.productId);
      const available = inv.quantity - reserved;

      // Detectar estado
      let alertType: "LOW_STOCK" | "OUT_OF_STOCK" | "OVERSTOCKED" | null = null;

      if (available === 0) {
        alertType = "OUT_OF_STOCK";
      } else if (available < inv.lowStockThreshold) {
        alertType = "LOW_STOCK";
      } else if (available > inv.lowStockThreshold * 2) {
        alertType = "OVERSTOCKED"; // Opcional: detectar sobrestoque
      }

      if (alertType) {
        alerts.push({
          productId: inv.productId,
          storeId,
          alertType,
          currentQuantity: available,
          threshold: inv.lowStockThreshold,
          createdAt: new Date(),
          acknowledged: false,
        });

        // Registrar alerta no BD
        await (prisma as any).inventoryAlert.create({
          data: {
            productId: inv.productId,
            storeId,
            alertType,
            currentQuantity: available,
          },
        });
      }
    }

    return alerts;
  }

  /**
   * Relatório de estoque por loja
   */
  async getInventoryReport(
    storeId: string,
    options?: {
      lowStockOnly?: boolean;
      outOfStockOnly?: boolean;
    },
  ): Promise<Array<ProductInventory & { productName: string }>> {
    const inventories = await (prisma as any).productInventory.findMany({
      where: { storeId },
      include: { product: { select: { name: true } } },
    });

    const report = await Promise.all(
      inventories.map(async (inv) => {
        const reserved = await this.getReservedQuantity(inv.productId);
        const available = inv.quantity - reserved;

        // Filtrar se solicitado
        if (options?.lowStockOnly && available >= inv.lowStockThreshold) {
          return null;
        }
        if (options?.outOfStockOnly && available > 0) {
          return null;
        }

        return {
          productId: inv.productId,
          storeId: inv.storeId,
          quantity: inv.quantity,
          reserved,
          available,
          lastRestocked: inv.lastRestocked,
          lowStockThreshold: inv.lowStockThreshold,
          productName: inv.product.name,
        };
      }),
    );

    return report.filter((item): item is NonNullable<typeof item> => item !== null);
  }

  /**
   * Histórico de movimentação de um produto
   */
  async getMovementHistory(
    storeId: string,
    productId: string,
    limit: number = 100,
  ): Promise<InventoryMovement[]> {
    return await prisma.inventoryMovement.findMany({
      where: { storeId, productId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Limpar reservas expiradas (executar via cron)
   */
  async cleanupExpiredReservations(): Promise<number> {
    const deleted = await (prisma as any).stockReservation.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    return deleted.count;
  }

  /**
   * Obter quantidade reservada (helper privado)
   */
  private async getReservedQuantity(productId: string): Promise<number> {
    const reservations = await (prisma as any).stockReservation.findMany({
      where: { productId },
    });

    return reservations.reduce((sum: any, r: any) => sum + r.quantity, 0);
  }
}

/**
 * CASOS DE USO:
 *
 * 1. CRIAR PRODUTO COM ESTOQUE INICIAL:
 *    const inventory = await inventoryService.restockProduct(
 *      "store-123",
 *      "prod-456",
 *      50, // 50 unidades
 *      "admin-789",
 *      "Pedido #PED-001" // referência
 *    );
 *
 * 2. RESERVAR ESTOQUE PARA PEDIDO:
 *    const result = await inventoryService.reserveStock(
 *      "store-123",
 *      "order-123",
 *      [
 *        { productId: "prod-456", quantity: 2 },
 *        { productId: "prod-789", quantity: 1 },
 *      ]
 *    );
 *    if (!result.success) {
 *      return { error: "Produtos indisponíveis" };
 *    }
 *
 * 3. CONSUMIR ESTOQUE (PEDIDO CONFIRMADO):
 *    await inventoryService.consumeStock(
 *      "store-123",
 *      "order-123",
 *      [
 *        { productId: "prod-456", quantity: 2 },
 *        { productId: "prod-789", quantity: 1 },
 *      ]
 *    );
 *
 * 4. CANCELAR PEDIDO (LIBERAR RESERVA):
 *    await inventoryService.releaseReservation("order-123", "admin-789");
 *
 * 5. AJUSTE MANUAL (DANO, PERDA):
 *    await inventoryService.adjustStock(
 *      "store-123",
 *      "prod-456",
 *      -5, // Remover 5 unidades
 *      "Dano na cozinha",
 *      "admin-789"
 *    );
 *
 * 6. DEFINIR ALERTA DE BAIXO ESTOQUE:
 *    await inventoryService.setLowStockThreshold(
 *      "store-123",
 *      "prod-456",
 *      15, // Alerta quando < 15
 *      "admin-789"
 *    );
 *
 * 7. VERIFICAR ALERTAS (CRON):
 *    const alerts = await inventoryService.checkLowStockAlerts("store-123");
 *    if (alerts.length > 0) {
 *      // Enviar notificação ao admin
 *      await notificationService.sendAlert(alerts);
 *    }
 *
 * 8. RELATÓRIO DE ESTOQUE:
 *    const report = await inventoryService.getInventoryReport(
 *      "store-123",
 *      { lowStockOnly: true }
 *    );
 *    // Mostrar produtos com estoque baixo
 *
 * 9. HISTÓRICO DE MOVIMENTAÇÃO:
 *    const history = await inventoryService.getMovementHistory(
 *      "store-123",
 *      "prod-456"
 *    );
 *    // Auditoria: ver todas as entradas/saídas
 *
 * 10. LIMPEZA DE RESERVAS EXPIRADAS (CRON):
 *     const cleaned = await inventoryService.cleanupExpiredReservations();
 *     console.log(`Limpas ${cleaned} reservas expiradas`);
 */
