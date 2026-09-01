import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  Bike,
  CalendarDays,
  ChefHat,
  CircleCheck,
  Clock,
  Search,
  ShoppingBag,
  AlertTriangle,
  HandCoins,
} from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { KanbanBoard, type KanbanOrder } from "@/components/admin/orders/KanbanBoard";
import { MesaCard } from "@/components/admin/orders/MesaCard";
import {
  DispatchDialog,
  type DispatchTarget,
} from "@/components/admin/orders/DispatchDialog";
import { ConfirmDialog } from "@/components/admin/comum/ConfirmDialog";
import { NotificationBell } from "@/components/admin/layout/NotificationBell";
import { listKanbanOrdersFn, listMesasAbertasFn, updateOrderStatusFn, confirmPaymentFn } from "@/server/functions/orders.fn";
import { abrirFiadoFn, getPagamentosEmAbertoFn } from "@/server/functions/recebimentos.fn";
import { recursoNoEstado } from "@/lib/planos/resolucao";
import type { KanbanResponse, MesasAbertasResponse } from "@/types/api-responses";

export const Route = createFileRoute("/admin/pedidos/")({
  component: KanbanPage,
});

/** Local YYYY-MM-DD — toISOString() would give the UTC day, which is already
 *  tomorrow during the evening in UTC-3. */
