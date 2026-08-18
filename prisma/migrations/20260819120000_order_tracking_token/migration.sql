-- Public tracking link secret. Nullable: orders placed before this exist
-- without one, and they simply have no link.
ALTER TABLE "Order" ADD COLUMN "trackingToken" TEXT;
CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");
