import { action } from "@solidjs/router";
import { getStoreFromSession } from "@/server/auth/session";
import { reportRepository } from "@/server/repositories/report-repository";

export const adminGetStockReport = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) throw new Error("Not authenticated");

  const sortBy = (formData.get("sortBy") || "name") as any;
  const limit = parseInt(formData.get("limit") as string) || 100;

  return reportRepository.getStockLevelsByStore(store.id, { sortBy, limit });
});

export const adminGetLowStockAlerts = action(async () => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) throw new Error("Not authenticated");

  return reportRepository.getLowStockItems(store.id);
});

export const adminGetMovementHistory = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) throw new Error("Not authenticated");

  const itemId = formData.get("itemId");
  const type = formData.get("type");
  const limit = parseInt(formData.get("limit") as string) || 100;

  return reportRepository.getMovementHistory(store.id, { itemId: itemId || undefined, type: type || undefined, limit });
});

export const adminGetInventoryValue = action(async () => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) throw new Error("Not authenticated");

  return reportRepository.getInventoryValue(store.id);
});

export const adminGetCostAnalysis = action(async (formData: FormData) => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) throw new Error("Not authenticated");

  const type = formData.get("type");

  return reportRepository.getMovementCostAnalysis(store.id, { type: type || undefined });
});

export const adminGetCompositionUsageReport = action(async () => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) throw new Error("Not authenticated");

  return reportRepository.getCompositionUsageReport(store.id);
});

export const adminGetMovementStats = action(async () => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) throw new Error("Not authenticated");

  return reportRepository.getMovementStats(store.id);
});

export const adminGetOrderFulfillmentStats = action(async () => {
  const store = await getStoreFromSession();
  if (!store?.adminUser) throw new Error("Not authenticated");

  return reportRepository.getOrderFulfillmentStats(store.id);
});
