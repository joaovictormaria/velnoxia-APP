import { prisma } from "@/server/db/client";
// @ts-expect-error - Module not typed but needed for Decimal casting
import { Decimal } from "@prisma/client/runtime/library";

/**
 * ServiÃ§o de Forecast de Demanda
 * PrevÃª consumo futuro baseado em histÃ³rico
 */
export class InventoryForecastService {
  /**
   * Calcular forecast de consumo para um item
   * Baseado em consumo dos Ãºltimos N dias
   */
  static async forecastItemConsumption(
    storeId: string,
    itemId: string,
    historicalDays: number = 30,
    forecastDays: number = 7
  ): Promise<{
    itemId: string;
    historicalDays: number;
    forecastDays: number;
    dailyAverageConsumption: Decimal;
    forecast: Array<{
      day: number;
      forecastDate: Date;
      estimatedConsumption: Decimal;
      confidence: number; // 0-100%
    }>;
    totalForecastedConsumption: Decimal;
    recommendation: string;
  }> {
    const now = new Date();
    const historicalStart = new Date(
      now.getTime() - historicalDays * 24 * 60 * 60 * 1000
    );

    // Pegar histÃ³rico de consumo
    const consumptions = await prisma.inventoryMovement.aggregate({
      where: {
        storeId,
        itemId,
        type: "CONSUMPTION",
        createdAt: { gte: historicalStart },
      },
      _sum: { quantity: true },
    });

    const totalHistoricalConsumption = consumptions._sum.quantity
      ? new Decimal(consumptions._sum.quantity).abs()
      : new Decimal(0);

    const dailyAverage = totalHistoricalConsumption.dividedBy(
      new Decimal(historicalDays)
    );

    // Gerar forecast simples (mÃ©dia mÃ³vel)
    const forecast = [];
    let totalForecasted = new Decimal(0);

    for (let day = 1; day <= forecastDays; day++) {
      const forecastDate = new Date(now.getTime() + day * 24 * 60 * 60 * 1000);

      // Confidence diminui com o tempo (100% no dia 1, 60% no dia 7)
      const confidence = Math.max(
        60,
        100 - (day - 1) * 5.7 // Diminui ~5.7% por dia
      );

      forecast.push({
        day,
        forecastDate,
        estimatedConsumption: dailyAverage,
        confidence: Math.round(confidence),
      });

      totalForecasted = totalForecasted.add(dailyAverage);
    }

    // Gerar recomendaÃ§Ã£o
    let recommendation = "Estoque normal";
    if (totalForecasted.greaterThan(100)) {
      recommendation = "âš ï¸ Aumento de demanda esperado";
    } else if (totalForecasted.lessThan(10)) {
      recommendation = "ðŸ“‰ Demanda baixa esperada";
    }

    return {
      itemId,
      historicalDays,
      forecastDays,
      dailyAverageConsumption: dailyAverage,
      forecast,
      totalForecastedConsumption: totalForecasted,
      recommendation,
    };
  }

  /**
   * Forecast para todos os items da store
   */
  static async forecastStoreConsumption(
    storeId: string,
    historicalDays: number = 30,
    forecastDays: number = 7
  ): Promise<
    Array<{
      itemName: string;
      dailyAverageConsumption: Decimal;
      totalForecastedConsumption: Decimal;
      recommendation: string;
    }>
  > {
    const items = await prisma.inventoryItem.findMany({
      where: { storeId, isActive: true },
      select: { id: true, name: true },
    });

    const forecasts = [];

    for (const item of items) {
      const forecast = await this.forecastItemConsumption(
        storeId,
        item.id,
        historicalDays,
        forecastDays
      );

      forecasts.push({
        itemName: item.name,
        dailyAverageConsumption: forecast.dailyAverageConsumption,
        totalForecastedConsumption: forecast.totalForecastedConsumption,
        recommendation: forecast.recommendation,
      });
    }

    return forecasts.sort((a, b) =>
      b.totalForecastedConsumption
        .minus(a.totalForecastedConsumption)
        .toNumber()
    );
  }

