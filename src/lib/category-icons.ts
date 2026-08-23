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
  Fruit,
  GlassWater,
  Ham,
  Hamburger,
  Heart,
  Herbal,
  Hoagie,
  Honey,
  IceCreamBowl,
  IceCreamCone,
  Leaf,
  Lemon,
  Martini,
  Milk,
  Mug,
  Nut,
  Orange,
  Pasta,
  Peach,
  Pepper,
  Pineapple,
  Pizza,
  Popcorn,
  Pot,
  Porkchop,
  Salad,
  Sandwich,
  Shellfish,
  Shrimp,
  Snowflake,
  Soup,
  Spoon,
  Star,
  Strawberry,
  Sushi,
  Tablet,
  Takeout,
  Tempura,
  Tea,
  Thermometer,
  Tomato,
  Utensils,
  UtensilsCrossed,
  Vegan,
  Wheat,
  Wine,
  Zap,
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
  Fruit,
  GlassWater,
  Ham,
  Hamburger,
  Heart,
  Herbal,
  Hoagie,
  Honey,
  IceCreamBowl,
  IceCreamCone,
  Leaf,
  Lemon,
  Martini,
  Milk,
  Mug,
  Nut,
  Orange,
  Pasta,
  Peach,
  Pepper,
  Pineapple,
  Pizza,
  Popcorn,
  Pot,
  Porkchop,
  Salad,
  Sandwich,
  Shellfish,
  Shrimp,
  Snowflake,
  Soup,
  Spoon,
  Star,
  Strawberry,
  Sushi,
  Tablet,
  Takeout,
  Tempura,
  Tea,
  Thermometer,
  Tomato,
  Utensils,
  UtensilsCrossed,
  Vegan,
  Wheat,
  Wine,
  Zap,
};

/**
 * O que todo cardápio tem, independente do ramo: bebida, água, o prato
 * genérico e o destaque.
 */
const COMUNS = ["CupSoda", "GlassWater", "Utensils", "Star"];

const POR_RAMO: Record<string, string[]> = {
  pizzaria: ["Pizza", "Flame", "Cake", "Wheat", "ChefHat", "Tomato", "Herb", "Pepper"],
  hamburgueria: ["Hamburger", "Sandwich", "Beef", "Drumstick", "Salad", "Flame", "UtensilsCrossed", "Egg", "Cheese", "Lettuce"],
  "hot-dog": ["Sandwich", "Ham", "Flame", "Popcorn", "Salad", "Takeout", "Mustard"],
  restaurante: ["UtensilsCrossed", "Soup", "Beef", "Fish", "Salad", "Clock", "Pot", "Spoon", "Pasta"],
  marmitaria: ["UtensilsCrossed", "Soup", "Beef", "Drumstick", "Bean", "Salad", "Clock", "Pot", "Rice"],
  churrascaria: ["Flame", "Beef", "Drumstick", "Ham", "Salad", "ChefHat", "Porkchop", "Chicken"],
  japones: ["Sushi", "Fish", "Shrimp", "Soup", "Leaf", "UtensilsCrossed", "Drumstick", "Tempura", "Tea"],
  acai: ["IceCreamBowl", "Cherry", "Banana", "Strawberry", "Nut", "Leaf", "Honey"],
  sorvetes: ["IceCreamCone", "IceCreamBowl", "Cookie", "Cherry", "Snowflake", "Candy"],
  cafeteria: ["Coffee", "Croissant", "CakeSlice", "Cookie", "Milk", "Tea", "Mug"],
  confeitaria: ["Cake", "CakeSlice", "Cookie", "Donut", "Candy", "Croissant", "Honey"],
  bar: ["Beer", "Martini", "Wine", "Popcorn", "Flame", "Zap"],
  saudavel: ["Salad", "Leaf", "Apple", "Carrot", "Vegan", "Herb", "Tomato", "Lemon"],
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
