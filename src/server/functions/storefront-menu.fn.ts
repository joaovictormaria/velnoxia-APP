import { createServerFn } from "@tanstack/react-start";
import { listActiveExtras } from "../repositories/extra-repository";
import { listMenuForStorefront } from "../repositories/product-repository";
import { getPublicStoreSettings } from "../repositories/store-settings-repository";

/** Public — no admin session required. Feeds the customer-facing menu. */
export const getStorefrontMenuFn = createServerFn({ method: "GET" }).handler(async () => {
  const [categories, extras, store] = await Promise.all([
    listMenuForStorefront(),
    listActiveExtras(),
    getPublicStoreSettings(),
  ]);
  return { categories, extras, store };
});
