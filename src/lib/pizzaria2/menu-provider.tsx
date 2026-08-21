import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ICONES_DE_CATEGORIA as ICONS } from "@/lib/category-icons";
import type { Category, Extra, OptionGroup, Product } from "./menu";

/** O mesmo formato de pergunta, venha ela da categoria ou do produto. */
function paraGrupos(
  grupos:
    | {
        id: string;
        name: string;
        minChoices: number;
        maxChoices: number;
        freeChoices: number;
        options: { id: string; name: string; price: number }[];
      }[]
    | undefined,
): OptionGroup[] {
  return (grupos ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    min: g.minChoices,
    max: g.maxChoices,
    free: g.freeChoices,
    options: g.options.map((o) => ({ id: o.id, name: o.name, price: o.price })),
  }));
}

/** Shape returned by getStorefrontMenuFn. */
export type MenuPayload = {
  categories: {
    id: string;
    name: string;
    slug: string;
    badge: string | null;
    headline: string | null;
    subhead: string | null;
    icon: string | null;
    imageUrl: string | null;
    kind: "PIZZA" | "SIMPLE";
    optionGroups: {
      id: string;
      name: string;
      minChoices: number;
      maxChoices: number;
      freeChoices: number;
      options: { id: string; name: string; price: number }[];
    }[];
    products: {
      id: string;
      name: string;
      slug: string;
      description: string;
      basePrice: number;
      imageUrl: string | null;
      tag: string | null;
      allowHalfAndHalf: boolean;
      optionGroups: {
        id: string;
        name: string;
        minChoices: number;
        maxChoices: number;
        freeChoices: number;
        options: { id: string; name: string; price: number }[];
      }[];
      sizes: { categorySize: { id: string; label: string }; price: number }[];
    }[];
  }[];
  extras: { id: string; name: string; price: number; categoryIds: string[]; productIds: string[] }[];
  promotions: {
    id: string;
    eyebrow: string;
    title: string;
    description: string;
    discount: string | null;
    price: number | null;
    originalPrice: number | null;
    imageUrl: string | null;
  }[];
  posts?: {
    id: string;
    title: string;
    body: string;
    imageUrl: string | null;
    publishedAt: string | Date;
    likeCount?: number;
  }[];
};

export type MenuApi = {
  categories: Category[];
  products: Product[];
  extras: Extra[];
  promotions: MenuPayload["promotions"];
  posts: NonNullable<MenuPayload["posts"]>;
  categoryBySlug: (slug: string) => Category | undefined;
  productBySlug: (slug: string) => Product | undefined;
  productsByCategory: (slug: string) => Product[];
};

const MenuContext = createContext<MenuApi | null>(null);

function adapt(payload: MenuPayload): MenuApi {
  const categories: Category[] = payload.categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    shortName: c.name.replace(/^Pizzas\s+/i, ""),
    image: c.imageUrl ?? c.products.find((p) => p.imageUrl)?.imageUrl ?? undefined,
    badge: c.badge ?? undefined,
    headline: c.headline ?? undefined,
    subhead: c.subhead ?? undefined,
    icon: c.icon ? ICONS[c.icon] : undefined,
    kind: c.kind === "PIZZA" ? "pizza" : "simple",
    optionGroups: paraGrupos(c.optionGroups),
  }));

  const products: Product[] = payload.categories.flatMap((c) =>
    c.products.map((p) => ({
      slug: p.slug,
      name: p.name,
      desc: p.description,
      price: p.basePrice,
      image: p.imageUrl ?? undefined,
      icon: !p.imageUrl && c.icon ? ICONS[c.icon] : undefined,
      categorySlug: c.slug,
      id: p.id,
      categoryId: c.id,
      tag: p.tag ?? undefined,
      allowHalfAndHalf: p.allowHalfAndHalf,
      optionGroups: paraGrupos(p.optionGroups),
      sizes: p.sizes.map((s) => ({
        id: s.categorySize.id,
        label: s.categorySize.label,
        price: s.price,
      })),
    })),
  );

  const extras: Extra[] = payload.extras.map((x) => ({
    id: x.id,
    label: x.name,
    price: x.price,
    categoryIds: x.categoryIds ?? [],
    productIds: x.productIds ?? [],
  }));

  return {
    categories,
    products,
    extras,
    promotions: payload.promotions ?? [],
    posts: payload.posts ?? [],
    categoryBySlug: (slug) => categories.find((c) => c.slug === slug),
    productBySlug: (slug) => products.find((p) => p.slug === slug),
    productsByCategory: (slug) => products.filter((p) => p.categorySlug === slug),
  };
}

export function MenuProvider({
  payload,
  children,
}: {
  payload: MenuPayload;
  children: ReactNode;
}) {
  const value = useMemo(() => adapt(payload), [payload]);
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function useMenu(): MenuApi {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu must be used inside <MenuProvider>");
  return ctx;
}
