import type { CategoryKind, SizeLabel } from "@prisma/client";

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
  sizes?: { size: SizeLabel; price: number }[];
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

export const PIZZA_SIZES = (broto: number, media: number, grande: number, gigante: number) => [
  { size: "BROTINHO" as SizeLabel, price: broto },
  { size: "MEDIA" as SizeLabel, price: media },
  { size: "GRANDE" as SizeLabel, price: grande },
  { size: "GIGANTE" as SizeLabel, price: gigante },
];
