import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  pedirRedefinicaoDeSenha,
  redefinirSenha,
} from "../services/password-reset-service";
import { permitido } from "../security/rate-limit";

/**
 * Pede o link de redefinição.
 *
 * Público e sem sessão — quem chega aqui é justamente quem não consegue entrar.
 * A resposta é sempre a mesma, exista ou não a conta: um "e-mail não
 * encontrado" transformaria este formulário numa lista de quais lojistas estão
 * cadastrados, e o cadastro é por convite comercial.
 */
export const requestPasswordResetFn = createServerFn({ method: "POST" })
  .validator(z.object({ email: z.string().trim().toLowerCase().email("E-mail inválido.") }))
  .handler(async ({ data }) => {
    // O serviço já segura pedidos repetidos para a MESMA conta; este teto por
    // origem barra o varredor que dispara para muitos e-mails diferentes,
    // que o por-conta deixaria passar. Resposta segue idêntica, então nada
    // aqui revela se a conta existe.
    if (!permitido("reset-request", { max: 5, janelaMs: 60_000 })) {
      return { ok: true as const };
    }
    await pedirRedefinicaoDeSenha(data.email);
    return { ok: true as const };
  });

/** Troca a senha com o token que veio no link do e-mail. */
export const resetPasswordFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string().trim().min(10).max(200),
      password: z
        .string()
        .min(8, "A senha precisa de pelo menos 8 caracteres.")
        .max(72),
    }),
  )
  .handler(({ data }) => {
    if (!permitido("reset-confirm", { max: 10, janelaMs: 60_000 })) {
      throw new Error("Muitas tentativas. Espere um minuto.");
    }
    return redefinirSenha(data.token, data.password);
  });
