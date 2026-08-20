import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import {
  employeeReport,
  productReport,
  salesOverview,
  settlePayroll,
} from "../repositories/report-repository";

/** Fixed windows instead of a free range: fewer ways to ask a question the
 *  screen cannot answer, and the comparison period is always well defined. */
const periodo = z.object({
  days: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]).default(30),
});

export const salesOverviewFn = createServerFn({ method: "GET" })
  .validator(periodo)
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    return salesOverview(storeId, data.days);
  });

export const productReportFn = createServerFn({ method: "GET" })
  .validator(periodo)
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    return productReport(storeId, data.days);
  });

export const employeeReportFn = createServerFn({ method: "GET" })
  .validator(periodo)
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    return employeeReport(storeId, data.days);
  });

/** Marca como quitado o que estava para descontar em folha daquela pessoa. */
export const settlePayrollFn = createServerFn({ method: "POST" })
  .validator(z.object({ employeeId: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const quitados = await settlePayroll(storeId, data.employeeId);
    return { ok: true as const, quitados };
  });
