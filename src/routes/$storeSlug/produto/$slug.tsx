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
} from "@/lib/pizzaria2/menu";
import { useMenu } from "@/lib/pizzaria2/menu-provider";
import { cn } from "@/lib/utils";
import { OptionGroups } from "@/components/site/pizzaria2/OptionGroups";

export const Route = createFileRoute("/$storeSlug/produto/$slug")({
  validateSearch: (search: Record<string, unknown>): { view?: "cardapio" } => ({
    view: search.view === "cardapio" ? "cardapio" : undefined,
  }),
  component: ProdutoRoute,
});

/**
 * Remounts the screen whenever the address changes.
 *
 * Everything below lives in local state seeded from the route: which product is
 * open, whether the list or the product is showing, the chosen size and extras.
 * That was written for the in-page picker, which swaps products without
 * navigating. The cards navigate now, and navigating inside the same route does
 * not remount — the address changed and the screen kept its old state, so a
 * click seemed to do nothing while a reload worked.
 *
 * The key ties that state to the address. It also stops a product from
 * inheriting the extras and the quantity picked on the previous one.
 */
function ProdutoRoute() {
  const { slug } = Route.useParams();
  const { view } = Route.useSearch();
  return <PizzariaPersonalizacao key={slug + ":" + (view ?? "")} />;
}

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
  const [leavingTo, setLeavingTo] = useState<"customize" | "cardapio" | null>(
    null,
  );
  const product = productBySlug(activeSlug);

  const [mode, setMode] = useState<"inteira" | "meia">("inteira");
  // Guarda o id do tamanho, não um nome fixo: "media" só existia numa
  // pizzaria, e o efeito abaixo escolhe o primeiro assim que o produto carrega.
  const [size, setSize] = useState<string>("");
  const [half2Slug, setHalf2Slug] = useState<string>(
    pizzaProducts.find((p) => p.slug !== activeSlug)?.slug ?? activeSlug,
  );
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
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
    if (sizeOptions.length && !sizeOptions.some((s) => s.id === size)) {
      setSize(sizeOptions[0].id);
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
  /**
   * Primeiro as perguntas da categoria, depois as do próprio produto — a mesma
   * ordem que o servidor usa ao conferir o pedido. Uma categoria pergunta o
   * que vale para tudo dentro dela; o produto pergunta o que só ele tem, como
   * o sabor do suco que o refrigerante ao lado não compartilha.
   */
  const optionGroups = product
    ? [
        ...(categoryBySlug(product.categorySlug)?.optionGroups ?? []),
        ...product.optionGroups,
      ]
    : [];

  /**
   * Trocar de produto pode trocar de categoria, e as escolhas antigas
   * apontariam para grupos que a nova nem tem — some com elas em vez de mandar
   * ao servidor um id que ele vai recusar.
   */
  useEffect(() => {
    setSelectedOptions((atuais) => {
      const validos = new Set(optionGroups.flatMap((g) => g.options.map((o) => o.id)));
      const filtrados = atuais.filter((id) => validos.has(id));
      return filtrados.length === atuais.length ? atuais : filtrados;
    });
    // A lista de grupos é derivada; comparar pelos ids evita rodar a cada render.
  }, [optionGroups.map((g) => g.id).join(",")]);

  /**
   * A cota grátis vale para as mais caras, igual ao servidor — se a tela
   * somasse de outro jeito, o cliente veria um total e pagaria outro.
   */
  const optionsTotal = optionGroups.reduce((soma, grupo) => {
    const escolhidas = grupo.options
      .filter((o) => selectedOptions.includes(o.id))
      .sort((a, b) => b.price - a.price);
    return soma + escolhidas.slice(grupo.free).reduce((s, o) => s + o.price, 0);
  }, 0);

  const faltando = optionGroups.find(
    (g) => g.options.filter((o) => selectedOptions.includes(o.id)).length < g.min,
  );

  function toggleOption(grupo: { id: string; max: number; options: { id: string }[] }, optionId: string) {
    setSelectedOptions((atuais) => {
      if (atuais.includes(optionId)) return atuais.filter((id) => id !== optionId);
      // Escolha única troca em vez de acumular: o cliente clica no segundo
      // sabor esperando trocar, não receber um aviso de limite.
      if (grupo.max === 1) {
        const doGrupo = new Set(grupo.options.map((o) => o.id));
        return [...atuais.filter((id) => !doGrupo.has(id)), optionId];
      }
      return [...atuais, optionId];
    });
  }

  const extrasTotal = selectedExtras.reduce((sum, id) => {
    const extra = extrasCatalog.find((e) => e.id === id);
    return sum + (extra?.price ?? 0);
  }, 0);
  const total = (unitPrice + extrasTotal + optionsTotal) * qty;

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
  const sizeLabel = sizeOptions.find((s) => s.id === size)?.label;

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
      name:
        mode === "inteira"
          ? product.name
          : `${product.name} / ${half2?.name ?? product.name}`,
      sizeLabel,
      image: product.image,
      icon: product.icon,
      unitPrice,
      extras: chosenExtras,
      note: note.trim() || undefined,
      qty,
      productSlug: product.slug,
      sizeId: sizeOptions.length ? size : undefined,
      optionIds: selectedOptions.length ? selectedOptions : undefined,
      secondProductSlug: mode === "meia" ? half2?.slug : undefined,
    });
    goToScreen("cardapio");
  }

  function handleSelectPizza(newSlug: string) {
    setActiveSlug(newSlug);
    setMode("inteira");
    setSize("media");
    setHalf2Slug(
      pizzaProducts.find((p) => p.slug !== newSlug)?.slug ?? newSlug,
    );
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
      productSlug: drink.slug,
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
        className={cn(
          "mt-6",
          leavingTo !== null ? "animate-card-out" : "animate-card-in",
        )}
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
            </div>

            <div className="flex flex-col gap-8">
              {/* Inteira ou meia a meia só existe onde o produto aceita dois
              sabores; um lanche não tem essa pergunta. */}
              {product.allowHalfAndHalf && (
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
                      <span className="block text-sm font-bold text-charcoal">
                        Pizza inteira
                      </span>
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
                        <span className="text-xs font-semibold text-charcoal/60">
                          1ª metade
                        </span>
                        <select
                          value={product.slug}
                          disabled
                          className="mt-1 w-full rounded-xl border border-charcoal/15 bg-mozzarella px-3 py-2 text-sm text-charcoal/70"
                        >
                          <option value={product.slug}>{product.name}</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold text-charcoal/60">
                          2ª metade
                        </span>
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
                        O preço considera sempre o sabor mais caro entre as duas
                        metades.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {sizeOptions.length > 0 && (
                <div>
                  <h2 className="font-display text-base font-bold text-charcoal">
                    Escolha o tamanho
                  </h2>
                  <div className="mt-3 grid grid-cols-3 gap-2.5">
                    {sizeOptions.map((block) => (
                      <button
                        key={block.id}
                        type="button"
                        onClick={() => setSize(block.id)}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-center transition-colors",
                          size === block.id
                            ? "border-tomato bg-tomato text-mozzarella"
                            : "border-charcoal/15 text-charcoal hover:border-charcoal/30",
                        )}
                      >
                        <span className="block text-sm font-bold">
                          {block.label}
                        </span>
                        <span
                          className={cn(
                            "block text-xs",
                            size === block.id
                              ? "text-mozzarella/85"
                              : "text-charcoal/50",
                          )}
                        >
                          {formatCurrency(block.price)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-charcoal/8 bg-mozzarella p-5">
                {/* O nome abre o card das escolhas em vez de ficar sob a foto:
                    no computador a foto fica de um lado e o que se preenche do
                    outro, e o título solto na coluna esquerda deixava o card
                    da direita começando sem dizer de que produto se trata. */}
                <div className="mb-5 border-b border-charcoal/8 pb-4">
                  {category && (
                    <p className="text-xs font-medium uppercase tracking-wide text-charcoal/35">
                      {category.name}
                    </p>
                  )}
                  <h1 className="mt-1 font-display text-2xl font-extrabold text-charcoal sm:text-3xl">
                    {product.name}
                  </h1>
                  {product.desc && (
                    <p className="mt-2 text-sm leading-relaxed text-charcoal/55">
                      {product.desc}
                    </p>
                  )}
                </div>

                {optionGroups.length > 0 && (
                  <div className="mb-6">
                    <OptionGroups
                      groups={optionGroups}
                      selected={selectedOptions}
                      onToggle={toggleOption}
                    />
                  </div>
                )}

                <h2 className="font-display text-base font-bold text-charcoal">
                  Adicione extras
                </h2>
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
                      <span className="text-charcoal/50">
                        {formatCurrency(extra.price)}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="mt-5">
                  <span className="text-sm font-semibold text-charcoal/70">
                    Observação (opcional)
                  </span>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex: caprichar no orégano, cortar em 8 pedaços..."
                    className="mt-1.5 border-charcoal/15 bg-cream/60 text-sm placeholder:text-charcoal/35 focus-visible:ring-tomato"
                  />
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-charcoal/70">
                    Quantidade
                  </span>
                  <QuantityStepper
                    value={qty}
                    onIncrement={() => setQty((q) => q + 1)}
                    onDecrement={() => setQty((q) => Math.max(1, q - 1))}
                  />
                </div>

                {/* Bloqueia antes de o servidor recusar: dizer o que falta na
                    tela é melhor que devolver um erro depois do clique. */}
                <Button
                  onClick={handleAddToCart}
                  disabled={Boolean(faltando)}
                  className="mt-6 w-full rounded-full bg-tomato py-6 text-base font-semibold text-mozzarella shadow-none hover:bg-tomato/90 disabled:opacity-50"
                >
                  {faltando
                    ? `Escolha: ${faltando.name}`
                    : `Adicionar ao carrinho — ${formatCurrency(total)}`}
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
                    <p className="truncate text-sm font-bold text-charcoal">
                      {suggestedDrink.name}
                    </p>
                    <PriceTag
                      value={suggestedDrink.price}
                      className="text-xs"
                    />
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
