// @ts-nocheck
import { prisma } from "@/server/db/client";
import { unitConversionRepository } from "@/server/repositories/unit-conversion-repository";
import { randomUUID } from "crypto";

export class ProductionService {
  static async produceFromComposition(
    storeId: string,
    compositionId: string,
    quantity: number,
    unitId: string,
    /** Identifica esta producao, para a chave de idempotencia ser estavel. */
    referencia: string = "AVULSO",
  ) {
    const composition = await prisma.productComposition.findUnique({
      where: { id: compositionId },
      include: {
        items: {
          include: {
            inventoryItem: true,
            unit: true,
          },
        },
        product: true,
      },
    });

    if (!composition) {
      throw new Error("Composition not found");
    }

    if (composition.storeId !== storeId) {
      throw new Error("Unauthorized");
    }

    // Validar se hÃ¡ estoque suficiente para todos os itens
    const insufficientItems = [];
    for (const item of composition.items) {
      const qtyNeeded = Number(item.quantity) * quantity;
      const qtyAvailable = Number(item.inventoryItem.quantityOnHand);

      if (qtyAvailable < qtyNeeded) {
        insufficientItems.push({
          name: item.inventoryItem.name,
          needed: qtyNeeded,
          available: qtyAvailable,
          unit: item.unit.code,
        });
      }
    }

    if (insufficientItems.length > 0) {
      const details = insufficientItems
        .map((i) => `${i.name}: precisa de ${i.needed} ${i.unit}, tem apenas ${i.available} ${i.unit}`)
        .join("; ");
      throw new Error(`âŒ Estoque insuficiente! ${details}`);
    }

    // Decrement inventory for each item in the composition
    let itemIdx = 0;
    for (const item of composition.items) {
      const qty = Number(item.quantity) * quantity;

      await prisma.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { quantityOnHand: { decrement: qty } },
      });

      // Create consumption movement record
      await prisma.inventoryMovement.create({
        data: {
          storeId,
          itemId: item.inventoryItemId,
          type: "CONSUMPTION",
          quantity: qty,
          unitId: item.unitId,
          reference: compositionId,
          referenceType: "COMPOSITION",
          // Deterministica: randomUUID() anulava o indice unico.
          idempotencyKey: `${storeId}#PRODUCTION#${referencia}#${item.inventoryItemId}`,
        },
      });

      itemIdx++;
    }

    // Mark composition as used
    await prisma.productComposition.update({
      where: { id: compositionId },
      data: {
        usageCount: { increment: 1 },
        firstUsedAt: composition.firstUsedAt || new Date(),
      },
    });

    return true;
  }

  static async getLowStockItems(storeId: string) {
    return prisma.inventoryItem.findMany({
      where: {
        storeId,
        isActive: true,
      },
    }).then((items) =>
      items.filter((item) => item.quantityOnHand < (item.minimumStock || 0))
    );
  }
}

