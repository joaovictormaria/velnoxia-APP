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
      // As mensagens sao em portugues porque a tela passou a mostra-las: uma
      // recusa de validacao agora vira texto para o lojista, e nao um erro mudo.
      email: z.string().email("Informe um e-mail vÃ¡lido."),
      password: z.string().min(1, "Informe sua senha."),
    }),
  )
  .handler(async ({ data }) => {
    /*
     * O bcrypt (custo 12) jÃ¡ torna cada tentativa cara, mas cara nÃ£o Ã©
     * impossÃ­vel: sem um teto, um script ainda varre uma senha fraca Ã 
     * vontade. Cinco por minuto por origem Ã© folgado para quem digitou errado
     * e intransponÃ­vel para forÃ§a bruta. O contador Ã© por IP, entÃ£o errar a
     * prÃ³pria senha nÃ£o tranca o vizinho.
     */
    if (!permitido("login", { max: 5, janelaMs: 60_000 })) {
      return {
        ok: false as const,
        error: "Muitas tentativas. Espere um minuto e tente de novo.",
      };
    }
    const admin = await loginAdmin(data.email, data.password);
    if (!admin) {
      return { ok: false as const, error: "E-mail ou senha invÃ¡lidos." };
    }
    return { ok: true as const, admin };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  await logoutAdmin();
  return { ok: true as const };
});