function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function KanbanPage() {
  const queryClient = useQueryClient();
  /* O estado comercial já veio na sessão, pelo `beforeLoad` de `/admin`. */
  const { admin } = Route.useRouteContext();
  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Pedido cuja saída está sendo decidida — a escolha do entregador é um passo
  // próprio, não um clique que já muda o status.
  const [dispatching, setDispatching] = useState<DispatchTarget | null>(null);
  /*
   * O pedido esperando confirmação de "pagamento outro dia". O pedido inteiro,
   * e não só o id, porque o diálogo mostra cliente e valor — e é a existência
   * dele que abre o diálogo, sem um segundo booleano para ficar fora de sincronia.
   */
  const [fiadoPendente, setFiadoPendente] = useState<KanbanOrder | null>(null);
  /** Falha do fiado. Mora à parte do `error` da página: aparece dentro do diálogo. */
  const [erroDoFiado, setErroDoFiado] = useState<string | null>(null);
  /*
   * O Radix segura o diálogo montado durante a animação de saída. Ler
   * `fiadoPendente` direto deixaria o nome e o valor sumirem NA FRENTE da
   * pessoa nesses ~200ms, com a caixa âmbar vazia esvaindo na tela. Esta cópia
   * só anda para frente, então o conteúdo continua inteiro até o fim do fade.
   */
  const ultimoFiado = useRef<KanbanOrder | null>(null);
  if (fiadoPendente) ultimoFiado.current = fiadoPendente;
  const fiadoExibido = fiadoPendente ?? ultimoFiado.current;

  const { data, isPending } = useQuery({
    queryKey: ["orders", "kanban", date, search],
    queryFn: () => listKanbanOrdersFn({ data: { date, search: search || undefined } }),
    refetchInterval: 3_000,
    staleTime: 3_000,
    gcTime: 10 * 60 * 1000,
  });
  const kanban = data as KanbanResponse | undefined;

  /*
    SEM O MÓDULO, NEM CONSULTA.

    O servidor já recusa `listMesasAbertasFn` sem MESAS, e o painel ficaria
    vazio de qualquer forma — mas às custas de uma requisição que falha a
    cada 3 segundos em toda loja BASIC. Mesmo motivo do indicador de fiado.
  */
  const temMesas =
    !admin?.store.plano ||
    recursoNoEstado(admin.store.plano, "MESAS") !== "BLOQUEADO";

  const { data: mesasData = [] } = useQuery({
    queryKey: ["mesas", "abertas", date, search],
    queryFn: () => listMesasAbertasFn({ data: { date, search: search || undefined } }),
    refetchInterval: 3_000,
    staleTime: 3_000,
    gcTime: 10 * 60 * 1000,
    enabled: temMesas,
  });
  const mesas = mesasData as MesasAbertasResponse;

  const advance = useMutation({
    mutationFn: (vars: { id: string; status: OrderStatus }) =>
      updateOrderStatusFn({ data: vars }),
    onSuccess: async (res, vars) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);

      /*
       * A COMANDA IMPRIME AO ACEITAR — e só ao aceitar.
       *
       * Isto morava no diálogo de pedido novo, que foi removido. Sem ele o
       * balcão passou a precisar de dois cliques a mais por pedido no horário
       * de pico: abrir o pedido e clicar em imprimir.
       *
       * `PREPARING` é a única transição que imprime. Recusar não imprime, e
       * avançar para pronto ou concluído também não — a comanda já saiu quando
       * o pedido entrou na fila.
       *
       * DEPOIS do `res.ok`, e não junto com o clique: a versão antiga disparava
       * a impressão em paralelo com a mutação, e um pedido que o servidor
       * recusasse mudar imprimia comanda assim mesmo.
       *
       * `setTimeout` porque `window.print()` trava a thread principal até
       * alguém fechar o diálogo do sistema. Adiando um tick, a atualização do
       * quadro não fica esperando a impressora.
       */
      if (vars.status === "PREPARING") {
        setTimeout(() => window.print(), 0);
      }

      await queryClient.invalidateQueries({ queryKey: ["orders", "kanban"] });
      await queryClient.invalidateQueries({ queryKey: ["mesas", "abertas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const finalizarMesa = useMutation({
    mutationFn: async (pedidoIds: string[]) => {
      // Confirmar pagamento de todos os pedidos primeiro
      const confirmResults = await Promise.all(
        pedidoIds.map((id) => confirmPaymentFn({ data: { orderId: id } }))
      );

      // Depois finalizar a mesa (mudar status para COMPLETED)
      const results = await Promise.all(
        pedidoIds.map((id) => updateOrderStatusFn({ data: { id, status: "COMPLETED" } }))
      );

      return results;
    },
    onSuccess: async (res) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["orders", "kanban"] });
      await queryClient.invalidateQueries({ queryKey: ["mesas", "abertas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => {
      setError("Erro ao finalizar mesa");
    },
  });

  const confirmarPagamento = useMutation({
    mutationFn: (orderId: string) => confirmPaymentFn({ data: { orderId } }),
    onSuccess: async (res) => {
      if (res.ok) {
        setError(null);
        await queryClient.invalidateQueries({ queryKey: ["orders", "kanban"] });
        await queryClient.invalidateQueries({ queryKey: ["mesas", "abertas"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      } else {
        setError(res.error || "Erro ao confirmar pagamento");
      }
    },
    onError: () => {
      setError("Erro ao confirmar pagamento");
    },
  });

  /**
   * VENDA A PRAZO — o fiado do cliente da casa.
   *
   * Não passa por `confirmPaymentFn`: aquela função empurra o status do pedido,
   * e PREPARING é onde a reserva vira consumo. Aqui só o pagamento muda; o
   * pedido segue o fluxo dele e o estoque baixa na hora de sempre.
   */
  const abrirFiado = useMutation({
    mutationFn: (orderId: string) => abrirFiadoFn({ data: { orderId } }),
    onSuccess: async (res) => {
      if (!res.ok) {
        /*
         * A recusa fica NO DIÁLOGO, que continua aberto. Antes ela virava um
         * aviso no topo da página enquanto o confirm nativo já tinha sumido —
         * a pessoa lia o motivo longe da decisão e sem como tentar de novo.
         */
        setErroDoFiado(res.error || "Erro ao registrar pagamento em aberto");
        return;
      }
      setError(null);
      setErroDoFiado(null);
      // Só o sucesso fecha.
      setFiadoPendente(null);
      await queryClient.invalidateQueries({ queryKey: ["orders", "kanban"] });
      await queryClient.invalidateQueries({ queryKey: ["mesas", "abertas"] });
      queryClient.invalidateQueries({ queryKey: ["pagamentos-em-aberto"] });
    },
    onError: () => setErroDoFiado("Erro ao registrar pagamento em aberto"),
  });

  /*
   * A confirmação nomeia o cliente e o valor. Deixar de cobrar é uma decisão
   * que fica assinada em `openedById`, e quem assina precisa ver o que está
   * assinando antes — não depois, no relatório de inadimplência.
   *
   * Isto aqui só ABRE o diálogo. A operação continua sendo a mesma
   * `abrirFiado.mutate(id)` de sempre, disparada na confirmação.
   */
  function pedirFiado(pedido: KanbanOrder) {
    setErroDoFiado(null);
    setFiadoPendente(pedido);
  }

  function handleAdvance(order: KanbanOrder, status: OrderStatus) {
    advance.mutate({ id: order.id, status });
  }

  const metrics = kanban?.metrics;
  const awaiting = kanban?.awaiting ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Pedidos (Kanban)</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Acompanhe e gerencie os pedidos em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700">
            <CalendarDays className="size-4 text-neutral-500" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent outline-none"
            />
          </label>

          <div className="relative w-full min-w-0 flex-1 sm:min-w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido, cliente ou telefone..."
              className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-base md:text-sm text-neutral-700 placeholder:text-neutral-400"
            />
          </div>

          <IndicadorDeFiado />
          <NotificationBell />
        </div>
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
        </p>
      )}

      {mesas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-neutral-900">Mesas Abertas ({mesas.length})</h2>
          <div className="flex flex-wrap gap-3">
            {mesas.map((mesa: any) => (
              <div key={mesa.tableId} className="w-64">
                <MesaCard
                  mesa={mesa}
                  onFinalize={(tableId, pedidoIds) => finalizarMesa.mutate(pedidoIds)}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {awaiting.length > 0 && (
        <WaitingList orders={awaiting} onPick={setDispatching} />
      )}

      {isPending && !kanban ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <KanbanBoard
          columns={(kanban?.columns as any) ?? []}
          mostrarEntrega={kanban?.mostrarEntrega ?? true}
          /* O plano já veio na sessão: nenhuma consulta a mais. */
          permiteEntregador={
            !admin?.store.plano ||
            recursoNoEstado(admin.store.plano, "DELIVERY_AVANCADO") !== "BLOQUEADO"
          }
          /* Idem para a venda a prazo: mesma sessão, mesma pergunta. */
          permiteFiado={
            !admin?.store.plano ||
            recursoNoEstado(admin.store.plano, "FIADO") !== "BLOQUEADO"
          }
          onAdvance={handleAdvance}
          onDispatch={(order) =>
            setDispatching({
              id: order.id,
              number: order.number,
              customerName: order.customerName,
            })
          }
          onConfirmPayment={(orderId) => confirmarPagamento.mutate(orderId)}
          onAbrirFiado={pedirFiado}
        />
      )}

      {/*
        PEDIDOS PAGOS QUE NINGUÉM ACEITOU.
      
        Aviso, e só. Não cancela, não libera reserva, não toca no estoque — quem
        pagou não pode ter o pedido desfeito porque a cozinha demorou. O clique
        leva à coluna Recebidos, onde eles já estão.
      */}
      {metrics && metrics.paidWaiting > 0 && (
        <button
          type="button"
          onClick={() =>
            document
              .getElementById("coluna-RECEIVED")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className="mb-4 flex w-full items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <span>
            <span className="block text-sm font-medium text-amber-900">
              Pedidos pagos aguardando atendimento
            </span>
            <span className="mt-0.5 block text-sm text-amber-800">
              {metrics.paidWaiting === 1
                ? "Existe 1 pedido pago"
                : `Existem ${metrics.paidWaiting} pedidos pagos`}{" "}
              há mais de {metrics.paidWaitingMinutes} minutos aguardando início do
              preparo. Toque para ver na coluna Recebidos.
            </span>
          </span>
        </button>
      )}
      
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={ShoppingBag}
          label="Total de pedidos"
          value={metrics ? String(metrics.totalOrders) : "-"}
          accent="#E11D2E"
        />
        <Metric
          icon={ChefHat}
          label="Tempo médio preparo"
          value={metrics?.avgPrepMinutes !== null && metrics ? `${metrics.avgPrepMinutes} min` : "-"}
          accent="#F59E0B"
        />
        <Metric
          icon={Bike}
          label="Tempo médio entrega"
          value={
            metrics?.avgDeliveryMinutes !== null && metrics
              ? `${metrics.avgDeliveryMinutes} min`
              : "-"
          }
          accent="#2563EB"
        />
        <Metric
          icon={CircleCheck}
          label="Taxa de conclusão"
          value={metrics?.completionRate !== null && metrics ? `${metrics.completionRate}%` : "-"}
          accent="#059669"
        />
      </div>

      {dispatching && (
        <DispatchDialog order={dispatching} onClose={() => setDispatching(null)} />
      )}

      {/*
        A confirmação do fiado. Substitui o `window.confirm()` que anunciava
        "localhost:5173 diz" — mesma pergunta, mesma operação depois do OK.

        Fica montado sempre: o Radix precisa da transição de `open` para animar
        a saída, e desmontar no clique cortaria isso. Sem pedido pendente ele
        não renderiza nada no DOM.
      */}
      <ConfirmDialog
        open={fiadoPendente !== null}
        onOpenChange={(aberto) => {
          if (aberto) return;
          setFiadoPendente(null);
          setErroDoFiado(null);
        }}
        icone={HandCoins}
        variante="atencao"
        titulo="Pagamento outro dia"
        descricao="O pedido entra na fila normalmente e o valor fica registrado como pagamento em aberto até o cliente quitar."
        rotuloConfirmar="Registrar em aberto"
        carregando={abrirFiado.isPending}
        erro={erroDoFiado}
        onConfirm={() => {
          // A MESMA chamada de antes. O diálogo não sabe o que ela faz.
          if (fiadoPendente) abrirFiado.mutate(fiadoPendente.id);
        }}
      >
        {/*
          Quem e quanto, destacados. É o que a pessoa está assinando — fica em
          `openedById` e reaparece na tela de recebimentos.
        */}
        <dl className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Cliente
            </dt>
            <dd className="truncate text-sm font-medium text-neutral-900">
              {fiadoExibido?.customerName}
            </dd>
          </div>
          <div className="shrink-0 text-right">
            <dt className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Ficará em aberto
            </dt>
            <dd className="font-display text-xl font-bold tabular-nums text-amber-900">
              {fiadoExibido
                ? new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(Number(fiadoExibido.total))
                : null}
            </dd>
          </div>
        </dl>
      </ConfirmDialog>
    </div>
  );
}

/**
 * Pedidos prontos parados por falta de quem leve.
 *
 * Fica acima do quadro, e não dentro da coluna de preparo, porque é a única
 * fila em que o relógio corre contra a comida sem ninguém agindo: misturada
 * aos pedidos que ainda estão no forno, ela some.
 */
function WaitingList({
  orders,
  onPick,
}: {
  orders: {
    id: string;
    number: number;
    customerName: string;
    total: number;
    awaitingCourierSince: string | Date | null;
    deliveryNeighborhood: string | null;
  }[];
  onPick: (order: DispatchTarget) => void;
}) {
  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-orange-800">
        <Clock className="size-4" />
        Aguardando entregador ({orders.length})
      </h2>
      <p className="mt-1 text-xs text-orange-700">
        Prontos para sair assim que alguém puder levar.
      </p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {orders.map((order) => {
          const desde = order.awaitingCourierSince
            ? Math.round((Date.now() - new Date(order.awaitingCourierSince).getTime()) / 60_000)
            : 0;
          return (
            <li key={order.id}>
              <button
                type="button"
                onClick={() =>
                  onPick({
                    id: order.id,
                    number: order.number,
                    customerName: order.customerName,
                  })
                }
                className="flex items-center gap-3 rounded-xl border border-orange-300 bg-white px-4 py-2.5 text-left transition-colors hover:border-orange-500"
              >
                <span>
                  <span className="block text-sm font-bold text-neutral-900">
                    #{order.number} - {order.customerName}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {order.deliveryNeighborhood ? order.deliveryNeighborhood + " · " : ""}
                    esperando há {desde} min
                  </span>
                </span>
                <Bike className="size-4 shrink-0 text-orange-600" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${accent}1a` }}
      >
        <Icon className="size-5" style={{ color: accent }} />
      </span>
      <div>
        <p className="text-sm text-neutral-600">{label}</p>
        <p className="text-2xl font-bold text-neutral-900">{value}</p>
      </div>
    </div>
  );
}

/**
 * O AVISO DE CONTAS EM ABERTO — um indicador, não uma notificação.
 *
 * Dívida em aberto é um ESTADO, não um evento. Gravar uma Notification por dia
 * empilharia o mesmo aviso para a mesma conta a cada manhã, e alguém teria de
 * limpar a fila à mão. Calculado na hora, o número some sozinho quando o
 * cliente paga — e o histórico do que foi pago fica em OrderPayment, intacto.
 *
 * Só aparece quando há o que cobrar: um selo permanente dizendo "0 em aberto"
 * vira moldura e ninguém lê no dia em que houver um.
 */
function IndicadorDeFiado() {
  /*
    SEM O RECURSO, NEM CONSULTA.

    O servidor já recusa `getPagamentosEmAbertoFn` para quem não tem FIADO,
    e o indicador desapareceria sozinho — mas às custas de uma requisição
    que falha a cada 60 segundos, para sempre, em toda loja BASIC. O
    `enabled` evita a consulta que já se sabe que será recusada.
  */
  const { admin } = Route.useRouteContext();
  const temFiado =
    !admin?.store.plano ||
    recursoNoEstado(admin.store.plano, "FIADO") !== "BLOQUEADO";

  const { data } = useQuery({
    queryKey: ["pagamentos-em-aberto"],
    queryFn: async () => getPagamentosEmAbertoFn({ data: {} }),
    refetchInterval: 60_000,
    enabled: temFiado,
  });
  const quantidade = data?.quantidade ?? 0;
  if (quantidade === 0) return null;

  const dinheiro = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  /*
   * O RESUMO NO HOVER, com os mais antigos primeiro.
   *
   * `title` nativo, e não um Popover: os componentes de tooltip do projeto são
   * stubs do shadcn que nada usa, e ligar um deles por causa de três linhas de
   * texto custaria mais do que entrega. O navegador já sabe fazer isso.
   *
   * A lista vem ordenada por `openedAt` ascendente pelo serviço — quem espera
   * há mais tempo aparece antes, que é a ordem em que se cobra.
   */
  const resumo = [
    `${quantidade} pagamento(s) em aberto · ${dinheiro(data?.total ?? 0)}`,
    "",
    ...((data?.linhas ?? []) as any[])
      .slice(0, 5)
      .map((l) => `${l.cliente} — ${dinheiro(l.saldo)} — ${l.diasEmAberto} dia(s)`),
    ...(quantidade > 5 ? [`e mais ${quantidade - 5}...`] : []),
  ].join("\n");

  return (
    <Link
      to="/admin/relatorios/recebimentos"
      className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:border-amber-500"
      title={resumo}
    >
      <HandCoins className="size-4" />
      {quantidade} em aberto
      <span className="tabular-nums font-bold">
        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(data?.total ?? 0)}
      </span>
    </Link>
  );
}
