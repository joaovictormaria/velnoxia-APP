import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, Circle, Clock, Flame, Leaf, MapPin, Pizza, Truck, Wheat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/site/Reveal";
import { TypingText } from "@/components/site/TypingText";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { CategorySaboresSection } from "@/components/site/pizzaria2/CategorySaboresSection";
import { PromoCarousel } from "@/components/site/pizzaria2/PromoCarousel";
import { useGoToCardapio } from "@/lib/pizzaria2/go-to-cardapio";
import { useStore } from "@/lib/pizzaria2/store-provider";
import { HERO_BOUNDARY_ID } from "@/lib/pizzaria2/hero-overlap";
import { cn } from "@/lib/utils";
import heroPizzaPhoto from "@/assets/fotos de pizza/pizza-hero.jpg";
import heroPizzaPhotoOven from "@/assets/fotos de pizza/pizza-hero.jpeg";

const title = "Pizzaria — Cardápio online e entrega rápida | velnox.ia";
const description =
  "Cardápio completo, entrega rápida e pedido online. Pizzas tradicionais, especiais e doces feitas com carinho.";

export const Route = createFileRoute("/$storeSlug/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: PizzariaInicio,
});

const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  "Av. das Palmeiras, 812 - Jardim das Flores",
)}`;

const careItems = [
  { icon: Leaf, label: "Ingredientes selecionados" },
  { icon: Wheat, label: "Massa artesanal (fermentação natural)" },
  { icon: Flame, label: "Forno à lenha (sabor único)" },
  { icon: Truck, label: "Entrega rápida e segura" },
];

const heroPhotos = [heroPizzaPhoto, heroPizzaPhotoOven];

const heroCravings = [
  "queijo derretido?",
  "massa crocante?",
  "uma pizza saindo do forno?",
  "uma borda douradinha?",
  "uma pizza bem recheada?",
  "um sabor irresistível?",
  "comer bem?",
];

function PizzariaInicio() {
  const goToCardapio = useGoToCardapio();
  const { storeName: businessName, whatsappHref: buildWhatsappHref } = useStore();
  const whatsappHref = buildWhatsappHref();

  const [activePhoto, setActivePhoto] = useState(0);
  const [hasSwitchedPhoto, setHasSwitchedPhoto] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setActivePhoto((i) => (i + 1) % heroPhotos.length);
      setHasSwitchedPhoto(true);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const isOpen = true; // "Aberto agora" — flip to preview the closed (blinking red) state.

  const infoBlocks: {
    icon: ComponentType<{ className?: string }>;
    iconClassName?: string;
    tone: "olive" | "tomato";
    title: string;
    detail: string[];
    badge?: string;
    action?: { label: string; href: string };
    renderIcon?: () => ReactNode;
  }[] = [
    {
      icon: Circle,
      tone: isOpen ? "olive" : "tomato",
      title: "Aberto agora",
      detail: [isOpen ? "Fecha às 23:30" : "Abre às 18:00"],
      badge: isOpen ? "Aberto" : "Fechado",
      renderIcon: () => (
        <span className="relative flex h-3 w-3">
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-full",
              isOpen ? "bg-olive" : "bg-tomato",
            )}
          />
          <span className={cn("relative h-3 w-3 rounded-full", isOpen ? "bg-olive" : "bg-tomato")} />
        </span>
      ),
    },
    {
      icon: Truck,
      tone: "tomato",
      title: "Entrega em até 40 min",
      detail: ["Taxa a partir de R$ 6,00"],
      renderIcon: () => (
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span className="pointer-events-none absolute -left-1 top-0 flex flex-col gap-0.5">
            <span
              className="h-1 w-1 rounded-full bg-tomato/60 animate-truck-smoke"
              style={{ animationDelay: "0s" }}
            />
            <span
              className="h-1 w-1 rounded-full bg-tomato/60 animate-truck-smoke"
              style={{ animationDelay: "0.35s" }}
            />
            <span
              className="h-1 w-1 rounded-full bg-tomato/60 animate-truck-smoke"
              style={{ animationDelay: "0.7s" }}
            />
          </span>
          <Truck className="h-5 w-5 animate-truck-drive" />
        </span>
      ),
    },
    {
      icon: MapPin,
      iconClassName: "animate-bounce",
      tone: "tomato",
      title: "Endereço",
      detail: ["Av. das Palmeiras, 812 —", "Jardim das Flores"],
      action: { label: "Ver no mapa →", href: mapsHref },
    },
    {
      icon: WhatsAppIcon,
      iconClassName: "animate-phone-ring",
      tone: "tomato",
      title: "Dúvidas ou pedidos?",
      detail: ["Fale com a gente"],
      action: { label: "Chamar no WhatsApp →", href: whatsappHref },
    },
  ];

  return (
    <main>
      <section className="relative -mt-16.75 flex flex-col overflow-hidden min-h-screen min-h-dvh">
        {/* Text + photo row — grows to fill the hero, but never shrinks below its own content,
            so the info card below can never climb up and overlap it. */}
        <div className="flex flex-1 flex-col bg-gradient-accent md:grid md:grid-cols-2 md:grid-rows-[1fr]">
          {/* Text panel — sits on the shared accent gradient (bg lives on the row above),
              so the photo's masked edge blends into the exact same gradient with no seam. */}
          <div className="relative z-10 order-2 flex items-center justify-center px-4 py-10 sm:px-6 md:order-1">
            <Reveal variant="up" className="mx-auto max-w-xl text-center">
              <h1 className="font-display text-[7vw] font-extrabold leading-[1.1] sm:text-5xl md:text-4xl lg:text-5xl">
                <span className="block whitespace-nowrap text-mozzarella">Bateu aquela vontade de</span>
                <span className="block min-h-[1.2em] whitespace-nowrap text-[#ffd166] md:text-3xl lg:text-4xl xl:text-5xl">
                  <TypingText texts={heroCravings} className="text-[#ffd166]" caretClassName="text-[#ffd166]/70" />
                </span>
              </h1>
              <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-mozzarella/75">
                Escolha seus sabores favoritos e peça agora.
              </p>
              <div className="relative mt-8 inline-flex w-fit">
                <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-mozzarella/40" />
                <Button
                  size="xl"
                  onClick={goToCardapio}
                  className="rounded-full bg-mozzarella px-10 text-lg font-semibold text-tomato shadow-none hover:bg-mozzarella/90"
                >
                  Ver cardápio →
                </Button>
              </div>
            </Reveal>
          </div>

          {/* Photo — always on the right from md up, full-width above the text on small screens.
              Its own edge fades out (mask, not an overlay) so the shared gradient behind it
              shows through with no seam — the photo dissolves into the red, not cut by it. */}
          <div className="relative order-1 h-72 sm:h-96 md:order-2 md:h-auto">
            <Reveal variant="scale" className="relative h-full w-full">
              {heroPhotos.map((photo, i) => (
                <img
                  key={photo}
                  src={photo}
                  alt="Pizza de pepperoni com manjericão fresco"
                  className={cn(
                    "absolute inset-0 h-full w-full object-cover",
                    "mask-[linear-gradient(to_top,transparent,black_35%)] [-webkit-mask-image:linear-gradient(to_top,transparent,black_35%)]",
                    "md:mask-[linear-gradient(to_right,transparent,black_22%)] md:[-webkit-mask-image:linear-gradient(to_right,transparent,black_22%)]",
                    !hasSwitchedPhoto
                      ? i === activePhoto
                        ? "opacity-100"
                        : "-translate-x-20 opacity-0"
                      : i === activePhoto
                        ? "animate-[slide-in-from-right_0.9s_ease-out_forwards]"
                        : "animate-[slide-out-to-left_0.9s_ease-in_forwards]",
                  )}
                />
              ))}
            </Reveal>
          </div>
        </div>

        {/* Marks where the red gradient ends, so the fixed header knows when to
            switch from light to dark text (see useHeaderOverHero). */}
        <div id={HERO_BOUNDARY_ID} className="h-px" />

        {/* Info card — always follows the row above in normal flow, so it can never overlap
            the headline or the button, no matter the viewport height or text length. */}
        <div className="relative z-20 bg-mozzarella px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8">
          <Reveal
            variant="up"
            className="mx-auto grid max-w-[1200px] grid-cols-1 divide-y divide-charcoal/8 overflow-hidden rounded-[28px] border border-charcoal/8 bg-mozzarella shadow-[0_20px_50px_-35px_rgba(23,23,23,0.4)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"
          >
            {infoBlocks.map((block) => (
              <div key={block.title} className="flex flex-col gap-3 p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid h-11 w-11 shrink-0 place-items-center rounded-full",
                      block.tone === "olive" ? "bg-olive/10 text-olive" : "bg-tomato/10 text-tomato",
                    )}
                  >
                    {block.renderIcon ? block.renderIcon() : <block.icon className={cn("h-5 w-5", block.iconClassName)} />}
                  </span>
                  <span className="font-display text-sm font-bold text-charcoal">
                    {block.title}
                  </span>
                </div>

                <div className="flex-1">
                  {block.detail.map((line) => (
                    <p key={line} className="text-sm font-semibold leading-relaxed text-charcoal/80">
                      {line}
                    </p>
                  ))}
                </div>

                {block.badge && (
                  <span
                    className={cn(
                      "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      block.tone === "olive" ? "bg-olive/10 text-olive" : "bg-tomato/10 text-tomato",
                    )}
                  >
                    {block.badge}
                  </span>
                )}

                {block.action && (
                  <a
                    href={block.action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-fit items-center text-xs font-semibold text-tomato hover:underline"
                  >
                    {block.action.label}
                  </a>
                )}
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="cardapio" className="relative scroll-mt-20 overflow-hidden">
        <div className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-tomato/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-olive/10 blur-3xl" />
        <div className="relative mx-auto max-w-[1800px] px-6 py-20 sm:px-10 sm:py-24 xl:px-16">
          <CategorySaboresSection />
        </div>
      </section>

      <section id="promocoes" className="scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-20">
        <Reveal variant="up" className="mx-auto max-w-[1200px]">
          <PromoCarousel />
        </Reveal>
      </section>

      <section id="restaurante" className="scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="mx-auto max-w-[1200px] overflow-hidden rounded-[32px] border border-charcoal/8 bg-mozzarella p-6 shadow-[0_20px_50px_-35px_rgba(23,23,23,0.35)] sm:p-10">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal variant="left">
              <div className="relative aspect-4/3 w-full overflow-hidden rounded-[24px] border border-dashed border-charcoal/15 bg-charcoal/[0.03] sm:aspect-4/5">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-charcoal/25">
                  <Camera className="h-9 w-9" strokeWidth={1.5} />
                  <span className="text-xs font-medium">Foto do restaurante em breve</span>
                </div>
              </div>
            </Reveal>

            <Reveal variant="right">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-tomato">
                <span className="h-1.5 w-1.5 rounded-full bg-tomato" />
                Nosso restaurante
              </span>
              <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-charcoal sm:text-4xl">
                Feita com paixão, servida com carinho.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-charcoal/60">
                Na {businessName}, cada pizza começa com uma massa fermentada por 48 horas,
                ingredientes selecionados todos os dias e um preparo cuidadoso do início ao fim —
                para que cada mordida chegue até você com o mesmo carinho de sempre.
              </p>

              <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="flex gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tomato/10 text-tomato">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-bold text-charcoal">
                      Horário de funcionamento
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-charcoal/55">
                      Seg a Dom
                      <br />
                      18h às 23h30
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-olive/10 text-olive">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-bold text-charcoal">Localização</p>
                    <p className="mt-1 text-sm leading-relaxed text-charcoal/55">
                      Av. das Palmeiras, 812
                      <br />
                      Jardim das Flores — São Paulo
                    </p>
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center text-sm font-semibold text-tomato hover:underline"
                    >
                      Ver no mapa →
                    </a>
                  </div>
                </div>
              </div>
            </Reveal>
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

          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {careItems.map((item, i) => (
              <Reveal
                key={item.label}
                variant="up"
                delay={i * 80}
                className="flex flex-col items-center gap-3 text-center"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-tomato/10 text-tomato">
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium text-charcoal/70 sm:text-sm">
                  {item.label}
                </span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-24">
        <Reveal
          variant="up"
          className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] bg-tomato px-6 py-8 shadow-[0_20px_50px_-30px_rgba(233,75,44,0.55)] sm:px-10 sm:py-9"
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-mozzarella/10 blur-2xl" />
          <Pizza
            strokeWidth={1}
            className="pointer-events-none absolute -bottom-8 right-4 h-28 w-28 rotate-12 text-mozzarella/10 sm:right-8 sm:h-32 sm:w-32"
          />

          <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-extrabold text-mozzarella sm:text-2xl">
                Deu vontade de pizza? 🍕
              </h2>
              <p className="mt-1.5 text-sm text-mozzarella/80 sm:text-base">
                Peça agora pelo WhatsApp e fale diretamente com a gente.
              </p>
            </div>

            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-mozzarella px-6 py-3 text-sm font-semibold text-charcoal shadow-sm transition-transform hover:scale-[1.03] sm:text-base"
            >
              <WhatsAppIcon className="h-4 w-4 text-tomato" />
              Pedir pelo WhatsApp →
            </a>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
