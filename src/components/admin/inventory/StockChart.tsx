import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import {
  adminGetMovementHistory,
  adminGetInventoryValueReport,
} from "@/server/functions/report.fn";
import { quantidade, moeda } from "@/lib/formato";

/**
 * Gráficos do estoque.
 *
 * TUDO SAI DE DUAS CONSULTAS QUE JÁ EXISTIAM: o histórico de movimentos no
 * período e o valor do estoque por item. Nada de consulta nova — os quatro
 * recortes são derivações da mesma lista, feitas aqui, porque atravessar a rede
 * quatro vezes para cortar o mesmo dado de jeitos diferentes é desperdício.
 *
 * A escolha do que mostrar seguiu um critério: o gráfico responde a uma
 * pergunta que alguém faz de verdade na cozinha. "Entrou mais do que saiu?",
 * "onde está meu dinheiro parado?", "o que eu mais gasto?", "quanto joguei
 * fora?". Giro de estoque e projeção de compra ficaram de fora porque exigem
 * dado que ainda não existe, e gráfico bonito sobre número inventado é pior
 * que nenhum gráfico.
 */

export interface StockChartProps {
  storeId: string;
  itemId?: string;
  period?: "week" | "month" | "quarter";
}

/**
 * Teto de movimentos por carregamento.
 *
 * Bater neste número significa que o período tem MAIS movimentos do que vieram
 * — e os quatro gráficos passam a descrever só um pedaço. Sem aviso, um
 * "consumi 40 kg de farinha" viraria decisão de compra sobre metade do mês.
 */
const TETO_DE_MOVIMENTOS = 1000;

const PERIODOS = [
  { id: 7, rotulo: "7 dias" },
  { id: 30, rotulo: "30 dias" },
  { id: 90, rotulo: "90 dias" },
] as const;

/*
 * Entrada e saída são os dois sentidos do estoque, e a cor diz qual é qual sem
 * precisar de legenda. Perda tem cor própria porque ela é saída, mas de um
 * tipo que dói diferente.
 */
const VERDE = "#059669";
const VERMELHO = "#DC2626";
const CINZA = "#64748B";

const ENTRADAS = ["PURCHASE", "PRODUCTION", "RETURN"];
const SAIDAS = ["CONSUMPTION", "LOSS"];

const ROTULO_DO_TIPO: Record<string, string> = {
  PURCHASE: "Compras",
  PRODUCTION: "Produção",
  RETURN: "Devoluções",
  CONSUMPTION: "Consumo",
  LOSS: "Perdas",
  ADJUSTMENT: "Ajustes",
  RESERVATION: "Reservas",
  REVERSAL: "Estornos",
};

type Movimento = {
  type: string;
  quantity: number | string;
  costAtTime?: number | string | null;
  item?: { name?: string } | null;
};

