/**
 * Os ícones que uma categoria pode usar, e quais fazem sentido em cada ramo.
 *
 * Existe porque o nome do ícone era digitado à mão num campo de texto: o
 * lojista escrevia "Hambúrguer" e não aparecia nada, porque o nome válido era
 * "Sandwich". Pior, a vitrine só reconhecia oito nomes enquanto os cardápios
 * iniciais usavam vinte e um — categorias nasciam com ícone morto.
 *
 * Aqui o registro é um só: a vitrine desenha a partir dele e o painel oferece
 * dele. Um ícone que não estiver aqui não pode ser escolhido, e por isso não
 * pode sumir na vitrine.
 */
import {
  Apple,
  Banana,
  Bean,
  Beef,
  Beer,
  Cake,
  CakeSlice,
  Candy,
  Carrot,
  Cherry,
  ChefHat,
  Clock,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Donut,
  Drumstick,
  Egg,
  Fish,
  Flame,
  GlassWater,
  Ham,
  IceCreamBowl,
  IceCreamCone,
  Leaf,
  Martini,
  Milk,
  Nut,
  Pizza,
  Popcorn,
  Salad,
  Sandwich,
  Shrimp,
  Snowflake,
  Soup,
  Star,
  Tomato,
  Utensils,
  UtensilsCrossed,
  Vegan,
  Wheat,
  Wine,
  type LucideIcon,
} from "lucide-react";

export const ICONES_DE_CATEGORIA: Record<string, LucideIcon> = {
  Apple,
  Banana,
  Bean,
  Beef,
  Beer,
  Cake,
  CakeSlice,
  Candy,
  Carrot,
  Cherry,
  ChefHat,
  Clock,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Donut,
  Drumstick,
  Egg,
  Fish,
  Flame,
  GlassWater,
  Ham,
  IceCreamBowl,
  IceCreamCone,
  Leaf,
  Martini,
  Milk,
  Nut,
  Pizza,
  Popcorn,
  Salad,
  Sandwich,
  Shrimp,
  Snowflake,
  Soup,
  Star,
  Tomato,
  Utensils,
  UtensilsCrossed,
  Vegan,
  Wheat,
  Wine,
};

/**
 * O que todo cardápio tem, independente do ramo: bebida, água, o prato
 * genérico e o destaque.
 */
const COMUNS = ["CupSoda", "GlassWater", "Utensils", "Star"];

const POR_RAMO: Record<string, string[]> = {
  pizzaria: ["Pizza", "Flame", "Cake", "Wheat", "ChefHat", "Tomato"],
  hamburgueria: ["Sandwich", "Beef", "Drumstick", "Salad", "Flame", "UtensilsCrossed", "Egg"],
  "hot-dog": ["Sandwich", "Ham", "Flame", "Popcorn", "Salad"],
  restaurante: ["UtensilsCrossed", "Soup", "Beef", "Fish", "Salad", "Clock"],
  marmitaria: ["UtensilsCrossed", "Soup", "Beef", "Drumstick", "Bean", "Salad", "Clock"],
  churrascaria: ["Flame", "Beef", "Drumstick", "Ham", "Salad", "ChefHat"],
  japones: ["Fish", "Shrimp", "Soup", "Leaf", "UtensilsCrossed", "Drumstick"],
  acai: ["IceCreamBowl", "Cherry", "Banana", "Strawberry", "Nut", "Leaf"],
  sorvetes: ["IceCreamCone", "IceCreamBowl", "Cookie", "Cherry", "Snowflake", "Candy"],
  cafeteria: ["Coffee", "Croissant", "CakeSlice", "Cookie", "Milk", "Mug"],
  confeitaria: ["Cake", "CakeSlice", "Cookie", "Donut", "Candy", "Croissant"],
  bar: ["Beer", "Martini", "Wine", "Popcorn", "Flame", "Zap"],
  saudavel: ["Salad", "Leaf", "Apple", "Carrot", "Vegan", "Tomato", "Lemon"],
};

/** Quem herda o cardápio de outro ramo herda também os ícones dele. */
const HERDA: Record<string, string> = {
  "fast-food": "hamburgueria",
  "comida-caseira": "restaurante",
  "comida-brasileira": "restaurante",
};

/**
 * Os ícones oferecidos a uma loja, na ordem em que aparecem: primeiro os do
 * ramo, depois os que servem a qualquer cardápio.
 */
export function iconesDoRamo(businessType: string): string[] {
  const chave = HERDA[businessType] ?? businessType;
  return [...new Set([...(POR_RAMO[chave] ?? []), ...COMUNS])];
}
