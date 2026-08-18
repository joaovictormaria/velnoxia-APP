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
  /** Line under the hero heading. */
  subtitle: string;
  /**
   * Selling points shown below the hero. These are claims about how the food
   * is made, so they cannot be shared between trades — "forno à lenha" on an
   * açaí shop is not a cosmetic slip, it is a false statement about the
   * business. Icon names map to lucide components in the storefront.
   */
  careItems: { icon: string; label: string }[];
  /** Icon drawn faintly behind the WhatsApp call-to-action. */
  markIcon: string;
  /** Heading of that call-to-action — it names the food, so it is per trade. */
  ctaTitle: string;
  /** Blurb next to the ingredients photo in the full menu picker. */
  pickerBlurb: string;
  /** Line under "Veja o cardápio completo". */
  fullMenuTeaser: string;
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
    subtitle: "Escolha seus sabores favoritos e peça agora.",
    careItems: [
      { icon: "Leaf", label: "Ingredientes selecionados" },
      { icon: "Wheat", label: "Massa artesanal (fermentação natural)" },
      { icon: "Flame", label: "Forno à lenha (sabor único)" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "Pizza",
    ctaTitle: "Deu vontade de pizza? 🍕",
    pickerBlurb: "Massa fresca, molho artesanal e muito mais sabor para sua pizza perfeita.",
    fullMenuTeaser: "Mais sabores incríveis esperam por você!",
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
    subtitle: "Monte o seu lanche e peça agora.",
    careItems: [
      { icon: "Leaf", label: "Ingredientes frescos todo dia" },
      { icon: "Flame", label: "Carne na chapa, na hora" },
      { icon: "Wheat", label: "Pão artesanal" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "Sandwich",
    ctaTitle: "Bateu a fome? 🍔",
    pickerBlurb: "Pão macio, carne na chapa e ingredientes frescos em cada lanche.",
    fullMenuTeaser: "Tem muito mais lanche esperando por você!",
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
    subtitle: "Escolha o tamanho, os complementos e peça agora.",
    careItems: [
      { icon: "Leaf", label: "Polpa selecionada" },
      { icon: "Snowflake", label: "Servido sempre gelado" },
      { icon: "Cherry", label: "Complementos à sua escolha" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "GlassWater",
    ctaTitle: "Deu vontade de açaí? 🍧",
    pickerBlurb: "Polpa selecionada, batida na hora, com os complementos que você escolher.",
    fullMenuTeaser: "Tem muito mais combinação esperando por você!",
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
    subtitle: "Escolha seu combinado e peça agora.",
    careItems: [
      { icon: "Fish", label: "Peixe fresco do dia" },
      { icon: "Wheat", label: "Arroz temperado na medida" },
      { icon: "Leaf", label: "Montado na hora do pedido" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "Fish",
    ctaTitle: "Deu vontade de sushi? 🍣",
    pickerBlurb: "Peixe fresco do dia, arroz temperado na medida e montagem na hora.",
    fullMenuTeaser: "Tem muito mais combinado esperando por você!",
  },
};

/** Falls back to pizzaria so a type without artwork still renders a hero. */
export function heroFor(businessType: string): HeroContent {
  return HERO_BY_TYPE[businessType] ?? HERO_BY_TYPE.pizzaria;
}
