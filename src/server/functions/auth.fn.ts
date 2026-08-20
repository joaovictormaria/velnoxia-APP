import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentAdmin, loginAdmin, logoutAdmin } from "../auth/session";
import { permitido } from "../security/rate-limit";

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
    /*
     * O bcrypt (custo 12) já torna cada tentativa cara, mas cara não é
     * impossível: sem um teto, um script ainda varre uma senha fraca à
     * vontade. Cinco por minuto por origem é folgado para quem digitou errado
     * e intransponível para força bruta. O contador é por IP, então errar a
     * própria senha não tranca o vizinho.
     */
    if (!permitido("login", { max: 5, janelaMs: 60_000 })) {
      return {
        ok: false as const,
        error: "Muitas tentativas. Espere um minuto e tente de novo.",
      };
    }
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
