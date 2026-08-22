-- AddForeignKey para Order.tableId referenciando Table.id
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL;
