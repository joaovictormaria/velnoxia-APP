import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { listCustomers } from "../repositories/customer-repository";

export const listCustomersFn = createServerFn({ method: "GET" })
  .validator(z.object({ search: z.string().optional() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    return listCustomers(storeId, data.search);
  });
