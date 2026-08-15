import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Gift, Search, ShoppingCart } from "lucide-react";
import { categoryDescriptions } from "./CategorySaboresSection";
import { ProductCard } from "./ProductCard";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { useCart } from "@/lib/pizzaria2/cart";
import { usePizzariaOnboarding, whatsappLink } from "@/lib/pizzaria2/onboarding";
import {
  formatCurrency,
  sizePrice,
  type Category,
  type CategorySlug,
  type Product,
} from "@/lib/pizzaria2/menu";
import { useMenu } from "@/lib/pizzaria2/menu-provider";
import { cn } from "@/lib/utils";
import ingredientsPhoto from "@/assets/fotos de pizza/mussarela.jpg";

function productTags(product: Product, category?: Category): string[] {
  const tags: string[] = [];
  const byCategory: Record<string, string> = {
    tradicionais: "Clássica",
    especiais: "Especial",
    doces: "Doce",
  };
  const label = category && byCategory[category.slug];
  if (label) tags.push(label);
  if (product.tag === "Mais pedida") tags.push("Favorita");
  return tags;
}

/**
 * The richer, e-commerce-style cardápio used inside the produto screen's
 * "Escolha outro sabor" step — search, status/cart pills, a category
 * sidebar, favorites and a floating cart button.
 */
