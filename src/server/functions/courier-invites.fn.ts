import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hashInviteCode, newInviteCode } from "../auth/invite-code";
import { exigirRecurso } from "@/server/billing/guarda-de-recurso";
import { prisma } from "../db/client";

/** Quanto tempo um convite não usado continua valendo. */
const VALIDADE_HORAS = 24;

export const listCourierInvitesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await exigirRecurso("DELIVERY_AVANCADO");
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
    const { storeId } = await exigirRecurso("DELIVERY_AVANCADO");
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
    // Única vez que o código sai do servidor.
    return { ok: true as const, code, invite };
  });

export const revokeCourierInviteFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("DELIVERY_AVANCADO");
    // Só apaga o que ainda não virou conta: um convite usado é o registro de
    // como aquele entregador entrou, e apagá-lo perderia essa trilha.
    const r = await prisma.courierInvite.deleteMany({
      where: { id: data.id, storeId, usedAt: null },
    });
    if (r.count === 0) return { ok: false as const, error: "Este convite já foi usado." };
    return { ok: true as const };
  });

/**
 * Os entregadores desta loja — e só desta. Vem com quantas entregas cada um
 * já está carregando, porque é olhando isso que o dono escolhe a quem passar
 * a próxima em vez de descobrir depois que sobrecarregou um.
 */
export const listCouriersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await exigirRecurso("DELIVERY_AVANCADO");

  const couriers = await prisma.adminUser.findMany({
    where: { storeId, role: "COURIER" },
    // Só por nome. Ordenar por acesso fazia a lista se reordenar a cada
    // clique: quem recebia acesso subia, os outros desciam, e a linha debaixo
    // do cursor virava a de outra pessoa — o dono clicava de novo achando que
    // era o mesmo entregador e mexia em quem não queria.
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
 * Tira o acesso de quem não trabalha mais aqui — ou devolve.
 *
 * Desativa em vez de apagar: o entregador aparece no histórico dos pedidos que
 * levou, e apagar a conta deixaria essas entregas sem dono. Sem sessão nova e
 * sem as antigas: getCurrentAdmin relê o banco a cada pedido, então o cookie
 * que ele já tinha para de valer no mesmo instante.
 */
/**
 * Apaga a conta do entregador de vez.
 *
 * "Tirar acesso" existe para quem saiu de férias ou está de castigo; isto é
 * para o convite mandado errado, o motoboy que nunca chegou a trabalhar e a
 * conta de teste. São situações diferentes, e juntar as duas num botão só
 * faria o dono desativar quando queria apagar.
 *
 * O histórico não vai junto: o nome de quem levou fica copiado no pedido desde
 * o despacho, então as entregas antigas continuam dizendo quem as fez mesmo
 * depois que a conta deixa de existir.
 */
export const deleteCourierFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await exigirRecurso("DELIVERY_AVANCADO");

    // Mesma trava de tirar o acesso, pelo mesmo motivo: a entrega na rua
    // ficaria sem dono, e o pedido travado sem ninguém para marcar entregue.
    const naRua = await prisma.order.count({
      where: { storeId, courierId: data.id, status: "OUT_FOR_DELIVERY" },
    });
    if (naRua > 0) {
      return {
        ok: false as const,
        error: `Este entregador ainda tem ${naRua} entrega(s) em andamento.`,
      };
    }

    // O papel entra na busca: esta tela não apaga o dono nem um gerente.
    const alvo = await prisma.adminUser.findFirst({
      where: { id: data.id, storeId, role: "COURIER" },
      select: { id: true, name: true },
    });
    if (!alvo) return { ok: false as const, error: "Entregador não encontrado." };

    // Rede de segurança: se algum pedido antigo ficou sem a cópia do nome,
    // ela é gravada agora — antes de a conta sumir e não haver mais de onde
    // tirar essa informação.
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
    const { storeId } = await exigirRecurso("DELIVERY_AVANCADO");

    if (!data.isActive) {
      // Deixar entrega na rua com o acesso cortado prende o pedido: ele não
      // teria mais como marcar a entrega, e o dono não veria por quê.
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
      // O papel entra na busca: esta tela não pode desativar o dono.
      where: { id: data.id, storeId, role: "COURIER" },
      data: { isActive: data.isActive },
    });
    if (r.count === 0) return { ok: false as const, error: "Entregador não encontrado." };
    return { ok: true as const };
  });
