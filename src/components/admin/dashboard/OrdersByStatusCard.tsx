import { Bike, ChefHat, CircleCheck, ShoppingBag } from "lucide-react";

const CARDS = [
  { key: "received", label: "Recebidos", icon: ShoppingBag, color: "#E11D2E", bg: "bg-red-50", border: "border-red-100" },
  { key: "preparing", label: "Em preparo", icon: ChefHat, color: "#F59E0B", bg: "bg-amber-50", border: "border-amber-100" },
  { key: "outForDelivery", label: "Saiu p/ entrega", icon: Bike, color: "#2563EB", bg: "bg-blue-50", border: "border-blue-100" },
  { key: "completed", label: "Finalizados", icon: CircleCheck, color: "#059669", bg: "bg-emerald-50", border: "border-emerald-100" },
] as const;

export function OrdersByStatusCard({
  counts,
}: {
  counts: { received: number; preparing: number; outForDelivery: number; completed: number };
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map(({ key, label, icon: Icon, color, bg, border }) => (
        <div key={key} className={`flex items-center gap-4 rounded-2xl border p-5 ${bg} ${border}`}>
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white"
          >
            <Icon className="size-5" style={{ color }} />
          </span>
          <div>
            <p className="text-sm text-neutral-600">{label}</p>
            <p className="text-2xl font-bold text-neutral-900">{counts[key]}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
