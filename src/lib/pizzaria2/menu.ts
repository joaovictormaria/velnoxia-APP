import type { LucideIcon } from "lucide-react";

/**
 * Types and pure helpers for the customer-facing menu.
 *
 * The menu data itself lives in the database and is served by
 * getStorefrontMenuFn — consume it through `useMenu()` in menu-provider.tsx.
 */

export type CategorySlug = string;

export type Category = {
  slug: CategorySlug;
  name: string;
  shortName: string;
  /** Pizza categories have a photo; simple categories fall back to a branded icon tile. */
  image?: string;
  icon?: LucideIcon;
  kind: "pizza" | "simple";
};

export type SizeKey = "broto" | "media" | "grande" | "gigante";

export type ProductSize = { key: SizeKey; price: number };

export type Product = {
  slug: string;
  name: string;
  desc: string;
  /** Reference price — the base price, used when the product has no sizes. */
  price: number;
  image?: string;
  icon?: LucideIcon;
  categorySlug: CategorySlug;
  tag?: string;
  allowHalfAndHalf?: boolean;
  /** Absolute price per size, as configured in the admin panel. */
  sizes?: ProductSize[];
};

export type Extra = { id: string; label: string; price: number };

export const sizeBlocks: { key: SizeKey; label: string }[] = [
  { key: "broto", label: "Brotinho" },
  { key: "media", label: "Média" },
  { key: "grande", label: "Grande" },
  { key: "gigante", label: "Gigante" },
];

/**
 * Price for a given size. Sizes carry absolute prices from the admin panel,
 * so this is a lookup with the base price as fallback for size-less products.
 */
export function sizePrice(product: Product, size: SizeKey): number {
  const match = product.sizes?.find((s) => s.key === size);
  return match ? match.price : product.price;
}

/** Sizes actually offered for a product, in menu order. */
export function availableSizes(product: Product): { key: SizeKey; label: string; price: number }[] {
  if (!product.sizes?.length) return [];
  return sizeBlocks
    .filter((b) => product.sizes!.some((s) => s.key === b.key))
    .map((b) => ({ ...b, price: sizePrice(product, b.key) }));
}

export function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export const suggestedDrinkSlugs = [
  "coca-cola-2l",
  "guarana-antarctica-2l",
  "ice-tea-limao-2l",
];
