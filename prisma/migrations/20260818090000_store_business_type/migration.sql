-- Business type drives which starter catalog a new store is seeded with and
-- which copy the storefront shows. Existing stores keep the pizza template.
ALTER TABLE "Store" ADD COLUMN "businessType" TEXT NOT NULL DEFAULT 'pizzaria';
