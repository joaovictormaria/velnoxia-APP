import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";

/**
 * O movimento do dia, hora a hora.
 *
 * Virou ÁREA e não mais só linha: a linha sozinha desenha um contorno, e a
 * pergunta aqui é de volume — quanto movimento, e em que parte do dia. O
 * preenchimento em degradê dá a massa sem competir com a linha, que continua
 * sendo o que se lê.
 *
 * Os pontos por hora saíram. Vinte e quatro círculos numa loja 24h eram ruído
 * sobre a própria curva; o ponto agora aparece onde o cursor está, que é o
 * único lugar onde ele responde a alguma coisa.
 */
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
  const vazio = data.every((d) => d.orders === 0);
  const pico = data.reduce((maior, d) => (d.orders > maior.orders ? d : maior), data[0]);

  // A hora corrente só é marcada se estiver dentro da janela da loja: fora
  // dela, a linha apontaria para um lugar que o eixo não representa.
  const agora = new Date().getHours();
  const horaAtual = data.find((d) => d.hour === agora)?.label;

  return (
    <section className="animate-entrada-suave flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-base font-semibold text-neutral-900">Pedidos por hora</p>
          {primeira && ultima && (
            <p className="mt-0.5 text-xs text-neutral-500">
              {/* Dizer a janela evita a leitura errada de "não vendi nada de
                  manhã" quando na verdade a loja nem tinha aberto. */}
              Das {primeira} às {ultima}, o horário da sua loja hoje.
            </p>
          )}
        </div>
        {/* O pico só é dito quando existe pico. Num dia parado, "maior
            movimento às 00h, 0 pedidos" é uma frase sem conteúdo. */}
        {!vazio && pico && (
          <p className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
            <TrendingUp className="size-3.5 text-neutral-400" />
            Pico às <span className="font-semibold text-neutral-900">{pico.label}</span>
          </p>
        )}
      </div>

      {vazio ? (
        /*
         * Antes o gráfico desenhava uma reta no zero, que lê como defeito. Uma
         * frase é mais honesta: o dia ainda não começou a acontecer.
         */
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <div className="h-px w-24 bg-neutral-200" />
          <p className="text-sm text-neutral-500">Nenhum pedido registrado hoje.</p>
          <p className="max-w-64 text-xs text-neutral-400">
            O gráfico se desenha conforme os pedidos chegam.
          </p>
        </div>
      ) : (
        <div className="mt-4 h-64 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradiente-pedidos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E11D2E" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#E11D2E" stopOpacity={0} />
                </linearGradient>
              </defs>
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
                width={40}
                tick={{ fill: "#737373", fontSize: 12 }}
              />
              {horaAtual && (
                <ReferenceLine
                  x={horaAtual}
                  stroke="#D4D4D4"
                  strokeDasharray="3 3"
                  label={{ value: "agora", position: "top", fill: "#A3A3A3", fontSize: 10 }}
                />
              )}
              <Tooltip
                cursor={{ stroke: "#E11D2E", strokeOpacity: 0.25, strokeWidth: 1 }}
                content={<Balao />}
              />
              <Area
                type="monotone"
                dataKey="orders"
                stroke="#E11D2E"
                strokeWidth={2.5}
                fill="url(#gradiente-pedidos)"
                dot={false}
                activeDot={{ r: 5, fill: "#fff", stroke: "#E11D2E", strokeWidth: 2.5 }}
                /* A curva se desenha da esquerda para a direita na primeira
                   montagem, no mesmo sentido em que o dia passou. Não repete
                   nas recargas de 8s: o gráfico não é remontado. */
                isAnimationActive
                animationDuration={520}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

/**
 * O balão do gráfico, com a moldura do painel.
 *
 * O padrão do recharts entrega uma caixa branca de canto vivo e borda cinza,
 * que destoa de tudo em volta. Escrever o próprio custa dez linhas e alinha o
 * gráfico ao resto da tela.
 */
function Balao({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const quantidade = Number(payload[0]?.value ?? 0);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs text-neutral-500">Às {label}</p>
      <p className="font-display text-lg font-bold leading-tight tabular-nums text-neutral-900">
        {quantidade} {quantidade === 1 ? "pedido" : "pedidos"}
      </p>
    </div>
  );
}
