/**
 * Envio de e-mail pelo Resend.
 *
 * Chamada direta à API em vez do SDK: é uma requisição só, e uma dependência a
 * menos num servidor que já carrega bastante coisa.
 *
 * Nunca lança. Um e-mail que não sai não pode derrubar a operação que o pediu —
 * quem chama decide o que dizer ao usuário, e no caso da redefinição de senha a
 * resposta é a mesma de qualquer jeito, por segurança.
 */

const ENDPOINT = "https://api.resend.com/emails";

export type ResultadoDoEnvio = { ok: true } | { ok: false; motivo: string };

export async function enviarEmail(opcoes: {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}): Promise<ResultadoDoEnvio> {
  const apiKey = process.env.RESEND_API_KEY;
  const remetente = process.env.MAIL_FROM;

  if (!apiKey || !remetente) {
    // Em desenvolvimento é o caso comum: não há chave, e travar o fluxo aqui
    // impediria de testar o resto. O aviso sai no log de quem está rodando.
    console.warn(
      "[mail] RESEND_API_KEY ou MAIL_FROM ausente — e-mail não enviado para " + opcoes.para,
    );
    return { ok: false, motivo: "nao-configurado" };
  }

  try {
    const resposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remetente,
        to: [opcoes.para],
        subject: opcoes.assunto,
        html: opcoes.html,
        text: opcoes.texto,
      }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      console.error("[mail] Resend recusou (" + resposta.status + "): " + corpo.slice(0, 300));
      return { ok: false, motivo: "recusado" };
    }

    return { ok: true };
  } catch (erro) {
    console.error("[mail] falha ao falar com o Resend:", erro);
    return { ok: false, motivo: "indisponivel" };
  }
}

/**
 * Endereço público do app, para montar o link que vai no e-mail.
 *
 * Lido de `process.env` e não de `import.meta.env` porque isto roda no
 * servidor, em tempo de execução — a mesma variável que o cliente recebe no
 * build serve aqui sem precisar de uma segunda.
 */
export function baseUrlDoApp(): string {
  const configurada = process.env.VITE_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return configurada || "http://localhost:5173";
}
