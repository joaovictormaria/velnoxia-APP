import { createFileRoute } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/(public)/")({
  component: PublicLayout,
});

function PublicLayout() {
  return <Outlet />;
}
