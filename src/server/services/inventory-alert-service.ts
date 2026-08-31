import { prisma } from "@/server/db/client";
import { statusDoEstoque } from "@/lib/status-do-estoque";

type Decimal = any;

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

    /*
      O STATUS VEM DA FONTE UNICA; A SEVERIDADE CONTINUA AQUI.

      São duas perguntas diferentes, e misturá-las foi o que deixou esta classe
      discordando de si mesma: `checkItemAlerts` usava o disponível e
      `getStockStatusReport` usava o saldo físico, dando respostas opostas para
      o mesmo item.

      `statusDoEstoque` responde "em que estado o item está" — NORMAL,
      LOW_STOCK, OUT_OF_STOCK. O grau de urgência de NOTIFICAR (WARNING contra
      CRITICAL, e o corte de metade do mínimo) é decisão desta camada e
      permanece intacto: quem consome os e-mails espera esses níveis.
    */
    const estado = statusDoEstoque(item);

    // STOCK_OUT: nenhum disponível
    if (estado.status === "OUT_OF_STOCK") {
      alerts.push({
        type: this.ALERT_TYPES.STOCK_OUT,
        severity: "CRITICAL",
        message: `${item.name}: SEM ESTOQUE! Nenhuma unidade disponível.`,
        currentQty: item.quantityOnHand,
      });
      return alerts; // Não checar outros alertas se já zerou
    }

    /*
      CRITICAL e uma SEVERIDADE, nao um status. O item esta em LOW_STOCK nos
      dois ramos abaixo; o que muda e a urgencia com que se avisa. Metade do
      minimo continua sendo o corte, como sempre foi.
    */
    if (
      estado.status === "LOW_STOCK" &&
      item.minimumThreshold &&
      available.lessThan(item.minimumThreshold.mul((0.5 as any)))
    ) {
      alerts.push({
        type: this.ALERT_TYPES.STOCK_CRITICAL,
        severity: "CRITICAL",
        message: `${item.name}: ESTOQUE CRÍTICO! Compre URGENTEMENTE!`,
        currentQty: available,
        threshold: item.minimumThreshold.mul((0.5 as any)),
      });
      return alerts;
    }

    // LOW: abaixo do mínimo
    if (estado.status === "LOW_STOCK") {
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
      alerts: Awaited<ReturnType<typeof InventoryAlertService.checkItemAlerts>>;
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
        /*
          O PERCENTUAL SEGUE O DISPONIVEL, como o status.

          Ele media `quantityOnHand / minimo` enquanto o status ao lado media
          outra coisa — o card mostrava "120% do minimo" para um item que a
          outra funcao da mesma classe classificava como critico.
        */
        percentOfMinimum: item.minimumThreshold
          ? item.quantityOnHand
              .minus(item.quantityReserved)
              .dividedBy(item.minimumThreshold)
              .times(100)
              .toNumber()
          : 100,
        /*
          A MESMA REGRA DE `checkItemAlerts`, e nao uma cópia parecida. Aqui se
          decidia por `quantityOnHand` enquanto a outra decidia por
          `available`: um item com 10 no fisico e 10 reservados era "critico"
          numa e "ok" na outra.

          `overstocked` nao e estado de FALTA e continua sendo decidido pelo
          saldo fisico contra a capacidade — e o galpao que enche, nao o
          disponivel que sobra.
        */
        status: (() => {
          const e = statusDoEstoque(item).status;
          if (e === "OUT_OF_STOCK") return "out_of_stock";
          if (e === "LOW_STOCK") return "low";
          if (
            item.maximumCapacity &&
            item.quantityOnHand.greaterThan(item.maximumCapacity)
          )
            return "overstocked";
          return "ok";
        })(),
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

      const totalConsumption = consumption._sum.quantity || (0 as any);
      const dailyConsumption = totalConsumption
        .abs()
        .dividedBy((days as any));

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
        (sum: any, item: any) =>
          sum + item.alerts.filter((a: any) => a.severity === "CRITICAL").length,
        0
      ),
      warningAlerts: storeAlerts.reduce(
        (sum: any, item: any) =>
          sum + item.alerts.filter((a: any) => a.severity === "WARNING").length,
        0
      ),
    };
  }
}
