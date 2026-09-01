import { prisma } from "../db/client";
import { garantirLimite } from "../billing/guarda-de-limite";
import { AuditService } from "./audit-service";

/**
 * PRIORIDADE 7: SOFT DELETE SERVICE
 *
 * Marca registros como deletados (deletedAt != null) sem remover do banco.
 * Permite recuperação e compliance LGPD ("direito ao esquecimento").
 *
 * Todos os queries devem incluir `where: { deletedAt: null }` automaticamente.
 * (Padrão seguro: se foi deletado, não aparece em lugar algum)
 *
 * Exemplo:
 * await softDeleteService.deleteProduct(storeId, productId, adminId, "Saiu do cardápio");
 * // Depois, se precisar restaurar:
 * await softDeleteService.restoreProduct(storeId, productId, adminId);
 */

export interface SoftDeleteInput {
  storeId: string;
  deletedById: string; // Admin ID que está deletando
  reason?: string;
}

export class SoftDeleteService {
  /**
   * Deletar um produto (soft delete)
   */
  static async deleteProduct(
    storeId: string,
    productId: string,
    adminId: string,
    reason?: string,
  ): Promise<void> {
    const product = await prisma.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
      select: { id: true, name: true, basePrice: true },
    });

    if (!product) {
      throw new Error("Produto não encontrado ou já deletado");
    }

    await prisma.product.update({
      where: { id: productId },
      data: {
        deletedAt: new Date(),
        deletedBy: adminId,
      },
    });

    // Auditar a ação
    await AuditService.log({
      storeId,
      userId: adminId,
      action: "DELETE",
      resource: "Product",
      resourceId: productId,
      oldValue: { ...product },
      reason: reason || "Produto deletado",
    });
  }

  /**
   * Restaurar um produto deletado
   */
  static async restoreProduct(
    storeId: string,
    productId: string,
    adminId: string,
  ): Promise<void> {
    const product = await prisma.product.findFirst({
      where: { id: productId, storeId, deletedAt: { not: null } },
      select: { id: true, name: true, deletedAt: true },
    });

    if (!product) {
      throw new Error("Produto não encontrado ou já está ativo");
    }

    /*
     * RESTAURAR É VOLTAR A OCUPAR UMA VAGA, e por isso passa pela mesma cota
     * da criação. Sem isto, uma loja BASIC no teto poderia excluir e
     * restaurar em volta do limite indefinidamente.
     *
     * ⚠️ CAMINHO SEM CHAMADOR HOJE. `deleteProductFn` apaga de verdade
     * (`prisma.product.delete`), então não existe produto com `deletedAt`
     * para restaurar, e nenhuma tela chama este método. A guarda entra agora
     * para que o dia em que o soft delete for ligado não seja o dia em que o
     * limite deixe de valer.
     */
    await prisma.$transaction(async (tx) => {
      await garantirLimite(tx, storeId, "MAX_PRODUTOS");
      await tx.product.update({
        where: { id: productId },
        data: {
          deletedAt: null,
          deletedBy: null,
        },
      });
    });

    // Auditar a restauração
    await AuditService.log({
      storeId,
      userId: adminId,
      action: "UPDATE",
      resource: "Product",
      resourceId: productId,
      oldValue: { deletedAt: product.deletedAt },
      newValue: { deletedAt: null },
      reason: "Produto restaurado",
    });
  }

  /**
   * Deletar um funcionário
   */
  static async deleteEmployee(
    storeId: string,
    employeeId: string,
    adminId: string,
    reason?: string,
  ): Promise<void> {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, storeId, deletedAt: null },
      select: { id: true, name: true, phone: true },
    });

    if (!employee) {
      throw new Error("Funcionário não encontrado ou já deletado");
    }

    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        deletedAt: new Date(),
        deletedBy: adminId,
        isActive: false,
      },
    });

    await AuditService.log({
      storeId,
      userId: adminId,
      action: "DELETE",
      resource: "Employee",
      resourceId: employeeId,
      oldValue: { ...employee },
      reason: reason || "Funcionário desligado",
    });
  }

  /**
   * Deletar um cliente (LGPD: direito ao esquecimento)
   * Mais agressivo: também remove relacionamentos para anonimizar
   */
  static async deleteCustomer(
    storeId: string,
    customerId: string,
    adminId: string,
    reason?: string,
  ): Promise<void> {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId, deletedAt: null },
      select: { id: true, name: true, phone: true, email: true },
    });

    if (!customer) {
      throw new Error("Cliente não encontrado ou já deletado");
    }

    // Anonimizar: remover dados pessoais
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        name: "[Deletado]",
        phone: "", // Deixar vazio para manter unique constraint
        email: null,
        deletedAt: new Date(),
        deletedBy: adminId,
      },
    });

    await AuditService.log({
      storeId,
      userId: adminId,
      action: "DELETE",
      resource: "Customer",
      resourceId: customerId,
      oldValue: { ...customer },
      reason: reason || "LGPD: cliente exerceu direito ao esquecimento",
    });
  }

  /**
   * Restaurar cliente (se solicitação foi acidental)
   */
  static async restoreCustomer(
    storeId: string,
    customerId: string,
    adminId: string,
  ): Promise<void> {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId, deletedAt: { not: null } },
    });

    if (!customer) {
      throw new Error("Cliente não encontrado ou já está ativo");
    }

    // Nota: dados pessoais foram anonimizados, não conseguimos restaurar
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        deletedAt: null,
        deletedBy: null,
      },
    });

    await AuditService.log({
      storeId,
      userId: adminId,
      action: "UPDATE",
      resource: "Customer",
      resourceId: customerId,
      reason: "Cliente restaurado (dados pessoais não podem ser recuperados)",
    });
  }

  /**
   * Deletar um cupom
   */
  static async deleteCoupon(
    storeId: string,
    couponId: string,
    adminId: string,
    reason?: string,
  ): Promise<void> {
    const coupon = await prisma.coupon.findFirst({
      where: { id: couponId, storeId, deletedAt: null },
      select: { id: true, code: true },
    });

    if (!coupon) {
      throw new Error("Cupom não encontrado ou já deletado");
    }

    await prisma.coupon.update({
      where: { id: couponId },
      data: {
        deletedAt: new Date(),
        deletedBy: adminId,
        isActive: false,
      },
    });

    await AuditService.log({
      storeId,
      userId: adminId,
      action: "DELETE",
      resource: "Coupon",
      resourceId: couponId,
      oldValue: { code: coupon.code },
      reason: reason || "Cupom deletado",
    });
  }

  /**
   * Listar itens deletados (para auditoria ou recuperação)
   */
  static async listDeletedProducts(storeId: string, limit: number = 100) {
    return prisma.product.findMany({
      where: {
        storeId,
        deletedAt: { not: null },
      },
      orderBy: { deletedAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        deletedAt: true,
        deletedBy: true,
      },
    });
  }

  static async listDeletedEmployees(storeId: string, limit: number = 100) {
    return prisma.employee.findMany({
      where: {
        storeId,
        deletedAt: { not: null },
      },
      orderBy: { deletedAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        phone: true,
        deletedAt: true,
        deletedBy: true,
      },
    });
  }

  static async listDeletedCustomers(storeId: string, limit: number = 100) {
    return prisma.customer.findMany({
      where: {
        storeId,
        deletedAt: { not: null },
      },
      orderBy: { deletedAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        deletedAt: true,
        deletedBy: true,
      },
    });
  }

  /**
   * Esvaziar trash (deletar permanentemente)
   * ⚠️ IRREVERSÍVEL — use com cuidado
   */
  static async purgeDeletedItems(
    storeId: string,
    resource: "Product" | "Employee" | "Customer" | "Coupon",
    olderThanDays: number = 30,
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let deletedCount = 0;

    if (resource === "Product") {
      const result = await prisma.product.deleteMany({
        where: {
          storeId,
          deletedAt: { lte: cutoffDate },
        },
      });
      deletedCount = result.count;
    } else if (resource === "Employee") {
      const result = await prisma.employee.deleteMany({
        where: {
          storeId,
          deletedAt: { lte: cutoffDate },
        },
      });
      deletedCount = result.count;
    } else if (resource === "Customer") {
      const result = await prisma.customer.deleteMany({
        where: {
          storeId,
          deletedAt: { lte: cutoffDate },
        },
      });
      deletedCount = result.count;
    } else if (resource === "Coupon") {
      const result = await prisma.coupon.deleteMany({
        where: {
          storeId,
          deletedAt: { lte: cutoffDate },
        },
      });
      deletedCount = result.count;
    }

    return deletedCount;
  }
}

/**
 * PADRÃO SEGURO EM QUERIES:
 *
 * ❌ Inseguro (retorna deletados):
 * const products = await prisma.product.findMany({ where: { storeId } });
 *
 * ✅ Seguro (exclui deletados):
 * const products = await prisma.product.findMany({
 *   where: { storeId, deletedAt: null }
 * });
 *
 * 💡 Dica: criar um helper para sempre incluir deletedAt: null
 *
 * export const findActiveProducts = (storeId: string) =>
 *   prisma.product.findMany({
 *     where: { storeId, deletedAt: null }
 *   });
 */
