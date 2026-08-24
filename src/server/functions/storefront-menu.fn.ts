// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";
import { listActiveExtras } from "../repositories/extra-repository";
import { listMenuForStorefront } from "../repositories/product-repository";
import { getPublicStoreSettings } from "../repositories/store-settings-repository";
import { getStoreBySlug, isStoreServable } from "../repositories/store-repository";
import { listActivePromotions } from "../repositories/promotion-repository";
import { listPublishedPosts } from "../repositories/post-repository";

/**
 * Public â€” no admin session. The tenant comes from the URL segment, so an
 * unknown, suspended or expired store is a 404 rather than an empty menu.
 */
export const getStorefrontMenuFn = createServerFn({ method: "GET" })
  .validator(z.object({ storeSlug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const store = await getStoreBySlug(data.storeSlug);
    if (!store || !isStoreServable(store)) throw notFound();

    const [categories, extras, settings, promotions, posts] = await Promise.all([
      listMenuForStorefront(store.id),
      listActiveExtras(store.id),
      getPublicStoreSettings(store.id),
      listActivePromotions(store.id),
      listPublishedPosts(store.id),
    ]);
    return { categories, extras, promotions, posts, store: { ...settings, slug: store.slug } } as any;
  });

