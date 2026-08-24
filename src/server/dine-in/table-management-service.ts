import { prisma } from "../db/client";
import { AuditService } from "../audit/audit-service";

/**
 * PRIORIDADE 13: DINE-IN AVANÇADO
 *
 * Gerenciamento completo de mesas com status, histórico,
 * integração com comanda e analytics de ocupação.
 *
 * Status de mesa:
 * - EMPTY: Vazia (pronta para uso)
 * - OCCUPIED: Ocupada (cliente sentado, pedido em andamento)
 * - WAITING: Aguardando (pedido confirmado, cozinha preparando)
 * - SERVED: Servido (comida na mesa, cliente comendo)
 * - CALLING: Chamando (cliente sinalizou garçom)
 * - PAYING: Pagando (cliente revisando conta)
 * - CLEANING: Limpando (após cliente sair)
 *
 * Fluxo típico:
 * EMPTY → OCCUPIED → WAITING → SERVED → PAYING → CLEANING → EMPTY
 *
 * Modelos:
 * - Table: Mesa (número, QR code, capacidade)
 * - TableOccupancy: Histórico de ocupação (entrada/saída, duração)
 * - TableOrder: Vínculo mesa ↔ pedido
 * - TableStatus: Status atual com timestamps
 */

export enum TableStatus {
  EMPTY = "EMPTY",
  OCCUPIED = "OCCUPIED",
  WAITING = "WAITING",
  SERVED = "SERVED",
  CALLING = "CALLING",
  PAYING = "PAYING",
  CLEANING = "CLEANING",
}

export interface TableStateInfo {
  tableId: string;
  number: number;
  status: TableStatus;
  capacity: number;
  isActive: boolean;
  currentOrderId?: string;
  occupiedSince?: Date;
  occupancyDurationMinutes?: number;
  lastStatusChangeAt: Date;
  notes?: string;
}

export interface TableOccupancyRecord {
  id: string;
  tableId: string;
  storeId: string;
  checkInAt: Date;
  checkOutAt?: Date;
  durationMinutes?: number;
  customerId?: string;
  ordersCount: number;
  totalSpent?: number;
  cleanedBy?: string;
  cleanedAt?: Date;
}

export interface TableAnalytics {
  totalTables: number;
  emptyTables: number;
  occupiedTables: number;
  occupancyRate: number; // 0-100%
  averageOccupancyDuration: number; // minutos
  averageOrdersPerTable: number;
  peakHour?: string;
  tablesNeedingCleaning: number;
}

export class TableManagementService {
  /**
   * Obter estado atual de uma mesa
   */
  async getTableState(storeId: string, tableId: string): Promise<TableStateInfo | null> {
    const table = await prisma.table.findFirst({
      where: { id: tableId, storeId, deletedAt: null },
      include: { orders: { where: { status: { not: "CANCELLED" } } } },
    });

    if (!table) {
      return null;
    }

    // Buscar ocupação atual
    const currentOccupancy = await prisma.tableOccupancy.findFirst({
      where: { tableId, checkOutAt: null },
      orderBy: { checkInAt: "desc" },
    });

    // Calcular duração se ocupado
    let occupancyDurationMinutes: number | undefined;
    if (currentOccupancy) {
      occupancyDurationMinutes = Math.floor(
        (Date.now() - currentOccupancy.checkInAt.getTime()) / 60000,
      );
    }

    const lastOrder = table.orders[0];

    return {
      tableId: table.id,
      number: table.number,
      status: table.status as TableStatus,
      capacity: table.capacity || 4,
      isActive: table.deletedAt === null,
      currentOrderId: lastOrder?.id,
      occupiedSince: currentOccupancy?.checkInAt,
      occupancyDurationMinutes,
      lastStatusChangeAt: table.updatedAt,
      notes: table.notes,
    };
  }

  /**
   * Ocupar mesa (cliente chega e senta)
   */
  async occupyTable(
    storeId: string,
    tableId: string,
    customerId?: string,
    adminId?: string,
  ): Promise<TableStateInfo> {
    const table = await prisma.table.findFirst({
      where: { id: tableId, storeId, deletedAt: null },
    });

    if (!table) {
      throw new Error("Mesa não encontrada");
    }

    if (table.status !== TableStatus.EMPTY) {
      throw new Error(`Mesa não está vazia. Status atual: ${table.status}`);
    }

    // Atualizar mesa para OCCUPIED
    await prisma.table.update({
      where: { id: tableId },
      data: {
        status: TableStatus.OCCUPIED,
        notes: customerId ? `Cliente: ${customerId}` : undefined,
      },
    });

    // Registrar ocupação
    await prisma.tableOccupancy.create({
      data: {
        tableId,
        storeId,
        customerId,
      },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: adminId || "system",
      action: "OCCUPY_TABLE",
      resource: "Table",
      resourceId: tableId,
      newValue: { status: TableStatus.OCCUPIED, customerId },
      reason: "Mesa ocupada",
    });

    return this.getTableState(storeId, tableId) as Promise<TableStateInfo>;
  }

