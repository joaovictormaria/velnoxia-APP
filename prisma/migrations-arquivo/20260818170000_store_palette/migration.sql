-- Palette choice: a flat brand colour, or a gradient of up to three stops.
-- Existing stores keep GRADIENT, which is what they already rendered (the
-- gradient was derived from the single colour), so nothing changes visually.
ALTER TABLE "StoreSettings" ADD COLUMN "colorMode" TEXT NOT NULL DEFAULT 'GRADIENT';
ALTER TABLE "StoreSettings" ADD COLUMN "secondaryColor" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "tertiaryColor" TEXT;
