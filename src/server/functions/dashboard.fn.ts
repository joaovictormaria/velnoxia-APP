import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "../auth/session";
import { getDashboardData } from "../services/dashboard-service";

export const getDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return getDashboardData(storeId);
});
