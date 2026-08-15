import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/pizzaria2/menu";

export function PriceTag({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("font-display font-bold text-tomato", className)}>
      {formatCurrency(value)}
    </span>
  );
}
