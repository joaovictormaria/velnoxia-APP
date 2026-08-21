import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { reportRepository } from "@/server/repositories/report-repository";

export const adminGetStockReport = createServerFn({ method: "POST" })
  .validator(z.object({
    sortBy: z.string().optional(),
    limit: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store?.adminUser) throw new Error("Not authenticated");

    const sortBy = (data.sortBy || "name") as any;
    const limit = parseInt(data.limit || "100") || 100;

    return reportRepository.getStockLevelsByStore(store.id, { sortBy, limit });
  });

export const adminGetLowStockAlerts2 = createServerFn({ method: "GET" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store?.adminUser) throw new Error("Not authenticated");

    return reportRepository.getLowStockItems(store.id);
  });

export const adminGetMovementHistory = createServerFn({ method: "POST" })
  .validator(z.object({
    itemId: z.string().optional(),
    type: z.string().optional(),
    limit: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store?.adminUser) throw new Error("Not authenticated");

    const limit = parseInt(data.limit || "100") || 100;

    return reportRepository.getMovementHistory(store.id, {
      itemId: data.itemId || undefined,
      type: data.type || undefined,
      limit,
    });
  });

export const adminGetCostAnalysis = createServerFn({ method: "POST" })
  .validator(z.object({
    type: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store?.adminUser) throw new Error("Not authenticated");

    return reportRepository.getMovementCostAnalysis(store.id, { type: data.type || undefined });
  });

export const adminGetCompositionUsageReport = createServerFn({ method: "GET" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store?.adminUser) throw new Error("Not authenticated");

    return reportRepository.getCompositionUsageReport(store.id);
  });

export const adminGetMovementStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store?.adminUser) throw new Error("Not authenticated");

    return reportRepository.getMovementStats(store.id);
  });

export const adminGetOrderFulfillmentStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store?.adminUser) throw new Error("Not authenticated");

    return reportRepository.getOrderFulfillmentStats(store.id);
  });

export const adminGetInventoryValueReport = createServerFn({ method: "GET" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store?.adminUser) throw new Error("Not authenticated");

    return reportRepository.getInventoryValue(store.id);
  });
