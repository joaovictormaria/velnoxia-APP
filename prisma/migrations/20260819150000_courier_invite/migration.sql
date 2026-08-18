-- Invite a courier to create their own account. The code itself is never
-- stored: only its hash, so reading the database does not hand anyone a
-- working invite.
CREATE TABLE "CourierInvite" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourierInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourierInvite_codeHash_key" ON "CourierInvite"("codeHash");
CREATE INDEX "CourierInvite_storeId_usedAt_idx" ON "CourierInvite"("storeId", "usedAt");
ALTER TABLE "CourierInvite" ADD CONSTRAINT "CourierInvite_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
