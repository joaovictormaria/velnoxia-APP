import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { reportRepository } from "@/server/repositories/report-repository";

export const adminGetStockReport = createServerFn({ method: "POST" })
  .handler(async ({ data }: any) => {
    const admin = await requireAdminSession();

    const sortBy = (data?.sortBy || "name") as any;
    const limit = parseInt(data?.limit || "100") || 100;

    return reportRepository.getStockLevelsByStore(admin.storeId, { sortBy, limit });
  });

export const adminGetLowStockAlerts2 = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await requireAdminSession();

    return reportRepository.getLowStockItems(admin.storeId);
  });

export const adminGetMovementHistory = createServerFn({ method: "POST" })
  .validator(z.object({
    itemId: z.string().optional(),
    type: z.string().optional(),
    limit: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();

    const limit = parseInt(data.limit || "100") || 100;

    return reportRepository.getMovementHistory(admin.storeId, {
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
    const admin = await requireAdminSession();

    return reportRepository.getMovementCostAnalysis(admin.storeId, { type: data.type || undefined });
  });

export const adminGetCompositionUsageReport = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await requireAdminSession();

    return reportRepository.getCompositionUsageReport(admin.storeId);
  });

export const adminGetMovementStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await requireAdminSession();

    return reportRepository.getMovementStats(admin.storeId);
  });

export const adminGetOrderFulfillmentStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await requireAdminSession();

    return reportRepository.getOrderFulfillmentStats(admin.storeId);
  });

export const adminGetInventoryValueReport = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await requireAdminSession();

    return reportRepository.getInventoryValue(admin.storeId);
  });
