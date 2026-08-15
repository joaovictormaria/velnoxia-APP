import {
  Cake,
  CupSoda,
  Drumstick,
  GlassWater,
  Pizza,
  Sandwich,
  Star,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import mussarelaPhoto from "@/assets/fotos de pizza/mussarela.jpg";
import frangoPhoto from "@/assets/fotos de pizza/frango.jpg";
import pepperoniPhoto from "@/assets/fotos de pizza/pepperoni.jpg";
import quatroQueijosPhoto from "@/assets/fotos de pizza/quatro-queijos.jpg";

export type CategorySlug =
  | "tradicionais"
  | "especiais"
  | "doces"
  | "bebidas"
  | "acompanhamentos";

export type Category = {
  slug: CategorySlug;
  name: string;
  shortName: string;
  /** Pizza categories have a photo; simple categories fall back to a branded icon tile. */
  image?: string;
  icon?: LucideIcon;
  kind: "pizza" | "simple";
};

export type Product = {
  slug: string;
  name: string;
  desc: string;
  /** Reference price — used as the "Média" size for pizzas, or the unit price for simple items. */
  price: number;
  image?: string;
  icon?: LucideIcon;
  categorySlug: CategorySlug;
  tag?: string;
};

export const categories: Category[] = [
  {
    slug: "tradicionais",
    name: "Pizzas Tradicionais",
    shortName: "Tradicionais",
    image: mussarelaPhoto,
    icon: Pizza,
    kind: "pizza",
  },
  {
    slug: "especiais",
    name: "Pizzas Especiais",
    shortName: "Especiais",
    image: quatroQueijosPhoto,
    icon: Star,
    kind: "pizza",
  },
  {
    slug: "doces",
    name: "Pizzas Doces",
    shortName: "Doces",
    image: pepperoniPhoto,
    icon: Cake,
    kind: "pizza",
  },
  {
    slug: "bebidas",
    name: "Bebidas",
    shortName: "Bebidas",
    icon: CupSoda,
    kind: "simple",
  },
  {
    slug: "acompanhamentos",
    name: "Acompanhamentos",
    shortName: "Acompanhamentos",
    icon: UtensilsCrossed,
    kind: "simple",
  },
];

export const categoryBySlug = (slug: string) =>
  categories.find((c) => c.slug === slug);

export const products: Product[] = [
  // Tradicionais
  {
    slug: "calabresa",
    name: "Calabresa",
    desc: "Molho de tomate, mussarela, calabresa fatiada e cebola.",
    price: 39.9,
    image: pepperoniPhoto,
    categorySlug: "tradicionais",
    tag: "Mais pedida",
  },
  {
    slug: "frango-com-catupiry",
    name: "Frango com Catupiry",
    desc: "Frango desfiado, catupiry cremoso e milho.",
    price: 44.9,
    image: frangoPhoto,
    categorySlug: "tradicionais",
  },
  {
    slug: "marguerita",
    name: "Marguerita",
    desc: "Molho de tomate, mussarela, tomate fatiado e manjericão fresco.",
    price: 41.9,
    image: mussarelaPhoto,
    categorySlug: "tradicionais",
  },

  // Especiais
  {
    slug: "pepperoni-duplo",
    name: "Pepperoni Duplo",
    desc: "Dose dupla de pepperoni importado e mussarela.",
    price: 56.9,
    image: pepperoniPhoto,
    categorySlug: "especiais",
    tag: "Mais pedida",
  },
  {
    slug: "quatro-queijos",
    name: "Quatro Queijos",
    desc: "Mussarela, provolone, parmesão e gorgonzola.",
    price: 55.9,
    image: quatroQueijosPhoto,
    categorySlug: "especiais",
  },
  {
    slug: "bacon-cheddar",
    name: "Bacon Cheddar",
    desc: "Bacon crocante, cheddar cremoso e cebola caramelizada.",
    price: 54.9,
    image: frangoPhoto,
    categorySlug: "especiais",
    tag: "Novidade",
  },

  // Doces
  {
    slug: "chocolate-com-morango",
    name: "Chocolate com Morango",
    desc: "Chocolate ao leite derretido e morangos frescos.",
    price: 44.9,
    image: pepperoniPhoto,
    categorySlug: "doces",
  },
  {
    slug: "banana-com-canela",
    name: "Banana com Canela",
    desc: "Banana caramelizada, canela e leite condensado.",
    price: 41.9,
    image: frangoPhoto,
    categorySlug: "doces",
  },
  {
    slug: "ninho-com-nutella",
    name: "Ninho com Nutella",
    desc: "Leite ninho, Nutella e morango.",
    price: 47.9,
    image: quatroQueijosPhoto,
    categorySlug: "doces",
    tag: "Mais pedida",
  },

  // Bebidas
  {
    slug: "coca-cola-2l",
    name: "Coca-Cola 2L",
    desc: "Garrafa 2 litros, geladinha.",
    price: 12.9,
    icon: CupSoda,
    categorySlug: "bebidas",
    tag: "Mais pedida",
  },
  {
    slug: "guarana-antarctica-2l",
    name: "Guaraná Antarctica 2L",
    desc: "Garrafa 2 litros.",
    price: 12.9,
    icon: CupSoda,
    categorySlug: "bebidas",
  },
  {
    slug: "ice-tea-limao-2l",
    name: "Ice Tea Limão 2L",
    desc: "Garrafa 2 litros, chá gelado sabor limão.",
    price: 11.9,
    icon: GlassWater,
    categorySlug: "bebidas",
  },
  {
    slug: "agua-mineral",
    name: "Água Mineral",
    desc: "500ml, com ou sem gás.",
    price: 4.5,
    icon: GlassWater,
    categorySlug: "bebidas",
  },

  // Acompanhamentos
  {
    slug: "pao-de-alho",
    name: "Pão de Alho",
    desc: "Porção com 4 unidades, na brasa.",
    price: 14.9,
    icon: Sandwich,
    categorySlug: "acompanhamentos",
  },
  {
    slug: "batata-frita",
    name: "Batata Frita",
    desc: "Porção grande, crocante.",
    price: 18.9,
    icon: UtensilsCrossed,
    categorySlug: "acompanhamentos",
  },
  {
    slug: "nuggets",
    name: "Nuggets",
    desc: "Porção com 10 unidades e molho.",
    price: 16.9,
    icon: Drumstick,
    categorySlug: "acompanhamentos",
  },
];

export const productBySlug = (slug: string) =>
  products.find((p) => p.slug === slug);

export const productsByCategory = (slug: string) =>
  products.filter((p) => p.categorySlug === slug);

export type SizeKey = "broto" | "media" | "grande";

export const sizeBlocks: { key: SizeKey; label: string; delta: number }[] = [
  { key: "broto", label: "Brotinho", delta: -10 },
  { key: "media", label: "Média", delta: 0 },
  { key: "grande", label: "Grande", delta: 10 },
];

export function sizePrice(basePrice: number, size: SizeKey): number {
  const block = sizeBlocks.find((s) => s.key === size)!;
  return Math.max(basePrice + block.delta, basePrice * 0.6);
}

export type Extra = { id: string; label: string; price: number };

export const extras: Extra[] = [
  { id: "queijo-extra", label: "Queijo extra", price: 5 },
  { id: "catupiry", label: "Catupiry", price: 6 },
  { id: "bacon", label: "Bacon", price: 7 },
  { id: "borda-recheada", label: "Borda recheada", price: 8 },
];

export function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export const suggestedDrinkSlugs = [
  "coca-cola-2l",
  "guarana-antarctica-2l",
  "ice-tea-limao-2l",
];
