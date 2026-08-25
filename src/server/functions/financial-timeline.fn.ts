import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { decimalToNumber } from "@/server/utils/decimal-converter";

export const getFinancialTimeline = createServerFn({ method: "POST" })
  .validator(
    z.object({
      days: z.number().int().positive().optional(),
    })
  )
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    const days = data.days || 30;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    // Buscar pedidos completos
    const orders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        createdAt: { gte: fromDate },
        status: "COMPLETED",
      },
      select: {
        id: true,
        createdAt: true,
        total: true,
      },
    });

    // Agrupar por data
    const timelineByDate = new Map<
      string,
      {
        date: string;
        totalSales: number;
        totalCost: number;
        totalProfit: number;
        orderCount: number;
      }
    >();

    for (const order of orders) {
      const zonedDate = new Date(
        order.createdAt.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
      );
      const dateKey = zonedDate.toISOString().split("T")[0];

      if (!timelineByDate.has(dateKey)) {
        timelineByDate.set(dateKey, {
          date: dateKey,
          totalSales: 0,
          totalCost: 0,
          totalProfit: 0,
          orderCount: 0,
        });
      }

      const dayData = timelineByDate.get(dateKey)!;
      const orderTotal = decimalToNumber(order.total);

      dayData.totalSales += orderTotal;
      dayData.totalProfit += orderTotal;
      dayData.orderCount += 1;
    }

    const timeline = Array.from(timelineByDate.values());

    if (timeline.length === 0) {
      return [];
    }

    // Preencher datas faltantes
    const firstDate = new Date(timeline[0].date);
    const lastDate = new Date(timeline[timeline.length - 1].date);
    const filledTimeline: typeof timeline = [];

    for (
      let d = new Date(firstDate);
      d <= lastDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateKey = d.toISOString().split("T")[0];
      const existing = timeline.find((t) => t.date === dateKey);

      if (existing) {
        filledTimeline.push(existing);
      } else {
        filledTimeline.push({
          date: dateKey,
          totalSales: 0,
          totalCost: 0,
          totalProfit: 0,
          orderCount: 0,
        });
      }
    }

    return filledTimeline;
  });
