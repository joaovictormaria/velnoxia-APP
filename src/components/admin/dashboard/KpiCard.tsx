import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  change,
  changeSuffix = "%",
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  change: number | null;
  changeSuffix?: string;
  icon: LucideIcon;
  accent: string;
}) {
  const isUp = change !== null && change >= 0;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-600">{label}</p>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}1a` }}
        >
          <Icon className="size-5" style={{ color: accent }} />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold text-neutral-900">{value}</p>
      {change !== null && (
        <p className="mt-2 flex items-center gap-1 text-xs">
          {isUp ? (
            <ArrowUp className="size-3.5 text-emerald-600" />
          ) : (
            <ArrowDown className="size-3.5 text-[#E11D2E]" />
          )}
          <span className={isUp ? "font-semibold text-emerald-600" : "font-semibold text-[#E11D2E]"}>
            {isUp ? "+" : ""}
            {change}
            {changeSuffix}
          </span>
          <span className="text-neutral-500">em relação a ontem</span>
        </p>
      )}
    </div>
  );
}
