import { Link } from "@tanstack/react-router";
import { Flame, Pizza, Plus } from "lucide-react";
import { useStore } from "@/lib/pizzaria2/store-provider";
import { formatCurrency, type Product } from "@/lib/pizzaria2/menu";

/**
 * Compact row for the full cardápio: it shows the name and the price, so a long
 * menu stays scannable. Tapping it opens the item's modal. "Adicionar" is a
 * separate button — pressing it goes straight to the cart instead of opening the
 * modal, which is why the two are siblings and not nested (a button inside a
 * button is invalid and would swallow the click).
 */
export function ProductRow({
  product,
  price,
  onQuickAdd,
  exigeEscolha,
}: {
  product: Product;
  price: number;
  onQuickAdd: () => void;
  /** Tem pergunta obrigatória: o "+" abre a tela em vez de ir ao carrinho. */
  exigeEscolha?: boolean;
}) {
  const { slug: storeSlug } = useStore();
  const Icon = product.icon;

  return (
    <Link
      to="/$storeSlug/produto/$slug"
      params={{ storeSlug, slug: product.slug }}
      search={{}}
      className="block bg-white rounded-lg p-1"
    >
      <div className="flex flex-col rounded-lg overflow-hidden border-2 border-white hover:shadow-lg transition-shadow">
        <div className="relative">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              className="w-full h-28 object-cover"
            />
          ) : (
            <div className="w-full h-28 bg-charcoal/5 flex items-center justify-center">
              {Icon ? (
                <Icon className="size-8 text-charcoal/30" />
              ) : (
                <Pizza className="size-8 text-charcoal/30" />
              )}
            </div>
          )}
          {product.tag && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-tomato px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[color:var(--on-primary)] shadow-[0_4px_12px_-4px_rgba(23,23,23,0.4)]">
              {product.tag === "Mais pedida" && <Flame className="h-3 w-3" />}
              {product.tag}
            </span>
          )}
        </div>
        <div className="flex flex-col flex-1 p-1.5">
          <h3 className="font-semibold text-charcoal text-xs line-clamp-2">{product.name}</h3>
          <p className="text-xs text-charcoal/60 line-clamp-2 mt-1">{product.desc}</p>
          <div className="flex items-center justify-between gap-2 mt-auto pt-1.5">
            <p className="text-sm font-bold text-tomato">R$ {price.toFixed(2).replace(".", ",")}</p>
            {/* Esgotado: etiqueta no lugar do botao, como no card. */}
            {product.esgotado ? (
              <span className="inline-flex shrink-0 items-center rounded-full bg-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-600">
                Indisponível
              </span>
            ) : exigeEscolha ? (
              <Link
                to="/$storeSlug/produto/$slug"
                params={{ storeSlug, slug: product.slug }}
                search={{}}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Escolher opções de ${product.name}`}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-tomato p-1.5 text-xs font-semibold text-[color:var(--on-primary)] transition-colors hover:bg-tomato/90"
              >
                <Plus className="size-3" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onQuickAdd();
                }}
                aria-label={`Adicionar ${product.name} ao carrinho`}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-tomato p-1.5 text-xs font-semibold text-[color:var(--on-primary)] transition-colors hover:bg-tomato/90"
              >
                <Plus className="size-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
