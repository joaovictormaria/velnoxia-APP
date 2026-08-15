import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentAdmin, loginAdmin, logoutAdmin } from "../auth/session";

export const getCurrentAdminFn = createServerFn({ method: "GET" }).handler(async () => {
  return getCurrentAdmin();
});

export const loginFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await loginAdmin(data.email, data.password);
    if (!admin) {
      return { ok: false as const, error: "E-mail ou senha inválidos." };
    }
    return { ok: true as const, admin };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  await logoutAdmin();
  return { ok: true as const };
});
