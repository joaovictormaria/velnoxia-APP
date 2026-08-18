import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "../db/client";
import { hashPassword } from "../auth/password";
import { startSessionFor } from "../auth/session";
import { hashInviteCode } from "../auth/invite-code";

/**
 * Redeems an invite: the courier turns a code into their own account.
 *
 * This is the one door that grants access without a previous password, so every
 * check below is deliberate. Public on purpose — whoever uses it has no account
 * yet — and the code is the whole authorisation.
 */
export const redeemCourierInviteFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().trim().min(6).max(16),
      name: z.string().trim().min(2, "Informe seu nome.").max(60),
      email: z.string().trim().toLowerCase().email("E-mail inválido."),
      password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(72),
    }),
  )
  .handler(async ({ data }) => {
    const invite = await prisma.courierInvite.findUnique({
      where: { codeHash: hashInviteCode(data.code) },
    });

    // Código inexistente, vencido e já usado respondem igual. Distinguir diria
    // a quem estivesse tentando adivinhar que aquele código existe.
    const recusa = { ok: false as const, error: "Código inválido ou expirado." };
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) return recusa;

    // O e-mail identifica a conta no login, então não pode colidir com outra
    // da mesma loja — nem do dono, nem de outro entregador.
    const jaExiste = await prisma.adminUser.findFirst({
      where: { storeId: invite.storeId, email: data.email },
      select: { id: true },
    });
    if (jaExiste) {
      return { ok: false as const, error: "Já existe uma conta com esse e-mail nesta loja." };
    }

    const passwordHash = await hashPassword(data.password);

    /**
     * Conta e queima do convite na mesma transação, e a queima é condicional:
     * o updateMany só acerta a linha que ainda está sem uso. Se dois envios
     * chegarem juntos com o mesmo código, um deles não encontra a linha livre e
     * a transação inteira volta atrás — em vez de nascerem duas contas.
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
