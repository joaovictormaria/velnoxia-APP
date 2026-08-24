// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/server/auth/session";
import { ProductionService } from "@/server/services/production-service";

export const adminProduceFromComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    try {
      console.log("ðŸ”„ adminProduceFromComposition iniciado");
      const admin = await requireAdminSession();
      const data = context?.data?.data || context?.data;

      console.log("âœ… Data recebida:", data?.compositionId, data?.quantity, data?.unitId);

      const result = await ProductionService.produceFromComposition(
        admin.storeId,
        data.compositionId,
        Number(data.quantity),
        data.unitId
      );

      console.log("âœ… ProduÃ§Ã£o concluÃ­da");
      return result;
    } catch (error) {
      console.error("âŒ Erro na produÃ§Ã£o:", error instanceof Error ? error.message : String(error));
      throw error;
    }
  });

export const adminGetLowStockItems = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();

    const items = await ProductionService.getLowStockItems(admin.storeId);
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      quantityOnHand: Number(item.quantityOnHand),
      minimumStock: Number(item.minimumStock || 0),
      unitId: item.baseUnitId,
    }));
  });

