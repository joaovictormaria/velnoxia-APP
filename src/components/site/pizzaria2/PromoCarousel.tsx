import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { useGoToCardapio } from "@/lib/pizzaria2/go-to-cardapio";
import { formatCurrency } from "@/lib/pizzaria2/menu";
import { cn } from "@/lib/utils";
import { SequentialTypingText } from "@/components/site/SequentialTypingText";

type PromoSlide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  discount?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  imageUrl?: string | null;
};


export function PromoCarousel({ slides }: { slides: PromoSlide[] }) {
  // No promotions registered means no carousel — an empty strip with arrows
  // that go nowhere looks broken, while its absence looks deliberate.
  if (slides.length === 0) return null;

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const goToCardapio = useGoToCardapio();

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <div className="relative overflow-hidden shadow-[0_25px_60px_-30px_rgba(233,75,44,0.55)]">

      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {slides.map((slide) => (
            <div key={slide.title} className="min-w-0 shrink-0 grow-0 basis-full">
              <div className="relative grid grid-cols-1 items-center gap-0 px-0 pb-0 pt-0">

                <div className="hidden px-0 sm:px-10">
                  <span
                    className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary-muted)]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-mozzarella/80" />
                    {slide.eyebrow}
                  </span>
                  <h3
                    className="mt-3 font-display text-2xl font-extrabold leading-tight text-[color:var(--on-primary)] sm:text-3xl"
                  >
                    {slide.title}
                  </h3>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-[color:var(--on-primary-muted)] sm:text-base">
                    {slide.description}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {slide.discount && (
                      <span className="inline-flex items-center rounded-full bg-mozzarella px-3 py-1 text-xs font-bold text-tomato">
                        {slide.discount}
                      </span>
                    )}
                    {slide.price && (
                      <span className="flex items-baseline gap-2">
                        {slide.originalPrice && (
                          <span className="text-sm text-[color:var(--on-primary)]/55 line-through">
                            {formatCurrency(slide.originalPrice)}
                          </span>
                        )}
                        <span className="font-display text-xl font-bold text-[color:var(--on-primary)]">
                          {formatCurrency(slide.price)}
                        </span>
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={goToCardapio}
                    className="mt-7 inline-flex items-center gap-1.5 rounded-full bg-mozzarella px-6 py-3 text-sm font-semibold text-tomato shadow-sm transition-transform hover:scale-[1.03]"
                  >
                    Comprar combo →
                  </button>
                </div>

                {/* Dashed placeholder only until the owner uploads a photo —
                    once there is one it fills the frame. */}
                <div className="relative aspect-[3/1] w-full overflow-hidden rounded-2xl">
                  {/* Eyebrow overlay */}
                  <span
                    data-previa="chamada-da-promocao"
                    className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-tomato/75 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-primary)]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-mozzarella/80" />
                    {slide.eyebrow}
                  </span>

                  {/* Title overlay */}
                  <div
                    data-previa="titulo-da-promocao"
                    className="absolute bottom-20 left-4 z-10 max-w-[550px] leading-none bg-black/40 px-4 py-3 rounded-lg"
                  >
                    <h3 className="font-display text-4xl lg:text-5xl font-extrabold text-white">
                      {slide.title}
                    </h3>
                  </div>

                  {/* Discount overlay on top-right */}
                  {slide.discount && (
                    <span data-previa="selo-da-promocao" className="absolute top-4 right-4 z-10 inline-flex items-center rounded-full bg-mozzarella px-3 py-1 text-xs font-bold text-tomato">
                      {slide.discount}
                    </span>
                  )}

                  {/* Description overlay */}
                  <div
                    data-previa="descricao-da-promocao"
                    className="absolute top-20 left-4 z-10 max-w-xs bg-black/40 px-4 py-3 rounded-lg"
                  >
                    <p className="text-sm leading-relaxed text-white">
                      {slide.description}
                    </p>
                  </div>

                  {/* Price overlay on bottom-left */}
                  {slide.price && (
                    <div data-previa="preco-da-promocao" className="absolute bottom-4 left-4 z-10 flex items-baseline gap-2 bg-black/40 px-3 py-2 rounded-lg">
                      {slide.originalPrice && (
                        <span className="text-sm text-mozzarella line-through">
                          {formatCurrency(slide.originalPrice)}
                        </span>
                      )}
                      <span className="font-display text-xl font-bold text-mozzarella">
                        {formatCurrency(slide.price)}
                      </span>
                    </div>
                  )}

                  {/* Button overlay on bottom-right */}
                  <div className="absolute bottom-4 right-4 z-10">
                    <button
                      type="button"
                      onClick={goToCardapio}
                      className="inline-flex items-center gap-1 rounded-full bg-mozzarella px-3 py-1.5 text-xs font-semibold text-tomato lg:px-6 lg:py-3 lg:text-sm transition-transform hover:scale-[1.03]"
                    >
                      Comprar →
                    </button>
                  </div>

                  {slide.imageUrl ? (
                    <img
                      src={slide.imageUrl}
                      alt={slide.title}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[color:var(--on-primary-muted)]">
                      <Camera className="h-8 w-8" strokeWidth={1.5} />
                      <span className="text-xs font-medium">Imagem da promoção em breve</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        aria-label="Promoção anterior"
        onClick={() => emblaApi?.scrollPrev()}
        className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--on-primary)]/25 bg-[color:var(--on-primary)]/10 text-[color:var(--on-primary)] backdrop-blur-sm transition-colors hover:bg-[color:var(--on-primary)]/20 sm:flex"
      >
        <ChevronLeft className="h-4.5 w-4.5" />
      </button>
      <button
        type="button"
        aria-label="Próxima promoção"
        onClick={() => emblaApi?.scrollNext()}
        className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--on-primary)]/25 bg-[color:var(--on-primary)]/10 text-[color:var(--on-primary)] backdrop-blur-sm transition-colors hover:bg-[color:var(--on-primary)]/20 sm:flex"
      >
        <ChevronRight className="h-4.5 w-4.5" />
      </button>

    </div>
  );
}
