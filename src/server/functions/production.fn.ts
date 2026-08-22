import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/server/auth/session";
import { ProductionService } from "@/server/services/production-service";

export const adminProduceFromComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    try {
      console.log("🔄 adminProduceFromComposition iniciado");
      const admin = await requireAdminSession();
      const data = context?.data?.data || context?.data;

      console.log("✅ Data recebida:", data?.compositionId, data?.quantity, data?.unitId);

      const result = await ProductionService.produceFromComposition(
        admin.storeId,
        data.compositionId,
        Number(data.quantity),
        data.unitId
      );

      console.log("✅ Produção concluída");
      return result;
    } catch (error) {
      console.error("❌ Erro na produção:", error instanceof Error ? error.message : String(error));
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
