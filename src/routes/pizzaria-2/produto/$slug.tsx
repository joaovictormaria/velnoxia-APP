import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { CardapioPicker } from "@/components/site/pizzaria2/CardapioPicker";
import { MenuThumb } from "@/components/site/pizzaria2/MenuThumb";
import { PriceTag } from "@/components/site/pizzaria2/PriceTag";
import { QuantityStepper } from "@/components/site/pizzaria2/QuantityStepper";
import { useCart } from "@/lib/pizzaria2/cart";
import { useGoToCardapio } from "@/lib/pizzaria2/go-to-cardapio";
import {
  availableSizes,
  formatCurrency,
  sizePrice,
  suggestedDrinkSlugs,
  type SizeKey,
} from "@/lib/pizzaria2/menu";
import { useMenu } from "@/lib/pizzaria2/menu-provider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pizzaria-2/produto/$slug")({
  validateSearch: (search: Record<string, unknown>): { view?: "cardapio" } => ({
    view: search.view === "cardapio" ? "cardapio" : undefined,
  }),
  component: PizzariaPersonalizacao,
});

function PizzariaPersonalizacao() {
  const { slug } = Route.useParams();
  const { view } = Route.useSearch();
  const { addLine } = useCart();
  const goToCardapio = useGoToCardapio();
  const {
    categories,
    products,
    extras: extrasCatalog,
    categoryBySlug,
    productBySlug,
  } = useMenu();

  // Half-and-half is only offered by products flagged for it in the admin.
  const pizzaProducts = products.filter((p) => p.allowHalfAndHalf);

  // The active product lives in local state (seeded from the route param) so
  // picking another pizza from the in-page cardápio never navigates away —
  // it just swaps what "activeSlug" points to and slides the screens.
  const [activeSlug, setActiveSlug] = useState(slug);
  const [screen, setScreen] = useState<"customize" | "cardapio">(
    view === "cardapio" ? "cardapio" : "customize",
  );
  const [leavingTo, setLeavingTo] = useState<"customize" | "cardapio" | null>(null);
  const product = productBySlug(activeSlug);

  const [mode, setMode] = useState<"inteira" | "meia">("inteira");
  const [size, setSize] = useState<SizeKey>("media");
  const [half2Slug, setHalf2Slug] = useState<string>(
    pizzaProducts.find((p) => p.slug !== activeSlug)?.slug ?? activeSlug,
  );
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);

  const half2 = productBySlug(half2Slug);

  const sizeOptions = useMemo(
    () => (product ? availableSizes(product) : []),
    [product],
  );

  // Keep the selected size valid when switching to a product that offers
  // a different set of sizes.
  useEffect(() => {
    if (sizeOptions.length && !sizeOptions.some((s) => s.key === size)) {
      setSize(sizeOptions[0].key);
    }
  }, [sizeOptions, size]);

  // Prices are absolute per size, so half-and-half compares the two flavours
  // at the *same* size and charges the higher one.
  const unitPrice = useMemo(() => {
    if (!product) return 0;
    const own = sizePrice(product, size);
    if (mode === "inteira" || !half2) return own;
    return Math.max(own, sizePrice(half2, size));
  }, [product, half2, mode, size]);
  const extrasTotal = selectedExtras.reduce((sum, id) => {
    const extra = extrasCatalog.find((e) => e.id === id);
    return sum + (extra?.price ?? 0);
  }, 0);
  const total = (unitPrice + extrasTotal) * qty;

  if (!product) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-16 text-center sm:px-6">
        <p className="text-charcoal/60">Produto não encontrado.</p>
        <button
          type="button"
          onClick={goToCardapio}
          className="mt-3 inline-block font-semibold text-tomato hover:underline"
        >
          ← Voltar para o cardápio
        </button>
      </main>
    );
  }

  const category = categoryBySlug(product.categorySlug);
  const sizeLabel = sizeOptions.find((s) => s.key === size)?.label ?? "Média";

  function toggleExtra(id: string) {
    setSelectedExtras((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  }

  function goToScreen(next: "customize" | "cardapio") {
    if (leavingTo !== null || next === screen) return;
    setLeavingTo(next);
  }

  function handleAddToCart() {
    if (!product) return;
    const chosenExtras = selectedExtras
      .map((id) => extrasCatalog.find((e) => e.id === id))
      .filter((e): e is (typeof extrasCatalog)[number] => Boolean(e));

    addLine({
      name: mode === "inteira" ? product.name : `${product.name} / ${half2?.name ?? product.name}`,
      sizeLabel,
      image: product.image,
      icon: product.icon,
      unitPrice,
      extras: chosenExtras,
      note: note.trim() || undefined,
      qty,
    });
    goToScreen("cardapio");
  }

  function handleSelectPizza(newSlug: string) {
    setActiveSlug(newSlug);
    setMode("inteira");
    setSize("media");
    setHalf2Slug(pizzaProducts.find((p) => p.slug !== newSlug)?.slug ?? newSlug);
    setSelectedExtras([]);
    setNote("");
    setQty(1);
    goToScreen("customize");
  }

  function handleAddDrink(drinkSlug: string) {
    const drink = productBySlug(drinkSlug);
    if (!drink) return;
    addLine({
      name: drink.name,
      image: drink.image,
      icon: drink.icon,
      unitPrice: drink.price,
      extras: [],
      qty: 1,
    });
  }

  const suggestedDrink = productBySlug(suggestedDrinkSlugs[0]);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12">
      <button
        type="button"
        onClick={goToCardapio}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal/60 transition-colors hover:text-tomato"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para o cardápio
      </button>

      <div
        key={screen}
        onAnimationEnd={() => {
          if (leavingTo !== null) {
            setScreen(leavingTo);
            setLeavingTo(null);
          }
        }}
        className={cn("mt-6", leavingTo !== null ? "animate-card-out" : "animate-card-in")}
      >
        {screen === "cardapio" ? (
          <CardapioPicker onSelectPizza={handleSelectPizza} />
        ) : (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <div className="overflow-hidden rounded-[28px] border border-charcoal/8 shadow-[0_20px_50px_-35px_rgba(23,23,23,0.4)]">
            <img
              src={product.image}
              alt={product.name}
              className="aspect-square w-full object-cover"
            />
          </div>
          <h1 className="mt-5 font-display text-2xl font-extrabold text-charcoal sm:text-3xl">
            {product.name}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-charcoal/55">{product.desc}</p>
          {category && (
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-charcoal/35">
              {category.name}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <h2 className="font-display text-base font-bold text-charcoal">
              Como você quer sua pizza?
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("inteira")}
                className={cn(
                  "rounded-2xl border-2 p-4 text-left transition-colors",
                  mode === "inteira"
                    ? "border-tomato bg-tomato/5"
                    : "border-charcoal/12 hover:border-charcoal/25",
                )}
              >
                <span className="block text-sm font-bold text-charcoal">Pizza inteira</span>
                <span className="mt-1 block text-xs text-charcoal/55">
                  Um sabor só, do jeito clássico.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("meia")}
                className={cn(
                  "rounded-2xl border-2 p-4 text-left transition-colors",
                  mode === "meia"
                    ? "border-tomato bg-tomato/5"
                    : "border-charcoal/12 hover:border-charcoal/25",
                )}
              >
                <span className="block text-sm font-bold text-charcoal">
                  Meia-pizza (2 sabores)
                </span>
                <span className="mt-1 block text-xs text-charcoal/55">
                  Dois sabores no mesmo tamanho.
                </span>
              </button>
            </div>

            {mode === "meia" && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-charcoal/60">1ª metade</span>
                  <select
                    value={product.slug}
                    disabled
                    className="mt-1 w-full rounded-xl border border-charcoal/15 bg-mozzarella px-3 py-2 text-sm text-charcoal/70"
                  >
                    <option value={product.slug}>{product.name}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-charcoal/60">2ª metade</span>
                  <select
                    value={half2Slug}
                    onChange={(e) => setHalf2Slug(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-charcoal/15 bg-mozzarella px-3 py-2 text-sm text-charcoal focus:border-tomato focus:outline-none"
                  >
                    {pizzaProducts.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-charcoal/45 sm:col-span-2">
                  O preço considera sempre o sabor mais caro entre as duas metades.
                </p>
              </div>
            )}
          </div>

          <div>
            <h2 className="font-display text-base font-bold text-charcoal">Escolha o tamanho</h2>
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              {sizeOptions.map((block) => (
                <button
                  key={block.key}
                  type="button"
                  onClick={() => setSize(block.key)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-center transition-colors",
                    size === block.key
                      ? "border-tomato bg-tomato text-mozzarella"
                      : "border-charcoal/15 text-charcoal hover:border-charcoal/30",
                  )}
                >
                  <span className="block text-sm font-bold">{block.label}</span>
                  <span
                    className={cn(
                      "block text-xs",
                      size === block.key ? "text-mozzarella/85" : "text-charcoal/50",
                    )}
                  >
                    {formatCurrency(block.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-charcoal/8 bg-mozzarella p-5">
            <h2 className="font-display text-base font-bold text-charcoal">Adicione extras</h2>
            <div className="mt-3 flex flex-col gap-2.5">
              {extrasCatalog.map((extra) => (
                <label
                  key={extra.id}
                  className="flex cursor-pointer items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2.5">
                    <Checkbox
                      checked={selectedExtras.includes(extra.id)}
                      onCheckedChange={() => toggleExtra(extra.id)}
                      className="border-tomato data-[state=checked]:border-tomato data-[state=checked]:bg-tomato data-[state=checked]:text-mozzarella"
                    />
                    <span className="text-charcoal/80">{extra.label}</span>
                  </span>
                  <span className="text-charcoal/50">{formatCurrency(extra.price)}</span>
                </label>
              ))}
            </div>

            <div className="mt-5">
              <span className="text-sm font-semibold text-charcoal/70">Observação (opcional)</span>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: caprichar no orégano, cortar em 8 pedaços..."
                className="mt-1.5 border-charcoal/15 bg-cream/60 text-sm placeholder:text-charcoal/35 focus-visible:ring-tomato"
              />
            </div>

            <div className="mt-5 flex items-center justify-between">
              <span className="text-sm font-semibold text-charcoal/70">Quantidade</span>
              <QuantityStepper
                value={qty}
                onIncrement={() => setQty((q) => q + 1)}
                onDecrement={() => setQty((q) => Math.max(1, q - 1))}
              />
            </div>

            <Button
              onClick={handleAddToCart}
              className="mt-6 w-full rounded-full bg-tomato py-6 text-base font-semibold text-mozzarella shadow-none hover:bg-tomato/90"
            >
              Adicionar ao carrinho — {formatCurrency(total)}
            </Button>
          </div>

          {suggestedDrink && (
            <div className="flex items-center gap-4 rounded-2xl border border-charcoal/8 bg-mozzarella p-4">
              <MenuThumb
                image={suggestedDrink.image}
                icon={suggestedDrink.icon}
                alt={suggestedDrink.name}
                className="h-12 w-12 shrink-0"
                iconClassName="h-5 w-5"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/40">
                  Sugestão para você
                </p>
                <p className="truncate text-sm font-bold text-charcoal">{suggestedDrink.name}</p>
                <PriceTag value={suggestedDrink.price} className="text-xs" />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddDrink(suggestedDrink.slug)}
                className="shrink-0 rounded-full border-tomato bg-mozzarella text-tomato hover:bg-tomato hover:text-mozzarella"
              >
                Adicionar bebida
              </Button>
            </div>
          )}
        </div>
          </div>
        )}
      </div>
    </main>
  );
}
