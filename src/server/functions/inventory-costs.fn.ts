import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { InventoryCostService } from "@/server/services/inventory-cost-service";
import { Decimal } from "@prisma/client/runtime/client";

/**
 * Calculate cost of a specific order
 */
export const getOrderCost = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orderId: z.string().cuid(),
    })
  )
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryCostService.calculateOrderCost(store.id, data.orderId);
  });

/**
 * Get cost report for a period
 */
export const getCostReport = createServerFn({ method: "POST" })
  .validator(
    z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    })
  )
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryCostService.getCostReport(
      store.id,
      new Date(data.startDate),
      new Date(data.endDate)
    );
  });

/**
 * Calculate profit margin
 */
export const calculateMargin = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sellingPrice: z.string(), // Decimal as string
      costPrice: z.string(),
    })
  )
  .handler(async ({ data }) => {
    return InventoryCostService.calculateMargin(
      new Decimal(data.sellingPrice),
      new Decimal(data.costPrice)
    );
  });

/**
 * Get product profitability analysis
 */
export const getProductProfitability = createServerFn({
  method: "POST",
})
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

    return InventoryCostService.getProductProfitability(
      store.id,
      data.days || 30
    );
  });

/**
 * Get financial KPIs dashboard
 */
export const getFinancialKPIs = createServerFn({ method: "POST" })
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

    return InventoryCostService.getFinancialKPIs(store.id, data.days || 30);
  });
