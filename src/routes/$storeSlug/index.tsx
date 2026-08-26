import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Beef,
  Beer,
  CakeSlice,
  Camera,
  Cherry,
  Circle,
  Clock,
  Coffee,
  Fish,
  Flame,
  GlassWater,
  IceCreamCone,
  Leaf,
  MapPin,
  Milk,
  Pizza,
  Plus,
  Salad,
  Sandwich,
  Snowflake,
  Truck,
  Utensils,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/site/Reveal";
import { TypingText } from "@/components/site/TypingText";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { CategorySaboresSection } from "@/components/site/pizzaria2/CategorySaboresSection";
import { SecaoDoCardapio } from "@/components/site/pizzaria2/SecaoDoCardapio";
import { SobreORestaurante } from "@/components/site/pizzaria2/SobreORestaurante";
import { HeroDaVitrine } from "@/components/site/pizzaria2/HeroDaVitrine";
import { PromoCarousel } from "@/components/site/pizzaria2/PromoCarousel";
import { StoreBlog } from "@/components/site/pizzaria2/StoreBlog";
import { ReviewsSection } from "@/components/site/pizzaria2/ReviewsSection";
import { ReviewsMarquee } from "@/components/site/pizzaria2/ReviewsMarquee";
import { ReviewsProvider } from "@/lib/pizzaria2/reviews-provider";
import { useGoToCardapio } from "@/lib/pizzaria2/go-to-cardapio";
import { useStore } from "@/lib/pizzaria2/store-provider";
import { useMenu } from "@/lib/pizzaria2/menu-provider";
import { useCart } from "@/lib/pizzaria2/cart";
import { HERO_BOUNDARY_ID } from "@/lib/pizzaria2/hero-overlap";
import { cn } from "@/lib/utils";

import { heroFor } from "@/lib/pizzaria2/hero-by-type";
import { CARE_ICONS } from "@/lib/pizzaria2/care-icons";
import { defaultSize, sizePrice } from "@/lib/pizzaria2/menu";

/** The trade config names its icons, so they are resolved here. */

