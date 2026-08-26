import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { STARTER_CATALOGS } from "../catalog/starter-catalogs";
import { permitido } from "../security/rate-limit";

/**
 * Exportado para os testes: a server function nao roda fora do runtime do
 * servidor, entao esta e a unica forma de exercitar as regras do zod.
 */
export const signupSchema = z.object({
  storeName: z.string().trim().min(2, "Informe o nome da lanchonete."),
  adminName: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
  whatsappNumber: z.string().trim().min(8, "Informe o WhatsApp da loja."),
  businessType: z.enum(Object.keys(STARTER_CATALOGS) as [string, ...string[]]),
  /**
   * CPF ou CNPJ, como a pessoa digitou — com máscara ou sem.
   *
   * O zod só confere que veio alguma coisa; quem decide se é um documento de
   * verdade é o `validateDocument`, dentro do serviço. Duas razões: a mensagem
   * de recusa precisa distinguir "faltam dígitos" de "verificador errado", e o
   * tipo (CPF ou CNPJ) é deduzido no servidor, nunca recebido do cliente — um
   * formulário que mandasse `documentType` junto não teria como ser acreditado.
   */
  document: z
    .string()
    .trim()
    .min(1, "Informe o CPF ou CNPJ.")
    /*
     * Teto acima do maior documento possivel (CNPJ formatado tem 18). Serve
     * para o campo nao aceitar uma carga de megabytes que so seria recusada
     * depois de passar por regex e normalizacao.
     */
    .max(20, "Informe um CPF ou CNPJ válido."),
});

/**
 * A casca HTTP do cadastro: só o que precisa da requisição.
 *
 * O limite por origem e o cookie de sessão vivem aqui porque os dois leem o
 * contexto da chamada. Todo o resto — validação do documento, duplicidade,
 * transação — está em `signup-service.ts`.
 *
 * Aquele módulo é importado DENTRO do handler, e não no topo do arquivo. Não é
 * estilo: o plugin do TanStack Start remove do bundle do navegador o corpo do
 * handler, mas mantém o que o arquivo importa no topo. Com o import lá em cima,
 * `prisma` e `bcrypt` iam parar no cliente — o chunk desta rota chegou a 167 KB
 * e a página morria na hidratação com "Buffer is not defined".
 */
export const createStoreAccountFn = createServerFn({ method: "POST" })
  .validator(signupSchema)
  .handler(async ({ data }) => {
    /*
     * O limite vem antes de tudo, e não por perfeccionismo: abaixo desta linha
     * abre-se uma transação que cria loja, configurações, sete horários, um
     * catálogo inteiro e um usuário — o endpoint mais caro do sistema. Sem
     * trava, um laço de requisições enche o banco e prende as conexões.
     *
     * Cinco por minuto por origem é o mesmo do login. Ninguém abre cinco
     * lanchonetes em um minuto.
     */
    if (!permitido("signup", { max: 5, janelaMs: 60_000 })) {
      return {
        ok: false as const,
        error: "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
      };
    }

    const { criarContaDeLoja, respostaDeCadastro } = await import(
      "../services/signup-service"
    );
    const { startSessionFor } = await import("../auth/session");

    const resultado = await criarContaDeLoja(data);
    if (!resultado.ok) return resultado;

    /*
     * A transacao ja commitou: a conta existe. Se o cookie falhar agora,
     * responder "nao foi possivel criar a conta" seria mentira — e uma mentira
     * cara, porque a pessoa tentaria de novo e bateria em "este CPF ja esta
     * cadastrado", sem entender que a conta e dela.
     *
     * Signing in immediately: asking someone to log in right after choosing a
     * password is friction with no security benefit.
     */
    let sessaoAberta = true;
    try {
      await startSessionFor(resultado.adminUserId);
    } catch (error) {
      sessaoAberta = false;
      const e = error as { name?: string; code?: string };
      console.error(
        "[signup] conta criada, sessão falhou:",
        e?.code ? `${e.name}(${e.code})` : (e?.name ?? "Error"),
      );
    }

    /*
     * O adminUserId não desce para o navegador: ele existia só para abrir a
     * sessão.
     */
    return respostaDeCadastro(resultado, sessaoAberta);
  });
