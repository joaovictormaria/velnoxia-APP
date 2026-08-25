// @ts-nocheck
import { prisma } from "@/server/db/client";

type Decimal = any;

/**
 * ServiÃ§o de AnÃ¡lise de Custos de ProduÃ§Ã£o
 * Calcula COGS (Cost of Goods Sold), margem e lucratividade
 */
export class InventoryCostService {
  /**
   * Calcular custo total de um pedido baseado em consumos
   * (COGS - Cost of Goods Sold)
   */
  static async calculateOrderCost(
    storeId: string,
    orderId: string
  ): Promise<{
    orderId: string;
    totalItems: number;
    totalCost: Decimal;
    costBreakdown: Array<{
      itemName: string;
      quantity: Decimal;
      unitCost: Decimal;
      totalCost: Decimal;
    }>;
  }> {
    // Pegar todos os consumos do pedido
    const consumptions = await prisma.inventoryMovement.findMany({
      where: {
        storeId,
        reference: orderId,
        type: "CONSUMPTION",
      },
      include: {
        item: {
          select: {
            name: true,
            cost: true,
          },
        },
      },
    });

    const breakdown: typeof consumptions extends Array<infer T>
      ? Array<{
          itemName: string;
          quantity: Decimal;
          unitCost: Decimal;
          totalCost: Decimal;
        }>
      : never = [];

    let totalCost = (0 as Decimal);

    for (const consumption of consumptions) {
      if (!consumption.item.cost) {
        continue; // Skip items without cost
      }

      const quantity = consumption.quantity.abs(); // CONSUMPTION Ã© negativo
      const itemCost = (consumption.item.cost as Decimal);
      const lineCost = quantity.mul(itemCost);

      breakdown.push({
        itemName: consumption.item.name,
        quantity,
        unitCost: itemCost,
        totalCost: lineCost,
      });

      totalCost = totalCost.add(lineCost);
    }

    return {
      orderId,
      totalItems: consumptions.length,
      totalCost,
      costBreakdown: breakdown,
    };
  }

