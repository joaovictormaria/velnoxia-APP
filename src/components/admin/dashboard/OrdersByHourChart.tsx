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
  /*
   * O eixo acompanha o horário da loja, então o número de horas varia: uma
   * padaria abre 9 horas, um bar 8 atravessando a madrugada, uma loja 24h vinte
   * e quatro. Um interval fixo desliga o auto-esconder do recharts e, num
   * celular estreito, os rótulos se sobrepõem até virarem borrão.
   */
  const faixa = data.length <= 10 ? 0 : "preserveStartEnd";

  const primeira = data[0]?.label;
  const ultima = data.at(-1)?.label;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-base font-semibold text-neutral-900">Pedidos por hora</p>
      {primeira && ultima && (
        <p className="mt-0.5 text-xs text-neutral-500">
          {/* Dizer a janela evita a leitura errada de "não vendi nada de
              manhã" quando na verdade a loja nem tinha aberto. */}
          Das {primeira} às {ultima}, o horário da sua loja hoje.
        </p>
      )}
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#F1F1F0" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={faixa}
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
              formatter={(value) => [Number(value ?? 0), "Pedidos"]}
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
