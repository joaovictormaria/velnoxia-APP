import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/server/auth/session";
import { InventoryAlertRepository } from "@/server/repositories/inventory-alert-repository";

export const adminGetLowStockAlerts = createServerFn({ method: "GET" }).handler(
  async () => {
    const admin = await requireAdminSession();
    const alerts = await InventoryAlertRepository.findLowStockItems(
      admin.storeId
    );
    return { data: alerts };
  }
);
