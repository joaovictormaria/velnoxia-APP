import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function OrdersByHourChart({
  data,
}: {
  data: { hour: number; label: string; orders: number }[];
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-base font-semibold text-neutral-900">Pedidos por hora</p>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#F1F1F0" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={1}
              tick={{ fill: "#737373", fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tick={{ fill: "#737373", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: "#E5E5E5" }}
              contentStyle={{ borderRadius: 12, border: "1px solid #E5E5E5", fontSize: 12 }}
              labelFormatter={(label) => `Às ${label}`}
              formatter={(value: number) => [value, "Pedidos"]}
            />
            <Line
              type="monotone"
              dataKey="orders"
              stroke="#E11D2E"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#fff", stroke: "#E11D2E", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
