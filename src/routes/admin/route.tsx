import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { VolumeX } from "lucide-react";
import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
import { ContagemDoTeste } from "@/components/admin/layout/ContagemDoTeste";
import { CentralDeNovidades } from "@/components/admin/novidades/CentralDeNovidades";
import { NewOrderDialog } from "@/components/admin/orders/NewOrderDialog";
import { useSomDePedido } from "@/lib/alerta-sonoro";
import { registrarPainelInstalavel } from "@/lib/painel-instalavel";
import { precoEscrito } from "@/lib/plano";
import { getCurrentAdminFn, logoutFn } from "@/server/functions/auth.fn";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    /**
     * Rotas que renderizam dentro deste layout mas sem a moldura e sem sessão.
     * As de senha entram aqui pelo motivo mais óbvio: quem vai redefinir a
     * senha é exatamente quem não consegue entrar.
     */
    const PUBLICAS = [
      "/admin/login",
      "/admin/cadastro",
      "/admin/esqueci-senha",
      "/admin/nova-senha",
    ];
    if (PUBLICAS.includes(location.pathname)) {
      return { admin: null };
    }

    const admin = await getCurrentAdminFn();
    if (!admin) {
      throw redirect({ to: "/admin/login", search: { redirect: location.pathname } });
    }
    // O entregador tem conta válida, e é justamente por isso que ele chegaria
    // até aqui. As funções do painel já o recusam; mandá-lo para a tela dele
    // evita um painel inteiro de erros.
    if (admin.role === "COURIER") throw redirect({ to: "/entregador" });
    return { admin };
  },
  /**
   * O manifesto fica nesta rota, e não na raiz, porque só o painel é
   * instalável. Os sites das lojas são da marca do cliente — oferecer
   * "instalar Velnox.app Painel" para quem está pedindo um lanche seria
   * oferecer a ferramenta errada para a pessoa errada.
   */
  head: () => ({
    meta: [
      { title: "Velnox.app Painel" },
      { name: "theme-color", content: "#0A0A0A" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Painel" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "manifest", href: "/painel.webmanifest" },
      { rel: "apple-touch-icon", href: "/icones/painel-apple-180.png", sizes: "180x180" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { admin } = Route.useRouteContext();
  const router = useRouter();

  // Fica antes do retorno antecipado abaixo porque o login também precisa
  // registrar: é justamente na tela de login que o navegador oferece instalar.
  useEffect(() => {
    registrarPainelInstalavel();
  }, []);

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // The login route renders inside this layout but without the shell.
  if (!admin) return <Outlet />;

  async function handleLogout() {
    await logoutFn();
    router.navigate({ to: "/admin/login" });
  }

  // A suspended or expired store keeps its data and its login — every server
  // function already refuses it, so showing the panel would only produce
  // errors on each click. This explains the state instead.
  /**
   * Conta bloqueada mostra o aviso no lugar do painel — menos na tela de
   * assinatura, que é a saída. Ela precisa abrir justamente quando a conta
   * caiu, e continuar aberta na volta do pagamento, enquanto o webhook do
   * Stripe ainda não chegou para liberar.
   */
  if (!admin.store.acesso.liberado && pathname !== "/admin/assinatura") {
    return (
      <StoreInactiveScreen
        motivo={admin.store.acesso.motivo}
        storeName={admin.store.name}
        onLogout={handleLogout}
      />
    );
  }

  return (
    // No celular a barra do menu fica em cima do conteúdo, empilhada; a
    // partir de lg vira coluna ao lado. Por isso o flex só entra em lg.
    <div className="min-h-screen bg-neutral-950 lg:flex">
      {/* Nome e logo vêm da sessão — este painel atende todas as lojas. */}
      <AdminSidebar
        storeName={admin.store.name}
        logoUrl={admin.store.logoUrl}
        /* O estado comercial já veio na sessão: o menu decide o cadeado sem
           nenhuma consulta a mais ao banco ou ao Stripe. */
        plano={admin.store.plano}
        onLogout={handleLogout}
      />
      {/* A moldura cresce com a tela em vez de custar 96px fixos. Num celular
          de 360px os p-4 + p-8 antigos comiam mais de um quarto da largura
          antes de qualquer conteúdo, e o overflow-x-hidden abaixo faz o que
          sobra ser cortado sem rolagem — some, em vez de rolar. */}
      <main className="min-w-0 flex-1 overflow-x-hidden p-2 sm:p-4">
        <div className="admin-theme min-h-full rounded-2xl bg-[#FAF9F7] p-4 text-neutral-900 sm:p-6 lg:p-8">
          {/* Na moldura, e não no painel inicial: nas últimas horas o aviso
              precisa alcançar quem está no cardápio ou nos pedidos, que é
              onde o dono realmente passa o dia. */}
          {admin.store.status === "TRIAL" && (
            <ContagemDoTeste
              trialEndsAt={admin.store.trialEndsAt}
              onExpirar={() => router.invalidate()}
            />
          )}
          <Outlet />
        </div>
      </main>
      {/*
       * O aviso de pedido novo mora na moldura, e não na tela de pedidos: o PC
       * do balcão fica ligado o dia inteiro e nem sempre na tela certa. Alguém
       * abrir o cardápio para corrigir um preço não pode desligar o alarme da
       * loja.
       */}
      <NewOrderDialog />
      <AvisoDeSomBloqueado />
      {/*
       * A apresentação de novas funcionalidades mora na moldura pelo mesmo
       * motivo do aviso de pedido: precisa atravessar as telas. O tour começa
       * no painel inicial e termina em Relatórios — montado dentro de uma
       * página, ele seria desmontado no primeiro passo que navegasse.
       *
       * Com o catálogo sem nenhuma novidade publicada, este componente devolve
       * `null` antes de montar hook algum.
       */}
      {/* Só o papel: a identidade não atravessa mais o componente — ela sai
          de `requireAdminSession()` no servidor. */}
      <CentralDeNovidades papel={admin.role} />
    </div>
  );
}

/**
 * O navegador não deixa a página tocar som antes de alguém interagir com ela, e
 * o painel do balcão abre sozinho com o Windows. Sem este aviso, a loja passaria
 * o dia achando que seria chamada por um som que nunca ia sair.
 *
 * Some ao primeiro clique em qualquer lugar — inclusive neste botão, que existe
 * mais para explicar o silêncio do que para ser o único jeito de resolvê-lo.
 */
function AvisoDeSomBloqueado() {
  const { bloqueado } = useSomDePedido();
  if (!bloqueado) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-4">
      <button
        type="button"
        className="flex items-center gap-2 rounded-full bg-[#E11D2E] px-5 py-3 text-sm font-semibold text-white shadow-lg"
      >
        <VolumeX className="size-4" />
        Toque aqui para ativar o som dos pedidos
      </button>
    </div>
  );
}

/**
 * Mostrada no lugar do painel quando a conta não pode ser usada.
 *
 * O botão principal muda com o motivo: quem venceu tem como resolver sozinho,
 * pagando; quem foi suspenso não tem — suspensão é decisão nossa, e mandá-lo
 * para o pagamento só criaria a expectativa errada.
 */
function StoreInactiveScreen({
  motivo,
  storeName,
  onLogout,
}: {
  motivo: "suspensa" | "trial-vencido" | "assinatura-vencida";
  storeName: string;
  onLogout: () => void;
}) {
  const texto = {
    suspensa: {
      titulo: "Conta suspensa",
      corpo: `A conta de ${storeName} está suspensa. Fale com a gente para reativar.`,
    },
    "trial-vencido": {
      titulo: "Seu período de teste terminou",
      corpo: `Os 14 dias de teste de ${storeName} acabaram. Seus dados continuam salvos — é só assinar para voltar a receber pedidos.`,
    },
    "assinatura-vencida": {
      titulo: "Sua assinatura venceu",
      corpo: `Não conseguimos renovar a assinatura de ${storeName}. Seus dados continuam salvos — regularize para voltar ao ar.`,
    },
  }[motivo];

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="admin-theme w-full max-w-md rounded-2xl bg-white p-8 text-center text-neutral-900 shadow-xl">
        <h1 className="text-xl font-bold">{texto.titulo}</h1>
        <p className="mt-2 text-sm text-neutral-600">{texto.corpo}</p>
        <p className="mt-4 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
          Enquanto isso, seu cardápio fica fora do ar para os clientes.
        </p>

        {motivo === "suspensa" ? (
          <a
            href="https://wa.me/5511999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 block rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a]"
          >
            Falar com o suporte
          </a>
        ) : (
          <Link
            to="/admin/assinatura"
            className="mt-5 block rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a]"
          >
            Assinar por {precoEscrito()} por mês
          </Link>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="mt-3 text-sm text-neutral-500 hover:text-neutral-800"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
