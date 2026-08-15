import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { usePizzariaOnboarding, whatsappLink } from "@/lib/pizzaria2/onboarding";
import { cn } from "@/lib/utils";

type PromoSlide = {
  eyebrow: string;
  title: string;
  description: string;
  discount?: string;
  price?: string;
  originalPrice?: string;
  whatsappMessage: string;
};

const promoSlides: PromoSlide[] = [
  {
    eyebrow: "Oferta da semana",
    title: "Terça da Família",
    description: "2 pizzas grandes + refrigerante 2L, pra ninguém ficar de fora.",
    discount: "-20%",
    price: "R$ 79,90",
    originalPrice: "R$ 99,90",
    whatsappMessage: "Olá! Quero aproveitar a promoção Terça da Família 🍕",
  },
  {
    eyebrow: "Combo especial",
    title: "Combo Casal",
    description: "1 pizza média + sobremesa + bebida, pra um jantar a dois.",
    price: "R$ 54,90",
    whatsappMessage: "Olá! Quero pedir o Combo Casal 🍕",
  },
  {
    eyebrow: "Toda sexta-feira",
    title: "Sexta é Dia de Promoção",
    description: "Todas as pizzas especiais com desconto — só até domingo.",
    discount: "-15%",
    whatsappMessage: "Olá! Quero pedir uma pizza especial da promoção de sexta 🍕",
  },
];

export function PromoCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { businessPhone } = usePizzariaOnboarding();

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
    <div className="relative overflow-hidden rounded-[32px] bg-tomato shadow-[0_25px_60px_-30px_rgba(233,75,44,0.55)]">
      <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-mozzarella/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-charcoal/10 blur-3xl" />

      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {promoSlides.map((slide) => (
            <div key={slide.title} className="min-w-0 shrink-0 grow-0 basis-full">
              <div className="relative grid grid-cols-1 items-center gap-8 px-6 pb-14 pt-10 sm:px-10 sm:pb-16 sm:pt-12 md:grid-cols-2 md:gap-12 lg:px-14">
                <div>
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-mozzarella/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-mozzarella/80" />
                    {slide.eyebrow}
                  </span>
                  <h3 className="mt-3 font-display text-2xl font-extrabold leading-tight text-mozzarella sm:text-3xl">
                    {slide.title}
                  </h3>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-mozzarella/80 sm:text-base">
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
                          <span className="text-sm text-mozzarella/55 line-through">
                            {slide.originalPrice}
                          </span>
                        )}
                        <span className="font-display text-xl font-bold text-mozzarella">
                          {slide.price}
                        </span>
                      </span>
                    )}
                  </div>

                  <a
                    href={whatsappLink(businessPhone, slide.whatsappMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-7 inline-flex items-center gap-1.5 rounded-full bg-mozzarella px-6 py-3 text-sm font-semibold text-tomato shadow-sm transition-transform hover:scale-[1.03]"
                  >
                    Pedir pelo WhatsApp →
                  </a>
                </div>

                <div className="relative aspect-video w-full overflow-hidden rounded-[22px] border border-dashed border-mozzarella/30 bg-mozzarella/10 md:aspect-4/3">
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-mozzarella/60">
                    <Camera className="h-8 w-8" strokeWidth={1.5} />
                    <span className="text-xs font-medium">Imagem da promoção em breve</span>
                  </div>
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
        className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-mozzarella/25 bg-mozzarella/10 text-mozzarella backdrop-blur-sm transition-colors hover:bg-mozzarella/20 sm:flex"
      >
        <ChevronLeft className="h-4.5 w-4.5" />
      </button>
      <button
        type="button"
        aria-label="Próxima promoção"
        onClick={() => emblaApi?.scrollNext()}
        className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-mozzarella/25 bg-mozzarella/10 text-mozzarella backdrop-blur-sm transition-colors hover:bg-mozzarella/20 sm:flex"
      >
        <ChevronRight className="h-4.5 w-4.5" />
      </button>

      <div className="relative flex items-center justify-center gap-2 pb-6">
        {promoSlides.map((slide, i) => (
          <button
            key={slide.title}
            type="button"
            aria-label={`Ir para promoção ${i + 1}`}
            onClick={() => emblaApi?.scrollTo(i)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === selectedIndex ? "w-6 bg-mozzarella" : "w-1.5 bg-mozzarella/40 hover:bg-mozzarella/60",
            )}
          />
        ))}
      </div>
    </div>
  );
}
