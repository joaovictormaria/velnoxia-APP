-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TableSession_tableId_key" ON "TableSession"("tableId");

-- CreateIndex
CREATE INDEX "TableSession_storeId_expiresAt_idx" ON "TableSession"("storeId", "expiresAt");

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE;
