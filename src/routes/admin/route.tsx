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
