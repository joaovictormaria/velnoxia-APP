import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { createOrderFromCheckout, type CheckoutInput } from "@/server/services/order-service";
import {
  authorizeDeviceForSession,
  getOrCreateOpenTableSession,
} from "@/server/services/table-session-service";

/*
 * PIN É PROPRIEDADE DO CONTEXTO DE MESA, NÃO DE UM PEDIDO QUALQUER.
 *
 * A guarda no serviço era `if (deviceToken)`, sem olhar a mesa. Bastava um
 * token velho sobrando no navegador — e nada no sistema apagava aquelas chaves
 * — para um pedido da vitrine PÚBLICA ser recusado com "Sessão de mesa expirou
 * ou PIN inválido". Erro de mesa num pedido que nunca teve mesa.
 *
 * Agora o caminho de mesa só existe com `tableId`. Estes testes trancam as duas
 * pontas: que o público passa sem encostar em PIN, e que a mesa continua com
 * toda a segurança que já tinha.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";

let storeId = "";
let slugDaLoja = "";
let slugDoProduto = "";

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

async function semearUnidades() {
  const sql = readFileSync(
    resolve(__dirname, `../../../../prisma/migrations/${SEED_UNIDADES}/migration.sql`),
    "utf8",
  )
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  await prisma.$executeRawUnsafe(sql);
}

beforeEach(async () => {
  await limparBanco();
  await semearUnidades();

  slugDaLoja = `ctx-${Date.now()}`;
  const loja = await prisma.store.create({ data: { slug: slugDaLoja, name: "Cantina" } });
  storeId = loja.id;
  await prisma.storeSettings.create({
    data: { storeId, whatsappNumber: "11999999999", acceptsDelivery: true, acceptsPickup: true },
  });

  const categoria = await prisma.category.create({
    data: { storeId, name: "Doces", slug: `doces-${Date.now()}`, kind: "SIMPLE" },
  });
  slugDoProduto = `bolo-${Date.now()}`;
  await prisma.product.create({
    data: {
      storeId,
      categoryId: categoria.id,
      name: "Bolo",
      slug: slugDoProduto,
      description: "Bolo",
      basePrice: 25,
    },
  });
});
afterAll(limparBanco);

/** Uma mesa desta loja, com sessão aberta e um aparelho autorizado. */
async function mesaComSessao(numero = 1) {
  const table = await prisma.table.create({
    data: {
      id: `mesa-${numero}-${Date.now()}`,
      storeId,
      number: numero,
      capacity: 4,
      qrcodeUrl: "https://exemplo/qr",
      qrcodeData: "data",
    },
  });
  const sessao = await getOrCreateOpenTableSession(storeId, table.id);
  const aparelho = await authorizeDeviceForSession(storeId, sessao.id, true);
  return { tableId: table.id, sessionId: sessao.id, deviceToken: aparelho.deviceToken };
}

const pedir = (extra: Partial<CheckoutInput> = {}, nome = "João Victor") =>
  createOrderFromCheckout(
    storeId,
    {
      items: [{ productSlug: slugDoProduto, quantity: 1, extraIds: [] }],
      customerName: nome,
      customerPhone: "11999999999",
      type: "PICKUP",
      paymentMethod: "PIX",
      ...extra,
    } as CheckoutInput,
    extra.deviceToken,
  );

const pedidoDe = (orderId: string) =>
  prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { tableId: true, sessionId: true, deviceId: true, customerName: true, type: true },
  });