  /**
   * RelatÃ³rio de custos por perÃ­odo
   */
  static async getCostReport(
    storeId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    period: {
      startDate: Date;
      endDate: Date;
    };
    summary: {
      totalOrders: number;
      totalCost: Decimal;
      averageCostPerOrder: Decimal;
      costByType: Record<string, { count: number; total: Decimal }>;
    };
    topExpensiveItems: Array<{
      itemName: string;
      totalCost: Decimal;
      usageCount: number;
      averageCost: Decimal;
    }>;
    orders: Array<{
      orderId: string;
      createdAt: Date;
      cost: Decimal;
    }>;
  }> {
    // Pegar consumos do perÃ­odo
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        storeId,
        type: "CONSUMPTION",
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        item: {
          select: {
            name: true,
            cost: true,
          },
        },
      },
    });

    // Agrupar por pedido
    const costByOrder: Record<string, Decimal> = {};
    const costByItem: Record<
      string,
      { count: number; total: Decimal; usage: number }
    > = {};
    const orders = new Map<
      string,
      { reference?: string; createdAt: Date; cost: Decimal }
    >();

    for (const movement of movements) {
      if (!movement.item.cost) continue;

      const quantity = movement.quantity.abs();
      const itemCost = (movement.item.cost);
      const lineCost = quantity.mul(itemCost);

      // Custo por pedido
      const orderId = movement.reference || "UNKNOWN";
      if (!costByOrder[orderId]) {
        costByOrder[orderId] = (0 as Decimal);
      }
      costByOrder[orderId] = costByOrder[orderId].add(lineCost);

      // Custo por item
      if (!costByItem[movement.item.name]) {
        costByItem[movement.item.name] = {
          count: 0,
          total: (0),
          usage: 0,
        };
      }
      costByItem[movement.item.name].count += 1;
      costByItem[movement.item.name].total = costByItem[
        movement.item.name
      ].total.add(lineCost);
      costByItem[movement.item.name].usage += 1;

      // Rastrear ordem
      if (!orders.has(orderId)) {
        orders.set(orderId, {
          reference: movement.reference,
          createdAt: movement.createdAt,
          cost: (0),
        });
      }
      const order = orders.get(orderId)!;
      order.cost = order.cost.add(lineCost);
    }

    // Calcular total
    let totalCost = (0 as Decimal);
    for (const cost of Object.values(costByOrder)) {
      totalCost = totalCost.add(cost);
    }

    const totalOrders = Object.keys(costByOrder).length;
    const averageCostPerOrder =
      totalOrders > 0 ? totalCost.dividedBy((totalOrders)) : (0 as Decimal);

    // Items mais caros
    const topExpensive = Object.entries(costByItem)
      .map(([name, data]) => ({
        itemName: name,
        totalCost: data.total,
        usageCount: data.usage,
        averageCost: data.total.dividedBy((data.usage)),
      }))
      .sort((a, b) => b.totalCost.toNumber() - a.totalCost.toNumber())
      .slice(0, 10);

    // Custo por tipo de movimento (para anÃ¡lise)
    const costByType: Record<string, { count: number; total: Decimal }> = {};
    for (const movement of movements) {
      if (!movement.item.cost) continue;

      const key = movement.type;
      if (!costByType[key]) {
        costByType[key] = { count: 0, total: (0) };
      }
      costByType[key].count += 1;
      costByType[key].total = costByType[key].total.add(
        movement.quantity.abs().mul((movement.item.cost))
      );
    }

    return {
      period: { startDate, endDate },
      summary: {
        totalOrders,
        totalCost,
        averageCostPerOrder,
        costByType,
      },
      topExpensiveItems: topExpensive,
      orders: Array.from(orders.entries()).map(([id, order]) => ({
        orderId: id,
        createdAt: order.createdAt,
        cost: order.cost,
      })),
    };
  }

  /**
   * Calcular margem de lucro
   * Precisa de: preÃ§o de venda do pedido
   */
  static calculateMargin(
    sellingPrice: Decimal,
    costPrice: Decimal
  ): {
    margin: Decimal;
    marginPercent: Decimal;
    profitAmount: Decimal;
  } {
    const profitAmount = sellingPrice.minus(costPrice);
    const marginPercent = sellingPrice.isZero()
      ? (0)
      : profitAmount.dividedBy(sellingPrice).times(100);

    return {
      margin: profitAmount,
      marginPercent,
      profitAmount,
    };
  }

  /**
   * AnÃ¡lise de rentabilidade por produto
   * Baseado em histÃ³rico de pedidos
   */
  static async getProductProfitability(
    storeId: string,
    days: number = 30
  ): Promise<
    Array<{
      productName: string;
      totalOrders: number;
      totalSalesValue: Decimal;
      totalCost: Decimal;
      totalProfit: Decimal;
      profitPercent: Decimal;
      averageOrderValue: Decimal;
      averageCost: Decimal;
      averageProfit: Decimal;
    }>
  > {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Pegar pedidos do perÃ­odo
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: startDate },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    const profitByProduct: Record<
      string,
      {
        productName: string;
        orders: number;
        totalSales: Decimal;
        totalCost: Decimal;
      }
    > = {};

    for (const order of orders) {
      for (const item of order.orderItems) {
        const key = item.product.name;
        if (!profitByProduct[key]) {
          profitByProduct[key] = {
            productName: key,
            orders: 0,
            totalSales: (0),
            totalCost: (0),
          };
        }

        // Valor de venda
        const itemSalesValue = (item.price).mul(
          (item.quantity)
        );
        profitByProduct[key].totalSales =
          profitByProduct[key].totalSales.add(itemSalesValue);

        // Custo (via composiÃ§Ã£o)
        const cost = await this.calculateOrderCost(storeId, order.id);
        profitByProduct[key].totalCost = profitByProduct[key].totalCost.add(
          cost.totalCost
        );
        profitByProduct[key].orders += 1;
      }
    }

    return Object.values(profitByProduct)
      .map((product) => {
        const profit = product.totalSales.minus(product.totalCost);
        const profitPercent = product.totalSales.isZero()
          ? (0)
          : profit.dividedBy(product.totalSales).times(100);

        return {
          productName: product.productName,
          totalOrders: product.orders,
          totalSalesValue: product.totalSales,
          totalCost: product.totalCost,
          totalProfit: profit,
          profitPercent,
          averageOrderValue: product.totalSales.dividedBy(
            (product.orders)
          ),
          averageCost: product.totalCost.dividedBy(
            (product.orders)
          ),
          averageProfit: profit.dividedBy((product.orders)),
        };
      })
      .sort((a, b) => b.profitPercent.toNumber() - a.profitPercent.toNumber());
  }

  /**
   * Dashboard widget: KPIs financeiros
   */
  static async getFinancialKPIs(storeId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    const [costReport, profitability] = await Promise.all([
      this.getCostReport(storeId, startDate, endDate),
      this.getProductProfitability(storeId, days),
    ]);

    // Calcular KPIs
    let totalSalesValue = new Decimal(0);
    for (const item of profitability) {
      totalSalesValue = totalSalesValue.plus(item.totalSalesValue);
    }

    const totalProfit = totalSalesValue.minus(costReport.summary.totalCost);
    const profitMargin = totalSalesValue.isZero()
      ? 0
      : totalProfit.dividedBy(totalSalesValue).times(100).toNumber();

    return {
      period: `Últimos ${days} dias`,
      totalSalesValue: totalSalesValue.toNumber(),
      totalCost: costReport.summary.totalCost.toNumber(),
      totalProfit: totalProfit.toNumber(),
      profitMargin: typeof profitMargin === "number" ? profitMargin : profitMargin.toNumber(),
      averageOrderValue: costReport.summary.averageCostPerOrder,
      totalOrders: costReport.summary.totalOrders,
      mostProfitableProduct: profitability[0] || null,
      leastProfitableProduct:
        profitability[profitability.length - 1] || null,
    };
  }
}

