import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  pedirRedefinicaoDeSenha,
  redefinirSenha,
} from "../services/password-reset-service";

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
  .handler(({ data }) => redefinirSenha(data.token, data.password));
