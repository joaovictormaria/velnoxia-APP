import type { CategoryKind } from "@prisma/client";

/**
 * Shape of what a store gets the moment it signs up.
 *
 * Lives apart from the menus and from the registry so both can import it
 * without a cycle: the menus describe the food, the registry decides which
 * trade gets which menu, and neither needs to know about the other.
 */

export type StarterProduct = {
  name: string;
  description: string;
  basePrice: number;
  tag?: string;
  allowHalfAndHalf?: boolean;
  imageUrl?: string;
  /** Preço em cada tamanho, casado pelo nome com os da categoria. */
  sizes?: { label: string; price: number }[];
};

export type StarterCategory = {
  name: string;
  /** Pill above the title on the storefront. */
  badge?: string;
  /** Two lines under the title. */
  headline?: string;
  subhead?: string;
  slug: string;
  icon: string;
  kind: CategoryKind;
  /** Tamanhos oferecidos, na ordem. Ausente quando a categoria não usa. */
  sizes?: string[];
  products: StarterProduct[];
};

export type StarterCatalog = {
  /** Shown in the business-type selector at signup. */
  label: string;
  /** Short line under the store name in the storefront header. */
  tagline: string;
  /** Footer paragraph. */
  description: string;
  categories: StarterCategory[];
  extras: { name: string; price: number }[];
  /** Carousel slides the store opens with; the owner edits them in the panel. */
  promotions: { eyebrow: string; title: string; description: string; discount?: string }[];
};

/** Os nomes que uma pizzaria usa. Ficam aqui para categoria e produto não
 *  divergirem — o preço é casado pelo nome. */
export const NOMES_DE_PIZZA = ["Brotinho", "Média", "Grande", "Gigante"];

export const PIZZA_SIZES = (broto: number, media: number, grande: number, gigante: number) =>
  NOMES_DE_PIZZA.map((label, i) => ({ label, price: [broto, media, grande, gigante][i] }));
