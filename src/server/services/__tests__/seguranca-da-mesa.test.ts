import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { createOrderFromCheckout, type CheckoutInput } from "@/server/services/order-service";
import {
  authorizeDeviceForSession,
  getOrCreateOpenTableSession,
  validateTableSessionPin,
  validateDeviceToken,
} from "@/server/services/table-session-service";
import { orchestrateTableSession } from "@/server/services/table-session-orchestrator";

/*
 * O ATACANTE CONTROLA TUDO QUE VEM DO NAVEGADOR.
 *
 * Estes testes chamam os serviços direto, sem passar por React, porque é assim
 * que o ataque acontece: `curl` com o payload que o atacante quiser. Ele pode
 * inventar `tableId`, `deviceToken`, `sessionId` e `storeSlug`.
 *
 * O `tableId` NÃO é segredo — vem impresso no QR colado na mesa, é permanente
 * e aparece na URL pública. Quem sentou ali uma vez o conhece para sempre. Toda
 * a suíte parte disso: conhecer o `tableId` não pode valer autorização.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";

let lojaA = "";
let slugA = "";
let produtoA = "";
let lojaB = "";
let produtoB = "";

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

async function montarLoja(prefixo: string) {
  const slug = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const loja = await prisma.store.create({ data: { slug, name: prefixo } });
  await prisma.storeSettings.create({
    data: {
      storeId: loja.id,
      whatsappNumber: "11999999999",
      acceptsDelivery: true,
      acceptsPickup: true,
    },
  });
  const categoria = await prisma.category.create({
    data: {
      storeId: loja.id,
      name: "Doces",
      slug: `d-${Math.random().toString(36).slice(2, 8)}`,
      kind: "SIMPLE",
    },
  });
  const produto = `bolo-${Math.random().toString(36).slice(2, 8)}`;
  await prisma.product.create({
    data: {
      storeId: loja.id,
      categoryId: categoria.id,
      name: "Bolo",
      slug: produto,
      description: "Bolo",
      basePrice: 25,
    },
  });
  return { id: loja.id, slug, produto };
}

beforeEach(async () => {
  await limparBanco();
  await semearUnidades();
  const a = await montarLoja("lojaA");
  lojaA = a.id;
  slugA = a.slug;
  produtoA = a.produto;
  const b = await montarLoja("lojaB");
  lojaB = b.id;
  produtoB = b.produto;
});
afterAll(limparBanco);

/** Uma mesa vazia, sem sessão nenhuma. */
async function mesaCrua(storeId: string, numero: number) {
  return prisma.table.create({
    data: {
      id: crypto.randomUUID(),
      storeId,
      number: numero,
      capacity: 4,
      qrcodeUrl: "https://exemplo/qr",
      qrcodeData: "data",
    },
  });
}

/** Mesa com sessão aberta e um aparelho já autorizado. */
async function mesaEmUso(storeId: string, numero: number) {
  const t = await mesaCrua(storeId, numero);
  const sessao = await getOrCreateOpenTableSession(storeId, t.id);
  const aparelho = await authorizeDeviceForSession(storeId, sessao.id, true);
  return { tableId: t.id, sessionId: sessao.id, deviceToken: aparelho.deviceToken };
}

/** Um pedido com o carrinho mínimo; o resto vem de quem chama. */
const pedir = (storeId: string, produto: string, extra: Partial<CheckoutInput> = {}) =>
  createOrderFromCheckout(
    storeId,
    {
      items: [{ productSlug: produto, quantity: 1, extraIds: [] }],
      customerName: "Cliente",
      customerPhone: "11999999999",
      type: "PICKUP",
      paymentMethod: "PIX",
      ...extra,
    } as CheckoutInput,
    extra.deviceToken,
  );

const pedidoDe = (id: string) =>
  prisma.order.findUniqueOrThrow({
    where: { id },
    select: { tableId: true, sessionId: true, deviceId: true },
  });

// ─────────────────────────────────────────── V1