function Cartao({
  titulo,
  descricao,
  vazio,
  children,
}: {
  titulo: string;
  descricao: string;
  /** Mensagem quando não há dado — nunca um gráfico vazio sem explicação. */
  vazio?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-900">{titulo}</h3>
      <p className="mt-0.5 text-xs text-neutral-600">{descricao}</p>
      <div className="mt-4 h-56">
        {vazio ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-neutral-200 px-4 text-center">
            <p className="text-sm text-neutral-500">{vazio}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

const eixo = { fontSize: 11, fill: "#64748B" };

export function StockChart(props: StockChartProps) {
  const [dias, setDias] = useState<number>(30);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [valorEmEstoque, setValorEmEstoque] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    const desde = new Date(Date.now() - dias * 24 * 60 * 60_000);

    Promise.all([
      adminGetMovementHistory({
        data: {
          startDate: desde.toISOString(),
          limit: String(TETO_DE_MOVIMENTOS),
        },
      } as any),
      adminGetInventoryValueReport(),
    ])
      .then(([hist, valor]) => {
        if (cancelado) return;
        setMovimentos(Array.isArray(hist) ? hist : []);
        setValorEmEstoque(valor);
      })
      .catch((e) => {
        if (cancelado) return;
        setErro(e instanceof Error ? e.message : "Falha ao carregar os dados.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [dias, props.storeId]);

  /*
   * Os quatro recortes, derivados de uma lista só. `useMemo` porque a lista
   * pode ter mil linhas e a troca de período já refaz tudo.
   */
  const entradasESaidas = useMemo(() => {
    const soma = new Map<string, number>();
    for (const m of movimentos) {
      const q = Math.abs(Number(m.quantity ?? 0));
      if (!Number.isFinite(q) || q === 0) continue;
      if (!ENTRADAS.includes(m.type) && !SAIDAS.includes(m.type)) continue;
      soma.set(m.type, (soma.get(m.type) ?? 0) + q);
    }
    return [...soma.entries()]
      .map(([type, total]) => ({
        nome: ROTULO_DO_TIPO[type] ?? type,
        total,
        entrada: ENTRADAS.includes(type),
      }))
      .sort((a, b) => b.total - a.total);
  }, [movimentos]);

  const maisConsumidos = useMemo(() => {
    const soma = new Map<string, number>();
    for (const m of movimentos) {
      if (m.type !== "CONSUMPTION") continue;
      const nome = m.item?.name;
      if (!nome) continue;
      soma.set(nome, (soma.get(nome) ?? 0) + Math.abs(Number(m.quantity ?? 0)));
    }
    return [...soma.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [movimentos]);

  const perdas = useMemo(() => {
    const soma = new Map<string, number>();
    for (const m of movimentos) {
      if (m.type !== "LOSS") continue;
      const nome = m.item?.name;
      if (!nome) continue;
      /*
       * O valor da perda usa `costAtTime`, o custo CONGELADO no movimento — e
       * não o custo atual do item. Uma perda de três meses atrás vale o que o
       * material valia naquele dia; recalcular pelo preço de hoje reescreveria
       * a história a cada mudança de fornecedor.
       */
      const custo = Number(m.costAtTime ?? 0);
      if (!Number.isFinite(custo) || custo <= 0) continue;
      soma.set(nome, (soma.get(nome) ?? 0) + Math.abs(Number(m.quantity ?? 0)) * custo);
    }
    return [...soma.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [movimentos]);

  const topValor = useMemo(() => {
    const linhas = valorEmEstoque?.breakdown ?? [];
    return linhas.map((x: any) => ({
      nome: String(x.name ?? ""),
      total: Number(x.value ?? 0),
    }));
  }, [valorEmEstoque]);

  const totalPerdido = perdas.reduce((s, p) => s + p.total, 0);

  /*
   * Se veio exatamente o teto, quase certamente havia mais. Pode ser que o
   * período tenha mil movimentos redondos — mas avisar à toa custa uma faixa
   * amarela, e não avisar custa uma decisão errada.
   */
  const truncado = movimentos.length >= TETO_DE_MOVIMENTOS;

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-900">
          Não consegui carregar os gráficos
        </p>
        <p className="mt-1 text-sm text-red-800">{erro}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Gráficos</h2>
          <p className="mt-0.5 text-sm text-neutral-600">
            O que entrou, o que saiu e onde está o dinheiro parado.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-neutral-200 p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              onClick={() => setDias(p.id)}
              className={
                dias === p.id
                  ? "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
              }
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      {!carregando && truncado && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            Estes gráficos podem estar incompletos
          </p>
          <p className="mt-0.5 text-sm text-amber-800">
            O período tem mais de {quantidade(TETO_DE_MOVIMENTOS)} movimentações
            e só as mais recentes entraram na conta. Escolha um período menor
            para ver os números completos.
          </p>
        </div>
      )}

      {carregando ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-72 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao
            titulo="Entradas × saídas"
            descricao={`Movimentação dos últimos ${dias} dias, por tipo.`}
            vazio={
              entradasESaidas.length === 0
                ? "Nenhuma movimentação neste período."
                : undefined
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={entradasESaidas}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="nome" tick={eixo} axisLine={false} tickLine={false} />
                <YAxis tick={eixo} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  formatter={(v: any) => [quantidade(v), "Quantidade"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {entradasESaidas.map((d, i) => (
                    <Cell key={i} fill={d.entrada ? VERDE : VERMELHO} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Cartao>

          <Cartao
            titulo="Valor em estoque"
            descricao={
              valorEmEstoque
                ? `Top 10 por valor parado. Total: ${moeda(valorEmEstoque.totalValue)}`
                : "Top 10 por valor parado."
            }
            vazio={
              topValor.length === 0
                ? "Nenhum item com custo informado ainda."
                : undefined
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topValor} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis type="number" tick={eixo} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  tick={eixo}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip
                  formatter={(v: any) => [moeda(v), "Valor"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="total" fill={CINZA} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Cartao>

          <Cartao
            titulo="Itens mais consumidos"
            descricao={`O que a cozinha mais gastou em ${dias} dias.`}
            vazio={
              maisConsumidos.length === 0
                ? "Nenhum consumo registrado neste período."
                : undefined
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={maisConsumidos} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis type="number" tick={eixo} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  tick={eixo}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip
                  formatter={(v: any) => [quantidade(v), "Consumido"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="total" fill={CINZA} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Cartao>

          <Cartao
            titulo="Perdas"
            descricao={
              totalPerdido > 0
                ? `${moeda(totalPerdido)} jogados fora em ${dias} dias.`
                : `O que foi perdido em ${dias} dias, em reais.`
            }
            vazio={
              perdas.length === 0
                ? "Nenhuma perda registrada neste período — ou sem custo informado."
                : undefined
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perdas} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis type="number" tick={eixo} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  tick={eixo}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip
                  formatter={(v: any) => [moeda(v), "Perdido"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="total" fill={VERMELHO} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Cartao>
        </div>
      )}

      {!carregando && movimentos.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center">
          <BarChart3 className="mx-auto size-8 text-neutral-300" />
          <p className="mt-3 text-sm font-medium text-neutral-900">
            Nenhuma movimentação em {dias} dias
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Registre compras, produções e perdas para ver os números aqui.
          </p>
        </div>
      )}
    </div>
  );
}
