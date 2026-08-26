import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowRight, Camera, Circle, Clock, MapPin, Star, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/site/Reveal";
import { TypingText } from "@/components/site/TypingText";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { useGoToCardapio } from "@/lib/pizzaria2/go-to-cardapio";
import { useStore } from "@/lib/pizzaria2/store-provider";
import { useMenu } from "@/lib/pizzaria2/menu-provider";
import { HERO_BOUNDARY_ID } from "@/lib/pizzaria2/hero-overlap";
import { heroFor } from "@/lib/pizzaria2/hero-by-type";
import { CARE_ICONS } from "@/lib/pizzaria2/care-icons";
import { formatCurrency } from "@/lib/pizzaria2/menu";
import { cn } from "@/lib/utils";

/**
 * O topo da vitrine: nome, frase, foto e o cartão de informações.
 *
 * Extraído da página inicial para a prévia do painel poder mostrá-lo. É onde a
 * lojista vê o efeito do que edita em Configurações — nome, subtítulo, frase
 * do topo e, principalmente, a cor da marca, que aqui pinta o fundo inteiro.
 *
 * Tudo que ele precisa sai dos provedores, então usá-lo é só montá-lo: nem a
 * página nem a prévia passam nada.
 */
export function HeroDaVitrine() {
  const goToCardapio = useGoToCardapio();
  const {
    storeName: businessName,
    whatsappHref: buildWhatsappHref,
    whatsappNumber,
    businessType,
    addressLines,
    hasAddress,
    mapsHref,
    openingHoursSummary,
    heroSubtitle,
    deliveryFee,
    estimatedDeliveryMinMax,
  } = useStore();
  // A conversa ja abre dizendo a que veio: quem clica aqui esta com uma
  // duvida, e a mensagem pronta evita que ela comece com um pedido.
  const whatsappHref = buildWhatsappHref("Olá! Tenho uma dúvida.");
  const { products } = useMenu();

  const {
    photos: heroPhotos,
    cravings: heroCravings,
    subtitle: tradeHeroSubtitle,
    markIcon,
  } = heroFor(businessType);
  const MarkIcon = CARE_ICONS[markIcon] ?? CARE_ICONS.Pizza;

  /**
   * The hero shows the store's own food when there is any. A photo under
   * /catalogo-inicial/ came with the starter menu, not from the owner, so it
   * does not count as theirs — otherwise a brand new store would never fall back
   * to the trade photos, which is the whole point of having them.
   */
  const ownPhotos = Array.from(
    new Set(
      products
        .map((p) => p.image)
        .filter(
          (src): src is string =>
            !!src && !src.startsWith("/catalogo-inicial/"),
        ),
    ),
  ).slice(0, 6);
  const slides = ownPhotos.length > 0 ? ownPhotos : heroPhotos;
  const [activePhoto, setActivePhoto] = useState(0);
  const [hasSwitchedPhoto, setHasSwitchedPhoto] = useState(false);
  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      setActivePhoto((i) => (i + 1) % slides.length);
      setHasSwitchedPhoto(true);
    }, 5000);
    return () => clearInterval(id);
  }, [slides.length]);
  const currentPhoto = slides.length > 0 ? activePhoto % slides.length : 0;
  const temFoto = slides.length > 0;

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
    isClickableIcon?: boolean;
    iconHref?: string;
  }[] = [
    {
      icon: Circle,
      tone: isOpen ? "olive" : "tomato",
      title: "Aberto agora",
      // First line of the store's own schedule, instead of a fixed time that
      // contradicts whatever the owner set in the panel.
      detail: openingHoursSummary.slice(0, 1),
      renderIcon: () => (
        <span className="relative flex h-3 w-3">
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-full",
              isOpen ? "bg-olive" : "bg-tomato",
            )}
          />
          <span
            className={cn(
              "relative h-3 w-3 rounded-full",
              isOpen ? "bg-olive" : "bg-tomato",
            )}
          />
        </span>
      ),
    },
    {
      icon: Truck,
      tone: "tomato",
      title: `Entrega em até ${estimatedDeliveryMinMax} min`,
      detail: [`Taxa a partir de ${formatCurrency(deliveryFee)}`],
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
      detail: addressLines,
      // No address on file means no map link — better an absent card than one
      // pointing at a search for nothing.
      action: mapsHref ? { label: "Ver no mapa →", href: mapsHref } : undefined,
    },
    {
      icon: WhatsAppIcon,
      iconClassName: "animate-phone-ring",
      tone: "tomato",
      /*
       * Só dúvida, nunca pedido.
       *
       * "Dúvidas ou pedidos?" convidava a pedir pelo WhatsApp, e o pedido que
       * chega por lá não entra no sistema: fica fora do quadro, fora do
       * faturamento e fora do acompanhamento do cliente. A loja passava a ter
       * dois lugares para olhar, e o site virava o menos confiável dos dois.
       */
      title: "Dúvidas?",
      detail: ["Pedidos só pelo site"],
      isClickableIcon: true,
      iconHref: whatsappHref,
    },
  ];
  return (
    <section className="relative -mt-16.75 flex flex-col overflow-hidden min-h-screen min-h-dvh">
      {/* Text + photo row — grows to fill the hero, but never shrinks below its own content,
          so the info card below can never climb up and overlap it. */}
      {/* Duas colunas só quando existe foto. Sem ela a grade continuava com as
          duas, o texto ficava na primeira e a segunda sobrava como um bloco
          chapado da cor da marca — parecia imagem que não carregou. Nove dos
          dezesseis ramos ainda não têm banco de imagens, então este é o caso
          comum, não a exceção. */}
      <div
        data-previa="cores"
        className={cn(
          "flex flex-1 flex-col bg-gradient-accent md:grid md:grid-rows-[1fr]",
          temFoto ? "md:grid-cols-2" : "md:grid-cols-1",
        )}
      >
        {/* Text panel — sits on the shared accent gradient (bg lives on the row above),
            so the photo's masked edge blends into the exact same gradient with no seam. */}
        <div className="relative z-10 order-2 flex items-center justify-center px-4 pb-10 pt-26.75 sm:px-6 md:order-1">
          <Reveal
            variant="up"
            className={cn("mx-auto text-center", temFoto ? "max-w-xl" : "max-w-3xl")}
          >
            <h1 className="text-balance font-display text-[7vw] font-extrabold leading-[1.1] sm:text-4xl md:text-3xl lg:text-4xl xl:text-5xl">
              <span className="block text-[color:var(--on-primary)]">
                Bateu aquela vontade de
              </span>
              <span className="block min-h-[2.4em] text-[color:var(--on-primary-accent)] sm:min-h-[1.2em] md:text-2xl lg:text-3xl xl:text-4xl">
                <TypingText
                  texts={heroCravings}
                  className="text-[color:var(--on-primary-accent)]"
                  caretClassName="text-[color:var(--on-primary-accent)]/70"
                />
              </span>
            </h1>
            <p
              data-previa="frase-do-topo"
              className="mx-auto mt-5 max-w-md text-base leading-relaxed text-[color:var(--on-primary-muted)]"
            >
              {heroSubtitle || tradeHeroSubtitle}
            </p>
            <div className="relative mt-8 inline-flex w-fit">
              <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[color:var(--on-primary)]/40" />
              {/* O fundo precisa ser repetido no hover. Sem isso vale o
                  hover:bg-primary/90 que vem da variante padrão do Button, e
                  o botão fica com o fundo na mesma cor do próprio texto — ou
                  seja, some ao passar o mouse, em qualquer paleta de loja. */}
              <Button
                size="xl"
                onClick={goToCardapio}
                className="rounded-full bg-[color:var(--on-primary)] px-10 text-lg font-semibold text-[color:var(--primary)] shadow-none hover:bg-[color:var(--on-primary)] hover:opacity-90"
              >
                Ver cardápio →
              </Button>
            </div>
          </Reveal>
        </div>

        {/* Photo — always on the right from md up, full-width above the text on small screens.
            Its own edge fades out (mask, not an overlay) so the shared gradient behind it
            shows through with no seam — the photo dissolves into the red, not cut by it.

            Sem foto nenhuma a coluna inteira sai, em vez de reservar um bloco
            vazio: ramos novos ainda não têm banco de imagens, e a capa só de
            texto sobre o gradiente parece decidida, não quebrada. Assim que o
            dono sobe as fotos dele, elas assumem — ownPhotos vem antes. */}
        {slides.length > 0 && (
        <div className="relative order-1 h-72 sm:h-96 md:order-2 md:h-auto">
          <Reveal variant="scale" className="relative h-full w-full">
            {slides.map((photo, i) => (
              <img
                key={photo}
                src={photo}
                alt={businessName}
                className={cn(
                  "absolute inset-0 h-full w-full object-cover",
                  "mask-[linear-gradient(to_top,transparent,black_35%)] [-webkit-mask-image:linear-gradient(to_top,transparent,black_35%)]",
                  "md:mask-[linear-gradient(to_right,transparent,black_22%)] md:[-webkit-mask-image:linear-gradient(to_right,transparent,black_22%)]",
                  !hasSwitchedPhoto
                    ? i === currentPhoto
                      ? "opacity-100"
                      : "-translate-x-20 opacity-0"
                    : i === currentPhoto
                      ? "animate-[slide-in-from-right_0.9s_ease-out_forwards]"
                      : "animate-[slide-out-to-left_0.9s_ease-in_forwards]",
                )}
              />
            ))}
          </Reveal>
        </div>
        )}
      </div>

      {/* Marks where the red gradient ends, so the fixed header knows when to
          switch from light to dark text (see useHeaderOverHero). */}
      <div id={HERO_BOUNDARY_ID} className="h-px" />

      {/* Info card — always follows the row above in normal flow, so it can never overlap
          the headline or the button, no matter the viewport height or text length. */}
      <div className="relative z-20 bg-mozzarella px-4 pb-0 pt-6 sm:px-6 sm:pb-0 sm:pt-8">
        <Reveal
          variant="up"
          className="mx-auto grid max-w-[1200px] grid-cols-4 divide-y divide-charcoal/8 overflow-hidden rounded-[28px] border border-charcoal/8 bg-mozzarella shadow-[0_20px_50px_-35px_rgba(23,23,23,0.4)] sm:divide-x sm:divide-y-0"
        >
          {infoBlocks.map((block) => (
            <div key={block.title} className="flex flex-col gap-2 p-3 sm:p-4">
              <span className="font-display text-xs font-bold text-charcoal text-center">
                {block.title}
              </span>

              <div className="flex justify-center">
                {block.isClickableIcon && block.iconHref ? (
                  <a
                    href={block.iconHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full transition-opacity hover:opacity-80",
                      block.tone === "olive"
                        ? "bg-olive/10 text-olive"
                        : "bg-tomato/10 text-tomato",
                    )}
                  >
                    {block.renderIcon ? (
                      block.renderIcon()
                    ) : (
                      <block.icon
                        className={cn("h-3.5 w-3.5", block.iconClassName)}
                      />
                    )}
                  </a>
                ) : (
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                      block.tone === "olive"
                        ? "bg-olive/10 text-olive"
                        : "bg-tomato/10 text-tomato",
                    )}
                  >
                    {block.renderIcon ? (
                      block.renderIcon()
                    ) : (
                      <block.icon
                        className={cn("h-3.5 w-3.5", block.iconClassName)}
                      />
                    )}
                  </span>
                )}
              </div>

              <div className="flex-1 text-center">
                {block.detail.map((line) => (
                  <p
                    key={line}
                    className="text-xs font-semibold leading-relaxed text-charcoal/80"
                  >
                    {line}
                  </p>
                ))}
              </div>

              {block.badge && (
                <div className="flex justify-center">
                  <span
                    className={cn(
                      "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      block.tone === "olive"
                        ? "bg-olive/10 text-olive"
                        : "bg-tomato/10 text-tomato",
                    )}
                  >
                    {block.badge}
                  </span>
                </div>
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
  );
}
