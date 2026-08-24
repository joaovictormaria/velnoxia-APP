// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

export const adminSeedRecipe = createServerFn({ method: "POST" })
  .handler(async () => {
    const admin = await requireAdminSession();

    // Get inventory items by SKU
    const items = await prisma.inventoryItem.findMany({
      where: {
        storeId: admin.storeId,
        sku: {
          in: [
            "ING-1787347331381-4RQC", // AÃ§Ãºcar
            "ING-1787347332157-CWK6", // Chocolate em PÃ³
            "ING-1787347334056-8WVQ", // Farinha de trigo
            "ING-1787347333324-6PFY", // Fermento em PÃ³
            "ING-1787347332548-6OOM", // Leite
            "ING-1787347334499-ZG95", // Leite Condensado
            "ING-1787347334099-3RGH", // Manteiga
            "ING-1787347332936-7SAQ", // Ã“leo de Soja
            "ING-1787347331770-YL05", // Ovos
            "ING-1787347333711-4GLS", // Sal Fino
          ],
        },
      },
    });

    console.log(`âœ… Encontrados ${items.length} itens`);

    if (items.length < 10) {
      throw new Error(`Faltam itens. Encontrados apenas ${items.length}`);
    }

    // Get a unit
    const unit = await prisma.inventoryUnit.findFirst({
      where: { isBuiltIn: true },
    });

    if (!unit) {
      throw new Error("Nenhuma unidade encontrada");
    }

    // Create composition
    const composition = await prisma.productComposition.create({
      data: {
        storeId: admin.storeId,
        productId: "bolo-de-chocolate",
        version: 1,
        isActive: true,
        items: {
          create: items.map((item, idx) => ({
            inventoryItemId: item.id,
            quantity: 1,
            unitId: unit.id,
            sortOrder: idx,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return {
      success: true,
      productId: composition.productId,
      itemsCount: composition.items.length,
    };
  });

