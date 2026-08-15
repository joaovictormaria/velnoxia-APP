const DOT_COLORS = ["#E11D2E", "#F97316", "#F59E0B", "#059669", "#2563EB", "#7C3AED"];

export function TopProductsList({
  products,
}: {
  products: { rank: number; name: string; quantity: number }[];
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-base font-semibold text-neutral-900">Mais vendidos</p>
      <ul className="mt-4 divide-y divide-neutral-100">
        {products.length === 0 && (
          <li className="py-6 text-center text-sm text-neutral-500">
            Nenhuma venda registrada hoje.
          </li>
        )}
        {products.map((p) => (
          <li key={p.name} className="flex items-center gap-3 py-3">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: DOT_COLORS[(p.rank - 1) % DOT_COLORS.length] }}
            />
            <span className="w-4 shrink-0 text-sm text-neutral-500">{p.rank}</span>
            <span className="flex-1 truncate text-sm text-neutral-900">{p.name}</span>
            <span className="shrink-0 text-sm font-semibold text-neutral-600">{p.quantity}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
