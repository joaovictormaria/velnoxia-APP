// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/server/auth/session";
import { InventoryAlertService } from "@/server/services/inventory-alert-service";

/**
 * Get dashboard summary of inventory alerts
 * Usado no dashboard para mostrar status geral de estoque
 */
export const getInventoryAlertsSummary = createServerFn({ method: "GET" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryAlertService.getDashboardSummary(store.id);
  });

/**
 * Get critical items (low/out of stock)
 */
export const getCriticalItems = createServerFn({ method: "GET" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryAlertService.getCriticalItems(store.id);
  });

/**
 * Get stock runout forecast
 * PrevÃª quais itens vÃ£o acabar em breve
 */
export const getStockRunoutForecast = createServerFn({ method: "GET" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryAlertService.getStockRunoutForecast(store.id, 7);
  });

/**
 * Check alerts for a specific item
 */
export const checkItemAlerts = createServerFn({ method: "POST" })
  .validator((data: { itemId: string }) => data)
  .handler(async ({ data }) => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryAlertService.checkItemAlerts(store.id, data.itemId);
  });

/**
 * Check all alerts for the store
 */
export const checkAllAlerts = createServerFn({ method: "GET" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store) {
      throw new Error("Not authenticated");
    }

    return InventoryAlertService.checkStoreAlerts(store.id);
  });

