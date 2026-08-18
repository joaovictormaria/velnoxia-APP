import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { productReport, salesOverview } from "../repositories/report-repository";

/** Fixed windows instead of a free range: fewer ways to ask a question the
 *  screen cannot answer, and the comparison period is always well defined. */
const periodo = z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) });

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
