import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Award, BookOpen, ChevronDown, ShieldCheck, Truck } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { CategoryTabs } from "./CategoryTabs";
import { ProductCard } from "./ProductCard";
import { useCart } from "@/lib/pizzaria2/cart";
import { sizePrice, type CategorySlug } from "@/lib/pizzaria2/menu";
import { useMenu } from "@/lib/pizzaria2/menu-provider";
import { useStore } from "@/lib/pizzaria2/store-provider";

export const categoryBadges: Record<string, string> = {
  tradicionais: "Sabores que todo mundo ama",
  especiais: "Para ocasiões especiais",
  doces: "Pra adoçar o pedido",
  bebidas: "Geladinhas pra acompanhar",
  acompanhamentos: "Aquele extra pro pedido",
};

export const categoryDescriptions: Record<string, [string, string]> = {
  tradicionais: [
    "Os clássicos que nunca saem de moda.",
    "Qualidade, sabor e ingredientes selecionados para a pizza perfeita.",
  ],
  especiais: [
    "Combinações autorais para quem quer sair do óbvio.",
    "Receitas exclusivas com ingredientes premium, feitas para impressionar.",
  ],
  doces: [
    "Pra fechar o pedido com um toque doce.",
    "Recheios generosos e cobertura na medida certa, direto do forno.",
  ],
  bebidas: [
    "Pra acompanhar sua pizza geladinha.",
    "Sempre bem gelada, na hora que o pedido chega.",
  ],
  acompanhamentos: [
    "Aquele extra pra completar o pedido.",
    "Porções generosas, feitas pra dividir — ou não.",
  ],
};

const trustItems: { label: string; renderIcon: () => ReactNode }[] = [
  {
    label: "Ingredientes selecionados",
    renderIcon: () => <Award className="h-5 w-5 animate-badge-shine" />,
  },
  {
    label: "Entrega rápida",
    renderIcon: () => (
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="pointer-events-none absolute -left-1 top-0 flex flex-col gap-0.5">
          <span className="h-1 w-1 rounded-full bg-olive/60 animate-truck-smoke" style={{ animationDelay: "0s" }} />
          <span className="h-1 w-1 rounded-full bg-olive/60 animate-truck-smoke" style={{ animationDelay: "0.35s" }} />
        </span>
        <Truck className="h-5 w-5 animate-truck-drive" />
      </span>
    ),
  },
  {
    label: "Compra segura",
    renderIcon: () => (
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-olive/40 animate-ping" />
        <ShieldCheck className="relative h-5 w-5" />
      </span>
    ),
  },
];

/**
 * The full, interactive cardápio — category filters + product list — lives
 * entirely inside this component so it can be embedded once as a Home
 * section (#cardapio). Switching categories is local state, not routing.
 */
