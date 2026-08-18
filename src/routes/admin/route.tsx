import { Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
import { getCurrentAdminFn, logoutFn } from "@/server/functions/auth.fn";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    // Both render inside this layout but without the shell, and without a session.
    if (location.pathname === "/admin/login" || location.pathname === "/admin/cadastro") {
      return { admin: null };
    }

    const admin = await getCurrentAdminFn();
    if (!admin) {
      throw redirect({ to: "/admin/login", search: { redirect: location.pathname } });
    }
    return { admin };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { admin } = Route.useRouteContext();
  const router = useRouter();

  // The login route renders inside this layout but without the shell.
  if (!admin) return <Outlet />;

  async function handleLogout() {
    await logoutFn();
    router.navigate({ to: "/admin/login" });
  }

  // A suspended or expired store keeps its data and its login — every server
  // function already refuses it, so showing the panel would only produce
  // errors on each click. This explains the state instead.
  if (admin.store.status === "SUSPENDED" || admin.store.trialExpired) {
    return (
      <StoreInactiveScreen
        suspended={admin.store.status === "SUSPENDED"}
        storeName={admin.store.name}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-neutral-950">
      {/* The store name comes from the session — this panel serves every tenant. */}
      <AdminSidebar storeName={admin.store.name} onLogout={handleLogout} />
      <main className="flex-1 overflow-x-hidden p-4">
        <div className="admin-theme min-h-full rounded-2xl bg-[#FAF9F7] p-8 text-neutral-900">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/** Shown instead of the panel when the store cannot be used. */
function StoreInactiveScreen({
  suspended,
  storeName,
  onLogout,
}: {
  suspended: boolean;
  storeName: string;
  onLogout: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="admin-theme w-full max-w-md rounded-2xl bg-white p-8 text-center text-neutral-900 shadow-xl">
        <h1 className="text-xl font-bold">
          {suspended ? "Conta suspensa" : "Seu período de teste terminou"}
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          {suspended
            ? `A conta de ${storeName} está suspensa. Fale com a gente para reativar.`
            : `Os 14 dias de teste de ${storeName} acabaram. Seus dados continuam salvos — é só reativar para voltar a receber pedidos.`}
        </p>
        <p className="mt-4 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
          Enquanto isso, seu cardápio fica fora do ar para os clientes.
        </p>
        <a
          href="https://wa.me/5511999999999"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 block rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a]"
        >
          Falar com o suporte
        </a>
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
