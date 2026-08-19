import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db/client";
import { hashPassword } from "../auth/password";
import { baseUrlDoApp, enviarEmail } from "../mail/resend";

/** Quanto tempo o link vale. Curto porque, enquanto vale, ele é a senha. */
const VALIDADE_MINUTOS = 30;

/**
 * Intervalo mínimo entre dois pedidos da mesma conta.
 *
 * Sem isso, qualquer pessoa que saiba o e-mail de um lojista pode encher a
 * caixa dele apertando o botão — o formulário é público por natureza.
 */
const INTERVALO_MINIMO_SEGUNDOS = 120;

/**
 * O token nunca é guardado, só o hash. Quem ler o banco não consegue redefinir
 * a senha de ninguém. Hash simples basta: o token tem 32 bytes de entropia e
 * vida curta, não é uma senha escolhida por humano.
 */
const hashDoToken = (token: string) => createHash("sha256").update(token).digest("hex");

function corpoDoEmail(nome: string, link: string) {
  const texto = [
    `Olá, ${nome}.`,
    "",
    "Recebemos um pedido para redefinir a senha da sua conta no velnox.app.br — Área do Administrador.",
    "Abra o endereço abaixo para escolher uma nova senha:",
    "",
    link,
    "",
    `O link vale por ${VALIDADE_MINUTOS} minutos e só pode ser usado uma vez.`,
    "Se não foi você quem pediu, ignore esta mensagem — sua senha continua a mesma.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;line-height:1.6">
      <p>Olá, ${nome}.</p>
      <p>Recebemos um pedido para redefinir a senha da sua conta no velnox.app.br — Área do Administrador.</p>
      <p>
        <a href="${link}" style="display:inline-block;background:#E11D2E;color:#fff;
           padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">
          Escolher nova senha
        </a>
      </p>
      <p style="color:#555;font-size:13px">
        Ou copie este endereço: <br>${link}
      </p>
      <p style="color:#555;font-size:13px">
        O link vale por ${VALIDADE_MINUTOS} minutos e só pode ser usado uma vez.<br>
        Se não foi você quem pediu, ignore esta mensagem — sua senha continua a mesma.
      </p>
    </div>`;

  return { texto, html };
}

/**
 * Cria o pedido e manda o e-mail.
 *
 * Não devolve nada sobre a conta de propósito: quem chama responde sempre a
 * mesma coisa, exista ou não o e-mail. Dizer "não encontrado" transformaria
 * este formulário numa lista de quais lojistas estão cadastrados.
 */
export async function pedirRedefinicaoDeSenha(email: string): Promise<void> {
  const usuario = await prisma.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, email: true, isActive: true },
  });
  if (!usuario || !usuario.isActive) return;

  // Um pedido recente ainda válido segura o próximo: o dono acabou de receber
  // um link que funciona, e mandar outro só encheria a caixa dele.
  const recente = await prisma.passwordResetToken.findFirst({
    where: {
      adminUserId: usuario.id,
      usedAt: null,
      createdAt: { gt: new Date(Date.now() - INTERVALO_MINIMO_SEGUNDOS * 1000) },
    },
    select: { id: true },
  });
  if (recente) return;

  /**
   * Pedidos anteriores são queimados. Se o dono clicou três vezes, só o último
   * link deve abrir — os outros ficariam válidos numa caixa de e-mail que ele
   * talvez nem controle mais.
   */
  await prisma.passwordResetToken.updateMany({
    where: { adminUserId: usuario.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      adminUserId: usuario.id,
      tokenHash: hashDoToken(token),
      expiresAt: new Date(Date.now() + VALIDADE_MINUTOS * 60_000),
    },
  });

  const link = `${baseUrlDoApp()}/admin/nova-senha?token=${encodeURIComponent(token)}`;
  const { texto, html } = corpoDoEmail(usuario.name, link);

  await enviarEmail({
    para: usuario.email,
    assunto: "Redefinir a senha do seu painel — velnox.ia",
    texto,
    html,
  });
}

export type ResultadoDaRedefinicao =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Troca a senha, se o token servir.
 *
 * Token inexistente, vencido e já usado respondem igual: distinguir diria a
 * quem estivesse tentando adivinhar que aquele token existe.
 */
export async function redefinirSenha(
  token: string,
  novaSenha: string,
): Promise<ResultadoDaRedefinicao> {
  const recusa = {
    ok: false as const,
    error: "Este link não vale mais. Peça um novo para redefinir sua senha.",
  };

  const pedido = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashDoToken(token) },
    select: { id: true, adminUserId: true, usedAt: true, expiresAt: true },
  });
  if (!pedido || pedido.usedAt || pedido.expiresAt < new Date()) return recusa;

  const passwordHash = await hashPassword(novaSenha);

  /**
   * Queima e troca na mesma transação, e a queima é condicional: o updateMany
   * só acerta a linha que ainda está sem uso. Dois envios simultâneos com o
   * mesmo token — o link clicado duas vezes — não trocam a senha duas vezes.
   */
  try {
    await prisma.$transaction(async (tx) => {
      const queimou = await tx.passwordResetToken.updateMany({
        where: { id: pedido.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (queimou.count === 0) throw new Error("TOKEN_JA_USADO");

      await tx.adminUser.update({
        where: { id: pedido.adminUserId },
        data: { passwordHash },
      });
    });
  } catch {
    return recusa;
  }

  return { ok: true };
}