describe("V1 · tableId não é credencial", () => {
  it("01 · SOMENTE tableId, sem token → BLOQUEIA", async () => {
    /*
     * A VULNERABILIDADE CONFIRMADA NA AUDITORIA. Aceitava, e gravava o pedido
     * amarrado à mesa com `sessionId` e `deviceId` nulos: consumo lançado na
     * conta de quem estivesse sentado ali, de qualquer lugar do mundo.
     */
    const mesa = await mesaEmUso(lojaA, 1);

    const r = await pedir(lojaA, produtoA, { tableId: mesa.tableId });

    expect(r.ok).toBe(false);
    expect(await prisma.order.count()).toBe(0);
  });

  it("02 · tableId de mesa SEM sessão alguma → BLOQUEIA", async () => {
    const t = await mesaCrua(lojaA, 9);

    const r = await pedir(lojaA, produtoA, { tableId: t.id });

    expect(r.ok).toBe(false);
  });

  it("03 · tableId de mesa com sessão EXPIRADA, sem token → BLOQUEIA", async () => {
    const mesa = await mesaEmUso(lojaA, 1);
    await prisma.tableSession.update({
      where: { id: mesa.sessionId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const r = await pedir(lojaA, produtoA, { tableId: mesa.tableId });

    expect(r.ok).toBe(false);
  });

  it("04 · tableId inexistente → BLOQUEIA", async () => {
    const mesa = await mesaEmUso(lojaA, 1);

    const r = await pedir(lojaA, produtoA, {
      tableId: crypto.randomUUID(),
      deviceToken: mesa.deviceToken,
    });

    expect(r.ok).toBe(false);
  });

  it("05 · token inventado → BLOQUEIA", async () => {
    const mesa = await mesaEmUso(lojaA, 1);

    const r = await pedir(lojaA, produtoA, {
      tableId: mesa.tableId,
      deviceToken: "token-inventado-123",
    });

    expect(r.ok).toBe(false);
  });

  it("06 · token de sessão EXPIRADA → BLOQUEIA", async () => {
    const mesa = await mesaEmUso(lojaA, 1);
    await prisma.tableSession.update({
      where: { id: mesa.sessionId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const r = await pedir(lojaA, produtoA, {
      tableId: mesa.tableId,
      deviceToken: mesa.deviceToken,
    });

    expect(r.ok).toBe(false);
  });

  it("07 · token de sessão ENCERRADA → BLOQUEIA", async () => {
    const mesa = await mesaEmUso(lojaA, 1);
    await prisma.tableSession.update({
      where: { id: mesa.sessionId },
      data: { status: "CLOSED" },
    });

    const r = await pedir(lojaA, produtoA, {
      tableId: mesa.tableId,
      deviceToken: mesa.deviceToken,
    });

    expect(r.ok).toBe(false);
  });

  it("08 · SEM rebaixamento silencioso: tableId sem token não vira público", async () => {
    /*
     * Ignorar o `tableId` e deixar passar como pedido público esconderia tanto
     * o ataque quanto o defeito legítimo. O cliente pediu como mesa; se não dá
     * para provar a mesa, a resposta é erro — não outra coisa, calada.
     */
    const mesa = await mesaEmUso(lojaA, 1);

    const r = await pedir(lojaA, produtoA, { tableId: mesa.tableId });

    expect(r.ok).toBe(false);
    expect(await prisma.order.count()).toBe(0);
  });

  it("09 · mesa legítima com token válido → ACEITA e amarra a cadeia", async () => {
    const mesa = await mesaEmUso(lojaA, 1);

    const r = await pedir(lojaA, produtoA, {
      tableId: mesa.tableId,
      deviceToken: mesa.deviceToken,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = await pedidoDe(r.orderId);
    expect(p.tableId).toBe(mesa.tableId);
    expect(p.sessionId).toBe(mesa.sessionId);
    expect(p.deviceId).not.toBeNull();
  });

  it("10 · a mensagem de erro não entrega qual porta bateu", async () => {
    // Mensagens diferentes por motivo viram oráculo: o atacante descobre quais
    // mesas existem e quais tokens valem, uma tentativa por vez.
    const mesa = await mesaEmUso(lojaA, 1);
    const outra = await mesaEmUso(lojaA, 2);

    const semToken = await pedir(lojaA, produtoA, { tableId: mesa.tableId });
    const tokenFalso = await pedir(lojaA, produtoA, {
      tableId: mesa.tableId,
      deviceToken: "xxx",
    });
    const mesaInexistente = await pedir(lojaA, produtoA, {
      tableId: crypto.randomUUID(),
      deviceToken: mesa.deviceToken,
    });
    const tokenDeOutraMesa = await pedir(lojaA, produtoA, {
      tableId: mesa.tableId,
      deviceToken: outra.deviceToken,
    });

    const erros = [semToken, tokenFalso, mesaInexistente, tokenDeOutraMesa].map((r) =>
      r.ok ? "ACEITOU" : r.error,
    );
    expect(new Set(erros).size).toBe(1);
    expect(erros[0]).not.toBe("ACEITOU");
  });
});

// ─────────────────────────────────────────── IDOR e lojas

describe("IDOR e isolamento entre lojas", () => {
  it("11 · mesa A + token da mesa B → BLOQUEIA", async () => {
    const a = await mesaEmUso(lojaA, 1);
    const b = await mesaEmUso(lojaA, 2);

    const r = await pedir(lojaA, produtoA, { tableId: a.tableId, deviceToken: b.deviceToken });

    expect(r.ok).toBe(false);
  });

  it("12 · mesa da loja A + token da loja B → BLOQUEIA", async () => {
    const a = await mesaEmUso(lojaA, 1);
    const b = await mesaEmUso(lojaB, 1);

    const r = await pedir(lojaA, produtoA, { tableId: a.tableId, deviceToken: b.deviceToken });

    expect(r.ok).toBe(false);
  });

  it("13 · mesa da loja A pedindo na loja B → BLOQUEIA", async () => {
    const a = await mesaEmUso(lojaA, 1);

    const r = await pedir(lojaB, produtoB, { tableId: a.tableId, deviceToken: a.deviceToken });

    expect(r.ok).toBe(false);
  });
});

// ─────────────────────────────────────────── V2

describe("V2 · o token só nasce da cadeia do PIN", () => {
  it("14 · não existe endpoint público que emita token só com sessionId", async () => {
    /*
     * `authorizeDeviceForSessionFn` e `authorizeFirstDeviceFn` eram públicas,
     * sem PIN e sem autenticação, e devolviam um token válido para qualquer
     * `sessionId`. Nenhuma tinha consumidor — eram caminho paralelo e morto,
     * mas continuavam sendo rota HTTP viva.
     *
     * O teste olha o módulo exportado: se alguém reintroduzir uma dessas, ele
     * quebra. `authorizeDeviceForSession` continua existindo como SERVIÇO
     * interno, chamado pela validação de PIN e pelo orquestrador.
     */
    const fns = await import("@/server/functions/table-session.fn");
    const expostas = Object.keys(fns);

    expect(expostas).not.toContain("authorizeDeviceForSessionFn");
    expect(expostas).not.toContain("authorizeFirstDeviceFn");
    expect(expostas).not.toContain("createTableSessionFn");
    expect(expostas).not.toContain("getOrCreateTableSessionFn");
    // A porta legítima continua de pé.
    expect(expostas).toContain("validateTableSessionPinFn");
  });

  it("15 · PIN errado não autoriza aparelho", async () => {
    const mesa = await mesaEmUso(lojaA, 1);

    const r = await validateTableSessionPin(lojaA, mesa.sessionId, "0000");

    // 1 em 10.000 de o PIN sorteado ser 0000; se acertar, o outro palpite falha.
    if (r.ok) {
      const r2 = await validateTableSessionPin(lojaA, mesa.sessionId, "1111");
      expect(r2.ok).toBe(false);
    } else {
      expect(r.ok).toBe(false);
    }
  });

  it("16 · PIN certo autoriza, e o token resultante vale", async () => {
    const t = await mesaCrua(lojaA, 1);
    const aberta = await orchestrateTableSession(lojaA, t.id);
    expect(aberta.firstDevice).toBe(true);
    const pin = aberta.pin!;
    expect(pin).toMatch(/^\d{4}$/);

    const r = await validateTableSessionPin(lojaA, aberta.sessionId, pin);
    expect(r.ok).toBe(true);

    const segundo = await authorizeDeviceForSession(lojaA, aberta.sessionId, false);
    expect(await validateDeviceToken(lojaA, segundo.deviceToken)).not.toBeNull();
  });
});

// ─────────────────────────────────────────── V3

describe("V3 · 'sem pedidos' não é prova de presença", () => {
  it("17 · mesa em uso: segundo chamador NÃO recebe token", async () => {
    /*
     * O ATAQUE QUE ISTO FECHA. Com `!hasActiveOrders → isFirstDevice`, quem
     * conhecesse o `tableId` chamava o orquestrador de casa e recebia um token
     * sem PIN — mesmo com clientes sentados na mesa.
     *
     * Com um pedido ativo, o intruso é segundo aparelho: só sessionId, e o PIN
     * fica entre ele e a autorização.
     */
    const t = await mesaCrua(lojaA, 1);
    const dono = await orchestrateTableSession(lojaA, t.id);
    expect(dono.firstDevice).toBe(true);

    await pedir(lojaA, produtoA, { tableId: t.id, deviceToken: dono.deviceToken! });

    const intruso = await orchestrateTableSession(lojaA, t.id);

    expect(intruso.firstDevice).toBe(false);
    expect(intruso.deviceToken).toBeUndefined();
    expect(intruso.pin).toBeUndefined();
    expect(intruso.sessionId).toBe(dono.sessionId);
  });

  it("18 · sessão ociosa: encerra a antiga e abre outra, com PIN novo", async () => {
    /*
     * O motivo pelo qual o atalho existia: sessão dura 24h, então a do almoço
     * ainda está OPEN no jantar e o cliente novo virava "segundo aparelho",
     * preso atrás de um PIN que nunca recebeu.
     *
     * A troca é no CICLO DE VIDA, não na autorização: a sessão parada é
     * encerrada e nasce outra. O cliente novo entra como primeiro aparelho pelo
     * caminho normal.
     */
    const t = await mesaCrua(lojaA, 1);
    const antiga = await orchestrateTableSession(lojaA, t.id);

    const nova = await orchestrateTableSession(lojaA, t.id);

    expect(nova.sessionId).not.toBe(antiga.sessionId);
    expect(nova.firstDevice).toBe(true);
    expect(nova.pin).toMatch(/^\d{4}$/);
    expect(nova.pin).not.toBe(antiga.pin);

    const encerrada = await prisma.tableSession.findUniqueOrThrow({
      where: { id: antiga.sessionId },
      select: { status: true, closedAt: true },
    });
    expect(encerrada.status).toBe("CLOSED");
    expect(encerrada.closedAt).not.toBeNull();
  });

  it("19 · a sessão encerrada para de autorizar seus aparelhos", async () => {
    // Regra 6: token da sessão anterior morre junto com ela.
    const t = await mesaCrua(lojaA, 1);
    const antiga = await orchestrateTableSession(lojaA, t.id);
    const tokenAntigo = antiga.deviceToken!;

    await orchestrateTableSession(lojaA, t.id); // encerra a ociosa

    expect(await validateDeviceToken(lojaA, tokenAntigo)).toBeNull();

    const r = await pedir(lojaA, produtoA, { tableId: t.id, deviceToken: tokenAntigo });
    expect(r.ok).toBe(false);
  });

  it("20 · o pedido ativo segura a sessão: ela não é encerrada por baixo", async () => {
    const t = await mesaCrua(lojaA, 1);
    const dono = await orchestrateTableSession(lojaA, t.id);
    await pedir(lojaA, produtoA, { tableId: t.id, deviceToken: dono.deviceToken! });

    await orchestrateTableSession(lojaA, t.id);

    const sessao = await prisma.tableSession.findUniqueOrThrow({
      where: { id: dono.sessionId },
      select: { status: true },
    });
    expect(sessao.status).toBe("OPEN");
    // E o token de quem está na mesa continua servindo.
    expect(await validateDeviceToken(lojaA, dono.deviceToken!)).not.toBeNull();
  });
});

// ─────────────────────────────────────────── V4

describe("V4 · teto de tentativas nos endpoints de mesa", () => {
  it("24 · o limitador corta a rajada e libera depois da janela", async () => {
    // O mecanismo em si, exercitado de verdade. `permitido()` é só açúcar
    // sobre isto, montando a chave com o endpoint e a origem da chamada.
    const { dentroDoLimite } = await import("@/server/security/rate-limit");
    const chave = `audit-mesa-${Date.now()}`;

    expect(dentroDoLimite(chave, 3, 60_000)).toBe(true);
    expect(dentroDoLimite(chave, 3, 60_000)).toBe(true);
    expect(dentroDoLimite(chave, 3, 60_000)).toBe(true);
    expect(dentroDoLimite(chave, 3, 60_000)).toBe(false);

    // Janela de 1ms: a próxima chamada já cai noutra janela.
    await new Promise((r) => setTimeout(r, 5));
    expect(dentroDoLimite(`${chave}-curta`, 1, 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(dentroDoLimite(`${chave}-curta`, 1, 1)).toBe(true);
  });

  it("25 · os três endpoints públicos de mesa estão ligados ao limitador", async () => {
    /*
     * Asserção ESTRUTURAL, e é uma escolha consciente: `permitido()` lê o IP do
     * contexto da requisição, que não existe num teste de node — chamar a
     * server function aqui falharia por falta de request, não por segurança.
     *
     * Então o que se tranca é a ligação: se alguém tirar o teto de um destes
     * endpoints, este teste quebra. O comportamento do limitador é provado no
     * caso 24.
     */
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync(
      resolve(__dirname, "../../functions/table-session.fn.ts"),
      "utf8",
    );

    for (const chave of ["mesa-pin", "mesa-sessao", "mesa-pin-hint"]) {
      expect(fonte).toContain(`permitido("${chave}"`);
    }
    // Um teto por endpoint: gastar o do PIN não pode zerar o da orquestração.
    expect(new Set(["mesa-pin", "mesa-sessao", "mesa-pin-hint"]).size).toBe(3);
  });
});

// ─────────────────────────────────────────── Público

describe("o fluxo público segue intocado", () => {
  it("21 · sem nada de mesa → ACEITA, e nada é amarrado", async () => {
    const r = await pedir(lojaA, produtoA);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = await pedidoDe(r.orderId);
    expect(p.tableId).toBeNull();
    expect(p.sessionId).toBeNull();
    expect(p.deviceId).toBeNull();
  });

  it("22 · com token de mesa mas sem tableId → ACEITA como público", async () => {
    // O estado antigo que sobrava no navegador. Sem `tableId` não há mesa, e o
    // token não é sequer consultado.
    const mesa = await mesaEmUso(lojaA, 1);

    const r = await pedir(lojaA, produtoA, { deviceToken: mesa.deviceToken });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = await pedidoDe(r.orderId);
    expect(p.sessionId).toBeNull();
    expect(p.deviceId).toBeNull();
  });

  it("23 · entrega continua liberada no público", async () => {
    const r = await pedir(lojaA, produtoA, {
      type: "DELIVERY",
      delivery: { street: "Rua A", number: "10", neighborhood: "Centro" },
    });

    expect(r.ok).toBe(true);
  });
});
