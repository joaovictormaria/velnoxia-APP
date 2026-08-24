import { prisma } from "@/server/db/client";
import type { Decimal } from "@prisma/client";

/**
 * Serviço de Alertas de Estoque
 * Monitora itens em níveis críticos e notifica admin
 */
export class InventoryAlertService {
  /**
   * Tipos de alertas
   */
  static readonly ALERT_TYPES = {
    STOCK_LOW: "STOCK_LOW", // onHand < minimumThreshold
    STOCK_CRITICAL: "STOCK_CRITICAL", // onHand < (minimumThreshold * 0.5)
    STOCK_OUT: "STOCK_OUT", // onHand = 0
    OVERSTOCKED: "OVERSTOCKED", // onHand > maximumCapacity
  } as const;

  /**
   * Verificar e gerar alertas para um item
   * Retorna array de alertas acionados
   */
  static async checkItemAlerts(
    storeId: string,
    itemId: string
  ): Promise<
    Array<{
      type: string;
      severity: "INFO" | "WARNING" | "CRITICAL";
      message: string;
      currentQty: Decimal;
      threshold?: Decimal;
    }>
  > {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: {
        name: true,
        quantityOnHand: true,
        quantityReserved: true,
        minimumThreshold: true,
        maximumCapacity: true,
        isActive: true,
      },
    });

    if (!item) {
      return [];
    }

    const alerts: typeof this.checkItemAlerts extends (
      ...args: any[]
    ) => Promise<infer R>
      ? R
      : never = [];

    const available = item.quantityOnHand.minus(item.quantityReserved);

    // STOCK_OUT: nenhum disponível
    if (available.isZero() && item.quantityOnHand.isZero()) {
      alerts.push({
        type: this.ALERT_TYPES.STOCK_OUT,
        severity: "CRITICAL",
        message: `${item.name}: SEM ESTOQUE! Nenhuma unidade disponível.`,
        currentQty: item.quantityOnHand,
      });
      return alerts; // Não checar outros alertas se já zerou
    }

    // CRITICAL: menos de 50% do mínimo
    if (
      item.minimumThreshold &&
      available.lessThan(item.minimumThreshold.mul(new Decimal(0.5)))
    ) {
      alerts.push({
        type: this.ALERT_TYPES.STOCK_CRITICAL,
        severity: "CRITICAL",
        message: `${item.name}: ESTOQUE CRÍTICO! Compre URGENTEMENTE!`,
        currentQty: available,
        threshold: item.minimumThreshold.mul(new Decimal(0.5)),
      });
      return alerts;
    }

    // LOW: abaixo do mínimo
    if (item.minimumThreshold && available.lessThan(item.minimumThreshold)) {
      alerts.push({
        type: this.ALERT_TYPES.STOCK_LOW,
        severity: "WARNING",
        message: `${item.name}: Estoque baixo. Próximo: ${available} (mínimo: ${item.minimumThreshold})`,
        currentQty: available,
        threshold: item.minimumThreshold,
      });
    }

    // OVERSTOCKED: acima do máximo
    if (
      item.maximumCapacity &&
      item.quantityOnHand.greaterThan(item.maximumCapacity)
    ) {
      alerts.push({
        type: this.ALERT_TYPES.OVERSTOCKED,
        severity: "INFO",
        message: `${item.name}: Sobrestocado! Tem ${item.quantityOnHand} (máximo: ${item.maximumCapacity})`,
        currentQty: item.quantityOnHand,
        threshold: item.maximumCapacity,
      });
    }

    return alerts;
  }

  /**
   * Verificar alertas para TODOS os itens de uma store
   */
  static async checkStoreAlerts(storeId: string): Promise<
    Array<{
      itemId: string;
      itemName: string;
      alerts: Awaited<ReturnType<typeof this.checkItemAlerts>>;
    }>
  > {
    const items = await prisma.inventoryItem.findMany({
      where: { storeId, isActive: true },
      select: { id: true, name: true },
    });

    const results = [];

    for (const item of items) {
      const alerts = await this.checkItemAlerts(storeId, item.id);
      if (alerts.length > 0) {
        results.push({
          itemId: item.id,
          itemName: item.name,
          alerts,
        });
      }
    }

    return results;
  }

  /**
   * Obter items críticos (para dashboard)
   */
  static async getCriticalItems(storeId: string) {
    const items = await prisma.inventoryItem.findMany({
      where: { storeId, isActive: true },
      select: {
        id: true,
        name: true,
        quantityOnHand: true,
        quantityReserved: true,
        minimumThreshold: true,
        maximumCapacity: true,
      },
      orderBy: { quantityOnHand: "asc" },
    });

    return items
      .map((item) => ({
        ...item,
        available: item.quantityOnHand.minus(item.quantityReserved),
        percentOfMinimum: item.minimumThreshold
          ? item.quantityOnHand
              .dividedBy(item.minimumThreshold)
              .times(100)
              .toNumber()
          : 100,
        status:
          item.quantityOnHand.isZero()
            ? "out_of_stock"
            : item.minimumThreshold &&
                item.quantityOnHand.lessThan(item.minimumThreshold)
              ? "low"
              : item.maximumCapacity &&
                  item.quantityOnHand.greaterThan(item.maximumCapacity)
                ? "overstocked"
                : "ok",
      }))
      .filter((item) => item.status !== "ok");
  }

  /**
   * Gerar relatório de dias até acabar estoque
   * Baseado em consumo médio dos últimos 7 dias
   */
  static async getStockRunoutForecast(
    storeId: string,
    days: number = 7
  ): Promise<
    Array<{
      itemId: string;
      itemName: string;
      currentQty: Decimal;
      dailyConsumption: Decimal;
      daysUntilRunout: number | null; // null = não vai acabar
      estimatedRunoutDate: Date | null;
    }>
  > {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - days);

    const items = await prisma.inventoryItem.findMany({
      where: { storeId, isActive: true },
      select: { id: true, name: true, quantityOnHand: true },
    });

    const results = [];

    for (const item of items) {
      // Calcular consumo dos últimos 7 dias
      const consumption = await prisma.inventoryMovement.aggregate({
        where: {
          storeId,
          itemId: item.id,
          type: "CONSUMPTION",
          createdAt: { gte: sevenDaysAgo },
        },
        _sum: { quantity: true },
      });

      const totalConsumption = consumption._sum.quantity || new Decimal(0);
      const dailyConsumption = totalConsumption
        .abs()
        .dividedBy(new Decimal(days));

      let daysUntilRunout: number | null = null;
      let estimatedRunoutDate: Date | null = null;

      if (dailyConsumption.greaterThan(0)) {
        daysUntilRunout = item.quantityOnHand
          .dividedBy(dailyConsumption)
          .toNumber();

        // Calcular data estimada
        const runoutDate = new Date();
        runoutDate.setDate(
          runoutDate.getDate() + Math.floor(daysUntilRunout)
        );
        estimatedRunoutDate = runoutDate;
      }

      results.push({
        itemId: item.id,
        itemName: item.name,
        currentQty: item.quantityOnHand,
        dailyConsumption,
        daysUntilRunout,
        estimatedRunoutDate,
      });
    }

    return results
      .sort((a, b) => {
        if (a.daysUntilRunout === null) return 1;
        if (b.daysUntilRunout === null) return -1;
        return a.daysUntilRunout - b.daysUntilRunout;
      })
      .filter((item) => item.daysUntilRunout === null || item.daysUntilRunout < 7);
  }

  /**
   * Dashboard widget: Resumo de alertas
   */
  static async getDashboardSummary(storeId: string) {
    const [criticalItems, forecast] = await Promise.all([
      this.getCriticalItems(storeId),
      this.getStockRunoutForecast(storeId, 7),
    ]);

    const storeAlerts = await this.checkStoreAlerts(storeId);

    return {
      totalCriticalItems: criticalItems.length,
      criticalItems: criticalItems.slice(0, 5), // Top 5
      itemsRunningOut: forecast.filter(
        (item) => item.daysUntilRunout !== null && item.daysUntilRunout < 3
      ),
      totalAlerts: storeAlerts.reduce(
        (sum, item) => sum + item.alerts.length,
        0
      ),
      criticalAlerts: storeAlerts.reduce(
        (sum, item) =>
          sum + item.alerts.filter((a) => a.severity === "CRITICAL").length,
        0
      ),
      warningAlerts: storeAlerts.reduce(
        (sum, item) =>
          sum + item.alerts.filter((a) => a.severity === "WARNING").length,
        0
      ),
    };
  }
}
