import { createServerFn } from "@tanstack/react-start";
import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { prisma } from "../db/client";

/** Sem 0/O e 1/I: o código é lido em voz alta ou copiado de um papel. */
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TAMANHO = 8;

/** Quanto tempo um convite não usado continua valendo. */
const VALIDADE_HORAS = 24;

function novoCodigo() {
  let s = "";
  for (let i = 0; i < TAMANHO; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

/**
 * O código nunca é guardado — só o hash. Quem ler o banco não consegue usar um
 * convite pendente. Como o código tem entropia suficiente e vida curta, o hash
 * simples basta aqui; não é uma senha escolhida por humano.
 */
export const hashInviteCode = (code: string) =>
  createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

export const listCourierInvitesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  const invites = await prisma.courierInvite.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, name: true, expiresAt: true, usedAt: true, createdAt: true },
  });
  // O código não volta: ele só existiu na tela em que foi criado. Se o dono
  // perdeu, gera outro — é mais seguro que poder consultá-lo depois.
  return invites;
});

export const createCourierInviteFn = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().min(2, "Informe o nome do entregador.").max(60) }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const code = novoCodigo();
    const invite = await prisma.courierInvite.create({
      data: {
        storeId,
        name: data.name,
        codeHash: hashInviteCode(code),
        expiresAt: new Date(Date.now() + VALIDADE_HORAS * 60 * 60 * 1000),
      },
      select: { id: true, name: true, expiresAt: true },
    });
    // Única vez que o código sai do servidor.
    return { ok: true as const, code, invite };
  });

export const revokeCourierInviteFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    // Só apaga o que ainda não virou conta: um convite usado é o registro de
    // como aquele entregador entrou, e apagá-lo perderia essa trilha.
    const r = await prisma.courierInvite.deleteMany({
      where: { id: data.id, storeId, usedAt: null },
    });
    if (r.count === 0) return { ok: false as const, error: "Este convite já foi usado." };
    return { ok: true as const };
  });

export const listCouriersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return prisma.adminUser.findMany({
    where: { storeId, role: "COURIER" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, createdAt: true },
  });
});
