/**
 * Turns the owner's palette into the tokens the storefront needs, including
 * the text colour that sits on top of it.
 *
 * The contrast part is not cosmetic: the hero prints the store name over the
 * brand background, so a light palette with fixed light text would leave that
 * name unreadable. The owner picks colours; deciding what is legible on them
 * is our job, not theirs.
 */

const FALLBACK = "#e94b2c";

export type Palette = {
  colorMode: string;
  primaryColor: string;
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
};

function parseHex(hex: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const c = parseHex(hex) ?? parseHex(FALLBACK)!;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** Valid stops in order, always with at least the primary. */
export function paletteStops(p: Palette): string[] {
  const stops = [p.primaryColor, p.secondaryColor, p.tertiaryColor]
    .filter((c): c is string => Boolean(parseHex(c)));
  return stops.length ? stops : [FALLBACK];
}

export type BrandTheme = Record<string, string>;

export function brandTheme(palette: Palette): BrandTheme {
  const stops = paletteStops(palette);
  const primary = stops[0];
  const solid = palette.colorMode === "SOLID" || stops.length < 2;

  /*
   * Contrast is judged by the lightest stop, not by the average. Text sits over
   * the whole background, so a gradient that runs from deep blue to cream would
   * pass an averaged check and still lose the headline at the cream end.
   */
  const lightest = Math.max(...stops.map(luminance));
  const light = lightest > 0.55;

  const background = solid
    ? primary
    : `linear-gradient(135deg, ${stops.join(", ")})`;

  return {
    "--tomato": primary,
    "--primary": primary,
    "--primary-glow": solid ? primary : `color-mix(in oklab, ${primary} 82%, white)`,
    "--primary-deep": solid ? primary : `color-mix(in oklab, ${stops.at(-1)!} 78%, black)`,
    /*
     * The composed gradients are restated, not just their ingredients: a custom
     * property containing var() is substituted where it is declared, and these
     * live on :root — so overriding the ingredients further down never reaches
     * them.
     */
    "--gradient-accent": solid ? primary : background,
    "--gradient-ember": `radial-gradient(60% 60% at 30% 20%, color-mix(in oklab, ${primary} 22%, transparent), transparent 70%)`,
    "--on-primary": light ? "#171717" : "#fffdf8",
    "--on-primary-muted": light ? "rgba(23,23,23,0.72)" : "rgba(255,253,248,0.75)",
    "--on-primary-accent": light ? "#7a3b00" : "#ffd166",
  };
}
