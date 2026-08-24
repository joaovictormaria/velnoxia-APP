import { prisma } from "../db/client";

/**
 * PRIORIDADE 3: MULTI-TENANT SECURITY
 *
 * Garante isolamento total entre lojas. Loja A nunca acessa dados de Loja B.
 * Valida storeId em TODAS as queries, rejeita IDs manipulados.
 *
 * Usar em toda server function e repository query:
 *
 * const valid = await MultiTenantValidator.validateAccess(adminId, storeId);
 * if (!valid) return { ok: false, error: "Não autorizado" };
 */

export class MultiTenantValidator {
  /**
   * Verificar se admin pode acessar essa loja
   * Retorna false se:
   * - Admin não existe
   * - Admin não é dono/gerente da loja
   * - Admin está desativado
   */
  static async validateAccess(adminId: string, storeId: string): Promise<boolean> {
    const admin = await prisma.adminUser.findFirst({
      where: {
        id: adminId,
        storeId, // ← CRÍTICO: filtro por storeId
        isActive: true,
        // OWNER e MANAGER podem acessar; COURIER não
        role: { in: ["OWNER", "MANAGER"] },
      },
      select: { id: true },
    });

    return !!admin;
  }

  /**
   * Obter storeId do admin para garantir que ele só acessa a própria loja
   */
  static async getAdminStoreId(adminId: string): Promise<string | null> {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { storeId: true },
    });

    return admin?.storeId ?? null;
  }

  /**
   * Validar que um recurso pertence à loja correta antes de deletar/editar
   * Exemplos: produto, categoria, funcionário, etc
   */
  static async validateResourceOwnership(
    resourceId: string,
    storeId: string,
    model: "Product" | "Category" | "Employee" | "Table" | "Coupon" | "Store",
  ): Promise<boolean> {
    const resource = await (prisma as any)[model.toLowerCase()].findFirst({
      where: {
        id: resourceId,
        storeId, // ← CRÍTICO: validar storeId
      },
      select: { id: true },
    } as any);

    return !!resource;
  }

  /**
   * Garantir que uma query retorna apenas dados da loja
   * Use no final de queries para double-check
   */
  static async validateQueryResults<T extends { storeId: string }>(
    results: T[],
    expectedStoreId: string,
  ): Promise<boolean> {
    // Verificar que TODOS os resultados pertencem à loja correta
    return results.every((item) => item.storeId === expectedStoreId);
  }

  /**
   * Middleware-like: validar storeId no contexto
   * Usar em server functions para garantir que data.storeId não foi manipulado
   */
  static validateStoreIdParameter(providedStoreId: string, adminStoreId: string): boolean {
    // NUNCA confiar em storeId do cliente — sempre obter do admin logado
    return providedStoreId === adminStoreId;
  }
}

/**
 * CHECKLIST DE MULTI-TENANT SAFETY
 *
 * ✅ Todas as queries têm `where: { storeId }`
 * ✅ Recursos são validados antes de editar/deletar
 * ✅ Admin nunca consegue acessar storeId diferente da própria
 * ✅ IDs manipulados na URL são ignorados
 * ✅ Logging inclui storeId para rastrear
 * ✅ APIs públicas validam ownership
 *
 * PADRÃO SEGURO EM SERVER FUNCTION:
 *
 * export const deleteProductFn = createServerFn({ method: "POST" })
 *   .validator(z.object({ productId: z.string(), storeSlug: z.string() }))
 *   .handler(async ({ data }) => {
 *     const admin = await requireAdminSession();
 *     const store = await getStoreBySlug(data.storeSlug);
 *
 *     // 1. Verificar que admin pode acessar essa loja
 *     const canAccess = await MultiTenantValidator.validateAccess(admin.id, store.id);
 *     if (!canAccess) {
 *       return { ok: false, error: "Não autorizado" };
 *     }
 *
 *     // 2. Verificar que produto pertence a essa loja
 *     const owns = await MultiTenantValidator.validateResourceOwnership(
 *       data.productId,
 *       store.id,
 *       "Product"
 *     );
 *     if (!owns) {
 *       return { ok: false, error: "Produto não encontrado" };
 *     }
 *
 *     // 3. Deletar com storeId no where
 *     await prisma.product.delete({
 *       where: {
 *         id: data.productId,
 *         storeId: store.id // ← sempre incluir
 *       }
 *     });
 *
 *     return { ok: true };
 *   });
 */

/**
 * QUERIES QUE VIOLAM MULTI-TENANT (INSEGURAS):
 *
 * ❌ prisma.product.findUnique({ where: { id } })
 *    → Alguém poderia passar qualquer ID e acessar
 *
 * ❌ prisma.order.findMany({})
 *    → Retorna pedidos de todas as lojas
 *
 * ❌ prisma.employee.findMany({ where: { name: "João" } })
 *    → Encontra Joãos de qualquer loja
 *
 * QUERIES SEGURAS:
 *
 * ✅ prisma.product.findUnique({ where: { id, storeId } })
 *    → Garante que o produto pertence à loja
 *
 * ✅ prisma.product.findFirst({
 *      where: { id, storeId }
 *    })
 *    → Fallback se não tem unique compound
 *
 * ✅ prisma.order.findMany({ where: { storeId } })
 *    → Apenas da loja
 *
 * ✅ prisma.employee.findMany({
 *      where: { storeId, name: "João" }
 *    })
 *    → Joãos apenas desta loja
 */

/**
 * AUDITORIA DE QUERIES EXISTENTES
 *
 * Grep para encontrar queries perigosas:
 *
 * grep -r "prisma\.\w\+\.find" src/server
 *
 * Verificar cada uma e garantir que:
 * 1. Tem `storeId` no where
 * 2. Admin foi validado antes
 * 3. Resultado foi validado depois
 */
