-- Multi-tenancy: every domain record becomes owned by a Store.
--
-- Written by hand rather than generated because the tables already hold data.
-- The generated version adds `storeId TEXT NOT NULL` with no default, which
-- fails on the first existing row. Here each column is added nullable,
-- backfilled with the store created below, and only then made mandatory.

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StoreStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");
CREATE INDEX "Store_status_idx" ON "Store"("status");

-- Everything that exists today belongs to the developer's own store. ACTIVE
-- rather than TRIAL so it never expires out from under local development.
INSERT INTO "Store" ("id", "slug", "name", "status", "createdAt", "updatedAt")
VALUES ('store_dev', 'loja-teste', 'Loja teste de desenvolvedor', 'ACTIVE', NOW(), NOW());

-- DropIndex: global uniques and indexes that multi-tenancy replaces
DROP INDEX "Category_slug_key";
DROP INDEX "Category_sortOrder_idx";
DROP INDEX "Coupon_code_key";
DROP INDEX "Customer_phone_key";
DROP INDEX "Notification_isRead_createdAt_idx";
DROP INDEX "Order_createdAt_idx";
DROP INDEX "Order_number_key";
DROP INDEX "Order_status_createdAt_idx";
DROP INDEX "Product_slug_key";
DROP INDEX "Review_createdAt_idx";
DROP INDEX "Review_status_idx";

-- AddColumn (nullable), backfill, then enforce
ALTER TABLE "AdminUser"    ADD COLUMN "storeId" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Category"     ADD COLUMN "storeId" TEXT;
ALTER TABLE "Product"      ADD COLUMN "storeId" TEXT;
ALTER TABLE "Extra"        ADD COLUMN "storeId" TEXT;
ALTER TABLE "Coupon"       ADD COLUMN "storeId" TEXT;
ALTER TABLE "Customer"     ADD COLUMN "storeId" TEXT;
ALTER TABLE "Order"        ADD COLUMN "storeId" TEXT;
ALTER TABLE "Review"       ADD COLUMN "storeId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "storeId" TEXT;

UPDATE "AdminUser"     SET "storeId" = 'store_dev';
UPDATE "StoreSettings" SET "storeId" = 'store_dev';
UPDATE "Category"      SET "storeId" = 'store_dev';
UPDATE "Product"       SET "storeId" = 'store_dev';
UPDATE "Extra"         SET "storeId" = 'store_dev';
UPDATE "Coupon"        SET "storeId" = 'store_dev';
UPDATE "Customer"      SET "storeId" = 'store_dev';
UPDATE "Order"         SET "storeId" = 'store_dev';
UPDATE "Review"        SET "storeId" = 'store_dev';
UPDATE "Notification"  SET "storeId" = 'store_dev';

ALTER TABLE "AdminUser"     ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "StoreSettings" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Category"      ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Product"       ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Extra"         ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Coupon"        ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Customer"      ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Order"         ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Review"        ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Notification"  ALTER COLUMN "storeId" SET NOT NULL;

-- StoreSettings stops being a singleton row.
ALTER TABLE "StoreSettings" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "OpeningHour"     ALTER COLUMN "storeSettingsId" DROP DEFAULT;
ALTER TABLE "RestaurantPhoto" ALTER COLUMN "storeSettingsId" DROP DEFAULT;

-- Order numbering becomes per-store, so the database-wide sequence goes away.
-- Existing numbers are kept: they are already unique within this single store.
ALTER TABLE "Order" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "Order_number_seq";

-- CreateIndex: store-scoped replacements
CREATE INDEX "AdminUser_storeId_idx" ON "AdminUser"("storeId");
CREATE UNIQUE INDEX "StoreSettings_storeId_key" ON "StoreSettings"("storeId");
CREATE INDEX "Category_storeId_sortOrder_idx" ON "Category"("storeId", "sortOrder");
CREATE UNIQUE INDEX "Category_storeId_slug_key" ON "Category"("storeId", "slug");
CREATE INDEX "Product_storeId_isActive_idx" ON "Product"("storeId", "isActive");
CREATE UNIQUE INDEX "Product_storeId_slug_key" ON "Product"("storeId", "slug");
CREATE INDEX "Extra_storeId_isActive_idx" ON "Extra"("storeId", "isActive");
CREATE UNIQUE INDEX "Coupon_storeId_code_key" ON "Coupon"("storeId", "code");
CREATE UNIQUE INDEX "Customer_storeId_phone_key" ON "Customer"("storeId", "phone");
CREATE INDEX "Order_storeId_status_createdAt_idx" ON "Order"("storeId", "status", "createdAt");
CREATE INDEX "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");
CREATE UNIQUE INDEX "Order_storeId_number_key" ON "Order"("storeId", "number");
CREATE INDEX "Review_storeId_status_idx" ON "Review"("storeId", "status");
CREATE INDEX "Review_storeId_createdAt_idx" ON "Review"("storeId", "createdAt");
CREATE INDEX "Notification_storeId_isRead_createdAt_idx" ON "Notification"("storeId", "isRead", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminUser"     ADD CONSTRAINT "AdminUser_storeId_fkey"     FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category"      ADD CONSTRAINT "Category_storeId_fkey"      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product"       ADD CONSTRAINT "Product_storeId_fkey"       FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Extra"         ADD CONSTRAINT "Extra_storeId_fkey"         FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Coupon"        ADD CONSTRAINT "Coupon_storeId_fkey"        FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer"      ADD CONSTRAINT "Customer_storeId_fkey"      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order"         ADD CONSTRAINT "Order_storeId_fkey"         FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review"        ADD CONSTRAINT "Review_storeId_fkey"        FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification"  ADD CONSTRAINT "Notification_storeId_fkey"  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
