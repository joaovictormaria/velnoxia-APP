import { Link, createFileRoute } from "@tanstack/react-router";
import { contagemNoAr } from "@/components/admin/layout/ContagemDoTeste";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Clock, ExternalLink } from "lucide-react";
import { BarraDeOperacao } from "@/components/admin/dashboard/BarraDeOperacao";
import { semProtocolo, urlDoCardapio, useBaseUrlPublica } from "@/lib/public-url";
import { MenuQrCodeButton } from "@/components/admin/dashboard/MenuQrCodeButton";
import { OrdersByHourChart } from "@/components/admin/dashboard/OrdersByHourChart";
import { PainelDeStatus } from "@/components/admin/dashboard/PainelDeStatus";
import { PedidosRecentes } from "@/components/admin/dashboard/PedidosRecentes";
import { TopProductsList } from "@/components/admin/dashboard/TopProductsList";
import { NotificationBell } from "@/components/admin/layout/NotificationBell";
import { getDashboardFn } from "@/server/functions/dashboard.fn";

export const Route = createFileRoute("/admin/")({
  component: DashboardPage,
});

const DATA_LONGA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function DashboardPage() {
  const { admin } = Route.useRouteContext();
  const basePublica = useBaseUrlPublica();
  /**
   * O aviso em dias, e só enquanto a contagem regressiva não estiver no ar.
   * Nas últimas 24 horas quem informa é o relógio na moldura; manter os dois
   * seria dizer a mesma coisa duas vezes, uma delas com menos precisão.
   */
  const trial =
    admin?.store.status === "TRIAL" && !contagemNoAr(admin.store.trialEndsAt)
      ? trialCountdown(admin.store.trialEndsAt)
      : null;
  const { data, isPending } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboardFn(),
    /*
     * 8 segundos, o mesmo da tela de Pedidos.
     *
     * Eram 30, o que servia para um resumo mas não para um alarme: a célula de
     * "Recebidos" pulsa quando há pedido esperando, e com meio minuto de atraso
     * o pedido chega, o cliente espera, e a tela continua calma. Um aviso que
     * demora a aparecer ensina a não confiar nele.
     */
    refetchInterval: 8_000,
    /*
     * A TELA NÃO VOLTA AO ESQUELETO A CADA 8 SEGUNDOS.
     *
     * Sem isto, cada ciclo de recarga desmonta o painel e o remonta — e como
     * quase sempre nada mudou, o que se vê é a tela piscando sozinha. Com os
     * dados anteriores no lugar, só os números que de fato mudaram se movem,
     * que é exatamente o que o painel deveria fazer notar.
     *
     * É também o que mantém as animações de entrada acontecendo UMA vez: nada
     * é remontado, então nada se reanima.
     */
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      {/* Only while the store is on trial: an ACTIVE store has nothing to count
          down, and a permanent banner would just become noise. */}
      {trial && (
        <div
          className={
            trial.days <= 3
              ? "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
              : "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
          }
        >
          <p className={trial.days <= 3 ? "text-sm text-[#E11D2E]" : "text-sm text-amber-800"}>
            <Clock className="mr-1.5 inline size-4 align-text-bottom" />
            <strong>Período de teste</strong> — {trial.label}
          </p>
          {/* Antes isto abria um WhatsApp de exemplo, que nem era o da loja.
              Agora leva para onde a assinatura de fato acontece. */}
          <Link
            to="/admin/assinatura"
            className="rounded-lg bg-[#E11D2E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#c4172a]"
          >
            Assinar agora
          </Link>
        </div>
      )}

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {/* O sino fica na linha do título para alcançar a borda direita da
              tela. Solto na fileira de botões, sobrava sozinho numa linha
              quando a barra quebrava no celular. */}
          <div className="flex items-center justify-between gap-3">
            <h1 className="min-w-0 truncate text-2xl font-bold text-neutral-900 sm:text-3xl">
              {saudacao()}, {admin?.name}! 👋
            </h1>
            {/* UMA instância só. O sino tem `useQuery` própria com recarga de
                15s; montá-lo duas vezes (uma por breakpoint) criaria dois
                observers para o mesmo sino. Fica na linha do título, e não na
                fileira de botões, porque ali ele sobrava sozinho numa segunda
                linha quando a barra quebrava no celular. */}
            <div className="shrink-0">
              <NotificationBell />
            </div>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            Veja o que está acontecendo hoje.{" "}
            <span className="text-neutral-400">· {DATA_LONGA.format(new Date())}</span>
          </p>
          {/* The address is what the owner sends to customers, so it belongs
              where they see it every day — not buried in the settings page.
              Discreto de propósito: é referência, não ação. */}
          {admin && basePublica && (
            <p className="mt-2 text-xs text-neutral-500">
              Seu cardápio:{" "}
              <span className="font-mono text-neutral-600">
                {semProtocolo(urlDoCardapio(basePublica, admin.store.slug))}
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Opens in a new tab: this is the public site, and the owner is
              usually mid-task in the panel — replacing it loses that place. */}
          {admin && (
            <a
              href={`/${admin.store.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#c4172a] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D2E] motion-reduce:transition-none"
            >
              <ExternalLink className="size-4" />
              Ver meu cardápio
            </a>
          )}
          {/* Ao lado do link do cardápio porque é o mesmo endereço, só que
              para o cliente que está sentado na mesa. */}
          {admin && (
            <MenuQrCodeButton slug={admin.store.slug} storeName={admin.store.name} />
          )}
        </div>
      </header>

      {isPending || !data ? (
        <Esqueleto />
      ) : (
        <>
          {/*
           * A barra de vitais primeiro, em qualquer largura: é o que se olha no
           * meio do movimento, e a única coisa aqui que muda de minuto a minuto.
           *
           * NENHUM VALOR EM DINHEIRO EM NENHUM BLOCO DESTA TELA. Faturamento,
           * ticket médio e margem vivem em Relatórios, que é a tela que se abre
           * de propósito quando se quer ver dinheiro. O painel fica aberto o dia
           * todo, muitas vezes com o cliente do outro lado do balcão.
           */}
          <BarraDeOperacao
            pedidosHoje={data.operacao.pedidosHoje}
            recebidos={data.byStatus.received}
            emPreparo={data.operacao.emPreparo}
            esgotados={data.operacao.produtosEsgotados}
          />

          {/*
           * A ORDEM DO DOM É A ORDEM DO CELULAR, e ela segue a prioridade
           * operacional: o que precisa de atenção vem antes da lista de
           * chegada. No desktop a grade recoloca os dois lado a lado, sem
           * duplicar marcação e sem inverter a ordem de foco do teclado.
           */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-start-3 lg:row-start-1">
              <PainelDeStatus
                abertoAgora={data.operacao.abertoAgora}
                aguardandoRecebimento={data.operacao.aguardandoRecebimento}
                minutosAguardando={data.operacao.minutosAguardando}
                estoqueBaixo={data.operacao.estoqueBaixo}
              />
            </div>
            <div className="lg:col-span-2 lg:col-start-1 lg:row-start-1">
              <PedidosRecentes pedidos={data.pedidosRecentes} />
            </div>
          </div>

          {/* O gráfico por último: é leitura de tendência, não de operação —
              ninguém precisa dele para saber o que fazer nos próximos minutos. */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <OrdersByHourChart data={data.byHour} />
            </div>
            <TopProductsList products={data.topProducts} />
          </div>
        </>
      )}
    </div>
  );
}

/** Bom dia até meio-dia, boa tarde até as 18h, boa noite depois disso. */
function saudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * O desenho da tela enquanto os dados não chegaram.
 *
 * Blocos na forma exata de cada peça, e não um "Carregando..." solto: o layout
 * não salta quando os números entram, e quem já conhece o painel começa a se
 * localizar antes de haver o que ler. Aparece uma vez só, na primeira carga —
 * as recargas de 8 segundos mantêm os dados anteriores na tela.
 */
function Esqueleto() {
  return (
    <div className="space-y-6" aria-hidden>
      {/* A barra: mesma moldura, mesmas divisórias, mesma altura. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-200 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-4 bg-white p-5 sm:p-6">
            <Bloco className="h-3 w-24" />
            <Bloco className="h-9 w-16" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-2">
          <Bloco className="h-4 w-36" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Bloco className="h-4 w-10" />
                <Bloco className="h-4 flex-1" />
                <Bloco className="h-6 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <Bloco className="h-4 w-28" />
          <Bloco className="mt-5 h-10 w-full" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-2">
          <Bloco className="h-4 w-32" />
          <Bloco className="mt-5 h-56 w-full" />
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <Bloco className="h-4 w-24" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Bloco key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Um retângulo de espera, com o brilho que atravessa em vez do pulso. */
function Bloco({ className }: { className: string }) {
  return <div className={`skeleton-brilho rounded-lg bg-neutral-100 ${className}`} />;
}

/**
 * Days left in the trial. Counts whole days remaining rather than rounding,
 * so the banner never promises a day that has already run out.
 */
function trialCountdown(endsAt: Date | string | null) {
  if (!endsAt) return { days: 14, label: "14 dias grátis para testar." };
  const ms = new Date(endsAt).getTime() - Date.now();
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  if (ms <= 0) return { days: 0, label: "seu teste terminou." };
  if (days === 0) return { days: 0, label: "termina hoje." };
  if (days === 1) return { days: 1, label: "resta 1 dia." };
  return { days, label: `restam ${days} dias.` };
}
