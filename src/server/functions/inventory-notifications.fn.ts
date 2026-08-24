import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/server/auth/session";
import { InventoryNotificationService } from "@/server/services/inventory-notification-service";

/**
 * Send critical alert email
 * Admin-only: Send email immediately when critical alerts exist
 */
export const sendAlertEmail = createServerFn({ method: "POST" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!(store as any)?.adminUser) {
      throw new Error("Not authenticated or not admin");
    }

    // Pegar email do admin
    const adminEmail = (store as any).adminUser.email;

    return InventoryNotificationService.sendAlertEmail(store.id, adminEmail);
  });

/**
 * Send forecast email
 * Admin-only: Send email with items that will run out soon
 */
export const sendForecastEmail = createServerFn({ method: "POST" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store?.email) {
      throw new Error("Not authenticated or not admin");
    }

    const adminEmail = store.email;

    return InventoryNotificationService.sendForecastEmail(
      store.id,
      adminEmail
    );
  });

/**
 * Send weekly report email
 * Admin-only: Send weekly summary report
 */
export const sendWeeklyReport = createServerFn({ method: "POST" })
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store?.email) {
      throw new Error("Not authenticated or not admin");
    }

    const adminEmail = store.email;

    return InventoryNotificationService.sendWeeklyReportEmail(
      store.id,
      adminEmail
    );
  });

