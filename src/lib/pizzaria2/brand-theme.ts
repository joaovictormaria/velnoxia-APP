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

function parseHex(
  hex: string | null | undefined,
): { r: number; g: number; b: number } | null {
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
  const stops = [p.primaryColor, p.secondaryColor, p.tertiaryColor].filter(
    (c): c is string => Boolean(parseHex(c)),
  );
  return stops.length ? stops : [FALLBACK];
}

export type BrandTheme = Record<string, string>;

const ON_DARK = "#171717";
const ON_LIGHT = "#fffdf8";

/**
 * Warm tones for the highlighted word in the headline, from deepest to
 * lightest. One of them is picked by measurement; the point of the list is that
 * a mid-tone brand color has somewhere to go when the obvious choice is too
 * close to the background.
 */
const ACCENTS_FOR_DARK_TEXT = ["#7a3b00", "#5a2a00", "#3d1c00"];
const ACCENTS_FOR_LIGHT_TEXT = ["#ffd166", "#ffe3a3", "#fff3d6"];

/** Below this a phrase stops being comfortably readable. */
const MIN_ACCENT_CONTRAST = 4.5;

/** WCAG contrast ratio between two hex colors, from 1 (same) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function brandTheme(palette: Palette): BrandTheme {
  const stops = paletteStops(palette);
  const primary = stops[0];
  const solid = palette.colorMode === "SOLID" || stops.length < 2;

  /*
   * Which of the two text colors survives on this background is measured, not
   * guessed from a luminance threshold. A fixed cutoff gets the middle of the
   * range wrong: a medium purple or a medium blue reads as "dark" and keeps the
   * cream text at a contrast around 3, which is where headlines start to
   * disappear. Measuring picks dark text for both and lands near 6.
   *
   * The worst stop decides. Text sits over the whole background, so a gradient
   * running from deep blue to cream must satisfy the cream end too, not the
   * average of the two.
   */
  const worstContrast = (fg: string) =>
    Math.min(...stops.map((s) => contrast(s, fg)));
  const light = worstContrast(ON_DARK) >= worstContrast(ON_LIGHT);
  const onPrimary = light ? ON_DARK : ON_LIGHT;

  const accentOptions = light ? ACCENTS_FOR_DARK_TEXT : ACCENTS_FOR_LIGHT_TEXT;
  const bestAccent = accentOptions.reduce((best, c) =>
    worstContrast(c) > worstContrast(best) ? c : best,
  );
  const accent =
    worstContrast(bestAccent) >= MIN_ACCENT_CONTRAST ? bestAccent : onPrimary;

  /*
   * Even the flat option has to be a gradient value. The token is consumed by
   * `background-image`, which rejects a bare colour outright — the declaration
   * is dropped and the hero renders transparent, i.e. white. Two identical
   * stops paint the same flat colour through a value the property accepts.
   */
  const background = solid
    ? `linear-gradient(${primary}, ${primary})`
    : `linear-gradient(135deg, ${stops.join(", ")})`;

  return {
    "--tomato": primary,
    "--primary": primary,
    "--primary-glow": solid
      ? primary
      : `color-mix(in oklab, ${primary} 82%, white)`,
    "--primary-deep": solid
      ? primary
      : `color-mix(in oklab, ${stops.at(-1)!} 78%, black)`,
    /*
     * The composed gradients are restated, not just their ingredients: a custom
     * property containing var() is substituted where it is declared, and these
     * live on :root — so overriding the ingredients further down never reaches
     * them.
     */
    "--gradient-accent": background,
    "--gradient-ember": `radial-gradient(60% 60% at 30% 20%, color-mix(in oklab, ${primary} 22%, transparent), transparent 70%)`,
    "--on-primary": onPrimary,
    "--on-primary-muted": light
      ? "rgba(23,23,23,0.72)"
      : "rgba(255,253,248,0.75)",
    /*
     * A halo in the opposite color of the text, used as a soft glow behind the
     * hero headline. It is deliberately self-effacing: on a background where the
     * text already stands out, the halo is close to that background and cannot
     * be seen. It only becomes visible where the background drifts toward the
     * text color — the exact spot where a phrase would otherwise dissolve. That
     * is what makes it safe to apply always, including on a gradient that no
     * single text color can survive end to end.
     */
    "--on-primary-halo": light
      ? "rgba(255,253,248,0.62)"
      : "rgba(23,23,23,0.5)",
    // The accent keeps its warm hue only while it stays readable. When no warm
    // tone clears the bar — a mid green, a grey — the highlighted word falls
    // back to the plain text color: losing the color beats losing the word.
    "--on-primary-accent": accent,
  };
}
