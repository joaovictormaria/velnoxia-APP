import { prisma } from "../db/client";

export type ReviewInput = {
  customerNameSnapshot: string;
  rating: number;
  comment: string;
  visitorId: string;
};

const publicSelect = {
  id: true,
  customerNameSnapshot: true,
  rating: true,
  comment: true,
  response: true,
  respondedAt: true,
  createdAt: true,
  _count: { select: { likes: true } },
} as const;

/**
 * Public list. Hidden reviews disappear for everyone, including their author —
 * an admin who hides one is not editing it, and cannot.
 */
export async function listPublicReviews(storeId: string, visitorId?: string | null) {
  const reviews = await prisma.review.findMany({
    where: { storeId, isHidden: false, channel: "SITE" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: publicSelect,
  });
  const liked = visitorId
    ? new Set(
        (
          await prisma.reviewLike.findMany({
            where: { visitorId, reviewId: { in: reviews.map((r) => r.id) } },
            select: { reviewId: true },
          })
        ).map((l) => l.reviewId),
      )
    : new Set<string>();

  return reviews.map(({ _count, ...r }) => ({
    ...r,
    likeCount: _count.likes,
    likedByMe: liked.has(r.id),
  }));
}

export async function ratingSummary(storeId: string) {
  const agg = await prisma.review.aggregate({
    where: { storeId, isHidden: false, channel: "SITE" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return { average: agg._avg.rating ?? 0, total: agg._count._all };
}

/** Admin view: everything, including hidden, read-only by design. */
export function listReviewsForAdmin(storeId: string) {
  return prisma.review.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { likes: true } } },
  });
}

export function createReview(storeId: string, data: ReviewInput) {
  return prisma.review.create({
    data: {
      storeId,
      customerNameSnapshot: data.customerNameSnapshot,
      rating: data.rating,
      comment: data.comment,
      visitorId: data.visitorId,
      channel: "SITE",
    },
  });
}

/** One review per device per store, so a single visitor cannot stuff the list. */
export function findReviewByVisitor(storeId: string, visitorId: string) {
  return prisma.review.findFirst({ where: { storeId, visitorId } });
}

/**
 * Toggle. The unique index does the deduplication; this only decides which way
 * the toggle goes for this device.
 */
export async function toggleLike(storeId: string, reviewId: string, visitorId: string) {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, storeId, isHidden: false },
    select: { id: true },
  });
  if (!review) return null;

  const existing = await prisma.reviewLike.findUnique({
    where: { reviewId_visitorId: { reviewId, visitorId } },
  });
  if (existing) await prisma.reviewLike.delete({ where: { id: existing.id } });
  else await prisma.reviewLike.create({ data: { reviewId, visitorId } });

  const likeCount = await prisma.reviewLike.count({ where: { reviewId } });
  return { likeCount, likedByMe: !existing };
}

/** The two things an admin may do: answer publicly, or hide abuse. */
export function respondToReview(storeId: string, id: string, adminId: string, response: string) {
  return prisma.review.update({
    where: { id, storeId },
    data: { response, respondedAt: new Date(), respondedByAdminId: adminId, status: "RESPONDED" },
  });
}

export function setReviewHidden(storeId: string, id: string, isHidden: boolean) {
  return prisma.review.update({ where: { id, storeId }, data: { isHidden } });
}