describe("vitrine pública", () => {
  it("01 · pedido sem contexto de mesa nenhum passa", async () => {
    const r = await pedir();

    expect(r.ok).toBe(true);
  });

  it("02 · não amarra sessão, mesa nem aparelho ao pedido", async () => {
    const r = await pedir();
    if (!r.ok) throw new Error(r.error);

    const pedido = await pedidoDe(r.orderId);
    expect(pedido.tableId).toBeNull();
    expect(pedido.sessionId).toBeNull();
    expect(pedido.deviceId).toBeNull();
  });

  it("03 · o nome do cliente é preservado", async () => {
    // No cliente, "Mesa N" só substitui o nome quando há contexto de mesa; sem
    // ele, quem pediu é quem digitou.
    const r = await pedir({}, "João Victor");
    if (!r.ok) throw new Error(r.error);

    expect((await pedidoDe(r.orderId)).customerName).toBe("João Victor");
  });

  it("04 · entrega continua disponível para o público", async () => {
    /*
     * A vitrine escondia "Entrega" quando havia mesa, e o contexto vazado
     * fazia isso valer para todo mundo. Do lado do servidor, o que prova a
     * separação é DELIVERY passar sem qualquer contexto de mesa.
     */
    const r = await pedir({
      type: "DELIVERY",
      delivery: { street: "Rua A", number: "10", neighborhood: "Centro" },
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect((await pedidoDe(r.orderId)).type).toBe("DELIVERY");
  });

  it("05 · deviceToken SEM tableId é ignorado, e não cria sessão", async () => {
    /*
     * O CASO DO ESTADO ANTIGO. É exatamente o que chegava do navegador de quem
     * já tinha usado uma mesa: token válido, mesa nenhuma. Antes isto era
     * validado e gravava `sessionId` no pedido sem ninguém ter conferido a que
     * mesa aquele token pertencia — a checagem de IDOR exige os dois para
     * comparar, então ela era pulada.
     */
    const mesa = await mesaComSessao();

    const r = await pedir({ deviceToken: mesa.deviceToken });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pedido = await pedidoDe(r.orderId);
    expect(pedido.sessionId).toBeNull();
    expect(pedido.deviceId).toBeNull();
    expect(pedido.tableId).toBeNull();
  });

  it("06 · token de mesa EXPIRADA não derruba o pedido público", async () => {
    // O relato de produção: a sessão tinha vencido, e o pedido público morria
    // com "Sessão de mesa expirou ou PIN inválido".
    const mesa = await mesaComSessao();
    await prisma.tableSession.update({
      where: { id: mesa.sessionId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const r = await pedir({ deviceToken: mesa.deviceToken });

    expect(r.ok).toBe(true);
    if (!r.ok) expect(r.error).not.toContain("PIN");
  });

  it("07 · token de OUTRA loja também é ignorado sem tableId", async () => {
    const outra = await prisma.store.create({
      data: { slug: `outra-${Date.now()}`, name: "Outra" },
    });
    const tableOutra = await prisma.table.create({
      data: {
        id: `mesa-outra-${Date.now()}`,
        storeId: outra.id,
        number: 1,
        capacity: 4,
        qrcodeUrl: "https://exemplo/qr",
        qrcodeData: "data",
      },
    });
    const sessao = await getOrCreateOpenTableSession(outra.id, tableOutra.id);
    const aparelho = await authorizeDeviceForSession(outra.id, sessao.id, true);

    const r = await pedir({ deviceToken: aparelho.deviceToken });

    expect(r.ok).toBe(true);
  });
});

describe("vitrine de mesa — a segurança continua inteira", () => {
  it("08 · mesa com sessão válida e token válido passa, e fica amarrada", async () => {
    const mesa = await mesaComSessao();

    const r = await pedir({ tableId: mesa.tableId, deviceToken: mesa.deviceToken });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pedido = await pedidoDe(r.orderId);
    expect(pedido.tableId).toBe(mesa.tableId);
    expect(pedido.sessionId).toBe(mesa.sessionId);
    expect(pedido.deviceId).not.toBeNull();
  });

  it("09 · sessão EXPIRADA bloqueia o pedido de mesa", async () => {
    /*
     * O teste que impede a correção de virar "PIN opcional para todo mundo".
     * Mesmo contexto do caso 06 — a diferença é o `tableId`, e é só ele que
     * decide se a segurança da mesa participa.
     */
    const mesa = await mesaComSessao();
    await prisma.tableSession.update({
      where: { id: mesa.sessionId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const r = await pedir({ tableId: mesa.tableId, deviceToken: mesa.deviceToken });
    expect(r.ok).toBe(false);

    /*
     * A MENSAGEM NÃO DISTINGUE O MOTIVO, e isso é a asserção.
     *
     * Antes cada falha dizia qual porta bateu — sessão expirada, mesa errada,
     * token inválido. Isso transforma o checkout num oráculo: quem está
     * sondando descobre quais mesas existem e quais tokens ainda valem, uma
     * tentativa por vez. Aqui se compara com o resultado de um token
     * inventado: as duas respostas têm de ser a mesma palavra por palavra.
     */
    const comTokenFalso = await pedir({ tableId: mesa.tableId, deviceToken: "nao-existe" });
    expect(comTokenFalso.ok).toBe(false);
    if (!r.ok && !comTokenFalso.ok) expect(r.error).toBe(comTokenFalso.error);
  });

  it("10 · sessão FECHADA bloqueia o pedido de mesa", async () => {
    const mesa = await mesaComSessao();
    await prisma.tableSession.update({
      where: { id: mesa.sessionId },
      data: { status: "CLOSED" },
    });

    const r = await pedir({ tableId: mesa.tableId, deviceToken: mesa.deviceToken });

    expect(r.ok).toBe(false);
  });

  it("11 · token inventado bloqueia o pedido de mesa", async () => {
    const mesa = await mesaComSessao();

    const r = await pedir({ tableId: mesa.tableId, deviceToken: "token-falso-123" });

    expect(r.ok).toBe(false);
  });

  it("12 · IDOR: token da mesa 1 com a mesa 2 é bloqueado", async () => {
    const mesa1 = await mesaComSessao(1);
    const mesa2 = await mesaComSessao(2);

    const r = await pedir({ tableId: mesa2.tableId, deviceToken: mesa1.deviceToken });

    expect(r.ok).toBe(false);
  });

  it("13 · token de outra loja com mesa desta loja é bloqueado", async () => {
    const mesa = await mesaComSessao();
    const outra = await prisma.store.create({
      data: { slug: `outra2-${Date.now()}`, name: "Outra" },
    });
    const tableOutra = await prisma.table.create({
      data: {
        id: `mesa-o2-${Date.now()}`,
        storeId: outra.id,
        number: 1,
        capacity: 4,
        qrcodeUrl: "https://exemplo/qr",
        qrcodeData: "data",
      },
    });
    const sessao = await getOrCreateOpenTableSession(outra.id, tableOutra.id);
    const aparelho = await authorizeDeviceForSession(outra.id, sessao.id, true);

    const r = await pedir({ tableId: mesa.tableId, deviceToken: aparelho.deviceToken });

    expect(r.ok).toBe(false);
  });

  it("14 · tableId de outra loja é bloqueado", async () => {
    const outra = await prisma.store.create({
      data: { slug: `outra3-${Date.now()}`, name: "Outra" },
    });
    const tableOutra = await prisma.table.create({
      data: {
        id: `mesa-o3-${Date.now()}`,
        storeId: outra.id,
        number: 1,
        capacity: 4,
        qrcodeUrl: "https://exemplo/qr",
        qrcodeData: "data",
      },
    });

    const r = await pedir({ tableId: tableOutra.id });

    expect(r.ok).toBe(false);
  });
});