export function CategorySaboresSection({
  defaultCategorySlug,
}: {
  defaultCategorySlug?: CategorySlug;
}) {
  const { addLine } = useCart();
  const { categories, products, categoryBySlug, productsByCategory } = useMenu();
  const { slug: storeSlug } = useStore();

  // The opening tab comes from the data, never a fixed slug: the admin can
  // rename, reorder, deactivate or delete any category, and whichever one the
  // seed happened to create must not be load-bearing. Prefer the first
  // category that actually has products so the list is never empty on arrival.
  const fallbackSlug =
    categories.find((c) => productsByCategory(c.slug).length > 0)?.slug ??
    categories[0]?.slug ??
    "";
  const initialSlug =
    defaultCategorySlug && categoryBySlug(defaultCategorySlug)
      ? defaultCategorySlug
      : fallbackSlug;

  const [activeSlug, setActiveSlug] = useState<CategorySlug>(initialSlug);
  // A category can disappear while the page is open (deactivated in the admin),
  // so fall back rather than blanking the whole section.
  const category = categoryBySlug(activeSlug) ?? categoryBySlug(fallbackSlug);
  const items = category ? productsByCategory(category.slug) : [];

  if (!category) return null;

  // The category's own copy wins. The maps below stay only as a fallback for
  // stores seeded before these columns existed — a category created in the
  // admin has no entry there and would otherwise render blank.
  const [fallbackFirst, fallbackSecond] = categoryDescriptions[category.slug] ?? ["", ""];
  const firstLine = category.headline ?? fallbackFirst;
  const secondLine = category.subhead ?? fallbackSecond;

  // Landing directly on the produto page's "cardápio" screen (the same one
  // the add-to-cart flow slides into) needs *a* valid pizza slug to anchor
  // the route — which one barely matters since that screen shows every category.
  const ctaProductSlug =
    (category.kind === "pizza" ? items[0]?.slug : undefined) ?? products[0]?.slug ?? "";

  return (
    <>
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[400px_1fr] lg:gap-16 2xl:grid-cols-[440px_1fr] 2xl:gap-20">
        <Reveal variant="up" className="lg:pt-1">
          {/* Categories created in the admin have no entry in the copy maps —
              fall back to the category's own name instead of an empty pill. */}
          <span className="inline-flex items-center gap-2 rounded-full bg-tomato/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-tomato">
            {category.icon && <category.icon className="h-4 w-4" />}
            {category.badge ?? categoryBadges[category.slug] ?? category.name}
          </span>

          <h2 className="mt-5 font-display text-5xl font-extrabold leading-[1.05] text-charcoal sm:text-6xl lg:text-5xl">
            {category.name}
          </h2>

          {(firstLine || secondLine) && (
            <p className="mt-5 max-w-md text-base leading-relaxed text-charcoal/60">
              {firstLine}
              {secondLine && (
                <>
                  <br />
                  {secondLine}
                </>
              )}
            </p>
          )}

          <Link
            to="/$storeSlug/produto/$slug"
            params={{ storeSlug, slug: ctaProductSlug }}
            search={{ view: "cardapio" }}
            className="group mt-7 flex items-center gap-4 rounded-4xl bg-linear-to-br from-tomato to-[color:var(--primary-deep)] p-6 text-[color:var(--on-primary)] shadow-[0_20px_40px_-24px_rgba(233,75,44,0.6)] transition-transform hover:-translate-y-0.5"
          >
            <span className="grid h-13 w-13 shrink-0 place-items-center rounded-full bg-[color:var(--on-primary)]/15">
              <BookOpen className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold leading-tight">Veja o cardápio completo</span>
              <span className="mt-1 block text-sm leading-tight text-[color:var(--on-primary-muted)]">
                Mais sabores incríveis esperam por você!
              </span>
            </span>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--on-primary)] text-[color:var(--primary)] transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="h-5 w-5" />
            </span>
          </Link>

          <div className="mt-7 grid grid-cols-3 gap-4">
            {trustItems.map((item) => (
              <div key={item.label} className="flex flex-col items-start gap-2.5">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-olive/10 text-olive">
                  {item.renderIcon()}
                </span>
                <span className="text-xs leading-tight text-charcoal/60">{item.label}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <div>
          <CategoryTabs activeSlug={category.slug} onSelect={setActiveSlug} />

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3">
            {items.map((product, i) => (
              <Reveal key={product.slug} variant="up" delay={Math.min(i * 40, 320)}>
                <ProductCard
                  product={product}
                  linkToCustomize={category.kind === "pizza"}
                  onQuickAdd={() =>
                    addLine({
                      name: product.name,
                      sizeLabel: category.kind === "pizza" ? "Média" : undefined,
                      image: product.image,
                      icon: product.icon,
                      unitPrice: sizePrice(product, "media"),
                      extras: [],
                      qty: 1,
                      productSlug: product.slug,
                      sizeKey: category.kind === "pizza" ? "media" : undefined,
                    })
                  }
                />
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-14 flex items-center justify-center gap-2.5 text-base font-medium text-tomato">
        <ChevronDown className="h-5 w-5 animate-bounce" />
        Explore o cardápio completo e monte sua pizza favorita!
      </div>
    </>
  );
}
