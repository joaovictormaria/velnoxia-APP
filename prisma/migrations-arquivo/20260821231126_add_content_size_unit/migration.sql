-- DropForeignKey
ALTER TABLE "CompositionItem" DROP CONSTRAINT "CompositionItem_compositionId_fkey";

-- DropForeignKey
ALTER TABLE "CompositionItem" DROP CONSTRAINT "CompositionItem_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "CompositionItem" DROP CONSTRAINT "CompositionItem_unitId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_baseUnitId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_storeId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_compositionId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_itemId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_originalMovementId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_storeId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_unitId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryUnitConversion" DROP CONSTRAINT "InventoryUnitConversion_fromUnitId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryUnitConversion" DROP CONSTRAINT "InventoryUnitConversion_toUnitId_fkey";

-- DropForeignKey
ALTER TABLE "ProductComposition" DROP CONSTRAINT "ProductComposition_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductComposition" DROP CONSTRAINT "ProductComposition_storeId_fkey";

-- DropIndex
DROP INDEX "Order_courierId_idx";

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "contentSize" DECIMAL(15,4),
ADD COLUMN     "contentUnit" TEXT,
ADD COLUMN     "maximumQuantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProductComposition" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "InventoryUnitConversion" ADD CONSTRAINT "InventoryUnitConversion_fromUnitId_fkey" FOREIGN KEY ("fromUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUnitConversion" ADD CONSTRAINT "InventoryUnitConversion_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_originalMovementId_fkey" FOREIGN KEY ("originalMovementId") REFERENCES "InventoryMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "ProductComposition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComposition" ADD CONSTRAINT "ProductComposition_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComposition" ADD CONSTRAINT "ProductComposition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "ProductComposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
