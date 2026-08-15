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
  await requireAdminSession();
  return listExtras();
});

export const saveExtraFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().nullish(), data: extraSchema }))
  .handler(async ({ data }) => {
    await requireAdminSession();
    const extra = data.id ? await updateExtra(data.id, data.data) : await createExtra(data.data);
    return { ok: true as const, extra };
  });

export const deleteExtraFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireAdminSession();
    await deleteExtra(data.id);
    return { ok: true as const };
  });
