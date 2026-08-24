import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hashInviteCode, newInviteCode } from "../auth/invite-code";
import { requireAdminSession } from "../auth/session";
import { prisma } from "../db/client";

/** Quanto tempo um convite nÃ£o usado continua valendo. */
const VALIDADE_HORAS = 24;

export const listCourierInvitesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  const invites = await prisma.courierInvite.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, name: true, expiresAt: true, usedAt: true, createdAt: true },
  });
  // O cÃ³digo nÃ£o volta: ele sÃ³ existiu na tela em que foi criado. Se o dono
  // perdeu, gera outro â€” Ã© mais seguro que poder consultÃ¡-lo depois.
  return invites;
});

export const createCourierInviteFn = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().min(2, "Informe o nome do entregador.").max(60) }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const code = newInviteCode();
    const invite = await prisma.courierInvite.create({
      data: {
        storeId,
        name: data.name,
        codeHash: hashInviteCode(code),
        expiresAt: new Date(Date.now() + VALIDADE_HORAS * 60 * 60 * 1000),
      },
      select: { id: true, name: true, expiresAt: true },
    });
    // Ãšnica vez que o cÃ³digo sai do servidor.
    return { ok: true as const, code, invite };
  });

export const revokeCourierInviteFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    // SÃ³ apaga o que ainda nÃ£o virou conta: um convite usado Ã© o registro de
    // como aquele entregador entrou, e apagÃ¡-lo perderia essa trilha.
    const r = await prisma.courierInvite.deleteMany({
      where: { id: data.id, storeId, usedAt: null },
    });
    if (r.count === 0) return { ok: false as const, error: "Este convite jÃ¡ foi usado." };
    return { ok: true as const };
  });

/**
 * Os entregadores desta loja â€” e sÃ³ desta. Vem com quantas entregas cada um
 * jÃ¡ estÃ¡ carregando, porque Ã© olhando isso que o dono escolhe a quem passar
 * a prÃ³xima em vez de descobrir depois que sobrecarregou um.
 */
export const listCouriersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();

  const couriers = await prisma.adminUser.findMany({
    where: { storeId, role: "COURIER" },
    // SÃ³ por nome. Ordenar por acesso fazia a lista se reordenar a cada
    // clique: quem recebia acesso subia, os outros desciam, e a linha debaixo
    // do cursor virava a de outra pessoa â€” o dono clicava de novo achando que
    // era o mesmo entregador e mexia em quem nÃ£o queria.
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, isActive: true, createdAt: true, lastLoginAt: true },
  });

  const emRota = await prisma.order.groupBy({
    by: ["courierId"],
    where: { storeId, status: "OUT_FOR_DELIVERY", courierId: { not: null } },
    _count: { _all: true },
  });
  const carga = new Map(emRota.map((linha) => [linha.courierId, linha._count._all]));

  return couriers.map((c) => ({ ...c, activeDeliveries: carga.get(c.id) ?? 0 }));
});

/**
 * Tira o acesso de quem nÃ£o trabalha mais aqui â€” ou devolve.
 *
 * Desativa em vez de apagar: o entregador aparece no histÃ³rico dos pedidos que
 * levou, e apagar a conta deixaria essas entregas sem dono. Sem sessÃ£o nova e
 * sem as antigas: getCurrentAdmin relÃª o banco a cada pedido, entÃ£o o cookie
 * que ele jÃ¡ tinha para de valer no mesmo instante.
 */
/**
 * Apaga a conta do entregador de vez.
 *
 * "Tirar acesso" existe para quem saiu de fÃ©rias ou estÃ¡ de castigo; isto Ã©
 * para o convite mandado errado, o motoboy que nunca chegou a trabalhar e a
 * conta de teste. SÃ£o situaÃ§Ãµes diferentes, e juntar as duas num botÃ£o sÃ³
 * faria o dono desativar quando queria apagar.
 *
 * O histÃ³rico nÃ£o vai junto: o nome de quem levou fica copiado no pedido desde
 * o despacho, entÃ£o as entregas antigas continuam dizendo quem as fez mesmo
 * depois que a conta deixa de existir.
 */
export const deleteCourierFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();

    // Mesma trava de tirar o acesso, pelo mesmo motivo: a entrega na rua
    // ficaria sem dono, e o pedido travado sem ninguÃ©m para marcar entregue.
    const naRua = await prisma.order.count({
      where: { storeId, courierId: data.id, status: "OUT_FOR_DELIVERY" },
    });
    if (naRua > 0) {
      return {
        ok: false as const,
        error: `Este entregador ainda tem ${naRua} entrega(s) em andamento.`,
      };
    }

    // O papel entra na busca: esta tela nÃ£o apaga o dono nem um gerente.
    const alvo = await prisma.adminUser.findFirst({
      where: { id: data.id, storeId, role: "COURIER" },
      select: { id: true, name: true },
    });
    if (!alvo) return { ok: false as const, error: "Entregador nÃ£o encontrado." };

    // Rede de seguranÃ§a: se algum pedido antigo ficou sem a cÃ³pia do nome,
    // ela Ã© gravada agora â€” antes de a conta sumir e nÃ£o haver mais de onde
    // tirar essa informaÃ§Ã£o.
    await prisma.order.updateMany({
      where: { storeId, courierId: alvo.id, courierNameSnapshot: null },
      data: { courierNameSnapshot: alvo.name },
    });

    await prisma.adminUser.delete({ where: { id: alvo.id } });
    return { ok: true as const, name: alvo.name };
  });

export const setCourierActiveFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), isActive: z.boolean() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();

    if (!data.isActive) {
      // Deixar entrega na rua com o acesso cortado prende o pedido: ele nÃ£o
      // teria mais como marcar a entrega, e o dono nÃ£o veria por quÃª.
      const naRua = await prisma.order.count({
        where: { storeId, courierId: data.id, status: "OUT_FOR_DELIVERY" },
      });
      if (naRua > 0) {
        return {
          ok: false as const,
          error: `Este entregador ainda tem ${naRua} entrega(s) em andamento.`,
        };
      }
    }

    const r = await prisma.adminUser.updateMany({
      // O papel entra na busca: esta tela nÃ£o pode desativar o dono.
      where: { id: data.id, storeId, role: "COURIER" },
      data: { isActive: data.isActive },
    });
    if (r.count === 0) return { ok: false as const, error: "Entregador nÃ£o encontrado." };
    return { ok: true as const };
  });
