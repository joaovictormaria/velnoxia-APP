import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { decimalToNumber } from "@/server/utils/decimal-converter";

export const getTransactionHistory = createServerFn({ method: "POST" })
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

    const orders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        createdAt: { gte: fromDate },
      },
      select: {
        id: true,
        number: true,
        createdAt: true,
        total: true,
        customerName: true,
        paymentMethod: true,
        paymentStatus: true,
        refund: true,
        refundedAt: true,
        items: {
          select: {
            unitCost: true,
            quantity: true,
            unitPrice: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const transactions = orders.map((order) => {
      const totalCost = order.items.reduce((sum, item) => {
        const cost = item.unitCost ? decimalToNumber(item.unitCost) : 0;
        return sum + cost * item.quantity;
      }, 0);

      const totalValue = decimalToNumber(order.total);
      const profit = totalValue - totalCost;

      return {
        id: order.id,
        orderId: order.id,
        orderNumber: order.number,
        type: order.refund ? "REFUND" : "SALE",
        amount: order.refund ? -decimalToNumber(order.refund) : totalValue,
        cost: totalCost,
        profit: order.refund ? -profit : profit,
        paymentMethod: order.paymentMethod || "Não informado",
        paymentStatus: order.refund ? "REFUNDED" : order.paymentStatus,
        createdAt: order.refund ? order.refundedAt : order.createdAt,
        customerName: order.customerName,
        notes: order.refund ? "Reembolsado" : undefined,
      };
    });

    return transactions;
  });
