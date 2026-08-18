import { prisma } from "../db/client";

/** A publication lives two days and then goes. Short on purpose: it keeps the
 *  blog current and gives the owner a reason to come back and post again. */
export const POST_LIFETIME_DAYS = 2;

/**
 * Counted from when it was posted, not from the date typed in the panel — that
 * date is what readers see, and basing the countdown on it would let a
 * backdated post arrive already dead.
 */
function expiryCutoff() {
  return new Date(Date.now() - POST_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Deletes what has run out. Called from the listings rather than from a
 * scheduler this project does not have; the age filters below mean an expired
 * post is invisible even if no sweep has run yet, so the delete is cleanup, not
 * the thing that enforces the rule.
 */
export function deleteExpiredPosts(storeId: string) {
  return prisma.post.deleteMany({
    where: { storeId, createdAt: { lt: expiryCutoff() } },
  });
}

export type PostInput = {
  title: string;
  body: string;
  imageUrl?: string | null;
  isPublished: boolean;
  publishedAt?: Date | null;
};

const toData = (data: PostInput) => ({
  title: data.title,
  body: data.body,
  imageUrl: data.imageUrl ?? null,
  isPublished: data.isPublished,
  ...(data.publishedAt ? { publishedAt: data.publishedAt } : {}),
});

export async function listPosts(storeId: string) {
  await deleteExpiredPosts(storeId);
  return prisma.post.findMany({
    where: { storeId, createdAt: { gte: expiryCutoff() } },
    orderBy: { publishedAt: "desc" },
  });
}

/** The storefront shows only what the owner published, newest first. */
export async function listPublishedPosts(storeId: string, take = 6) {
  const posts = await prisma.post.findMany({
    where: { storeId, isPublished: true, createdAt: { gte: expiryCutoff() } },
    orderBy: { publishedAt: "desc" },
    take,
    include: { _count: { select: { likes: true } } },
  });
  return posts.map(({ _count, ...p }) => ({ ...p, likeCount: _count.likes }));
}

/** Which of these posts this device already liked. Sent apart from the posts
 *  themselves because the server render has no visitor to speak of. */
export async function listLikedPostIds(storeId: string, visitorId: string) {
  // Likes on a post that already expired are not worth reporting.
  const likes = await prisma.postLike.findMany({
    where: { visitorId, post: { storeId } },
    select: { postId: true },
  });
  return likes.map((l) => l.postId);
}

/** Toggle. The unique index does the deduplication. */
export async function togglePostLike(
  storeId: string,
  postId: string,
  visitorId: string,
) {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      storeId,
      isPublished: true,
      createdAt: { gte: expiryCutoff() },
    },
    select: { id: true },
  });
  if (!post) return null;

  const existing = await prisma.postLike.findUnique({
    where: { postId_visitorId: { postId, visitorId } },
  });
  if (existing) await prisma.postLike.delete({ where: { id: existing.id } });
  else await prisma.postLike.create({ data: { postId, visitorId } });

  const likeCount = await prisma.postLike.count({ where: { postId } });
  return { likeCount, likedByMe: !existing };
}

export function createPost(storeId: string, data: PostInput) {
  return prisma.post.create({ data: { ...toData(data), storeId } });
}

/** storeId is part of the filter so an id from another store matches nothing. */
export function updatePost(storeId: string, id: string, data: PostInput) {
  return prisma.post.update({ where: { id, storeId }, data: toData(data) });
}

export function deletePost(storeId: string, id: string) {
  return prisma.post.delete({ where: { id, storeId } });
}
