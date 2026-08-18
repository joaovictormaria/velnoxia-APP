import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ComponentType } from "react";
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
} from "@/components/site/pizzaria2/SocialIcons";

export type Weekday =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

/** Shape of the `store` key returned by getStorefrontMenuFn. */
export type StorePayload = {
  /** URL segment of this store — the checkout sends it back to scope the order. */
  slug: string;
  storeName: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string;
  whatsappNumber: string;
  email: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZipCode: string | null;
  deliveryFee: number;
  freeDeliveryMinOrder: number | null;
  minOrderValue: number;
  estimatedDeliveryMinMin: number;
  estimatedDeliveryMinMax: number;
  estimatedPickupMinMin: number;
  estimatedPickupMinMax: number;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  acceptedPaymentMethods: string[];
  openingHours: { weekday: Weekday; isOpen: boolean; opensAt: string; closesAt: string }[];
  restaurantPhotos: { id: string; url: string; caption: string | null }[];
};

export type SocialLink = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

export type StoreApi = StorePayload & {
  /** Street + number + neighborhood, skipping the parts that are unset. */
  addressLines: string[];
  hasAddress: boolean;
  mapsHref: string | null;
  whatsappHref: (message?: string) => string;
  /** Only the networks that were actually filled in by the admin. */
  socialLinks: SocialLink[];
  /** e.g. "Seg a Sex: 18:00 às 23:30" — consecutive equal days are grouped. */
  openingHoursSummary: string[];
};

const SHORT_DAY: Record<Weekday, string> = {
  MONDAY: "Seg",
  TUESDAY: "Ter",
  WEDNESDAY: "Qua",
  THURSDAY: "Qui",
  FRIDAY: "Sex",
  SATURDAY: "Sáb",
  SUNDAY: "Dom",
};

export function whatsappLink(phone: string, message?: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const withCountryCode = digits.startsWith("55") ? digits : `55${digits}`;
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${withCountryCode}${query}`;
}

function buildAddressLines(s: StorePayload): string[] {
  const streetLine = [s.addressStreet, s.addressNumber].filter(Boolean).join(", ");
  const cityLine = [s.addressCity, s.addressState].filter(Boolean).join(" – ");
  return [streetLine, s.addressComplement, s.addressNeighborhood, cityLine].filter(
    (line): line is string => Boolean(line && line.trim()),
  );
}

function buildSocialLinks(s: StorePayload): SocialLink[] {
  const candidates: { label: string; href: string | null; icon: SocialLink["icon"] }[] = [
    { label: "Instagram", href: s.instagramUrl, icon: InstagramIcon },
    { label: "Facebook", href: s.facebookUrl, icon: FacebookIcon },
    { label: "TikTok", href: s.tiktokUrl, icon: TikTokIcon },
  ];
  return candidates.flatMap((l) => (l.href ? [{ ...l, href: l.href }] : []));
}

/** Collapses runs of days that share the same hours into a single line. */
function buildOpeningHoursSummary(hours: StorePayload["openingHours"]): string[] {
  const lines: string[] = [];
  let run: { start: Weekday; end: Weekday; label: string } | null = null;

  const flush = () => {
    if (!run) return;
    const days =
      run.start === run.end
        ? SHORT_DAY[run.start]
        : `${SHORT_DAY[run.start]} a ${SHORT_DAY[run.end]}`;
    lines.push(`${days}: ${run.label}`);
    run = null;
  };

  for (const h of hours) {
    const label = h.isOpen ? `${h.opensAt} às ${h.closesAt}` : "Fechado";
    if (run && run.label === label) run.end = h.weekday;
    else {
      flush();
      run = { start: h.weekday, end: h.weekday, label };
    }
  }
  flush();
  return lines;
}

function adapt(payload: StorePayload): StoreApi {
  const addressLines = buildAddressLines(payload);
  const fullAddress = addressLines.join(", ");

  return {
    ...payload,
    addressLines,
    hasAddress: addressLines.length > 0,
    mapsHref: fullAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
      : null,
    whatsappHref: (message?: string) => whatsappLink(payload.whatsappNumber, message),
    socialLinks: buildSocialLinks(payload),
    openingHoursSummary: buildOpeningHoursSummary(payload.openingHours),
  };
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({
  payload,
  children,
}: {
  payload: StorePayload;
  children: ReactNode;
}) {
  const value = useMemo(() => adapt(payload), [payload]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
