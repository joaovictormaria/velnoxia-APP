import type { MouseEvent } from "react";
import { useStore } from "@/lib/pizzaria2/store-provider";
import { Link } from "@tanstack/react-router";
import { Flame, Heart, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PriceTag } from "./PriceTag";
import type { Product } from "@/lib/pizzaria2/menu";

const ctaClassName =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-tomato px-4.5 py-3 text-sm font-semibold text-[color:var(--on-primary)] transition-colors hover:bg-tomato/90";

export function ProductCard({
  product,
  linkToCustomize,
  onQuickAdd,
  onSelect,
  tags,
  favorited,
  onToggleFavorite,
  ctaQuickAdd,
}: {
  product: Product;
  linkToCustomize: boolean;
  onQuickAdd: () => void;
  /** When set, picking a customizable product updates local state instead of
   * navigating — used by the in-page cardápio picker on the produto screen. */
  onSelect?: () => void;
  /** Small labels shown under the description (e.g. "Clássica", "Favorita"). */
  tags?: string[];
  favorited?: boolean;
  onToggleFavorite?: () => void;
  /** Body opens the produto screen, button still adds straight to the cart.
   *  Used where the screen exists only to offer extras: whoever wants none
   *  should not have to walk through it. */
  ctaQuickAdd?: boolean;
}) {
  const { slug: storeSlug } = useStore();
  const Icon = product.icon;

  function handleQuickAdd(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onQuickAdd();
  }

  function handleToggleFavorite(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite?.();
  }

  const media = (
    <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden">
      {product.image ? (
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-tomato/8">
          {Icon && <Icon className="h-12 w-12 text-tomato" />}
        </div>
      )}
      {product.tag && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-tomato px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--on-primary)] shadow-[0_6px_16px_-6px_rgba(23,23,23,0.5)]">
          {product.tag === "Mais pedida" && <Flame className="h-3.5 w-3.5" />}
          {product.tag}
        </span>
      )}
    </div>
  );

  const info = (
    <div className="flex flex-col p-5 sm:p-6">
      <h3 className="font-display text-xl font-bold text-charcoal">
        {product.name}
      </h3>
      <p className="mt-1.5 text-base leading-snug text-charcoal/55">
        {product.desc}
      </p>
      {tags && tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-olive/10 px-2.5 py-1 text-[11px] font-semibold text-olive"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[22px] border border-charcoal/8 bg-mozzarella shadow-[0_10px_30px_-22px_rgba(23,23,23,0.4)] transition-colors hover:border-tomato/25">
      {onToggleFavorite && (
        <button
          type="button"
          onClick={handleToggleFavorite}
          aria-label={
            favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"
          }
          aria-pressed={favorited}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-mozzarella/90 text-charcoal/50 shadow-[0_6px_16px_-6px_rgba(23,23,23,0.4)] transition-colors hover:text-tomato"
        >
          <Heart
            className={cn("h-4 w-4", favorited && "fill-tomato text-tomato")}
          />
        </button>
      )}
      {linkToCustomize && onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="flex flex-col text-left"
        >
          {media}
          {info}
        </button>
      ) : linkToCustomize ? (
        <Link
          to="/$storeSlug/produto/$slug"
          params={{ storeSlug, slug: product.slug }}
          search={{}}
          className="flex flex-col text-left"
        >
          {media}
          {info}
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleQuickAdd}
          className="flex flex-col text-left"
        >
          {media}
          {info}
        </button>
      )}

      <div className="flex items-center justify-between gap-3 p-5 pt-0 sm:p-6 sm:pt-0">
        <PriceTag
          value={product.price}
          className="whitespace-nowrap text-xl sm:text-2xl"
        />
        {ctaQuickAdd ? (
          <button
            type="button"
            onClick={handleQuickAdd}
            className={ctaClassName}
          >
            <Plus className="h-4.5 w-4.5" /> Adicionar
          </button>
        ) : linkToCustomize && onSelect ? (
          <button type="button" onClick={onSelect} className={ctaClassName}>
            <Plus className="h-4.5 w-4.5" /> Adicionar
          </button>
        ) : linkToCustomize ? (
          <Link
            to="/$storeSlug/produto/$slug"
            params={{ storeSlug, slug: product.slug }}
            search={{}}
            className={ctaClassName}
          >
            <Plus className="h-4.5 w-4.5" /> Adicionar
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleQuickAdd}
            className={ctaClassName}
          >
            <Plus className="h-4.5 w-4.5" /> Adicionar
          </button>
        )}
      </div>
    </div>
  );
}
