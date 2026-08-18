/**
 * Turns the owner's single brand colour into the set of tokens the storefront
 * needs, including the text colour that sits on top of it.
 *
 * The contrast part is not cosmetic: the hero prints its headline over the
 * brand gradient, so a light brand colour with fixed white text would leave
 * the store name unreadable. The owner picks one colour; deciding what is
 * legible on it is our job, not theirs.
 */

const FALLBACK = "#e94b2c";

function parseHex(hex: string): { r: number; g: number; b: number } | null {
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

export type BrandTheme = Record<string, string>;

export function brandTheme(primaryColor: string): BrandTheme {
  const color = parseHex(primaryColor) ? primaryColor : FALLBACK;
  const light = luminance(color) > 0.55;

  return {
    "--tomato": color,
    "--primary": color,
    // Gradient ends derived from the one colour, so the owner never has to
    // pick three that work together.
    "--primary-glow": `color-mix(in oklab, ${color} 82%, white)`,
    "--primary-deep": `color-mix(in oklab, ${color} 78%, black)`,
    // Text drawn over the brand colour. A pale brand needs dark type; the
    // highlight follows so the animated line never vanishes either.
    "--on-primary": light ? "#171717" : "#fffdf8",
    "--on-primary-muted": light ? "rgba(23,23,23,0.72)" : "rgba(255,253,248,0.75)",
    "--on-primary-accent": light ? "#7a3b00" : "#ffd166",
  };
}
