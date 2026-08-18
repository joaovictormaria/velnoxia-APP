import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuantityStepper({
  value,
  onIncrement,
  onDecrement,
  min = 1,
  className,
}: {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-full border border-charcoal/15 px-1.5 py-1",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Diminuir quantidade"
        onClick={onDecrement}
        disabled={value <= min}
        className="grid h-7 w-7 place-items-center rounded-full text-charcoal transition-colors hover:bg-charcoal/8 disabled:pointer-events-none disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-4 text-center text-sm font-bold text-charcoal">{value}</span>
      <button
        type="button"
        aria-label="Aumentar quantidade"
        onClick={onIncrement}
        className="grid h-7 w-7 place-items-center rounded-full bg-tomato text-[color:var(--on-primary)] transition-transform hover:scale-105"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