  /**
   * Mudar status de uma mesa
   */
  async changeTableStatus(
    storeId: string,
    tableId: string,
    newStatus: TableStatus,
    adminId: string,
    reason?: string,
  ): Promise<TableStateInfo> {
    const table = await prisma.table.findFirst({
      where: { id: tableId, storeId, deletedAt: null },
    });

    if (!table) {
      throw new Error("Mesa não encontrada");
    }

    const oldStatus = table.status;

    // Validar transição
    if (!this.isValidStatusTransition(oldStatus as TableStatus, newStatus)) {
      throw new Error(
        `Transição inválida: ${oldStatus} → ${newStatus}`,
      );
    }

    // Atualizar status
    await prisma.table.update({
      where: { id: tableId },
      data: { status: newStatus },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: adminId,
      action: "CHANGE_TABLE_STATUS",
      resource: "Table",
      resourceId: tableId,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus },
      reason: reason || `Mudança de status: ${oldStatus} → ${newStatus}`,
    });

    return this.getTableState(storeId, tableId) as Promise<TableStateInfo>;
  }

  /**
   * Liberar mesa (cliente sai e mesa vai para limpeza)
   */
  async releaseTable(
    storeId: string,
    tableId: string,
    adminId: string,
  ): Promise<TableStateInfo> {
    const table = await prisma.table.findFirst({
      where: { id: tableId, storeId, deletedAt: null },
    });

    if (!table) {
      throw new Error("Mesa não encontrada");
    }

    const occupancy = await prisma.tableOccupancy.findFirst({
      where: { tableId, checkOutAt: null },
      orderBy: { checkInAt: "desc" },
    });

    if (occupancy) {
      const durationMinutes = Math.floor(
        (Date.now() - occupancy.checkInAt.getTime()) / 60000,
      );

      // Registrar check-out
      await prisma.tableOccupancy.update({
        where: { id: occupancy.id },
        data: {
          checkOutAt: new Date(),
          durationMinutes,
        },
      });
    }

    // Mudar para CLEANING
    await prisma.table.update({
      where: { id: tableId },
      data: {
        status: TableStatus.CLEANING,
        notes: undefined,
      },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: adminId,
      action: "RELEASE_TABLE",
      resource: "Table",
      resourceId: tableId,
      newValue: {
        status: TableStatus.CLEANING,
        durationMinutes: occupancy?.durationMinutes,
      },
      reason: "Mesa liberada e direcionada para limpeza",
    });

    return this.getTableState(storeId, tableId) as Promise<TableStateInfo>;
  }

  /**
   * Marcar mesa como limpa e pronta
   */
  async markTableCleaned(
    storeId: string,
    tableId: string,
    cleanedBy: string,
  ): Promise<TableStateInfo> {
    const table = await prisma.table.findFirst({
      where: { id: tableId, storeId, deletedAt: null },
    });

    if (!table) {
      throw new Error("Mesa não encontrada");
    }

    const occupancy = await prisma.tableOccupancy.findFirst({
      where: { tableId, checkOutAt: { not: null }, cleanedAt: null },
      orderBy: { checkOutAt: "desc" },
    });

    if (occupancy) {
      await prisma.tableOccupancy.update({
        where: { id: occupancy.id },
        data: {
          cleanedAt: new Date(),
          cleanedBy,
        },
      });
    }

    // Volta para EMPTY
    await prisma.table.update({
      where: { id: tableId },
      data: { status: TableStatus.EMPTY },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: cleanedBy,
      action: "MARK_TABLE_CLEANED",
      resource: "Table",
      resourceId: tableId,
      newValue: { status: TableStatus.EMPTY },
      reason: "Mesa limpa e pronta para novo cliente",
    });

    return this.getTableState(storeId, tableId) as Promise<TableStateInfo>;
  }

  /**
   * Vincular mesa a um pedido
   */
  async linkOrderToTable(
    storeId: string,
    tableId: string,
    orderId: string,
    adminId: string,
  ): Promise<void> {
    const table = await prisma.table.findFirst({
      where: { id: tableId, storeId, deletedAt: null },
    });

    if (!table) {
      throw new Error("Mesa não encontrada");
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, storeId, deletedAt: null },
    });

    if (!order) {
      throw new Error("Pedido não encontrado");
    }

    // Atualizar pedido com tableId
    await prisma.order.update({
      where: { id: orderId },
      data: { tableId },
    });

    // Auditar
    await AuditService.log({
      storeId,
      userId: adminId,
      action: "LINK_ORDER_TABLE",
      resource: "Order",
      resourceId: orderId,
      newValue: { tableId },
      reason: `Pedido vinculado à mesa ${table.number}`,
    });
  }

  /**
   * Chamar garçom (mesa sinaliza necessidade)
   */
  async callWaiter(
    storeId: string,
    tableId: string,
  ): Promise<TableStateInfo> {
    const table = await prisma.table.findFirst({
      where: { id: tableId, storeId, deletedAt: null },
    });

    if (!table) {
      throw new Error("Mesa não encontrada");
    }

    await prisma.table.update({
      where: { id: tableId },
      data: { status: TableStatus.CALLING },
    });

    // Auditar como ação de sistema
    await AuditService.log({
      storeId,
      userId: "customer", // Sinal do cliente
      action: "CALL_WAITER",
      resource: "Table",
      resourceId: tableId,
      newValue: { status: TableStatus.CALLING },
      reason: "Cliente sinalizou necessidade de atendimento",
    });

    return this.getTableState(storeId, tableId) as Promise<TableStateInfo>;
  }

  /**
   * Obter todas as mesas de uma loja com status
   */
  async getAllTablesStatus(storeId: string): Promise<TableStateInfo[]> {
    const tables = await prisma.table.findMany({
      where: { storeId, deletedAt: null },
      orderBy: { number: "asc" },
    });

    const statuses = await Promise.all(
      tables.map((table) =>
        this.getTableState(storeId, table.id),
      ),
    );

    return statuses.filter((s): s is TableStateInfo => s !== null);
  }

  /**
   * Obter mesas que precisam limpeza
   */
  async getTablesNeedingCleaning(storeId: string): Promise<TableStateInfo[]> {
    const tables = await prisma.table.findMany({
      where: {
        storeId,
        status: TableStatus.CLEANING,
        deletedAt: null,
      },
      orderBy: { updatedAt: "asc" }, // Ordem de prioridade
    });

    const statuses = await Promise.all(
      tables.map((table) =>
        this.getTableState(storeId, table.id),
      ),
    );

    return statuses.filter((s): s is TableStateInfo => s !== null);
  }

  /**
   * Calcular analytics de ocupação
   */
  async getTableAnalytics(
    storeId: string,
    hoursBack: number = 24,
  ): Promise<TableAnalytics> {
    const tables = await prisma.table.findMany({
      where: { storeId, deletedAt: null },
    });

    const occupancies = await prisma.tableOccupancy.findMany({
      where: {
        storeId,
        checkInAt: {
          gte: new Date(Date.now() - hoursBack * 60 * 60 * 1000),
        },
      },
    });

    const emptyTables = tables.filter((t) => t.status === TableStatus.EMPTY).length;
    const occupiedTables = tables.filter((t) =>
      [TableStatus.OCCUPIED, TableStatus.WAITING, TableStatus.SERVED].includes(
        t.status as TableStatus,
      ),
    ).length;

    const occupancyRate = tables.length > 0 ? (occupiedTables / tables.length) * 100 : 0;

    const totalDuration = occupancies.reduce((sum, occ) => sum + (occ.durationMinutes || 0), 0);
    const averageDuration = occupancies.length > 0 ? totalDuration / occupancies.length : 0;

    const totalOrders = occupancies.reduce((sum, occ) => sum + (occ.ordersCount || 0), 0);
    const averageOrders = occupancies.length > 0 ? totalOrders / occupancies.length : 0;

    const cleaningTables = tables.filter((t) => t.status === TableStatus.CLEANING).length;

    return {
      totalTables: tables.length,
      emptyTables,
      occupiedTables,
      occupancyRate,
      averageOccupancyDuration: Math.round(averageDuration),
      averageOrdersPerTable: Math.round(averageOrders * 10) / 10,
      tablesNeedingCleaning: cleaningTables,
    };
  }

  /**
   * Histórico de ocupação de uma mesa
   */
  async getTableHistory(
    storeId: string,
    tableId: string,
    limit: number = 50,
  ): Promise<TableOccupancyRecord[]> {
    const occupancies = await prisma.tableOccupancy.findMany({
      where: { storeId, tableId },
      orderBy: { checkInAt: "desc" },
      take: limit,
    });

    return occupancies.map((occ) => ({
      id: occ.id,
      tableId: occ.tableId,
      storeId: occ.storeId,
      checkInAt: occ.checkInAt,
      checkOutAt: occ.checkOutAt || undefined,
      durationMinutes: occ.durationMinutes || undefined,
      customerId: occ.customerId || undefined,
      ordersCount: occ.ordersCount || 0,
      totalSpent: occ.totalSpent || undefined,
      cleanedBy: occ.cleanedBy || undefined,
      cleanedAt: occ.cleanedAt || undefined,
    }));
  }

  /**
   * Validar transição de status (máquina de estados)
   */
  private isValidStatusTransition(from: TableStatus, to: TableStatus): boolean {
    const validTransitions: Record<TableStatus, TableStatus[]> = {
      [TableStatus.EMPTY]: [TableStatus.OCCUPIED, TableStatus.CLEANING],
      [TableStatus.OCCUPIED]: [
        TableStatus.WAITING,
        TableStatus.CALLING,
        TableStatus.PAYING,
      ],
      [TableStatus.WAITING]: [
        TableStatus.SERVED,
        TableStatus.CALLING,
        TableStatus.OCCUPIED,
      ],
      [TableStatus.SERVED]: [TableStatus.CALLING, TableStatus.PAYING, TableStatus.OCCUPIED],
      [TableStatus.CALLING]: [
        TableStatus.OCCUPIED,
        TableStatus.WAITING,
        TableStatus.SERVED,
        TableStatus.PAYING,
      ],
      [TableStatus.PAYING]: [TableStatus.CLEANING, TableStatus.EMPTY],
      [TableStatus.CLEANING]: [TableStatus.EMPTY],
    };

    return validTransitions[from]?.includes(to) || false;
  }
}

