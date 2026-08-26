-- Who is carrying the order. Nullable on purpose: the owner may go out
-- themselves, and an order must never be stuck for lack of a courier.
ALTER TABLE "Order" ADD COLUMN "courierId" TEXT;
CREATE INDEX "Order_courierId_idx" ON "Order"("courierId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_courierId_fkey"
    FOREIGN KEY ("courierId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
