import { Camera, Clock, MapPin } from 'lucide-react';
import { Reveal } from '@/components/site/Reveal';
import { WhatsAppIcon } from '@/components/site/WhatsAppIcon';
import { useStore } from '@/lib/pizzaria2/store-provider';
import { heroFor } from '@/lib/pizzaria2/hero-by-type';
import { cn } from '@/lib/utils';

/**
 * A secao "Nosso restaurante": a foto e o texto que o dono escreve sobre a loja.
 *
 * Extraida da pagina inicial para a previa do painel poder mostra-la. E o
 * unico lugar onde esses campos aparecem, e eles sao escritos numa aba que nao
 * da nenhuma pista do resultado.
 */
export function SobreORestaurante() {
  const {
    storeName: businessName,
    businessType,
    aboutEyebrow,
    aboutTitle,
    aboutBody,
    aboutImageUrl,
    addressLines,
    hasAddress,
    mapsHref,
    openingHoursSummary,
    whatsappHref: buildWhatsappHref,
  } = useStore();
  const whatsappHref = buildWhatsappHref();
  const { aboutTitle: tradeAboutTitle, aboutBody: tradeAboutBody } = heroFor(businessType);

  return (
    <>
    <Reveal variant="left">
      {/* Dashed frame only while there is nothing to show; once the
      owner uploads a photo it fills it and the dashes go away. */}
      <div data-previa="foto-do-sobre"
        className={cn(
          "relative mx-auto aspect-4/3 w-full max-w-[420px] overflow-hidden rounded-[24px] sm:mx-0",
          aboutImageUrl
            ? "border border-charcoal/10"
            : "border border-dashed border-charcoal/15 bg-charcoal/[0.03]",
        )}
      >
        {aboutImageUrl ? (
          <img
            src={aboutImageUrl}
            alt={businessName}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-charcoal/25">
            <Camera className="h-9 w-9" strokeWidth={1.5} />
            <span className="text-xs font-medium">
              Foto do restaurante em breve
            </span>
          </div>
        )}
      </div>
    </Reveal>

    <Reveal variant="up" className="mt-8">
      <span data-previa="chamada-do-sobre" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-tomato">
        <span className="h-1.5 w-1.5 rounded-full bg-tomato" />
        {aboutEyebrow || "Nosso restaurante"}
      </span>
      <h2 data-previa="titulo-do-sobre" className="mt-3 font-display text-3xl font-extrabold leading-tight text-charcoal sm:text-4xl">
        {aboutTitle || tradeAboutTitle}
      </h2>
      <p data-previa="texto-do-sobre" className="mt-4 text-base leading-relaxed text-charcoal/60">
        {aboutBody || "Na " + businessName + ", " + tradeAboutBody}
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
            <p className="font-display text-sm font-bold text-charcoal">
              Localização
            </p>
            <p className="mt-1 text-sm leading-relaxed text-charcoal/55">
              {hasAddress
                ? addressLines.join(" — ")
                : "Endereço ainda não informado."}
            </p>
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center text-sm font-semibold text-tomato hover:underline"
              >
                Ver no mapa →
              </a>
            )}
          </div>
        </div>
      </div>
    </Reveal>
    </>
  );
}
