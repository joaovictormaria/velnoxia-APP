import { prisma } from "../db/client";

/**
 * PRIORIDADE 2: ENTITLEMENTS LAYER
 *
 * Decide quais recursos cada plano pode usar, sem ifs espalhados pelo código.
 * Centraliza lógica de "você pode fazer isso?" em um único lugar.
 *
 * Exemplo de uso:
 * const { canAddProduct, remaining } = await entitlements.canAddProduct(storeId);
 * if (!canAddProduct) {
 *   return { ok: false, error: "Limite de produtos atingido" };
 * }
 */

export enum PlanType {
  TRIAL = "TRIAL",
  STARTER = "STARTER",
  BUSINESS = "BUSINESS",
  ENTERPRISE = "ENTERPRISE",
}

export interface PlanLimits {
  type: PlanType;
  name: string;
  maxProducts: number;
  maxEmployees: number;
  maxCategories: number;
  maxCoupons: number;
  hasDelivery: boolean;
  hasInventory: boolean;
  hasPublicAPI: boolean;
  hasTeamMembers: boolean;
  maxTeamMembers?: number;
  price: number; // em centavos
}

const PLANS: Record<PlanType, PlanLimits> = {
  [PlanType.TRIAL]: {
    type: PlanType.TRIAL,
    name: "Trial",
    maxProducts: 50,
    maxEmployees: 3,
    maxCategories: 5,
    maxCoupons: 5,
    hasDelivery: true,
    hasInventory: false,
    hasPublicAPI: false,
    hasTeamMembers: false,
    price: 0,
  },
  [PlanType.STARTER]: {
    type: PlanType.STARTER,
    name: "Starter",
    maxProducts: 100,
    maxEmployees: 10,
    maxCategories: 10,
    maxCoupons: 20,
    hasDelivery: true,
    hasInventory: true,
    hasPublicAPI: false,
    hasTeamMembers: false,
    price: 9900, // R$ 99,00
  },
  [PlanType.BUSINESS]: {
    type: PlanType.BUSINESS,
    name: "Business",
    maxProducts: 500,
    maxEmployees: 50,
    maxCategories: 50,
    maxCoupons: 100,
    hasDelivery: true,
    hasInventory: true,
    hasPublicAPI: true,
    hasTeamMembers: true,
    maxTeamMembers: 5,
    price: 29900, // R$ 299,00
  },
  [PlanType.ENTERPRISE]: {
    type: PlanType.ENTERPRISE,
    name: "Enterprise",
    maxProducts: 99999,
    maxEmployees: 99999,
    maxCategories: 99999,
    maxCoupons: 99999,
    hasDelivery: true,
    hasInventory: true,
    hasPublicAPI: true,
    hasTeamMembers: true,
    maxTeamMembers: 999,
    price: 99900, // R$ 999,00 (negociável)
  },
};

