import { Link } from "@tanstack/react-router";
import { Mail, MapPin, Pizza } from "lucide-react";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { useGoToCardapio } from "@/lib/pizzaria2/go-to-cardapio";
import { useStore } from "@/lib/pizzaria2/store-provider";

export function Footer() {
  const goToCardapio = useGoToCardapio();
  const {
    storeName,
    slug: storeSlug,
    description,
    logoUrl,
    whatsappNumber,
    email,
    socialLinks,
    addressLines,
    hasAddress,
    mapsHref,
    openingHoursSummary,
    whatsappHref,
  } = useStore();

  return (
    <footer className="border-t border-charcoal/8 bg-cream">
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-14">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.8fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={storeName}
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tomato text-mozzarella">
                  <Pizza className="h-4.5 w-4.5" />
                </span>
              )}
              <span className="font-display text-lg font-bold text-charcoal">{storeName}</span>
            </div>
            {description && (
              <p className="mt-4 max-w-[26ch] text-sm leading-relaxed text-charcoal/55">
                {description}
              </p>
            )}
            <div className="mt-5 flex items-center gap-2">
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="grid h-8 w-8 place-items-center rounded-full text-charcoal/55 transition-colors hover:bg-tomato/10 hover:text-tomato"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <p className="font-display text-sm font-bold text-charcoal">Navegação</p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  to="/$storeSlug" params={{ storeSlug }}
                  activeOptions={{ exact: true }}
                  className="text-sm text-charcoal/60 transition-colors hover:text-tomato"
                  activeProps={{ className: "!text-tomato" }}
                >
                  Início
                </Link>
              </li>
              <li>
                <a
                  href="/$storeSlug#cardapio"
                  onClick={goToCardapio}
                  className="text-sm text-charcoal/60 transition-colors hover:text-tomato"
                >
                  Cardápio
                </a>
              </li>
              <li className="cursor-default text-sm text-charcoal/35">Acompanhar pedido</li>
              <li className="cursor-default text-sm text-charcoal/35">Contato</li>
            </ul>
          </div>

          <div>
            <p className="font-display text-sm font-bold text-charcoal">Atendimento</p>
            <ul className="mt-4 space-y-2.5 text-sm text-charcoal/60">
              {whatsappNumber && (
                <>
                  <li>
                    <a
                      href={whatsappHref()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-tomato"
                    >
                      <WhatsAppIcon className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  </li>
                  <li>{whatsappNumber}</li>
                </>
              )}
              {email && (
                <li>
                  <a
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-tomato"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {email}
                  </a>
                </li>
              )}
              {openingHoursSummary.map((line) => (
                <li key={line} className="text-charcoal/50">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {hasAddress && (
            <div>
              <p className="font-display text-sm font-bold text-charcoal">Endereço</p>
              <div className="mt-4 flex items-start gap-2 text-sm text-charcoal/60">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-tomato/70" />
                <div>
                  {addressLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
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
          )}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-charcoal/8 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-charcoal/45">
            © {new Date().getFullYear()} {storeName} · Todos os direitos reservados
          </p>
          <div className="flex items-center gap-4 text-xs text-charcoal/45">
            <a href="#" className="transition-colors hover:text-tomato">
              Política de Privacidade
            </a>
            <span className="text-charcoal/20">·</span>
            <a href="#" className="transition-colors hover:text-tomato">
              Termos de Uso
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
