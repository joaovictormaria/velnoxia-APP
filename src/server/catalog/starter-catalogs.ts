import type { CategoryKind, SizeLabel } from "@prisma/client";

/**
 * What a store gets the moment it signs up.
 *
 * Without this a new store lands on its own URL with no categories at all, and
 * the storefront drops the whole menu section — the owner sees a site with no
 * cardápio and assumes the signup failed. Everything here is a starting point
 * the owner edits in the admin; nothing is fixed.
 *
 * Photos are deliberately absent for now: the storefront falls back to the
 * category icon when imageUrl is null, so a fresh store looks intentional
 * rather than broken while the licensed image set is put together.
 */

export type StarterProduct = {
  name: string;
  description: string;
  basePrice: number;
  tag?: string;
  allowHalfAndHalf?: boolean;
  imageUrl?: string;
  sizes?: { size: SizeLabel; price: number }[];
};

export type StarterCategory = {
  name: string;
  /** Pill above the title on the storefront. */
  badge?: string;
  /** Two lines under the title. */
  headline?: string;
  subhead?: string;
  slug: string;
  icon: string;
  kind: CategoryKind;
  products: StarterProduct[];
};

export type StarterCatalog = {
  /** Shown in the business-type selector at signup. */
  label: string;
  /** Short line under the store name in the storefront header. */
  tagline: string;
  /** Footer paragraph. */
  description: string;
  categories: StarterCategory[];
  extras: { name: string; price: number }[];
  /** Carousel slides the store opens with; the owner edits them in the panel. */
  promotions: { eyebrow: string; title: string; description: string; discount?: string }[];
};

const PIZZA_SIZES = (broto: number, media: number, grande: number, gigante: number) => [
  { size: "BROTINHO" as SizeLabel, price: broto },
  { size: "MEDIA" as SizeLabel, price: media },
  { size: "GRANDE" as SizeLabel, price: grande },
  { size: "GIGANTE" as SizeLabel, price: gigante },
];

