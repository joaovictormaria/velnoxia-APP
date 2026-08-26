-- Copy of the "Nosso restaurante" block, now owned by the store.
ALTER TABLE "StoreSettings" ADD COLUMN "aboutEyebrow" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "aboutTitle" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "aboutBody" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "aboutImageUrl" TEXT;

-- Reviews: who left it (device, not account) and whether it was hidden for
-- abuse. The comment and the rating stay as the customer wrote them.
ALTER TABLE "Review" ADD COLUMN "visitorId" TEXT;
ALTER TABLE "Review" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ReviewLike" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewLike_pkey" PRIMARY KEY ("id")
);
-- One like per device per review; the constraint is what makes the count honest.
CREATE UNIQUE INDEX "ReviewLike_reviewId_visitorId_key" ON "ReviewLike"("reviewId", "visitorId");
CREATE INDEX "ReviewLike_reviewId_idx" ON "ReviewLike"("reviewId");
ALTER TABLE "ReviewLike" ADD CONSTRAINT "ReviewLike_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Post_storeId_publishedAt_idx" ON "Post"("storeId", "publishedAt");
ALTER TABLE "Post" ADD CONSTRAINT "Post_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
