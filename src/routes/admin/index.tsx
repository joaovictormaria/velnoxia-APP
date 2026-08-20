import { Link, createFileRoute } from "@tanstack/react-router";
import { contagemNoAr } from "@/components/admin/layout/ContagemDoTeste";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, DollarSign, ExternalLink, ShoppingBag, Star, Wallet } from "lucide-react";
import { KpiCard } from "@/components/admin/dashboard/KpiCard";
import { semProtocolo, urlDoCardapio, useBaseUrlPublica } from "@/lib/public-url";
import { MenuQrCodeButton } from "@/components/admin/dashboard/MenuQrCodeButton";
import { OrdersByHourChart } from "@/components/admin/dashboard/OrdersByHourChart";
import { OrdersByStatusCard } from "@/components/admin/dashboard/OrdersByStatusCard";
import { TopProductsList } from "@/components/admin/dashboard/TopProductsList";
import { NotificationBell } from "@/components/admin/layout/NotificationBell";
import { getDashboardFn } from "@/server/functions/dashboard.fn";

export const Route = createFileRoute("/admin/")({
  component: DashboardPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const todayLabel = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });

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
    refetchInterval: 30_000,
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

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Olá, {admin?.name}! 👋</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Aqui está o resumo do seu negócio hoje.
          </p>
          {/* The address is what the owner sends to customers, so it belongs
              where they see it every day — not buried in the settings page. */}
          {admin && basePublica && (
            <p className="mt-2 text-sm text-neutral-500">
              Seu cardápio:{' '}
              <span className="font-mono text-neutral-700">
                {semProtocolo(urlDoCardapio(basePublica, admin.store.slug))}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Opens in a new tab: this is the public site, and the owner is
              usually mid-task in the panel — replacing it loses that place. */}
          {admin && (
            <a
              href={`/${admin.store.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c4172a]"
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
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-700">
            <CalendarDays className="size-4 text-neutral-500" />
            Hoje, {todayLabel.format(new Date())}
          </div>
          <NotificationBell />
        </div>
      </header>

      {isPending || !data ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Pedidos"
              value={String(data.summary.orders.value)}
              change={data.summary.orders.change}
              icon={ShoppingBag}
              accent="#E11D2E"
            />
            <KpiCard
              label="Faturamento"
              value={currency.format(data.summary.revenue.value)}
              change={data.summary.revenue.change}
              icon={DollarSign}
              accent="#059669"
            />
            <KpiCard
              label="Ticket médio"
              value={currency.format(data.summary.averageTicket.value)}
              change={data.summary.averageTicket.change}
              icon={Wallet}
              accent="#F59E0B"
            />
            <KpiCard
              label="Avaliação média"
              value={data.summary.rating.value.toFixed(1).replace(".", ",")}
              change={data.summary.rating.change}
              changeSuffix=""
              icon={Star}
              accent="#2563EB"
            />
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-neutral-900">Pedidos por status</h2>
            <OrdersByStatusCard counts={data.byStatus} />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