export const STARTER_CATALOGS: Record<string, StarterCatalog> = {
  pizzaria: {
    label: "Pizzaria",
    tagline: "Pizzaria",
    description: "Pizza artesanal feita com carinho, para deixar seus momentos ainda melhores.",
    categories: [
      {
        name: "Pizzas Tradicionais",
        slug: "tradicionais",
        badge: "Sabores que todo mundo ama",
        headline: "Os clássicos que nunca saem de moda.",
        subhead: "Ingredientes selecionados para a pizza perfeita.",
        icon: "Pizza",
        kind: "PIZZA",
        products: [
          { name: "Mussarela", description: "Molho de tomate, mussarela e orégano.", basePrice: 39.9, imageUrl: "/catalogo-inicial/pizzaria/mussarela.jpg", allowHalfAndHalf: true, sizes: PIZZA_SIZES(29.9, 39.9, 49.9, 59.9), tag: "Mais pedida" },
          { name: "Calabresa", description: "Calabresa fatiada, cebola e mussarela.", basePrice: 42.9, imageUrl: "/catalogo-inicial/pizzaria/calabresa.jpg", allowHalfAndHalf: true, sizes: PIZZA_SIZES(32.9, 42.9, 52.9, 62.9) },
          { name: "Portuguesa", description: "Presunto, ovo, cebola, azeitona e mussarela.", basePrice: 45.9, imageUrl: "/catalogo-inicial/pizzaria/portuguesa.jpg", allowHalfAndHalf: true, sizes: PIZZA_SIZES(35.9, 45.9, 55.9, 65.9) },
          { name: "Frango com Catupiry", description: "Frango desfiado com catupiry cremoso.", basePrice: 46.9, allowHalfAndHalf: true, sizes: PIZZA_SIZES(36.9, 46.9, 56.9, 66.9) },
        ],
      },
      {
        name: "Pizzas Especiais",
        slug: "especiais",
        badge: "Para ocasiões especiais",
        headline: "Combinações autorais para quem quer sair do óbvio.",
        subhead: "Receitas exclusivas, feitas para impressionar.",
        icon: "Star",
        kind: "PIZZA",
        products: [
          { name: "Quatro Queijos", description: "Mussarela, provolone, gorgonzola e parmesão.", basePrice: 52.9, imageUrl: "/catalogo-inicial/pizzaria/quatro-queijos.jpg", allowHalfAndHalf: true, sizes: PIZZA_SIZES(42.9, 52.9, 62.9, 72.9) },
          { name: "Pepperoni", description: "Pepperoni italiano e mussarela.", basePrice: 54.9, allowHalfAndHalf: true, sizes: PIZZA_SIZES(44.9, 54.9, 64.9, 74.9) },
        ],
      },
      {
        name: "Pizzas Doces",
        slug: "doces",
        badge: "Pra adoçar o pedido",
        headline: "Pra fechar o pedido com um toque doce.",
        subhead: "Recheio generoso e cobertura na medida certa.",
        icon: "Cake",
        kind: "PIZZA",
        products: [
          { name: "Chocolate com Morango", description: "Chocolate ao leite e morangos frescos.", basePrice: 44.9, sizes: PIZZA_SIZES(34.9, 44.9, 54.9, 64.9) },
        ],
      },
      {
        name: "Bebidas",
        slug: "bebidas",
        badge: "Geladinhas pra acompanhar",
        headline: "Pra acompanhar seu pedido bem gelada.",
        subhead: "Sempre na temperatura certa quando chega.",
        icon: "CupSoda",
        kind: "SIMPLE",
        products: [
          { name: "Refrigerante 2L", description: "Coca-Cola, Guaraná ou Fanta.", basePrice: 12.9 },
          { name: "Suco Natural 500ml", description: "Laranja, limão ou maracujá.", basePrice: 9.9 },
        ],
      },
    ],
    extras: [
      { name: "Borda de catupiry", price: 8 },
      { name: "Borda de cheddar", price: 8 },
      { name: "Bacon extra", price: 6 },
    ],
    promotions: [
      { eyebrow: "Oferta da semana", title: "Terça da Família", description: "2 pizzas grandes + refrigerante 2L, pra ninguém ficar de fora.", discount: "-20%" },
      { eyebrow: "Combo especial", title: "Combo Casal", description: "1 pizza média + sobremesa + bebida, pra um jantar a dois." },
    ],
  },

  hamburgueria: {
    label: "Hamburgueria / Lanchonete",
    tagline: "Hamburgueria",
    description: "Hambúrguer artesanal, pão fresquinho e ingredientes selecionados todos os dias.",
    categories: [
      {
        name: "Hambúrgueres",
        slug: "hamburgueres",
        badge: "O que a gente faz de melhor",
        headline: "Carne na chapa e pão macio.",
        subhead: "Montado na hora do seu pedido.",
        icon: "Sandwich",
        kind: "SIMPLE",
        products: [
          { name: "X-Salada", description: "Hambúrguer, queijo, alface, tomate e maionese.", basePrice: 24.9, imageUrl: "/catalogo-inicial/hamburgueria/x-salada.jpg", tag: "Mais pedido" },
          { name: "X-Bacon", description: "Hambúrguer, queijo, bacon crocante e cebola.", basePrice: 29.9, imageUrl: "/catalogo-inicial/hamburgueria/x-bacon.jpg" },
          { name: "X-Tudo", description: "Dois hambúrgueres, ovo, bacon, queijo e salada.", basePrice: 36.9 },
          { name: "Smash Duplo", description: "Dois smash burgers, queijo cheddar e picles.", basePrice: 34.9 },
        ],
      },
      {
        name: "Porções",
        slug: "porcoes",
        badge: "Pra dividir (ou não)",
        headline: "Porções pra acompanhar o lanche.",
        subhead: "Fritas na hora, sempre crocantes.",
        icon: "UtensilsCrossed",
        kind: "SIMPLE",
        products: [
          { name: "Batata Frita", description: "Porção individual, crocante e sequinha.", basePrice: 16.9, imageUrl: "/catalogo-inicial/hamburgueria/batata-frita.jpg" },
          { name: "Batata com Cheddar e Bacon", description: "Batata coberta com cheddar e bacon.", basePrice: 24.9 },
          { name: "Nuggets (10 un.)", description: "Acompanha molho da casa.", basePrice: 19.9 },
        ],
      },
      {
        name: "Bebidas",
        slug: "bebidas",
        icon: "CupSoda",
        kind: "SIMPLE",
        products: [
          { name: "Refrigerante Lata", description: "Coca-Cola, Guaraná ou Fanta.", basePrice: 6.9 },
          { name: "Milkshake 400ml", description: "Chocolate, morango ou ovomaltine.", basePrice: 18.9, imageUrl: "/catalogo-inicial/hamburgueria/milkshake.jpg" },
        ],
      },
    ],
    extras: [
      { name: "Bacon extra", price: 5 },
      { name: "Queijo extra", price: 4 },
      { name: "Ovo", price: 3 },
    ],
    promotions: [
      { eyebrow: "Oferta da semana", title: "Combo do Dia", description: "Hambúrguer + batata + refrigerante por um preço só.", discount: "-15%" },
      { eyebrow: "Toda quarta", title: "Dobro de Bacon", description: "Bacon em dobro em qualquer lanche da casa." },
    ],
  },

  acai: {
    label: "Açaiteria",
    tagline: "Açaiteria",
    description: "Açaí cremoso batido na hora, com os complementos que você escolher.",
    categories: [
      {
        name: "Açaí",
        slug: "acai",
        badge: "Cremoso do jeito certo",
        headline: "Açaí batido na hora que você pede.",
        subhead: "Escolha o tamanho e os complementos.",
        icon: "GlassWater",
        kind: "SIMPLE",
        products: [
          { name: "Açaí 300ml", description: "Açaí puro batido na hora.", basePrice: 14.9, imageUrl: "/catalogo-inicial/acai/acai-300-copo.jpg" },
          { name: "Açaí 500ml", description: "Açaí puro batido na hora.", basePrice: 19.9, imageUrl: "/catalogo-inicial/acai/acai-500-tigela.png", tag: "Mais pedido" },
          { name: "Açaí 700ml", description: "Açaí puro batido na hora.", basePrice: 26.9 },
        ],
      },
      {
        name: "Combos",
        slug: "combos",
        badge: "Rende pra mais de um",
        headline: "Porções maiores com preço melhor.",
        subhead: "Ideal pra dividir a dois.",
        icon: "Star",
        kind: "SIMPLE",
        products: [
          { name: "Combo Casal 1L", description: "Açaí 1L com quatro complementos à escolha.", basePrice: 39.9, imageUrl: "/catalogo-inicial/acai/acai-combo-casal.jpg" },
          { name: "Barca de Açaí", description: "Açaí, frutas, granola e leite condensado.", basePrice: 44.9, imageUrl: "/catalogo-inicial/acai/acai-barca.jpg" },
        ],
      },
      {
        name: "Bebidas",
        slug: "bebidas",
        icon: "CupSoda",
        kind: "SIMPLE",
        products: [
          { name: "Água Mineral", description: "500ml, com ou sem gás.", basePrice: 4.9 },
          { name: "Suco Natural 500ml", description: "Laranja, limão ou maracujá.", basePrice: 9.9 },
        ],
      },
    ],
    extras: [
      { name: "Leite condensado", price: 3 },
      { name: "Granola", price: 3 },
      { name: "Morango", price: 5 },
      { name: "Paçoca", price: 3 },
    ],
    promotions: [
      { eyebrow: "Oferta da semana", title: "Açaí em Dobro", description: "Leve 1L e pague o preço do 700ml.", discount: "-25%" },
      { eyebrow: "Combo especial", title: "Combo Casal", description: "1L de açaí com quatro complementos à escolha." },
    ],
  },

  japones: {
    label: "Comida japonesa",
    tagline: "Comida japonesa",
    description: "Peixe fresco, arroz temperado na medida e combinados montados na hora.",
    categories: [
      {
        name: "Combinados",
        slug: "combinados",
        badge: "Montados na hora",
        headline: "Seleção de sushis e sashimis do dia.",
        subhead: "Peixe fresco, cortado na hora.",
        icon: "UtensilsCrossed",
        kind: "SIMPLE",
        products: [
          { name: "Combinado 20 peças", description: "Sushis e sashimis variados.", basePrice: 59.9, imageUrl: "/catalogo-inicial/japones/combinado.jpg", tag: "Mais pedido" },
          { name: "Combinado 40 peças", description: "Ideal para dividir entre duas pessoas.", basePrice: 109.9 },
        ],
      },
      {
        name: "Temakis",
        slug: "temakis",
        badge: "Enrolado na hora",
        headline: "Cone crocante, recheio generoso.",
        subhead: "Sai do balcão direto pro seu pedido.",
        icon: "Drumstick",
        kind: "SIMPLE",
        products: [
          { name: "Temaki Salmão", description: "Salmão fresco, arroz e cebolinha.", basePrice: 32.9, imageUrl: "/catalogo-inicial/japones/temaki.jpg" },
          { name: "Temaki Atum", description: "Atum, arroz e cream cheese.", basePrice: 34.9 },
          { name: "Temaki Califórnia", description: "Kani, manga e pepino.", basePrice: 28.9 },
        ],
      },
      {
        name: "Pratos Quentes",
        slug: "pratos-quentes",
        badge: "Pra quem prefere quente",
        headline: "Opções quentes do wok e da chapa.",
        subhead: "Servidos na porção individual.",
        icon: "UtensilsCrossed",
        kind: "SIMPLE",
        products: [
          { name: "Yakisoba de Frango", description: "Macarrão, legumes e frango no shoyu.", basePrice: 38.9, imageUrl: "/catalogo-inicial/japones/yakisoba.jpg" },
          { name: "Gyoza (6 un.)", description: "Pastéis japoneses grelhados.", basePrice: 24.9 },
        ],
      },
      {
        name: "Bebidas",
        slug: "bebidas",
        icon: "CupSoda",
        kind: "SIMPLE",
        products: [
          { name: "Refrigerante Lata", description: "Coca-Cola, Guaraná ou Fanta.", basePrice: 6.9 },
          { name: "Chá Gelado 500ml", description: "Limão ou pêssego.", basePrice: 8.9 },
        ],
      },
    ],
    extras: [
      { name: "Shoyu extra", price: 2 },
      { name: "Wasabi", price: 2 },
      { name: "Gengibre", price: 2 },
    ],
    promotions: [
      { eyebrow: "Oferta da semana", title: "Combinado em Conta", description: "40 peças com desconto para dividir.", discount: "-15%" },
      { eyebrow: "Toda quinta", title: "Temaki Day", description: "Todos os temakis com preço promocional." },
    ],
  },
};

export const DEFAULT_BUSINESS_TYPE = "pizzaria";

export function getStarterCatalog(businessType: string): StarterCatalog {
  return STARTER_CATALOGS[businessType] ?? STARTER_CATALOGS[DEFAULT_BUSINESS_TYPE];
}

/** Options for the signup selector, in the order they should appear. */
export const BUSINESS_TYPE_OPTIONS = Object.entries(STARTER_CATALOGS).map(([value, c]) => ({
  value,
  label: c.label,
}));
