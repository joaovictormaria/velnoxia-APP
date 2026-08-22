import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BadgePercent,
  BarChart3,
  Bike,
  ChevronDown,
  ClipboardList,
  Cog,
  CreditCard,
  Grid3x3,
  Inbox,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  Package,
  PanelLeft,
  PanelLeftClose,
  Percent,
  PieChart,
  PlusSquare,
  Shapes,
  Star,
  Tags,
  User,
  Users,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Acende só na rota exata. Necessário no Dashboard, prefixo de todas. */
  exact?: boolean;
  /** Rotas de um irmão mais específico, que não devem acender esta. */
  excluir?: string[];
};

type Grupo = { id: string; label: string; icon: LucideIcon; itens: Item[] };

/**
 * O menu do painel, agrupado pelo trabalho do dia.
 *
 * Treze links soltos em coluna obrigavam a percorrer a lista inteira para
 * achar "Cupons". Agrupados, a procura começa pela pergunta que o dono já tem
 * na cabeça — mexer no cardápio, ver quem entrega, olhar número — e só o
 * grupo daquela pergunta fica aberto.
 */
const MENU: (Item | Grupo)[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutGrid, exact: true },
  { to: "/admin/pedidos", label: "Pedidos", icon: Inbox },
  {
    id: "mesas",
    label: "Mesas",
    icon: Grid3x3,
    itens: [
      { to: "/admin/mesas", label: "Gerenciar", icon: Grid3x3, exact: true },
      { to: "/admin/mesas/dashboard", label: "Dashboard", icon: Grid3x3 },
    ],
  },
  {
    id: "cardapio",
    label: "Cardápio",
    icon: ClipboardList,
    itens: [
      { to: "/admin/cardapio/categorias", label: "Categorias", icon: Shapes },
      {
        to: "/admin/cardapio",
        label: "Produtos",
        icon: UtensilsCrossed,
        excluir: ["/admin/cardapio/categorias", "/admin/cardapio/extras"],
      },
      { to: "/admin/cardapio/extras", label: "Adicionais", icon: PlusSquare },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    itens: [
      { to: "/admin/promocoes", label: "Promoções", icon: Tags },
      { to: "/admin/cupons", label: "Descontos / Cupons", icon: Percent },
      { to: "/admin/avaliacoes", label: "Avaliações", icon: Star },
    ],
  },
  {
    id: "pessoas",
    label: "Pessoas",
    icon: Users,
    itens: [
      { to: "/admin/clientes", label: "Clientes", icon: User },
      { to: "/admin/entregadores", label: "Entregadores", icon: Bike },
      {
        to: "/admin/funcionarios",
        label: "Funcionários",
        icon: BadgePercent,
        excluir: ["/admin/funcionarios/planos"],
      },
      { to: "/admin/funcionarios/planos", label: "Planos de benefício", icon: Tags },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    icon: BarChart3,
    itens: [
      { to: "/admin/relatorios", label: "Visão Geral", icon: PieChart, exact: true },
      { to: "/admin/relatorios/produtos", label: "Produtos", icon: BarChart3 },
      { to: "/admin/relatorios/funcionarios", label: "Funcionários", icon: BadgePercent },
    ],
  },
  { to: "/admin/estoque", label: "Estoque & Produção", icon: Package },
  { to: "/admin/assinatura", label: "Assinatura", icon: CreditCard },
  { to: "/admin/configuracoes", label: "Configurações", icon: Cog },
];

const ehGrupo = (e: Item | Grupo): e is Grupo => "itens" in e;

function estaAtivo(pathname: string, item: Item): boolean {
  if (item.exact) return pathname === item.to;
  if (!pathname.startsWith(item.to)) return false;
  return !item.excluir?.some((p) => pathname.startsWith(p));
}

const CHAVE_RECOLHIDO = "velnox-painel-menu-recolhido";

export function AdminSidebar({
  storeName,
  logoUrl,
  onLogout,
}: {
  storeName: string;
  logoUrl: string | null;
  onLogout: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [recolhido, setRecolhido] = useState(false);
  const [aberto, setAberto] = useState(false);

  // Lido depois da montagem: no servidor não existe localStorage, e ler
  // durante a renderização faria o HTML do servidor divergir do cliente.
  useEffect(() => {
    setRecolhido(localStorage.getItem(CHAVE_RECOLHIDO) === "1");
  }, []);

  function alternarRecolhido() {
    setRecolhido((r) => {
      localStorage.setItem(CHAVE_RECOLHIDO, r ? "0" : "1");
      return !r;
    });
  }

  // Trocar de página fecha a gaveta do celular: ela cobre o conteúdo, e
  // ficar aberta esconderia justamente a tela que o dono acabou de abrir.
  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  return (
    <>
      {/* Celular: sem esta barra não haveria como chegar ao menu. */}
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-neutral-950 px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-neutral-300 hover:bg-neutral-900 hover:text-white"
        >
          <Menu className="size-6" />
        </button>
        <LogoDaLoja logoUrl={logoUrl} storeName={storeName} tamanho="size-8" />
        <p className="truncate text-base font-bold text-white">{storeName}</p>
      </div>

      {aberto && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setAberto(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={cn(
          "z-50 flex h-screen shrink-0 flex-col bg-neutral-950 text-neutral-300 transition-transform duration-200 lg:transition-[width]",
          // No celular é gaveta por cima do conteúdo; no desktop, coluna fixa.
          "fixed inset-y-0 left-0 w-72 lg:sticky lg:inset-y-auto lg:left-auto lg:top-0",
          aberto ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          recolhido ? "lg:w-20" : "lg:w-72",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 px-5 py-6",
            recolhido && "lg:justify-center lg:px-0",
          )}
        >
          <LogoDaLoja logoUrl={logoUrl} storeName={storeName} tamanho="size-10" />
          <div className={cn("min-w-0", recolhido && "lg:hidden")}>
            <p className="truncate text-lg font-bold text-white">{storeName}</p>
            <p className="truncate text-[10px] font-semibold tracking-widest text-[#E11D2E]">
              SISTEMA DO ADMINISTRADOR
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar menu"
            className="ml-auto rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-900 hover:text-white lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {recolhido ? (
            <TrilhaDeIcones pathname={pathname} />
          ) : (
            <div className="flex flex-col gap-0.5">
              {MENU.map((entrada) =>
                ehGrupo(entrada) ? (
                  <SecaoDoMenu key={entrada.id} grupo={entrada} pathname={pathname} />
                ) : (
                  <LinkDoMenu key={entrada.to} item={entrada} pathname={pathname} />
                ),
              )}
            </div>
          )}
        </nav>

        <div className="border-t border-neutral-900 p-3">
          <button
            type="button"
            onClick={alternarRecolhido}
            title={recolhido ? "Expandir menu" : "Recolher menu"}
            className={cn(
              "hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white lg:flex",
              recolhido && "lg:justify-center lg:px-0",
            )}
          >
            {recolhido ? (
              <PanelLeft className="size-5 shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="size-5 shrink-0" />
                <span>Recolher menu</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onLogout}
            title="Sair"
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white",
              recolhido && "lg:justify-center lg:px-0",
            )}
          >
            <LogOut className="size-5 shrink-0" />
            <span className={cn(recolhido && "lg:hidden")}>Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
}

/**
 * A marca de quem está usando o painel.
 *
 * Sem logo cadastrada fica o garfo e faca do sistema — nunca um quadrado
 * vazio, porque o topo do menu é a primeira coisa que se olha ao entrar.
 */
function LogoDaLoja({
  logoUrl,
  storeName,
  tamanho,
}: {
  logoUrl: string | null;
  storeName: string;
  tamanho: string;
}) {
  const [falhou, setFalhou] = useState(false);

  // Uma URL salva pode quebrar depois — arquivo removido do bucket, domínio
  // trocado. Aí volta o ícone, em vez da imagem partida do navegador.
  if (!logoUrl || falhou) {
    return <UtensilsCrossed className={cn(tamanho, "shrink-0 text-[#E11D2E]")} />;
  }

  return (
    <img
      src={logoUrl}
      alt={storeName}
      onError={() => setFalhou(true)}
      className={cn(tamanho, "shrink-0 rounded-lg object-cover")}
    />
  );
}

/** Um grupo que abre e fecha. Fechado, devolve o espaço à coluna. */
function SecaoDoMenu({ grupo, pathname }: { grupo: Grupo; pathname: string }) {
  const temAtivo = grupo.itens.some((i) => estaAtivo(pathname, i));
  // Sem escolha do dono, o grupo segue a rota: chegar a uma página por link
  // direto abre o grupo dela, em vez de deixar o menu mudo sobre onde se está.
  const [manual, setManual] = useState<boolean | null>(null);
  const aberto = manual ?? temAtivo;

  return (
    <div>
      <button
        type="button"
        onClick={() => setManual(!aberto)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white"
      >
        <grupo.icon className="size-5 shrink-0" />
        <span className="truncate">{grupo.label}</span>
        <ChevronDown
          className={cn("ml-auto size-4 shrink-0 transition-transform", aberto && "rotate-180")}
        />
      </button>

      {aberto && (
        <div className="mt-0.5 flex flex-col gap-0.5 pb-1">
          {grupo.itens.map((item) => (
            <LinkDoMenu key={item.to} item={item} pathname={pathname} filho />
          ))}
        </div>
      )}
    </div>
  );
}

function LinkDoMenu({
  item,
  pathname,
  filho,
}: {
  item: Item;
  pathname: string;
  filho?: boolean;
}) {
  const ativo = estaAtivo(pathname, item);
  return (
    <Link
      to={item.to}
      className={cn(
        "flex items-center gap-3 rounded-lg py-2.5 text-sm transition-colors",
        filho ? "pl-8 pr-3" : "px-3 font-semibold uppercase tracking-wide",
        ativo
          ? "bg-[#E11D2E] text-white"
          : "text-neutral-400 hover:bg-neutral-900 hover:text-white",
      )}
    >
      <item.icon className={cn("shrink-0", filho ? "size-4" : "size-5")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * O menu recolhido: só ícones, com um traço separando os grupos.
 *
 * Os cabeçalhos de grupo somem porque, sem texto, não distinguem nada — o
 * traço faz o mesmo trabalho ocupando uma linha em vez de sete.
 */
function TrilhaDeIcones({ pathname }: { pathname: string }) {
  return (
    <div className="flex flex-col items-center">
      {MENU.map((entrada, i) => {
        const itens = ehGrupo(entrada) ? entrada.itens : [entrada];
        return (
          <div key={ehGrupo(entrada) ? entrada.id : entrada.to} className="w-full">
            {i > 0 && <div className="mx-3 my-1.5 border-t border-neutral-900" />}
            <div className="flex flex-col items-center gap-1">
              {itens.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  aria-label={item.label}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-lg transition-colors",
                    estaAtivo(pathname, item)
                      ? "bg-[#E11D2E] text-white"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-white",
                  )}
                >
                  <item.icon className="size-6" />
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
