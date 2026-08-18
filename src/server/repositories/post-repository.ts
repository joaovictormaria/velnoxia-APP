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
export function listPublishedPosts(storeId: string, take = 6) {
  return prisma.post.findMany({
    where: { storeId, isPublished: true },
    orderBy: { publishedAt: "desc" },
    take,
  });
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