export function CardapioPicker({
  onSelectPizza,
}: {
  onSelectPizza: (slug: string) => void;
}) {
  const { addLine, itemCount, total } = useCart();
  const { businessPhone, businessName } = usePizzariaOnboarding();
  const { categories, products: allProducts, productsByCategory } = useMenu();
  const [activeSlug, setActiveSlug] = useState<CategorySlug>(
    categories[0]?.slug ?? "tradicionais",
  );
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const activeCategory = categories.find((c) => c.slug === activeSlug);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term) {
      return allProducts.filter(
        (p) => p.name.toLowerCase().includes(term) || p.desc.toLowerCase().includes(term),
      );
    }
    return productsByCategory(activeSlug);
  }, [query, activeSlug, allProducts, productsByCategory]);

  function toggleFavorite(slug: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <div className="relative">
      {/* Utility bar — search, open/closed status, cart summary */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-charcoal/8 bg-mozzarella p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no cardápio..."
            className="w-full rounded-full border border-charcoal/10 bg-cream/60 py-2.5 pl-10 pr-4 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-tomato focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-full border border-charcoal/10 px-3.5 py-2 text-xs font-semibold text-charcoal/70">
          <Clock className="h-4 w-4 text-tomato" />
          Hoje · 18:00 – 23:30
          <span className="rounded-full bg-olive/10 px-2 py-0.5 text-[11px] font-bold text-olive">
            Aberto
          </span>
        </div>
        <Link
          to="/pizzaria-2/carrinho"
          className="flex items-center gap-2 rounded-full bg-tomato px-4 py-2 text-sm font-bold text-mozzarella transition-colors hover:bg-tomato/90"
        >
          <span className="relative">
            <ShoppingCart className="h-4 w-4" />
            {itemCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-mozzarella px-0.5 text-[9px] font-bold text-tomato">
                {itemCount}
              </span>
            )}
          </span>
          {formatCurrency(total)}
        </Link>
      </div>

      {/* Heading + promo banner */}
      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tomato/10 text-tomato">
            {activeCategory?.icon && <activeCategory.icon className="h-5 w-5" />}
          </span>
          <div>
            <h2 className="font-display text-2xl font-extrabold text-charcoal sm:text-3xl">
              {query.trim() ? "Resultados da busca" : activeCategory?.name}
            </h2>
            <p className="mt-1 text-sm text-charcoal/55">
              {query.trim()
                ? `${results.length} sabor${results.length === 1 ? "" : "es"} encontrado${results.length === 1 ? "" : "s"}.`
                : categoryDescriptions[activeSlug]?.[0]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-charcoal/8 bg-tomato/5 p-4 lg:max-w-sm">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tomato/10 text-tomato">
            <Gift className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-tomato">Ingredientes selecionados</p>
            <p className="mt-0.5 text-xs leading-relaxed text-charcoal/60">
              Massa fresca, molho artesanal e muito mais sabor para sua pizza perfeita.
            </p>
          </div>
          <img
            src={ingredientsPhoto}
            alt=""
            className="hidden h-16 w-16 shrink-0 rounded-xl object-cover sm:block"
          />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="flex flex-col gap-4">
          <div>
            <p className="px-1 text-xs font-bold uppercase tracking-wide text-tomato">
              Categorias
            </p>
            <nav className="mt-3 flex flex-col gap-1">
              {categories.map((cat) => {
                const active = cat.slug === activeSlug && !query.trim();
                return (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setActiveSlug(cat.slug);
                    }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                      active ? "bg-tomato/10 text-tomato" : "text-charcoal/70 hover:bg-charcoal/5",
                    )}
                  >
                    {cat.icon && <cat.icon className="h-4 w-4 shrink-0" />}
                    {cat.name}
                  </button>
                );
              })}
            </nav>
          </div>

          <a
            href={whatsappLink(
              businessPhone,
              `Olá! Vi que ${businessName} tem uma oferta pro primeiro pedido, quero aproveitar 🍕`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-tomato/20 bg-tomato/5 p-4 transition-colors hover:bg-tomato/10"
          >
            <div className="flex items-center gap-2.5">
              <Gift className="h-4 w-4 shrink-0 text-tomato" />
              <div>
                <p className="text-sm font-bold text-tomato">Ganhe 10% OFF</p>
                <p className="text-xs text-charcoal/55">No seu primeiro pedido!</p>
              </div>
            </div>
            <span className="mt-3 block rounded-full border border-tomato/30 py-2 text-center text-xs font-bold text-tomato">
              Quero aproveitar
            </span>
          </a>

          <a
            href={whatsappLink(businessPhone, `Olá! Preciso de uma ajuda com o pedido 🍕`)}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2.5 rounded-2xl border border-charcoal/8 bg-mozzarella p-4 transition-colors hover:border-tomato/25"
          >
            <WhatsAppIcon className="h-5 w-5 shrink-0 text-olive" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-charcoal">Precisa de ajuda?</span>
              <span className="block text-xs text-charcoal/55">Fale com a gente no WhatsApp</span>
            </span>
            <span className="text-tomato transition-transform group-hover:translate-x-0.5">→</span>
          </a>
        </aside>

        {/* Product grid */}
        <div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((product) => {
              const productCategory = categories.find((c) => c.slug === product.categorySlug);
              const isPizza = productCategory?.kind === "pizza";
              return (
                <ProductCard
                  key={product.slug}
                  product={product}
                  linkToCustomize={isPizza}
                  onSelect={isPizza ? () => onSelectPizza(product.slug) : undefined}
                  tags={productTags(product, productCategory)}
                  favorited={favorites.has(product.slug)}
                  onToggleFavorite={() => toggleFavorite(product.slug)}
                  onQuickAdd={() =>
                    addLine({
                      name: product.name,
                      sizeLabel: isPizza ? "Média" : undefined,
                      image: product.image,
                      icon: product.icon,
                      unitPrice: sizePrice(product, "media"),
                      extras: [],
                      qty: 1,
                      productSlug: product.slug,
                      sizeKey: isPizza ? "media" : undefined,
                    })
                  }
                />
              );
            })}
          </div>

          {results.length === 0 && (
            <p className="py-12 text-center text-sm text-charcoal/50">
              Nenhum sabor encontrado para "{query}".
            </p>
          )}
        </div>
      </div>

      {/* Floating cart button */}
      {itemCount > 0 && (
        <Link
          to="/pizzaria-2/carrinho"
          className="fixed bottom-6 right-6 z-20 flex items-center gap-2 rounded-full bg-tomato px-5 py-3.5 text-sm font-bold text-mozzarella shadow-[0_20px_40px_-16px_rgba(233,75,44,0.6)] transition-transform hover:-translate-y-0.5"
        >
          <span className="relative">
            <ShoppingCart className="h-5 w-5" />
            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-mozzarella px-0.5 text-[10px] font-bold text-tomato">
              {itemCount}
            </span>
          </span>
          Ver pedido
        </Link>
      )}
    </div>
  );
}
