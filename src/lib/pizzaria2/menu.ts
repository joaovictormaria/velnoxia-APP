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
  /** Storefront copy, editable per category in the admin. */
  badge?: string;
  headline?: string;
  subhead?: string;
  /** Pizza categories have a photo; simple categories fall back to a branded icon tile. */
  image?: string;
  icon?: LucideIcon;
  kind: "pizza" | "simple";
  /** Perguntas feitas a qualquer produto desta categoria. */
  optionGroups: OptionGroup[];
};

/**
 * Um tamanho oferecido, já com o nome que o dono escolheu.
 *
 * O id é o do tamanho da categoria: é ele que vai no carrinho e no checkout,
 * porque o servidor reconfere o preço por ele. O nome viaja junto só para a
 * tela ter o que mostrar sem uma segunda consulta.
 */
export type ProductSize = { id: string; label: string; price: number };

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

/**
 * Uma pergunta que o cardápio faz antes de o item ir para o carrinho: o sabor
 * do shake, o ponto da carne, os complementos do açaí.
 */
export type OptionGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  /** Quantas escolhas não são cobradas, contando das mais caras. */
  free: number;
  options: { id: string; name: string; price: number }[];
};

/**
 * Preço num tamanho. Cai no preço base quando o produto não tem tamanhos —
 * bebidas e porções são vendidas assim.
 */
export function sizePrice(product: Product, sizeId?: string): number {
  if (!sizeId) return defaultSize(product)?.price ?? product.price;
  return product.sizes?.find((s) => s.id === sizeId)?.price ?? product.price;
}

/** Tamanhos oferecidos, na ordem em que a categoria os define. */
export function availableSizes(product: Product): ProductSize[] {
  return product.sizes ?? [];
}

/**
 * O tamanho que o "adicionar rápido" do cardápio usa.
 *
 * É o primeiro da categoria, e não um nome fixo: antes o código pedia "media",
 * o que só existia numa pizzaria. Numa marmitaria de P/M/G isso não resolveria
 * para nada e o produto entraria no carrinho pelo preço base.
 */
export function defaultSize(product: Product): ProductSize | null {
  return product.sizes?.[0] ?? null;
}

export function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export const suggestedDrinkSlugs = [
  "coca-cola-2l",
  "guarana-antarctica-2l",
  "ice-tea-limao-2l",
];
