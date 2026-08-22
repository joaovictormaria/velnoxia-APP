-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "inventoryItemId" TEXT;

-- CreateIndex
CREATE INDEX "Product_inventoryItemId_idx" ON "Product"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
