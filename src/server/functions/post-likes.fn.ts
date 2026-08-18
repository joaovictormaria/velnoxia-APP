import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";
import { getStoreBySlug, isStoreServable } from "../repositories/store-repository";
import { listLikedPostIds, togglePostLike } from "../repositories/post-repository";

const visitorId = z.string().trim().min(8).max(64);

async function servableStore(slug: string) {
  const store = await getStoreBySlug(slug);
  if (!store || !isStoreServable(store)) throw notFound();
  return store;
}

export const listLikedPostsFn = createServerFn({ method: "GET" })
  .validator(z.object({ storeSlug: z.string().min(1), visitorId }))
  .handler(async ({ data }) => {
    const store = await servableStore(data.storeSlug);
    return listLikedPostIds(store.id, data.visitorId);
  });

export const togglePostLikeFn = createServerFn({ method: "POST" })
  .validator(z.object({ storeSlug: z.string().min(1), postId: z.string(), visitorId }))
  .handler(async ({ data }) => {
    const store = await servableStore(data.storeSlug);
    const result = await togglePostLike(store.id, data.postId, data.visitorId);
    if (!result) return { ok: false as const, error: "Publicação não encontrada." };
    return { ok: true as const, ...result };
  });
