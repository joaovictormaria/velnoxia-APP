import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "../db/client";
import { hashPassword } from "../auth/password";
import { startSessionFor } from "../auth/session";
import { hashInviteCode } from "../auth/invite-code";
import { permitido } from "../security/rate-limit";

/**
 * Redeems an invite: the courier turns a code into their own account.
 *
 * This is the one door that grants access without a previous password, so every
 * check below is deliberate. Public on purpose â€” whoever uses it has no account
 * yet â€” and the code is the whole authorisation.
 */
export const redeemCourierInviteFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(6).max(16),
      name: z.string().trim().min(2, "Informe seu nome.").max(60),
      email: z.string().trim().toLowerCase().email("E-mail invÃ¡lido."),
      password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(72),
    }),
  )
  .handler(async ({ data }) => {
    // O codigo tem 8 caracteres de um alfabeto de 32 (~2^40). Sem teto, um
    // script poderia varre-lo; 5 por minuto por origem torna isso inviavel.
    if (!permitido("courier-invite", { max: 5, janelaMs: 60_000 })) {
      return { ok: false as const, error: "Muitas tentativas. Espere um minuto." };
    }
    const invite = await prisma.courierInvite.findUnique({
      where: { codeHash: hashInviteCode(data.code) },
    });

    // CÃ³digo inexistente, vencido e jÃ¡ usado respondem igual. Distinguir diria
    // a quem estivesse tentando adivinhar que aquele cÃ³digo existe.
    const recusa = { ok: false as const, error: "CÃ³digo invÃ¡lido ou expirado." };
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) return recusa;

    // O e-mail identifica a conta no login, entÃ£o nÃ£o pode colidir com outra
    // da mesma loja â€” nem do dono, nem de outro entregador.
    const jaExiste = await prisma.adminUser.findFirst({
      where: { storeId: invite.storeId, email: data.email },
      select: { id: true },
    });
    if (jaExiste) {
      return { ok: false as const, error: "JÃ¡ existe uma conta com esse e-mail nesta loja." };
    }

    const passwordHash = await hashPassword(data.password);

    /**
     * Conta e queima do convite na mesma transaÃ§Ã£o, e a queima Ã© condicional:
     * o updateMany sÃ³ acerta a linha que ainda estÃ¡ sem uso. Se dois envios
     * chegarem juntos com o mesmo cÃ³digo, um deles nÃ£o encontra a linha livre e
     * a transaÃ§Ã£o inteira volta atrÃ¡s â€” em vez de nascerem duas contas.
     */
    try {
      const courier = await prisma.$transaction(async (tx) => {
        const queimou = await tx.courierInvite.updateMany({
          where: { id: invite.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (queimou.count === 0) throw new Error("INVITE_JA_USADO");

        const created = await tx.adminUser.create({
          data: {
            storeId: invite.storeId,
            name: data.name,
            email: data.email,
            passwordHash,
            role: "COURIER",
          },
          select: { id: true },
        });

        await tx.courierInvite.update({
          where: { id: invite.id },
          data: { usedById: created.id },
        });

        return created;
      });

      await startSessionFor(courier.id);
      return { ok: true as const };
    } catch {
      return recusa;
    }
  });