/**
 * CASOS DE USO:
 *
 * 1. CLIENTE CHEGA E SENTA:
 *    await tableService.occupyTable("store-123", "table-001", "customer-456");
 *
 * 2. CRIAR PEDIDO PARA MESA:
 *    const order = await orderService.createOrder({...});
 *    await tableService.linkOrderToTable("store-123", "table-001", order.id, "admin");
 *    await tableService.changeTableStatus("store-123", "table-001", "WAITING", "admin");
 *
 * 3. COMIDA PRONTA (MUDAR PARA SERVED):
 *    await tableService.changeTableStatus(
 *      "store-123",
 *      "table-001",
 *      "SERVED",
 *      "admin",
 *      "Comida servida"
 *    );
 *
 * 4. CLIENTE CHAMA GARÇOM:
 *    await tableService.callWaiter("store-123", "table-001");
 *
 * 5. CLIENTE PEDE CONTA (PAYING):
 *    await tableService.changeTableStatus(
 *      "store-123",
 *      "table-001",
 *      "PAYING",
 *      "admin"
 *    );
 *
 * 6. CLIENTE SAI (LIMPEZA):
 *    await tableService.releaseTable("store-123", "table-001", "admin");
 *
 * 7. GARÇOM MARCA COMO LIMPO:
 *    await tableService.markTableCleaned("store-123", "table-001", "waiter-789");
 *
 * 8. VISUALIZAR STATUS DE TODAS MESAS:
 *    const allTables = await tableService.getAllTablesStatus("store-123");
 *    // Mostrar no display de cozinha/bar
 *
 * 9. MESAS CHAMANDO:
 *    const calling = allTables.filter(t => t.status === "CALLING");
 *
 * 10. MESAS PRECISANDO LIMPEZA:
 *     const cleaning = await tableService.getTablesNeedingCleaning("store-123");
 *     // Notificar faxineiro
 *
 * 11. ANALYTICS:
 *     const analytics = await tableService.getTableAnalytics("store-123");
 *     // Taxa ocupação: 75%
 *     // Tempo médio: 45 min
 *     // Mesas para limpar: 2
 *
 * 12. HISTÓRICO DE MESA:
 *     const history = await tableService.getTableHistory("store-123", "table-001");
 *     // Ver fluxo de ocupação ao longo do dia
 */
