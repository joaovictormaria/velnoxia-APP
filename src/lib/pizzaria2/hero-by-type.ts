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
  ctaBlurb: string;
  trustLabels: [string, string, string];
  browseAllBlurb: string;
  aboutTitle: string;
  aboutBody: string;
  /** Blurb next to the ingredients photo in the full menu picker. */
  pickerBlurb: string;
  /** Line under "Veja o cardápio completo". */
  fullMenuTeaser: string;
};

const HERO_BY_TYPE: Record<string, HeroContent> = {
  pizzaria: {
    photos: [
      "/catalogo-inicial/pizzaria/hero-pizza.jpg",
      "/catalogo-inicial/pizzaria/hero-pizza-2.jpg",
      "/catalogo-inicial/pizzaria/hero-pizza-3.jpg",
    ],
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
    aboutTitle: "Feita com paixão, servida com carinho.",
    aboutBody:
      "cada pizza começa com uma massa fermentada por 48 horas, ingredientes selecionados todos os dias e um preparo cuidadoso do início ao fim.",
    browseAllBlurb: "Explore o cardápio completo e monte sua pizza favorita!",
    trustLabels: [
      "Ingredientes selecionados",
      "Entrega rápida",
      "Compra segura",
    ],
    ctaBlurb: "Monte sua pizza aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb:
      "Massa fresca, molho artesanal e muito mais sabor para sua pizza perfeita.",
    fullMenuTeaser: "Mais sabores incríveis esperam por você!",
  },
  hamburgueria: {
    photos: [
      "/catalogo-inicial/hamburgueria/hero-burger.jpg",
      "/catalogo-inicial/hamburgueria/hero-burger-2.jpg",
      "/catalogo-inicial/hamburgueria/hero-burger-3.jpg",
    ],
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
    aboutTitle: "Feito na chapa, servido com carinho.",
    aboutBody:
      "cada lanche é montado na hora, com pão fresco, carne selecionada e um preparo cuidadoso do início ao fim.",
    browseAllBlurb: "Explore o cardápio completo e monte seu lanche favorito!",
    trustLabels: ["Carne fresca todo dia", "Entrega rápida", "Compra segura"],
    ctaBlurb: "Monte seu lanche aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb:
      "Pão macio, carne na chapa e ingredientes frescos em cada lanche.",
    fullMenuTeaser: "Tem muito mais lanche esperando por você!",
  },
  acai: {
    photos: [
      "/catalogo-inicial/acai/hero-acai.jpg",
      "/catalogo-inicial/acai/acai-barca.jpg",
      "/catalogo-inicial/acai/acai-combo-casal.jpg",
    ],
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
    aboutTitle: "Batido na hora, servido com carinho.",
    aboutBody:
      "o açaí é batido na hora, com polpa selecionada, complementos frescos e um preparo cuidadoso do início ao fim.",
    browseAllBlurb:
      "Explore o cardápio completo e monte seu açaí do seu jeito!",
    trustLabels: ["Polpa selecionada", "Entrega rápida", "Compra segura"],
    ctaBlurb: "Monte seu açaí aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb:
      "Polpa selecionada, batida na hora, com os complementos que você escolher.",
    fullMenuTeaser: "Tem muito mais combinação esperando por você!",
  },
  japones: {
    photos: [
      "/catalogo-inicial/japones/hero-sushi.jpg",
      "/catalogo-inicial/japones/hero-sushi-2.jpg",
      "/catalogo-inicial/japones/hero-sushi-3.jpg",
    ],
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
    aboutTitle: "Feito à mão, servido com carinho.",
    aboutBody:
      "cada peça é preparada à mão, com peixe fresco do dia, arroz no ponto e um preparo cuidadoso do início ao fim.",
    browseAllBlurb:
      "Explore o cardápio completo e monte seu combinado favorito!",
    trustLabels: ["Peixe fresco do dia", "Entrega rápida", "Compra segura"],
    ctaBlurb: "Monte seu combinado aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb:
      "Peixe fresco do dia, arroz temperado na medida e montagem na hora.",
    fullMenuTeaser: "Tem muito mais combinado esperando por você!",
  },
};

/** Falls back to pizzaria so a type without artwork still renders a hero. */
export function heroFor(businessType: string): HeroContent {
  return HERO_BY_TYPE[businessType] ?? HERO_BY_TYPE.pizzaria;
}
