import type { ComponentType } from "react";
import {
  Beef, Beer, CakeSlice, Cherry, Coffee, Fish, Flame, GlassWater, IceCreamCone,
  Leaf, Milk, Pizza, Salad, Sandwich, Snowflake, Truck, Utensils, UtensilsCrossed, Wheat,
} from "lucide-react";

/**
 * Os ícones dos selos de cuidado do hero, por nome.
 *
 * Ficam num módulo próprio porque a página inicial e o hero extraído dela
 * usam os dois — e a prévia do painel monta o hero sem passar pela página.
 */
export const CARE_ICONS: Record<
  string,
  ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  Leaf, Wheat, Flame, Truck, Snowflake, Cherry, Fish, Pizza, Sandwich,
  GlassWater, Beef, Coffee, Beer, Salad, IceCreamCone, CakeSlice, Utensils,
  UtensilsCrossed, Milk,
};
