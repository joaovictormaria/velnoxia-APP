import { createServerFn } from "@tanstack/react-start";
import { listActiveExtras } from "../repositories/extra-repository";
import { listMenuForStorefront } from "../repositories/product-repository";

/** Public — no admin session required. Feeds the customer-facing menu. */
export const getStorefrontMenuFn = createServerFn({ method: "GET" }).handler(async () => {
  const [categories, extras] = await Promise.all([
    listMenuForStorefront(),
    listActiveExtras(),
  ]);
  return { categories, extras };
});
