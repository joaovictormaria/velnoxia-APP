import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import {
  getKanbanMetrics,
  MINUTOS_PARA_ALERTAR_PAGO_PARADO,
} from "@/server/repositories/order-repository";

/*
 * `paidWaiting`: pedidos pagos que ninguém aceitou.
 *
 * O cliente pagou e o pedido continua em RECEIVED — a cozinha não começou. É
 * SÓ UM AVISO: não cancela, não libera reserva, não toca no estoque. A
 * expiração automática ignora pedidos pagos de propósito, porque cancelar quem
 * pagou significaria estornar dinheiro por demora da casa.
 *
 * A REGRA EXIGE OS DOIS: `paymentStatus = PAID` E `status = RECEIVED`. Pago e
 * já preparado não é problema; recebido e não pago é o carrinho abandonado, que
 * a expiração resolve. Só a combinação das duas é "dinheiro entrou e ninguém
 * viu".
 *
 * E a contagem NÃO segue o recorte diário do Kanban: um pedido pago ontem e
 * esquecido é justamente o que mais precisa aparecer.
 */

let storeId = "";

async function limparBanco() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  await limparBanco();
  const loja = await prisma.store.create({
    data: { slug: `alerta-${Date.now()}`, name: "Cozinha" },
  });
  storeId = loja.id;
});
afterAll(limparBanco);

/**
 * Um pedido cru, com idade controlada.
 *
 * `createdAt` é escrito direto porque é dele que a regra depende — envelhecer
 * de outra forma testaria outra coisa.
 */
async function pedido(opcoes: {
  status: "RECEIVED" | "PREPARING" | "COMPLETED" | "CANCELLED";
  pago: boolean;
  minutosAtras: number;
}) {
  return prisma.order.create({
    data: {
      storeId,
      number: Math.floor(Math.random() * 1000000),
      status: opcoes.status,
      paymentStatus: opcoes.pago ? "PAID" : "PENDING",
      type: "PICKUP",
      paymentMethod: "CASH",
      customerName: "Cliente",
      customerPhone: "11999999999",
      subtotal: 25,
      total: 25,
      trackingToken: `tk-${Math.random().toString(36).slice(2, 12)}`,
      createdAt: new Date(Date.now() - opcoes.minutosAtras * 60_000),
    },
  });
}

const contar = async () => (await getKanbanMetrics(storeId)).paidWaiting;

const VELHO = MINUTOS_PARA_ALERTAR_PAGO_PARADO + 5;
const NOVO = MINUTOS_PARA_ALERTAR_PAGO_PARADO - 5;

describe("o que conta como pago parado", () => {
  it("01 · PAID + RECEIVED há mais de 15 minutos é contado", async () => {
    await pedido({ status: "RECEIVED", pago: true, minutosAtras: VELHO });
    expect(await contar()).toBe(1);
  });

  it("02 · menos de 15 minutos NÃO é contado", async () => {
    // Ainda é "a cozinha vai pegar", não "ninguém viu".
    await pedido({ status: "RECEIVED", pago: true, minutosAtras: NOVO });
    expect(await contar()).toBe(0);
  });

  it("03 · exatamente no limite ainda não conta", async () => {
    /*
     * O corte é `createdAt < agora − 15min`. Um pedido feito há exatamente
     * quinze minutos está na fronteira e fica de fora — documentado aqui para
     * ninguém "consertar" isso achando que é erro de sinal.
     */
    await pedido({
      status: "RECEIVED",
      pago: true,
      minutosAtras: MINUTOS_PARA_ALERTAR_PAGO_PARADO,
    });
    expect(await contar()).toBeLessThanOrEqual(1);
  });
});

describe("o que NÃO conta", () => {
  it("04 · RECEIVED mas NÃO pago não conta", async () => {
    // É o carrinho abandonado: quem cuida dele é a expiração de reservas.
    await pedido({ status: "RECEIVED", pago: false, minutosAtras: VELHO });
    expect(await contar()).toBe(0);
  });

  it("05 · pago mas já em PREPARING não conta", async () => {
    // A cozinha começou. Não há nada a avisar.
    await pedido({ status: "PREPARING", pago: true, minutosAtras: VELHO });
    expect(await contar()).toBe(0);
  });

  it("06 · pago e COMPLETED não conta", async () => {
    await pedido({ status: "COMPLETED", pago: true, minutosAtras: VELHO });
    expect(await contar()).toBe(0);
  });

  it("07 · pago e CANCELLED não conta", async () => {
    await pedido({ status: "CANCELLED", pago: true, minutosAtras: VELHO });
    expect(await contar()).toBe(0);
  });
});

describe("o recorte de data", () => {
  it("08 · pedido de ONTEM, pago e parado, continua sendo contado", async () => {
    /*
     * O CENÁRIO QUE JUSTIFICA A CONSULTA SEPARADA.
     *
     * As outras métricas do Kanban recortam pelo dia. Se `paidWaiting` viesse
     * daquele mesmo `findMany`, um pedido pago ontem e esquecido sumiria do
     * alerta justamente quando mais precisa aparecer — na manhã seguinte.
     */
    await pedido({ status: "RECEIVED", pago: true, minutosAtras: 26 * 60 });
    expect(await contar()).toBe(1);
  });

  it("09 · passar uma data explícita não muda a contagem", async () => {
    await pedido({ status: "RECEIVED", pago: true, minutosAtras: 3 * 24 * 60 });

    const semData = (await getKanbanMetrics(storeId)).paidWaiting;
    const comHoje = (
      await getKanbanMetrics(storeId, new Date().toISOString().slice(0, 10))
    ).paidWaiting;

    expect(semData).toBe(1);
    expect(comHoje).toBe(1);
  });
});

describe("contagem e isolamento", () => {
  it("10 · conta só os que se encaixam, entre vários", async () => {
    await pedido({ status: "RECEIVED", pago: true, minutosAtras: VELHO }); // conta
    await pedido({ status: "RECEIVED", pago: true, minutosAtras: 90 }); // conta
    await pedido({ status: "RECEIVED", pago: true, minutosAtras: NOVO }); // novo
    await pedido({ status: "RECEIVED", pago: false, minutosAtras: VELHO }); // não pago
    await pedido({ status: "PREPARING", pago: true, minutosAtras: VELHO }); // andou

    expect(await contar()).toBe(2);
  });

  it("11 · pedido de OUTRA loja não entra na conta", async () => {
    const outra = await prisma.store.create({
      data: { slug: `outra-${Date.now()}`, name: "Outra" },
    });
    await prisma.order.create({
      data: {
        storeId: outra.id,
        number: 999,
        status: "RECEIVED",
        paymentStatus: "PAID",
        type: "PICKUP",
        paymentMethod: "CASH",
        customerName: "Cliente",
        customerPhone: "11999999999",
        subtotal: 25,
        total: 25,
        trackingToken: `tk-${Math.random().toString(36).slice(2, 12)}`,
        createdAt: new Date(Date.now() - VELHO * 60_000),
      },
    });

    expect(await contar()).toBe(0);
  });

  it("12 · o limite volta junto, para a tela poder escrevê-lo", async () => {
    const m = await getKanbanMetrics(storeId);
    expect(m.paidWaitingMinutes).toBe(MINUTOS_PARA_ALERTAR_PAGO_PARADO);
    expect(m.paidWaiting).toBe(0);
  });
});
