import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Search, ShoppingCart } from "lucide-react";
import { categoryDescriptions } from "./CategorySaboresSection";
import { ProductRow } from "./ProductRow";
import { useCart } from "@/lib/pizzaria2/cart";
import { useStore } from "@/lib/pizzaria2/store-provider";
import {
  formatCurrency,
  defaultSize,
  exigeEscolha,
  sizePrice,
  type Category,
  type CategorySlug,
  type Product,
} from "@/lib/pizzaria2/menu";
import { useMenu } from "@/lib/pizzaria2/menu-provider";
import { cn } from "@/lib/utils";

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
  const { slug: storeSlug } = useStore();
  const { categories, products: allProducts, productsByCategory, categoryBySlug } = useMenu();
  const [activeSlug, setActiveSlug] = useState<CategorySlug>(
    categories[0]?.slug ?? "tradicionais",
  );
  const [query, setQuery] = useState("");

  const activeCategory = categories.find((c) => c.slug === activeSlug);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term) {
      return allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.desc.toLowerCase().includes(term),
      );
    }
    return productsByCategory(activeSlug);
  }, [query, activeSlug, allProducts, productsByCategory]);

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
            className="w-full rounded-full border border-charcoal/10 bg-cream/60 py-2.5 pl-10 pr-4 text-base md:text-sm text-charcoal placeholder:text-charcoal/40 focus:border-tomato focus:outline-none"
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
          to="/$storeSlug/carrinho"
          params={{ storeSlug }}
          search={{ pagar: itemCount > 0 ? true : undefined }}
          className="flex items-center gap-2 rounded-full bg-tomato px-4 py-2 text-sm font-bold text-[color:var(--on-primary)] transition-colors hover:bg-tomato/90 active:scale-95"
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
        {/*
          Em tela larga o "Finalizar compras" mora aqui, ao lado do carrinho,
          onde o olho já está. O botão flutuante do canto existe para o celular,
          onde essa barra some da vista assim que a pessoa começa a rolar.
        */}
        {itemCount > 0 && (
          <Link
            to="/$storeSlug/carrinho"
            params={{ storeSlug }}
            search={{ pagar: true }}
            className="hidden items-center gap-2 rounded-full bg-charcoal px-5 py-2 text-sm font-bold text-mozzarella transition-colors hover:bg-charcoal/90 active:scale-95 lg:flex"
          >
            Finalizar compras
          </Link>
        )}
      </div>

      {/* Heading + promo banner */}
      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tomato/10 text-tomato">
            {activeCategory?.icon && (
              <activeCategory.icon className="h-5 w-5" />
            )}
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
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="flex flex-col gap-4">
          <div>
            <p className="px-1 text-xs font-bold uppercase tracking-wide text-tomato">
              Categorias
            </p>
            {/* O -mx-4/px-4 deixa a fila encostar nas bordas da tela ao rolar,
                em vez de parecer cortada dentro de uma caixa. */}
            <nav className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
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
                      "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors lg:shrink",
                      active
                        ? "bg-tomato/10 text-tomato"
                        : "text-charcoal/70 hover:bg-charcoal/5",
                    )}
                  >
                    {cat.icon && <cat.icon className="h-4 w-4 shrink-0" />}
                    {cat.name}
                  </button>
                );
              })}
            </nav>
          </div>

        </aside>

        {/* Product grid */}
        <div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {results.map((product) => {
              return (
                <ProductRow
                  key={product.slug}
                  product={product}
                  price={sizePrice(product)}
                  exigeEscolha={exigeEscolha(product, categoryBySlug(product.categorySlug))}
                  onQuickAdd={() =>
                    addLine({
                      name: product.name,
                      sizeLabel: defaultSize(product)?.label,
                      image: product.image,
                      icon: product.icon,
                      unitPrice: sizePrice(product),
                      extras: [],
                      qty: 1,
                      productSlug: product.slug,
                      sizeId: defaultSize(product)?.id,
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

      {/*
        Com item no carrinho o botão deixa de ser "ver" e passa a ser o
        próximo passo: leva direto ao pagamento, sem a parada de conferência.
        Quem quiser conferir fecha o pagamento e o carrinho está atrás dele.
      */}
      {itemCount > 0 && (
        <Link
          to="/$storeSlug/carrinho"
          params={{ storeSlug }}
          search={{ pagar: true }}
          className="fixed bottom-6 right-6 z-20 flex items-center gap-2 rounded-full bg-tomato px-5 py-3.5 lg:hidden text-sm font-bold text-[color:var(--on-primary)] shadow-[0_20px_40px_-16px_rgba(233,75,44,0.6)] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
        >
          <span className="relative">
            <ShoppingCart className="h-5 w-5" />
            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-mozzarella px-0.5 text-[10px] font-bold text-tomato">
              {itemCount}
            </span>
          </span>
          Finalizar compras
        </Link>
      )}
    </div>
  );
}
