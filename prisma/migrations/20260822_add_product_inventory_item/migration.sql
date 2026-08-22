-- Add inventoryItemId column to Product table
ALTER TABLE "Product" ADD COLUMN "inventoryItemId" TEXT;

-- Add foreign key constraint
ALTER TABLE "Product" ADD CONSTRAINT "Product_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL;
