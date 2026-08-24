import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { reportRepository } from "@/server/repositories/report-repository";

function serializeItem(item: any) {
  return {
    ...item,
    quantityOnHand: Number(item.quantityOnHand ?? 0),
    quantityReserved: Number(item.quantityReserved ?? 0),
    quantityAvailable: Number(item.quantityAvailable ?? 0),
    quantityUsedInRecipes: Number(item.quantityUsedInRecipes ?? 0),
    maximumQuantity: Number(item.maximumQuantity ?? 0),
    contentSize: item.contentSize ? Number(item.contentSize) : null,
    cost: item.cost ? Number(item.cost) : null,
    minimumThreshold: item.minimumThreshold ? Number(item.minimumThreshold) : null,
    idealQuantity: item.idealQuantity ? Number(item.idealQuantity) : null,
    maximumCapacity: item.maximumCapacity ? Number(item.maximumCapacity) : null,
  };
}

export const adminGetStockReport = createServerFn({ method: "POST" })
  .handler(async ({ data }: any) => {
    const admin = await requireAdminSession();

    const sortBy = (data?.sortBy || "name") as any;
    const limit = parseInt(data?.limit || "100") || 100;
    const includeInactive = data?.includeInactive === true;

    const items = await reportRepository.getStockLevelsByStore(admin.storeId, { sortBy, limit, includeInactive });
    return items.map(serializeItem);
  });

export const adminGetLowStockAlerts2 = createServerFn({ method: "GET" })
  .handler(async () => {
    const admin = await requireAdminSession();

    return reportRepository.getLowStockItems(admin.storeId);
  });

export const adminGetMovementHistory = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();

    const data = context?.data || {};
    const limit = parseInt(data.limit || "100") || 100;

    const movements = await reportRepository.getMovementHistory(admin.storeId, {
      itemId: data.itemId || undefined,
      type: data.type || undefined,
      limit,
    });

    // Serialize Decimal values - convert to JSON and back to ensure all Decimals are converted
    return JSON.parse(JSON.stringify(movements, (key, value) => {
      if (value && typeof value === 'object' && value.constructor.name === 'Decimal') {
        return Number(value);
      }
      return value;
    }));
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

