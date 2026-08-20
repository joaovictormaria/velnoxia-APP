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

/** Ramos que já vieram com fotos e textos próprios. */
const HERO_ORIGINAIS: Record<string, HeroContent> = {
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


/**
 * Ramos ainda sem banco de imagens próprio.
 *
 * `photos` vazio é uma escolha, não um esquecimento: a capa passa a ser só
 * texto sobre o gradiente da marca. Emprestar a foto de outro ramo deixaria uma
 * churrascaria anunciando pizza, que é pior que não ter foto — e some sozinho
 * assim que o dono sobe as fotos dele, que sempre têm precedência.
 */
const HERO_NOVOS: Record<string, HeroContent> = {
  "hot-dog": {
    photos: [
      "/catalogo-inicial/hot-dog/hero-dog.jpg",
      "/catalogo-inicial/hot-dog/hero-dog-2.jpg",
      "/catalogo-inicial/hot-dog/hero-dog-3.jpg",
    ],
    cravings: [
      "um dog bem servido?",
      "purê cremoso por cima?",
      "batata palha crocante?",
      "salsicha no capricho?",
      "aquele completo de sempre?",
    ],
    subtitle: "Monte o seu dog e peça agora.",
    careItems: [
      { icon: "Flame", label: "Montado na hora do pedido" },
      { icon: "Leaf", label: "Ingredientes frescos todo dia" },
      { icon: "Wheat", label: "Pão macio" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "Sandwich",
    ctaTitle: "Bateu vontade de dog? 🌭",
    aboutTitle: "Montado na hora, servido com carinho.",
    aboutBody:
      "cada dog é montado na hora do pedido, com pão macio, molho da casa e a cobertura que você escolher.",
    browseAllBlurb: "Explore o cardápio completo e monte seu dog favorito!",
    trustLabels: ["Feito na hora", "Entrega rápida", "Compra segura"],
    ctaBlurb: "Monte seu dog aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb: "Pão macio, salsicha no ponto e a cobertura do seu jeito.",
    fullMenuTeaser: "Tem muito mais combinação esperando por você!",
  },
  restaurante: {
    photos: [
      "/catalogo-inicial/restaurante/prato-feito.jpg",
      "/catalogo-inicial/restaurante/frango-grelhado.jpg",
      "/catalogo-inicial/restaurante/feijoada.jpg",
    ],
    cravings: [
      "um prato bem servido?",
      "arroz e feijão de verdade?",
      "comida quentinha?",
      "aquele bife acebolado?",
      "almoço de casa?",
    ],
    subtitle: "Escolha seu prato e peça agora.",
    careItems: [
      { icon: "Flame", label: "Feito na hora do pedido" },
      { icon: "Leaf", label: "Ingredientes frescos todo dia" },
      { icon: "Utensils", label: "Porção bem servida" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "UtensilsCrossed",
    ctaTitle: "Bateu a fome? 🍽️",
    aboutTitle: "Feito no fogão, servido com carinho.",
    aboutBody:
      "cada prato sai feito na hora, com ingredientes comprados no dia e a porção que sustenta o almoço inteiro.",
    browseAllBlurb: "Explore o cardápio completo e escolha seu prato!",
    trustLabels: ["Feito na hora", "Entrega rápida", "Compra segura"],
    ctaBlurb: "Escolha seu prato aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb: "Comida feita na hora, bem servida, do jeito que se come em casa.",
    fullMenuTeaser: "Tem muito mais prato esperando por você!",
  },
  churrascaria: {
    photos: [
      "/catalogo-inicial/churrascaria/hero-churrasco.jpg",
      "/catalogo-inicial/churrascaria/hero-churrasco-2.jpg",
      "/catalogo-inicial/churrascaria/hero-churrasco-3.jpg",
    ],
    cravings: [
      "carne na brasa?",
      "picanha no ponto?",
      "farofa crocante?",
      "aquele espeto quentinho?",
      "cheiro de churrasco?",
    ],
    subtitle: "Escolha sua carne e peça agora.",
    careItems: [
      { icon: "Flame", label: "Assado na brasa" },
      { icon: "Beef", label: "Carne selecionada" },
      { icon: "Leaf", label: "Acompanhamentos frescos" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "Beef",
    ctaTitle: "Deu vontade de churrasco? 🔥",
    aboutTitle: "Assada na brasa, servida com carinho.",
    aboutBody:
      "cada corte é temperado no sal grosso e assado na brasa, no ponto que você pedir, com os acompanhamentos que não podem faltar.",
    browseAllBlurb: "Explore o cardápio completo e escolha seu corte!",
    trustLabels: ["Carne selecionada", "Entrega rápida", "Compra segura"],
    ctaBlurb: "Escolha sua carne aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb: "Carne selecionada, temperada no sal grosso e assada na brasa.",
    fullMenuTeaser: "Tem muito mais corte esperando por você!",
  },
  cafeteria: {
    photos: [],
    cravings: [
      "um café passado na hora?",
      "pão quentinho?",
      "aquele pingado da manhã?",
      "fatia de bolo caseiro?",
      "cheiro de padaria?",
    ],
    subtitle: "Escolha seu café e peça agora.",
    careItems: [
      { icon: "Coffee", label: "Café moído na hora" },
      { icon: "Wheat", label: "Pão assado aqui mesmo" },
      { icon: "Leaf", label: "Ingredientes frescos todo dia" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "Coffee",
    ctaTitle: "Hora do café? ☕",
    aboutTitle: "Passado na hora, servido com carinho.",
    aboutBody:
      "o café é moído e passado na hora, o pão sai do forno aqui mesmo e o doce é feito na casa, todo dia.",
    browseAllBlurb: "Explore o cardápio completo e escolha o seu!",
    trustLabels: ["Feito na hora", "Entrega rápida", "Compra segura"],
    ctaBlurb: "Peça seu café aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb: "Café moído na hora, pão fresco e doce feito na casa.",
    fullMenuTeaser: "Tem muito mais esperando por você!",
  },
  bar: {
    photos: [],
    cravings: [
      "uma gelada?",
      "porção pra dividir?",
      "aquela caipirinha?",
      "batata com cheddar?",
      "mesa cheia de petisco?",
    ],
    subtitle: "Escolha sua porção e peça agora.",
    careItems: [
      { icon: "Snowflake", label: "Bebida sempre gelada" },
      { icon: "Flame", label: "Porção feita na hora" },
      { icon: "Leaf", label: "Ingredientes frescos todo dia" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "Beer",
    ctaTitle: "Bateu a sede? 🍻",
    aboutTitle: "Feito na hora, servido bem gelado.",
    aboutBody:
      "cada porção sai fritando na hora do pedido e a bebida vai sempre trincando de gelada, do jeito que petisco pede.",
    browseAllBlurb: "Explore o cardápio completo e monte sua mesa!",
    trustLabels: ["Sempre gelada", "Entrega rápida", "Compra segura"],
    ctaBlurb: "Monte sua mesa aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb: "Porção feita na hora e bebida trincando de gelada.",
    fullMenuTeaser: "Tem muito mais petisco esperando por você!",
  },
  saudavel: {
    photos: [
      "/catalogo-inicial/saudavel/bowl-salmao.jpg",
      "/catalogo-inicial/saudavel/salada-frango-abacate.jpg",
      "/catalogo-inicial/saudavel/salada-bowl.jpg",
    ],
    cravings: [
      "comida leve e gostosa?",
      "um bowl bem montado?",
      "folha fresca do dia?",
      "suco verde geladinho?",
      "proteína na medida?",
    ],
    subtitle: "Monte seu prato e peça agora.",
    careItems: [
      { icon: "Leaf", label: "Ingredientes frescos todo dia" },
      { icon: "Salad", label: "Porção equilibrada" },
      { icon: "Flame", label: "Preparado na hora do pedido" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "Salad",
    ctaTitle: "Vontade de comer bem? 🥗",
    aboutTitle: "Montado na hora, servido com cuidado.",
    aboutBody:
      "cada prato é montado na hora, com folha colhida no dia, proteína na medida e nada de açúcar escondido.",
    browseAllBlurb: "Explore o cardápio completo e monte seu prato!",
    trustLabels: ["Ingredientes frescos", "Entrega rápida", "Compra segura"],
    ctaBlurb: "Monte seu prato aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb: "Folha fresca, proteína na medida e preparo na hora.",
    fullMenuTeaser: "Tem muito mais combinação esperando por você!",
  },
  sorvetes: {
    photos: [
      "/catalogo-inicial/sorvetes/casquinhas.jpg",
      "/catalogo-inicial/sorvetes/milkshakes.jpg",
      "/catalogo-inicial/sorvetes/taca-morango.jpg",
    ],
    cravings: [
      "sorvete cremoso?",
      "aquela casquinha?",
      "calda por cima?",
      "algo bem geladinho?",
      "uma taça caprichada?",
    ],
    subtitle: "Escolha seu sabor e peça agora.",
    careItems: [
      { icon: "Snowflake", label: "Servido sempre gelado" },
      { icon: "Milk", label: "Sorvete cremoso" },
      { icon: "Cherry", label: "Coberturas à sua escolha" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "IceCreamCone",
    ctaTitle: "Deu vontade de sorvete? 🍦",
    aboutTitle: "Servido na hora, com carinho.",
    aboutBody:
      "o sorvete é servido na hora do pedido, cremoso do jeito certo, com as coberturas que você escolher.",
    browseAllBlurb: "Explore o cardápio completo e monte o seu!",
    trustLabels: ["Sempre gelado", "Entrega rápida", "Compra segura"],
    ctaBlurb: "Monte seu sorvete aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb: "Sorvete cremoso servido na hora, com a cobertura do seu jeito.",
    fullMenuTeaser: "Tem muito mais sabor esperando por você!",
  },
};

/**
 * Ramo que reaproveita a capa de um vizinho, trocando só o que seria mentira.
 *
 * Uma marmitaria e um restaurante de prato feito cozinham igual; o que muda é
 * como cada um se apresenta. Copiar a capa inteira para trocar duas frases
 * faria as outras doze envelhecerem separadas.
 */
function derivarHero(base: HeroContent, mudancas: Partial<HeroContent>): HeroContent {
  return { ...base, ...mudancas };
}

const HERO_BY_TYPE: Record<string, HeroContent> = {
  ...HERO_ORIGINAIS,
  ...HERO_NOVOS,

  // Fast food come do mesmo prato da hamburgueria — inclusive das fotos, que
  // mostram exatamente a comida que ele vende.
  "fast-food": HERO_ORIGINAIS.hamburgueria,

  "comida-caseira": derivarHero(HERO_NOVOS.restaurante, {
    subtitle: "Escolha seu prato e peça agora, quentinho.",
    ctaTitle: "Vontade de comida de casa? 🍲",
    aboutTitle: "Feito como em casa, servido com carinho.",
    aboutBody:
      "cada prato é feito no fogão como se faz em casa, com tempero de família e a porção que ninguém levanta da mesa com fome.",
    pickerBlurb: "Tempero de casa, feito no fogão, na porção de quem cozinha pra família.",
  }),

  "comida-brasileira": derivarHero(HERO_NOVOS.restaurante, {
    ctaTitle: "Bateu vontade de comida brasileira? 🍛",
    aboutTitle: "Feita no fogão, servida com carinho.",
    aboutBody:
      "o prato brasileiro de sempre, feito na hora, com arroz soltinho, feijão bem temperado e a carne no ponto.",
  }),

  marmitaria: derivarHero(HERO_NOVOS.restaurante, {
    subtitle: "Escolha sua marmita e peça agora.",
    ctaTitle: "Já pensou no almoço? 🍱",
    aboutTitle: "Montada na hora, entregue quentinha.",
    aboutBody:
      "cada marmita é montada na hora do pedido, bem servida, e sai para entrega no horário que você combinar.",
    browseAllBlurb: "Explore o cardápio completo e escolha sua marmita!",
    ctaBlurb: "Escolha sua marmita aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb: "Marmita montada na hora, bem servida, entregue quentinha.",
    fullMenuTeaser: "Tem muito mais opção esperando por você!",
  }),

  confeitaria: derivarHero(HERO_NOVOS.cafeteria, {
    cravings: [
      "um doce caprichado?",
      "bolo feito na casa?",
      "aquela fatia de torta?",
      "brigadeiro gourmet?",
      "algo pra adoçar o dia?",
    ],
    subtitle: "Escolha seu doce e peça agora.",
    careItems: [
      { icon: "Cherry", label: "Doce feito na casa" },
      { icon: "Wheat", label: "Massa fresca todo dia" },
      { icon: "Leaf", label: "Ingredientes selecionados" },
      { icon: "Truck", label: "Entrega rápida e segura" },
    ],
    markIcon: "CakeSlice",
    ctaTitle: "Vontade de doce? 🍰",
    aboutTitle: "Feito na casa, servido com carinho.",
    aboutBody:
      "cada doce é feito aqui mesmo, com massa fresca do dia e recheio preparado na hora, sem atalho.",
    browseAllBlurb: "Explore o cardápio completo e escolha seu doce!",
    trustLabels: ["Feito na casa", "Entrega rápida", "Compra segura"],
    ctaBlurb: "Escolha seu doce aqui mesmo e acompanhe o pedido pelo site.",
    pickerBlurb: "Massa fresca, recheio feito na hora e doce que sai da casa.",
    fullMenuTeaser: "Tem muito mais doce esperando por você!",
  }),
};

/** Falls back to pizzaria so a type without artwork still renders a hero. */
export function heroFor(businessType: string): HeroContent {
  return HERO_BY_TYPE[businessType] ?? HERO_BY_TYPE.pizzaria;
}
