/**
 * Hero photo and rotating cravings per business type.
 *
 * Both belong together: an açaí shop showing a pizza photo is obvious, but a
 * burger joint asking "bateu vontade de queijo derretido?" is the same mistake
 * in text, and easier to miss when reviewing.
 *
 * Paths point at public/ so they resolve the same way as the catalog photos,
 * without the bundler renaming them between builds.
 */
export type HeroContent = {
  photos: string[];
  cravings: string[];
};

const HERO_BY_TYPE: Record<string, HeroContent> = {
  pizzaria: {
    photos: ["/catalogo-inicial/pizzaria/hero-pizza.jpg"],
    cravings: [
      "queijo derretido?",
      "massa crocante?",
      "uma pizza saindo do forno?",
      "uma borda douradinha?",
      "um sabor irresistível?",
    ],
  },
  hamburgueria: {
    photos: ["/catalogo-inicial/hamburgueria/hero-burger.jpg"],
    cravings: [
      "um burger suculento?",
      "bacon crocante?",
      "pão na chapa?",
      "cheddar derretendo?",
      "batata bem sequinha?",
    ],
  },
  acai: {
    photos: ["/catalogo-inicial/acai/hero-acai.jpg"],
    cravings: [
      "açaí bem cremoso?",
      "aquele copo geladinho?",
      "granola crocante?",
      "fruta fresca por cima?",
      "leite condensado a mais?",
    ],
  },
  japones: {
    photos: ["/catalogo-inicial/japones/hero-sushi.jpg"],
    cravings: [
      "salmão fresquinho?",
      "um combinado caprichado?",
      "temaki na hora?",
      "arroz no ponto certo?",
      "um yakisoba quentinho?",
    ],
  },
};

/** Falls back to pizzaria so a type without artwork still renders a hero. */
export function heroFor(businessType: string): HeroContent {
  return HERO_BY_TYPE[businessType] ?? HERO_BY_TYPE.pizzaria;
}