export const Route = createFileRoute("/$storeSlug/")({
  // Built from the store's own name, since this title is what shows in the
  // browser tab and in the link preview when the owner shares the menu.
  head: ({ params }) => {
    const name = params.storeSlug
      .replace(/-[0-9a-z]{4}$/, "")
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    const title = `${name} — Cardápio online e entrega rápida`;
    const description = `Cardápio completo de ${name}, com pedido online e entrega rápida.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: PizzariaInicio,
});

function PizzariaInicio() {
  const goToCardapio = useGoToCardapio();
  const {
    slug: storeSlug,
    storeName: businessName,
    whatsappHref: buildWhatsappHref,
    businessType,
    addressLines,
    hasAddress,
    mapsHref,
    openingHoursSummary,
    aboutEyebrow,
    aboutTitle,
    aboutBody,
    aboutImageUrl,
    heroSubtitle,
    deliveryFee,
    estimatedDeliveryMinMax,
  } = useStore();
  const whatsappHref = buildWhatsappHref();
  const { promotions, posts, products } = useMenu();
  const { addLine } = useCart();

  // Hero comes from the store business type — photo and copy travel together.
  const {
    photos: heroPhotos,
    cravings: heroCravings,
    subtitle: tradeHeroSubtitle,
    careItems,
    markIcon,
    ctaTitle,
    aboutTitle: tradeAboutTitle,
    aboutBody: tradeAboutBody,
    ctaBlurb,
  } = heroFor(businessType);
  const MarkIcon = CARE_ICONS[markIcon] ?? Pizza;


  return (
    <main>
      <HeroDaVitrine />

      <section className="scroll-mt-20 px-4 pt-16 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-[1200px]">
          <Reveal variant="up" className="mb-6">
            <h2 className="text-xl font-bold text-charcoal">Mais Pedidos</h2>
          </Reveal>

          <div className="grid grid-cols-3 gap-2">
            {products.slice(0, 3).map((product) => {
              const Icon = product.icon;
              const price = sizePrice(product);

              function handleAddProduct() {
                addLine({
                  name: product.name,
                  sizeLabel: defaultSize(product)?.label,
                  image: product.image,
                  icon: product.icon,
                  unitPrice: price,
                  extras: [],
                  qty: 1,
                  productSlug: product.slug,
                  sizeId: defaultSize(product)?.id,
                });
              }

              return (
                <Link
                  key={product.id}
                  to="/$storeSlug/produto/$slug"
                  params={{ storeSlug, slug: product.slug }}
                  search={{}}
                  className="block bg-white rounded-lg p-1"
                >
                  <div className="flex flex-col rounded-lg overflow-hidden border-2 border-white hover:shadow-lg transition-shadow"
                >
                  <div className="relative">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-28 lg:h-56 object-cover"
                      />
                    ) : (
                      <div className="w-full h-28 lg:h-56 bg-charcoal/5 flex items-center justify-center">
                        {Icon ? <Icon className="size-8 text-charcoal/30" /> : <Pizza className="size-8 text-charcoal/30" />}
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAddProduct();
                        }}
                        className="inline-flex shrink-0 items-center justify-center rounded-full bg-tomato p-1.5 text-xs font-semibold text-[color:var(--on-primary)] transition-colors hover:bg-tomato/90"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                  </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-16 sm:py-24">
        <div className="pointer-events-none absolute -left-16 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-tomato/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-1/3 h-56 w-56 rounded-full bg-olive/10 blur-3xl" />
        <Leaf className="pointer-events-none absolute left-6 top-10 h-10 w-10 -rotate-12 text-olive/15 sm:left-16" />
        <Wheat className="pointer-events-none absolute bottom-10 left-10 h-12 w-12 rotate-12 text-tomato/10 sm:left-24" />
        <Flame className="pointer-events-none absolute right-8 top-16 h-9 w-9 rotate-6 text-tomato/15 sm:right-20" />
        <Leaf className="pointer-events-none absolute bottom-16 right-6 h-11 w-11 rotate-45 text-olive/10 sm:right-16" />

        <div className="relative mx-auto max-w-[1200px] px-4 text-center sm:px-6">
          <Reveal variant="up">
            <h2 className="font-display text-2xl font-extrabold sm:text-3xl">
              Feita com amor, entregue com carinho ❤️
            </h2>
          </Reveal>

          <div className="mt-10 grid grid-cols-4 gap-6">
            {careItems.map((item, i) => (
              <Reveal
                key={item.label}
                variant="up"
                delay={i * 80}
                className="flex flex-col items-center gap-3 text-center"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-tomato/10 text-tomato">
                  {(() => {
                    const Icon = CARE_ICONS[item.icon] ?? Leaf;
                    return <Icon className="h-5 w-5" />;
                  })()}
                </span>
                <span className="text-xs font-medium text-charcoal/70 sm:text-sm">
                  {item.label}
                </span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section
        id="promocoes"
        className="scroll-mt-20 px-4 pt-16 sm:px-6 sm:pt-20"
      >
        <Reveal variant="up" className="mx-auto max-w-[1200px]">
          <PromoCarousel slides={promotions} />
        </Reveal>
      </section>

      <SecaoDoCardapio>
        <CategorySaboresSection />
      </SecaoDoCardapio>

      <ReviewsProvider storeSlug={storeSlug}>
        <section
          id="restaurante"
          className="scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24 xl:px-10"
        >
          <div className="mx-auto max-w-[1800px] overflow-hidden rounded-[32px] border border-charcoal/8 bg-mozzarella p-6 shadow-[0_20px_50px_-35px_rgba(23,23,23,0.35)] sm:p-10 xl:px-14">
            <div className="grid grid-cols-1 items-start gap-10 sm:grid-cols-1 lg:grid-cols-2 lg:gap-14">
              <div>
                <SobreORestaurante />
              </div>

              <div className="hidden sm:block">
                <ReviewsSection storeSlug={storeSlug} />
              </div>
            </div>
          </div>
        </section>

        <div className="sm:hidden px-4 pb-16 sm:px-6">
          <div className="mx-auto max-w-[1800px] overflow-hidden rounded-[32px] border border-charcoal/8 bg-mozzarella p-6 shadow-[0_20px_50px_-35px_rgba(23,23,23,0.35)]">
            <ReviewsSection storeSlug={storeSlug} />
          </div>
        </div>

        <section
          id="contato"
          className="scroll-mt-20 pb-16 px-4 sm:px-0"
        >
          <Reveal
            variant="up"
            className="relative overflow-hidden bg-tomato px-6 py-8 shadow-[0_20px_50px_-30px_rgba(233,75,44,0.55)]"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-[color:var(--on-primary)]/10 blur-2xl" />
            <MarkIcon
              strokeWidth={1}
              className="pointer-events-none absolute -bottom-8 right-4 h-28 w-28 rotate-12 text-[color:var(--on-primary)]/10"
            />

            <div className="relative flex flex-col items-center justify-center gap-6">
              <div className="text-center">
                <h2 className="font-display text-xl font-extrabold text-[color:var(--on-primary)]">
                  {ctaTitle}
                </h2>
                <p className="mt-1.5 text-sm text-[color:var(--on-primary-muted)]">
                  {ctaBlurb}
                </p>
              </div>

              <button
                type="button"
                onClick={goToCardapio}
                className="group inline-flex shrink-0 items-center gap-2 rounded-xl bg-mozzarella px-6 py-3 text-sm font-semibold text-charcoal shadow-sm transition-transform hover:scale-[1.03]"
              >
                Faça um pedido
                <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </button>
            </div>
          </Reveal>
        </section>
      </ReviewsProvider>

      <ReviewsProvider storeSlug={storeSlug}>
        <ReviewsMarquee />
      </ReviewsProvider>

      <StoreBlog posts={posts} />
    </main>
  );
}
