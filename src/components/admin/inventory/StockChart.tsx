export interface StockChartProps {
  storeId: string;
  itemId?: string;
  period?: "week" | "month" | "quarter";
}

export function StockChart(props: StockChartProps) {
  return (
    <div className="stock-chart space-y-4 p-4 border rounded bg-white">
      <h3 className="text-lg font-bold">Gráficos e Análises</h3>
      <div className="p-4 text-center border-2 border-dashed rounded bg-neutral-50">
        <p className="text-neutral-600">
          Gráficos em desenvolvimento.
        </p>
        <p className="text-xs text-neutral-600 mt-2">
          Período: {props.period || "month"}
        </p>
      </div>
    </div>
  );
}
