CREATE TABLE "PostLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostLike_pkey" PRIMARY KEY ("id")
);
-- One like per device per post; the constraint is what keeps the count honest.
CREATE UNIQUE INDEX "PostLike_postId_visitorId_key" ON "PostLike"("postId", "visitorId");
CREATE INDEX "PostLike_postId_idx" ON "PostLike"("postId");
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
