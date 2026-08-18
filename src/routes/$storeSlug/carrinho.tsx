import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartItemRow } from "@/components/site/pizzaria2/CartItemRow";
import { CheckoutForm } from "@/components/site/pizzaria2/CheckoutForm";
import { MenuThumb } from "@/components/site/pizzaria2/MenuThumb";
import { PriceTag } from "@/components/site/pizzaria2/PriceTag";
import { useCart } from "@/lib/pizzaria2/cart";
import { formatCurrency, suggestedDrinkSlugs } from "@/lib/pizzaria2/menu";
import { useMenu } from "@/lib/pizzaria2/menu-provider";
import { useStore } from "@/lib/pizzaria2/store-provider";

export const Route = createFileRoute("/$storeSlug/carrinho")({
  component: PizzariaCarrinho,
});

function PizzariaCarrinho() {
  const { lines, addLine, removeLine, clearCart, subtotal, deliveryFee, total } = useCart();
  const store = useStore();
  const { categories, productBySlug, productsByCategory } = useMenu();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // "Continuar comprando" reopens the same rich cardápio picker the produto
  // screen uses — it just needs *a* pizza slug to anchor that route.
  const cardapioAnchorSlug =
    productsByCategory(categories[0]?.slug ?? "")[0]?.slug ?? "";

  const suggestedDrinks = suggestedDrinkSlugs
    .map((slug) => productBySlug(slug))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const whatsappHref = store.whatsappHref(
    `Oi! Quero fazer este pedido:\n${lines
      .map((l) => {
        const extrasTotal = l.extras.reduce((s, e) => s + e.price, 0);
        const extrasText = l.extras.length ? ` (+ ${l.extras.map((e) => e.label).join(", ")})` : "";
        return `${l.qty}x ${l.name}${l.sizeLabel ? ` - ${l.sizeLabel}` : ""}${extrasText} — ${formatCurrency(l.unitPrice + extrasTotal)}`;
      })
      .join("\n")}\n\nSubtotal: ${formatCurrency(subtotal)}\nTaxa de entrega: ${formatCurrency(deliveryFee)}\nTotal: ${formatCurrency(total)}`,
  );

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold text-charcoal sm:text-3xl">
          Seu carrinho 🛒
        </h1>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            aria-label="Esvaziar carrinho"
            className="grid h-9 w-9 place-items-center rounded-full text-charcoal/40 transition-colors hover:bg-tomato/10 hover:text-tomato"
          >
            <Trash2 className="h-4.5 w-4.5" />
          </button>
        )}
      </div>

      {lines.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-charcoal/15 py-16 text-center">
          <p className="text-sm text-charcoal/55">Seu carrinho está vazio.</p>
          <Button
            asChild
            className="mt-5 rounded-full bg-tomato text-mozzarella shadow-none hover:bg-tomato/90"
          >
            <Link
              to="/$storeSlug/produto/$slug"
              params={{ storeSlug: store.slug, slug: cardapioAnchorSlug }}
              search={{ view: "cardapio" }}
            >
              Ver cardápio
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-3">
            {lines.map((line) => (
              <CartItemRow key={line.id} line={line} onRemove={() => removeLine(line.id)} />
            ))}
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-charcoal/8 bg-mozzarella p-5">
              <h2 className="font-display text-sm font-bold text-charcoal">
                Que tal completar seu pedido?
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                {suggestedDrinks.map((drink) => (
                  <div key={drink.slug} className="flex items-center gap-3">
                    <MenuThumb
                      image={drink.image}
                      icon={drink.icon}
                      alt={drink.name}
                      className="h-11 w-11 shrink-0 border border-charcoal/8"
                      iconClassName="h-5 w-5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-charcoal">{drink.name}</p>
                      <PriceTag value={drink.price} className="text-xs" />
                    </div>
                    <button
                      type="button"
                      aria-label={`Adicionar ${drink.name}`}
                      onClick={() =>
                        addLine({
                          name: drink.name,
                          image: drink.image,
                          icon: drink.icon,
                          unitPrice: drink.price,
                          extras: [],
                          qty: 1,
                          productSlug: drink.slug,
                        })
                      }
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-tomato text-tomato transition-colors hover:bg-tomato hover:text-mozzarella"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-charcoal/8 bg-mozzarella p-5">
              <div className="flex items-center justify-between text-sm text-charcoal/60">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-charcoal/60">
                <span>Taxa de entrega</span>
                <span>{formatCurrency(deliveryFee)}</span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-charcoal/10 pt-4">
                <span className="font-display text-base font-bold text-charcoal">Total</span>
                <PriceTag value={total} className="text-2xl" />
              </div>
            </div>
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button
            asChild
            variant="outline"
            className="rounded-full border-charcoal/20 bg-mozzarella text-charcoal hover:bg-charcoal/5"
          >
            <Link
              to="/$storeSlug/produto/$slug"
              params={{ storeSlug: store.slug, slug: cardapioAnchorSlug }}
              search={{ view: "cardapio" }}
            >
              ← Continuar comprando
            </Link>
          </Button>
          <Button
            onClick={() => setCheckoutOpen(true)}
            className="rounded-full bg-tomato px-8 py-6 text-base font-semibold text-mozzarella shadow-none hover:bg-tomato/90 sm:flex-1 sm:max-w-sm"
          >
            Finalizar pedido →
          </Button>
        </div>
      )}

      {checkoutOpen && (
        <CheckoutForm onClose={() => setCheckoutOpen(false)} />
      )}
    </main>
  );
}
