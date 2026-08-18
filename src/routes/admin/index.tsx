import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, DollarSign, ExternalLink, ShoppingBag, Star, Wallet } from "lucide-react";
import { KpiCard } from "@/components/admin/dashboard/KpiCard";
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
  const { data, isPending } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboardFn(),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Olá, {admin?.name}! 👋</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Aqui está o resumo do seu negócio hoje.
          </p>
          {/* The address is what the owner sends to customers, so it belongs
              where they see it every day — not buried in the settings page. */}
          {admin && (
            <p className="mt-2 text-sm text-neutral-500">
              Seu cardápio:{' '}
              <span className="font-mono text-neutral-700">velnox.app/{admin.store.slug}</span>
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
