import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import {
  createExtra,
  deleteExtra,
  listExtras,
  updateExtra,
} from "../repositories/extra-repository";

const extraSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  price: z.number().nonnegative(),
  isActive: z.boolean(),
});

export const listExtrasFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return listExtras(storeId);
});

export const saveExtraFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().nullish(), data: extraSchema }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const extra = data.id ? await updateExtra(storeId, data.id, data.data) : await createExtra(storeId, data.data);
    return { ok: true as const, extra };
  });

export const deleteExtraFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    await deleteExtra(storeId, data.id);
    return { ok: true as const };
  });
