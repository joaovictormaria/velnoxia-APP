import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/server/auth/session";
import { ProductionService } from "@/server/services/production-service";

export const adminGetLowStockItems = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();

    const items = await ProductionService.getLowStockItems(admin.storeId);
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      quantityOnHand: Number(item.quantityOnHand),
      // Era `item.minimumStock`, campo inexistente: o limite chegava sempre 0.
      minimumThreshold: Number(item.minimumThreshold ?? 0),
      unitId: item.baseUnitId,
    }));
  });