  /**
   * RecomendaÃ§Ã£o de compra baseada em forecast
   */
  static async getPurchaseRecommendations(
    storeId: string,
    forecastDays: number = 7
  ): Promise<
    Array<{
      itemId: string;
      itemName: string;
      currentStock: Decimal;
      forecastedConsumption: Decimal;
      projectedStock: Decimal;
      recommendedOrder: Decimal;
      urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      reason: string;
    }>
  > {
    const items = await prisma.inventoryItem.findMany({
      where: { storeId, isActive: true },
      select: {
        id: true,
        name: true,
        quantityOnHand: true,
        quantityReserved: true,
        minimumThreshold: true,
        idealQuantity: true,
      },
    });

    const recommendations = [];

    for (const item of items) {
      const forecast = await this.forecastItemConsumption(
        storeId,
        item.id,
        30,
        forecastDays
      );

      const available = item.quantityOnHand.minus(item.quantityReserved);
      const projectedStock = available.minus(
        forecast.totalForecastedConsumption
      );

      // Definir urgÃªncia e quantidade recomendada
      let urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "LOW";
      let recommendedOrder = new Decimal(0);
      let reason = "Sem aÃ§Ã£o requerida";

      if (projectedStock.lessThan(0)) {
        // Vai ficar negativo
        urgency = "CRITICAL";
        recommendedOrder = item.idealQuantity
          ? item.idealQuantity.minus(item.quantityOnHand)
          : forecast.totalForecastedConsumption.times(1.5);
        reason = "Vai ficar sem estoque em " + forecastDays + " dias";
      } else if (
        item.minimumThreshold &&
        projectedStock.lessThan(item.minimumThreshold)
      ) {
        // Vai ficar abaixo do mÃ­nimo
        urgency = "HIGH";
        recommendedOrder = item.idealQuantity
          ? item.idealQuantity.minus(item.quantityOnHand)
          : item.minimumThreshold.times(2);
        reason = "Vai ficar abaixo do mÃ­nimo";
      } else if (available.lessThan(forecast.dailyAverageConsumption.times(3))) {
        // Menos de 3 dias de estoque
        urgency = "MEDIUM";
        recommendedOrder = forecast.dailyAverageConsumption.times(14); // 2 semanas
        reason = "Menos de 3 dias de estoque";
      }

      if (recommendedOrder.greaterThan(0)) {
        recommendations.push({
          itemId: item.id,
          itemName: item.name,
          currentStock: available,
          forecastedConsumption: forecast.totalForecastedConsumption,
          projectedStock,
          recommendedOrder,
          urgency,
          reason,
        });
      }
    }

    return recommendations.sort((a, b) => {
      const urgencyOrder = {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3,
      };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
  }

  /**
   * AnÃ¡lise de tendÃªncia de demanda
   */
  static async getDemandTrend(
    storeId: string,
    days: number = 30
  ): Promise<{
    trend: "UP" | "STABLE" | "DOWN";
    trendStrength: number; // 0-100%
    weeklyComparison: {
      currentWeek: Decimal;
      previousWeek: Decimal;
      changePercent: Decimal;
    };
    topItems: Array<{
      itemName: string;
      weeklyConsumption: Decimal;
      trend: "UP" | "STABLE" | "DOWN";
    }>;
  }> {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Pegar consumo atual (Ãºltima semana)
    const currentWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const currentWeek = await prisma.inventoryMovement.aggregate({
      where: {
        storeId,
        type: "CONSUMPTION",
        createdAt: { gte: currentWeekStart },
      },
      _sum: { quantity: true },
    });

    // Pegar consumo anterior (semana anterior)
    const previousWeekStart = new Date(
      currentWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000
    );
    const previousWeek = await prisma.inventoryMovement.aggregate({
      where: {
        storeId,
        type: "CONSUMPTION",
        createdAt: { gte: previousWeekStart, lt: currentWeekStart },
      },
      _sum: { quantity: true },
    });

    const current = currentWeek._sum.quantity
      ? new Decimal(currentWeek._sum.quantity).abs()
      : new Decimal(0);
    const previous = previousWeek._sum.quantity
      ? new Decimal(previousWeek._sum.quantity).abs()
      : new Decimal(0);

    const changePercent =
      previous.isZero()
        ? new Decimal(0)
        : current.minus(previous).dividedBy(previous).times(100);

    let trend: "UP" | "STABLE" | "DOWN" = "STABLE";
    let trendStrength = 0;

    if (changePercent.greaterThan(5)) {
      trend = "UP";
      trendStrength = Math.min(100, changePercent.toNumber());
    } else if (changePercent.lessThan(-5)) {
      trend = "DOWN";
      trendStrength = Math.min(100, changePercent.abs().toNumber());
    }

    // Top items por consumo
    const topItems = await prisma.inventoryMovement.groupBy({
      by: ["itemId"],
      where: {
        storeId,
        type: "CONSUMPTION",
        createdAt: { gte: currentWeekStart },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    });

    const topItemsData = await Promise.all(
      topItems.map(async (item) => {
        const itemDetails = await prisma.inventoryItem.findUnique({
          where: { id: item.itemId },
        });

        // Verificar tendÃªncia do item (comparar com semana anterior)
        const itemPrevious = await prisma.inventoryMovement.aggregate({
          where: {
            storeId,
            itemId: item.itemId,
            type: "CONSUMPTION",
            createdAt: { gte: previousWeekStart, lt: currentWeekStart },
          },
          _sum: { quantity: true },
        });

        const curr = item._sum.quantity
          ? new Decimal(item._sum.quantity).abs()
          : new Decimal(0);
        const prev = itemPrevious._sum.quantity
          ? new Decimal(itemPrevious._sum.quantity).abs()
          : new Decimal(0);

        let itemTrend: "UP" | "STABLE" | "DOWN" = "STABLE";
        if (prev.isZero() && !curr.isZero()) {
          itemTrend = "UP";
        } else if (!prev.isZero()) {
          const itemChange = curr.minus(prev).dividedBy(prev);
          if (itemChange.greaterThan(0.1)) {
            itemTrend = "UP";
          } else if (itemChange.lessThan(-0.1)) {
            itemTrend = "DOWN";
          }
        }

        return {
          itemName: itemDetails?.name || "Desconhecido",
          weeklyConsumption: curr,
          trend: itemTrend,
        };
      })
    );

    return {
      trend,
      trendStrength,
      weeklyComparison: {
        currentWeek: current,
        previousWeek: previous,
        changePercent,
      },
      topItems: topItemsData,
    };
  }
}

