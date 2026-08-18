-- Storefront copy per category. It lived in a map keyed by the seed's slugs, so
-- a category created by the owner rendered an empty pill and no description.
ALTER TABLE "Category" ADD COLUMN "badge" TEXT;
ALTER TABLE "Category" ADD COLUMN "headline" TEXT;
ALTER TABLE "Category" ADD COLUMN "subhead" TEXT;
