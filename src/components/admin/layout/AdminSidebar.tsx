import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Check,
  ClipboardList,
  Cog,
  FileBarChart,
  Inbox,
  LayoutGrid,
  LogOut,
  Megaphone,
  Percent,
  PlusSquare,
  Shapes,
  Star,
  Tags,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: LayoutGrid, exact: true },
  { to: "/admin/pedidos", label: "Pedidos (Kanban)", icon: Inbox },
  { to: "/admin/cardapio", label: "Cardápio", icon: ClipboardList },
  { to: "/admin/cardapio/categorias", label: "Categorias", icon: Shapes },
  { to: "/admin/cardapio/extras", label: "Extras / Adicionais", icon: PlusSquare },
  { to: "/admin/promocoes", label: "Promoções", icon: Megaphone },
  { to: "/admin/cupons", label: "Descontos / Cupons", icon: Percent },
  { to: "/admin/avaliacoes", label: "Avaliações", icon: Star },
  { to: "/admin/clientes", label: "Clientes", icon: Users },
  { to: "/admin/relatorios", label: "Relatórios - Visão Geral", icon: FileBarChart },
  { to: "/admin/relatorios/produtos", label: "Relatórios - Produtos", icon: BarChart3 },
  { to: "/admin/configuracoes", label: "Configurações", icon: Cog },
] as const;

const AUTOMATION_ITEMS = [
  "Impressão automática",
  "Mensagem via WhatsApp",
  "Atualização em tempo real",
  "Relatórios inteligentes",
];

export function AdminSidebar({
  storeName,
  onLogout,
}: {
  storeName: string;
  onLogout: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col overflow-y-auto bg-neutral-950 text-neutral-300">
      <div className="flex items-center gap-3 px-6 py-7">
        <UtensilsCrossed className="size-8 shrink-0 text-[#E11D2E]" />
        <div className="min-w-0">
          <p className="truncate text-xl font-bold text-white">{storeName}</p>
          <p className="truncate text-[10px] font-semibold tracking-widest text-[#E11D2E]">
            SISTEMA DO ADMINISTRADOR
          </p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => {
          const exact = "exact" in rest && rest.exact;
          const active = exact ? pathname === to : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[#E11D2E] text-white"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-white",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 mt-6 rounded-xl border border-[#E11D2E]/40 bg-neutral-900/60 p-4">
        <p className="text-sm font-semibold text-[#E11D2E]">Automação integrada</p>
        <ul className="mt-2 space-y-1.5">
          {AUTOMATION_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs text-neutral-400">
              <Check className="size-3.5 shrink-0 text-[#E11D2E]" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="mt-auto mb-4 flex items-center gap-3 px-6 py-4 text-sm font-medium text-neutral-400 transition-colors hover:text-white"
      >
        <LogOut className="size-5" />
        Sair
      </button>
    </aside>
  );
}
