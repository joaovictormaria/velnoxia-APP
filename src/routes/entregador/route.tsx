import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentAdminFn } from "@/server/functions/auth.fn";

/**
 * Área do entregador.
 *
 * Vive fora de /admin de propósito: a conta é da mesma tabela, mas o painel não
 * é dele. Quem cai aqui sem ser entregador volta para o próprio lugar, e quem
 * chega com o papel errado não vê meia tela antes de descobrir.
 */
export const Route = createFileRoute("/entregador")({
  beforeLoad: async ({ location }) => {
    // A tela de resgate é a porta de quem ainda não tem conta — pedir sessão
    // aqui deixaria o convite sem serventia.
    if (location.pathname.startsWith("/entregador/entrar")) return { courier: null };

    const admin = await getCurrentAdminFn();
    if (!admin) {
      throw redirect({ to: "/admin/login", search: { redirect: location.pathname } });
    }
    if (admin.role !== "COURIER") throw redirect({ to: "/admin" });

    return { courier: admin };
  },
  component: () => <Outlet />,
});
