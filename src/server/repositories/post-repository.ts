import { prisma } from "../db/client";

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

export function listPosts(storeId: string) {
  return prisma.post.findMany({ where: { storeId }, orderBy: { publishedAt: "desc" } });
}

/** The storefront shows only what the owner published, newest first. */
export async function listPublishedPosts(storeId: string, take = 6) {
  const posts = await prisma.post.findMany({
    where: { storeId, isPublished: true },
    orderBy: { publishedAt: "desc" },
    take,
    include: { _count: { select: { likes: true } } },
  });
  return posts.map(({ _count, ...p }) => ({ ...p, likeCount: _count.likes }));
}

/** Which of these posts this device already liked. Sent apart from the posts
 *  themselves because the server render has no visitor to speak of. */
export async function listLikedPostIds(storeId: string, visitorId: string) {
  const likes = await prisma.postLike.findMany({
    where: { visitorId, post: { storeId } },
    select: { postId: true },
  });
  return likes.map((l) => l.postId);
}

/** Toggle. The unique index does the deduplication. */
export async function togglePostLike(storeId: string, postId: string, visitorId: string) {
  const post = await prisma.post.findFirst({
    where: { id: postId, storeId, isPublished: true },
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