export class EntitlementsService {
  /**
   * Determinar qual plano a loja tem (baseado no status de pagamento)
   */
  static async getPlan(storeId: string): Promise<PlanLimits> {
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { status: true, subscriptionStatus: true },
    });

    // Lógica: qual plano ela tem?
    if (store.status === "TRIAL") {
      return PLANS[PlanType.TRIAL];
    }

    if (store.status !== "ACTIVE") {
      // Sem acesso (SUSPENDED, PAST_DUE)
      return PLANS[PlanType.TRIAL]; // Fallback: limites mais restritos
    }

    // Para simplificar, assumir que todos os ACTIVE pagam BUSINESS
    // Em produção, isso viria de um campo `planType` na Store ou Stripe
    return PLANS[PlanType.BUSINESS];
  }

  /**
   * Pode adicionar um novo produto?
   */
  static async canAddProduct(storeId: string): Promise<{
    canAdd: boolean;
    current: number;
    remaining: number;
    limit: number;
  }> {
    const plan = await this.getPlan(storeId);

    const current = await prisma.product.count({
      where: { storeId, isActive: true },
    });

    const remaining = plan.maxProducts - current;
    const canAdd = remaining > 0;

    return { canAdd, current, remaining, limit: plan.maxProducts };
  }

  /**
   * Pode adicionar um novo funcionário?
   */
  static async canAddEmployee(storeId: string): Promise<{
    canAdd: boolean;
    current: number;
    remaining: number;
    limit: number;
  }> {
    const plan = await this.getPlan(storeId);

    const current = await prisma.employee.count({
      where: { storeId, isActive: true },
    });

    const remaining = plan.maxEmployees - current;
    const canAdd = remaining > 0;

    return { canAdd, current, remaining, limit: plan.maxEmployees };
  }

  /**
   * Pode usar um módulo específico?
   */
  static async hasAccess(storeId: string, feature: keyof PlanLimits): Promise<boolean> {
    const plan = await this.getPlan(storeId);

    const value = plan[feature];

    // Se for booleano
    if (typeof value === "boolean") {
      return value;
    }

    // Se for número, retorna true se > 0
    if (typeof value === "number") {
      return value > 0;
    }

    return false;
  }

  /**
   * Pode acessar API pública? (para integrações)
   */
  static async hasPublicAPI(storeId: string): Promise<boolean> {
    return this.hasAccess(storeId, "hasPublicAPI");
  }

  /**
   * Pode usar estoque?
   */
  static async hasInventory(storeId: string): Promise<boolean> {
    return this.hasAccess(storeId, "hasInventory");
  }

  /**
   * Quantos membros de time pode convidar?
   */
  static async getMaxTeamMembers(storeId: string): Promise<number> {
    const plan = await this.getPlan(storeId);
    return plan.maxTeamMembers ?? 0;
  }

  /**
   * Pode convidar um novo membro de time?
   */
  static async canAddTeamMember(storeId: string): Promise<{
    canAdd: boolean;
    current: number;
    remaining: number;
    limit: number;
  }> {
    const plan = await this.getPlan(storeId);

    if (!plan.hasTeamMembers) {
      return { canAdd: false, current: 0, remaining: 0, limit: 0 };
    }

    const current = await prisma.adminUser.count({
      where: { storeId, role: { not: "OWNER" } },
    });

    const limit = plan.maxTeamMembers ?? 0;
    const remaining = limit - current;
    const canAdd = remaining > 0;

    return { canAdd, current, remaining, limit };
  }

  /**
   * Verificar multiplos recursos de uma vez
   */
  static async checkAccess(
    storeId: string,
    features: (keyof PlanLimits)[],
  ): Promise<Record<string, boolean>> {
    const plan = await this.getPlan(storeId);

    const result: Record<string, boolean> = {};

    for (const feature of features) {
      const value = plan[feature];
      if (typeof value === "boolean") {
        result[feature] = value;
      } else if (typeof value === "number") {
        result[feature] = value > 0;
      } else {
        result[feature] = false;
      }
    }

    return result;
  }

  /**
   * Obter todas as informações do plano (para exibir no dashboard)
   */
  static async getPlanInfo(storeId: string): Promise<PlanLimits> {
    return this.getPlan(storeId);
  }
}

/**
 * PADRÃO DE USO NO CÓDIGO:
 *
 * // Ao tentar adicionar produto
 * const { canAdd, remaining } = await EntitlementsService.canAddProduct(storeId);
 * if (!canAdd) {
 *   return {
 *     ok: false,
 *     error: `Limite de produtos atingido. Upgrade para adicionar mais. Plano: ${remaining}/${limit}`
 *   };
 * }
 *
 * // Ao tentar usar estoque
 * const hasInventory = await EntitlementsService.hasInventory(storeId);
 * if (!hasInventory) {
 *   return {
 *     ok: false,
 *     error: "Módulo de estoque não disponível neste plano"
 *   };
 * }
 *
 * // Verificar múltiplos recursos
 * const access = await EntitlementsService.checkAccess(storeId, [
 *   'hasInventory',
 *   'hasPublicAPI',
 *   'hasTeamMembers'
 * ]);
 * if (!access.hasInventory) { ... }
 */
