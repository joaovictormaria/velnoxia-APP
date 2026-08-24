import { prisma } from "../db/client";

/**
 * PRIORIDADE 6: AUDIT LOG SERVICE
 *
 * Registra todas as mudanças críticas para compliance (LGPD, PCI), debugging e forensics.
 * Imutável: AuditLog nunca é editado ou deletado.
 *
 * Exemplo:
 * await auditService.log({
 *   storeId: "store-123",
 *   userId: "admin-456",
 *   action: "UPDATE",
 *   resource: "Product",
 *   resourceId: "prod-789",
 *   oldValue: { price: 25.00 },
 *   newValue: { price: 29.99 },
 *   ipAddress: "192.168.1.1",
 *   reason: "Ajuste de preço semanal"
 * });
 */

export interface AuditLogInput {
  storeId: string;
  userId?: string;
  userEmail?: string;
  isSystem?: boolean;
  ipAddress?: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "EXPORT" | "IMPORT" | "REFUND" | "WEBHOOK" | string;
  resource: string; // "Product", "Order", "Employee", "Store", etc
  resourceId: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  reason?: string;
}

export interface AuditLogFilter {
  storeId: string;
  action?: string;
  resource?: string;
  userId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export class AuditService {
  /**
   * Registrar uma mudança no audit log.
   * Sempre usa a data do servidor (NOW), nunca do cliente.
   */
  static async log(input: AuditLogInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          storeId: input.storeId,
          userId: input.userId,
          userEmail: input.userEmail,
          isSystem: input.isSystem ?? false,
          ipAddress: input.ipAddress,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId,
          oldValue: input.oldValue ? JSON.stringify(input.oldValue) : null,
          newValue: input.newValue ? JSON.stringify(input.newValue) : null,
          reason: input.reason,
          status: "SUCCESS",
        },
      });
    } catch (error) {
      // Log falhou — log o erro mas não falha a operação
      console.error("Failed to write audit log:", error);
      // Poderia alertar monitoring aqui
    }
  }

  /**
   * Registrar erro de operação no audit log.
   */
  static async logError(
    input: AuditLogInput,
    error: unknown,
  ): Promise<void> {
    try {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await prisma.auditLog.create({
        data: {
          storeId: input.storeId,
          userId: input.userId,
          userEmail: input.userEmail,
          isSystem: input.isSystem ?? false,
          ipAddress: input.ipAddress,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId,
          oldValue: input.oldValue ? JSON.stringify(input.oldValue) : null,
          newValue: input.newValue ? JSON.stringify(input.newValue) : null,
          reason: input.reason,
          status: "FAILED",
          errorMessage: errorMessage.substring(0, 500), // Limitar tamanho
        },
      });
    } catch (err) {
      console.error("Failed to write error audit log:", err);
    }
  }

  /**
   * Buscar logs de auditoria (para dashboard ou investigação).
   */
  static async query(filter: AuditLogFilter) {
    const logs = await prisma.auditLog.findMany({
      where: {
        storeId: filter.storeId,
        action: filter.action,
        resource: filter.resource,
        userId: filter.userId,
        createdAt: {
          gte: filter.fromDate,
          lte: filter.toDate,
        },
      },
      orderBy: { createdAt: "desc" },
      take: filter.limit ?? 100,
      skip: filter.offset ?? 0,
    });

    return logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      userEmail: log.userEmail,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      oldValue: log.oldValue ? JSON.parse(log.oldValue) : null,
      newValue: log.newValue ? JSON.parse(log.newValue) : null,
      reason: log.reason,
      status: log.status,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    }));
  }

  /**
   * Relatar mudanças para um admin (últimas 24h).
   */
  static async getDayReport(storeId: string) {
    const from = new Date();
    from.setHours(from.getHours() - 24);

    const logs = await prisma.auditLog.findMany({
      where: {
        storeId,
        createdAt: { gte: from },
      },
      orderBy: { createdAt: "desc" },
    });

    // Agrupar por ação
    const byAction = logs.reduce(
      (acc, log) => {
        if (!acc[log.action]) acc[log.action] = [];
        acc[log.action].push(log);
        return acc;
      },
      {} as Record<string, typeof logs>,
    );

    // Agrupar por recurso
    const byResource = logs.reduce(
      (acc, log) => {
        if (!acc[log.resource]) acc[log.resource] = [];
        acc[log.resource].push(log);
        return acc;
      },
      {} as Record<string, typeof logs>,
    );

    return {
      totalChanges: logs.length,
      byAction,
      byResource,
      logs,
    };
  }

  /**
   * Extrair mudanças de um objeto (para registrar delta).
   * Útil quando você tem estado anterior e novo.
   */
  static extractChanges<T extends Record<string, any>>(
    oldValue: T | null,
    newValue: T | null,
  ): { oldValue?: T; newValue?: T; changed: boolean } {
    if (!oldValue && !newValue) return { changed: false };
    if (!oldValue) return { newValue: newValue || undefined, changed: true };
    if (!newValue) return { oldValue, changed: true };

    // Comparar shallow (não recursivo)
    const keys = new Set([
      ...Object.keys(oldValue),
      ...Object.keys(newValue),
    ]);
    let changed = false;

    for (const key of keys) {
      if (oldValue[key] !== newValue[key]) {
        changed = true;
        break;
      }
    }

    return {
      oldValue: changed ? oldValue : undefined,
      newValue: changed ? newValue : undefined,
      changed,
    };
  }

  /**
   * Compliance: listar todas as mudanças de um recurso específico.
   * Útil para LGPD ("direito ao esquecimento") e PCI (auditoria de pagamentos).
   */
  static async getResourceHistory(
    storeId: string,
    resource: string,
    resourceId: string,
  ) {
    const logs = await prisma.auditLog.findMany({
      where: {
        storeId,
        resource,
        resourceId,
      },
      orderBy: { createdAt: "asc" }, // Ordem cronológica
    });

    return logs.map((log) => ({
      createdAt: log.createdAt,
      action: log.action,
      userId: log.userId,
      userEmail: log.userEmail,
      oldValue: log.oldValue ? JSON.parse(log.oldValue) : null,
      newValue: log.newValue ? JSON.parse(log.newValue) : null,
      reason: log.reason,
      status: log.status,
    }));
  }

  /**
   * Compliance: listar todas as ações de um usuário.
   * Útil para investigar atividades suspeitas.
   */
  static async getUserActivity(storeId: string, userId: string) {
    const logs = await prisma.auditLog.findMany({
      where: {
        storeId,
        userId,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    return logs;
  }

  /**
   * Compliance: detectar padrões suspeitos (muitas deletes, etc).
   */
  static async detectAnomalies(storeId: string, hoursBack: number = 24) {
    const from = new Date();
    from.setHours(from.getHours() - hoursBack);

    const logs = await prisma.auditLog.findMany({
      where: {
        storeId,
        createdAt: { gte: from },
        action: "DELETE",
      },
    });

    return {
      deleteCount: logs.length,
      isAnomaly: logs.length > 10, // Threshold: > 10 deletes em 24h
      logs,
    };
  }
}

/**
 * CASOS DE USO:
 *
 * 1. CRIAR PRODUTO:
 *    await auditService.log({
 *      storeId, userId, action: "CREATE", resource: "Product",
 *      resourceId: product.id, newValue: product, reason: "Novo item de menu"
 *    });
 *
 * 2. EDITAR PREÇO:
 *    const oldPrice = { price: 25.00 };
 *    const newPrice = { price: 29.99 };
 *    await auditService.log({
 *      storeId, userId, action: "UPDATE", resource: "Product",
 *      resourceId: productId, oldValue: oldPrice, newValue: newPrice
 *    });
 *
 * 3. DELETAR FUNCIONÁRIO:
 *    await auditService.log({
 *      storeId, userId, action: "DELETE", resource: "Employee",
 *      resourceId: employeeId, oldValue: employee,
 *      reason: "Funcionário desligado"
 *    });
 *
 * 4. WEBHOOK DO STRIPE:
 *    await auditService.log({
 *      storeId, isSystem: true, action: "WEBHOOK", resource: "Subscription",
 *      resourceId: subscriptionId, newValue: stripeEvent,
 *      reason: "Stripe webhook: subscription.updated"
 *    });
 *
 * 5. REFUND:
 *    await auditService.log({
 *      storeId, userId, action: "REFUND", resource: "Order",
 *      resourceId: orderId, oldValue: { total: 100 }, newValue: { total: 0 },
 *      reason: "Cliente solicitou reembolso"
 *    });
 *
 * 6. INVESTIGAÇÃO DE ANOMALIA:
 *    const activity = await auditService.getUserActivity(storeId, suspiciousUserId);
 *    const anomalies = await auditService.detectAnomalies(storeId, 24);
 *
 * 7. COMPLIANCE LGPD (direito ao esquecimento):
 *    const history = await auditService.getResourceHistory(storeId, "Customer", customerId);
 *    // Deletar customer e registrar: await deleteCustomer(customerId, "LGPD request");
 */
