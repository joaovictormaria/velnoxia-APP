import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { transitionOrderStatus } from "@/server/services/order-service";

/*
 * O DELIVERY BÁSICO — SEM A ETAPA "SAIU PARA ENTREGA".
 *
 * Decisão comercial (a): o BASIC entrega, mas não gere frota. Seu fluxo é
 *
 *   RECEBIDO → PREPARANDO → CONCLUÍDO
 *
 * e a etapa intermediária pertence ao módulo de entregadores.
 *
 * A regra que sustenta isso é ANTERIOR a este projeto e permanece intocada:
 * `order-service` recusa `OUT_FOR_DELIVERY` num pedido de entrega sem
 * `courierId`. O que esta suíte faz é TRAVAR esse comportamento, porque agora
 * ele deixou de ser acidente e virou característica de plano — se alguém
 * relaxar aquela guarda, o BASIC passaria a despachar sem entregador.
 */

const DIA = 24 * 60 * 60 * 1000;
const futuro = (d: number) => new Date(Date.now() + d * DIA);

async function limpar() {
  const t: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${t.map((x) => `"${x.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(limpar);
afterAll(limpar);

let storeId = "";

/** Uma loja BASIC que aceita entrega, com um pedido de entrega em preparo. */
async function pedidoDeEntregaEmPreparo(plan: "BASIC" | "PREMIUM" | null) {
  const loja = await prisma.store.create({
    data: {
      slug: `entrega-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "Loja de teste",
      status: "ACTIVE",
      paidUntil: futuro(20),
      plan,
      settings: {
        create: {
          storeName: "Loja de teste",
          whatsappNumber: "11999999999",
          acceptsDelivery: true,
        },
      },
    },
    select: { id: true },
  });
  storeId = loja.id;

  const pedido = await prisma.order.create({
    data: {
      storeId,
      number: 1,
      customerName: "Cliente",
      customerPhone: "11988887777",
      type: "DELIVERY",
      status: "PREPARING",
      source: "SITE",
      paymentMethod: "PIX",
      paymentStatus: "PAID",
      subtotal: 50,
      deliveryFee: 6,
      discount: 0,
      total: 56,
      deliveryStreet: "Rua A",
      deliveryNumber: "10",
    },
    select: { id: true },
  });
  return pedido.id;
}

const autor = {
  authorType: "ADMIN" as const,
  authorId: "admin-1",
  authorName: "Dona",
};

describe("BASIC — o pedido de entrega nasce, prepara e conclui", () => {
  it("de PREPARANDO vai direto para CONCLUÍDO", async () => {
    const orderId = await pedidoDeEntregaEmPreparo("BASIC");
    const r = await transitionOrderStatus(storeId, orderId, "COMPLETED", autor);
    expect(r.ok).toBe(true);

    const depois = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, courierId: true },
    });
    expect(depois.status).toBe("COMPLETED");
    expect(depois.courierId).toBeNull();
  });

  /*
   * A TRAVA. Sem entregador, "saiu para entrega" continua recusado — e é isso
   * que torna a decisão (a) verdadeira no servidor, e não só na tela.
   */
  it("OUT_FOR_DELIVERY sem entregador continua recusado", async () => {
    const orderId = await pedidoDeEntregaEmPreparo("BASIC");
    const r = await transitionOrderStatus(storeId, orderId, "OUT_FOR_DELIVERY", autor);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("Escolha quem vai levar");

    const depois = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });
    expect(depois.status).toBe("PREPARING");
  });

  it("a recusa vale para qualquer plano — a regra é de dado, não de plano", async () => {
    for (const plan of ["BASIC", "PREMIUM", null] as const) {
      const orderId = await pedidoDeEntregaEmPreparo(plan);
      const r = await transitionOrderStatus(storeId, orderId, "OUT_FOR_DELIVERY", autor);
      expect(r.ok, `plan=${plan}`).toBe(false);
      await limpar();
    }
  });
});

describe("PREMIUM e TRIAL — com entregador, a entrega sai", () => {
  /** Cria um entregador e o atribui ao pedido, como faz `dispatchOrder`. */
  async function comEntregador(orderId: string) {
    const courier = await prisma.adminUser.create({
      data: {
        storeId,
        name: "Entregador",
        email: `entregador-${Date.now()}@teste.com`,
        passwordHash: "x",
        role: "COURIER",
        isActive: true,
      },
      select: { id: true, name: true },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { courierId: courier.id, courierNameSnapshot: courier.name },
    });
  }

  it("com courierId, OUT_FOR_DELIVERY é aceito", async () => {
    const orderId = await pedidoDeEntregaEmPreparo("PREMIUM");
    await comEntregador(orderId);

    const r = await transitionOrderStatus(storeId, orderId, "OUT_FOR_DELIVERY", autor);
    expect(r.ok).toBe(true);

    const depois = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, courierId: true },
    });
    expect(depois.status).toBe("OUT_FOR_DELIVERY");
    expect(depois.courierId).not.toBeNull();
  });

  it("e de lá conclui normalmente", async () => {
    const orderId = await pedidoDeEntregaEmPreparo("PREMIUM");
    await comEntregador(orderId);
    await transitionOrderStatus(storeId, orderId, "OUT_FOR_DELIVERY", autor);
    const r = await transitionOrderStatus(storeId, orderId, "COMPLETED", autor);
    expect(r.ok).toBe(true);
  });

  it("a loja legada mantém o fluxo completo", async () => {
    const orderId = await pedidoDeEntregaEmPreparo(null);
    await comEntregador(orderId);
    const r = await transitionOrderStatus(storeId, orderId, "OUT_FOR_DELIVERY", autor);
    expect(r.ok).toBe(true);
  });
});

describe("o quadro reflete a decisão", () => {
  const kanban = readFileSync(
    resolve(__dirname, "../../../components/admin/orders/KanbanBoard.tsx"),
    "utf8",
  );

  it("sem frota, a entrega avança como a retirada", () => {
    expect(kanban).toContain('order.type === "PICKUP" || !permiteEntregador');
  });

  it("sem frota, o botão de despacho não aparece", () => {
    expect(kanban).toContain("permiteEntregador && status === \"PREPARING\"");
  });

  it("sem frota, a coluna 'Saiu p/ entrega' some", () => {
    expect(kanban).toContain("mostrarEntrega && permiteEntregador");
  });

  it("o padrão é permissivo — um quadro sem a prop desenha como antes", () => {
    expect(kanban).toContain("permiteEntregador = true");
  });

  it("o quadro não compara plano diretamente", () => {
    expect(kanban).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
    expect(kanban).not.toContain("recursoNoEstado");
  });

  it("quem consulta o plano é a rota, pela camada central", () => {
    const rota = readFileSync(
      resolve(__dirname, "../../../routes/admin/pedidos/index.tsx"),
      "utf8",
    );
    expect(rota).toContain('recursoNoEstado(admin.store.plano, "DELIVERY_AVANCADO")');
    expect(rota).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
  });
});

describe("a criação do pedido de entrega não mudou", () => {
  const fn = (a: string) => readFileSync(resolve(__dirname, "../../functions", a), "utf8");

  it("checkout e balcão não conhecem o módulo de entregadores", () => {
    for (const arquivo of ["storefront-checkout.fn.ts", "balcao.fn.ts"]) {
      expect(fn(arquivo), arquivo).not.toContain("DELIVERY_AVANCADO");
    }
  });

  it("o serviço de pedidos não conhece plano nenhum", () => {
    const servico = readFileSync(
      resolve(__dirname, "../../services/order-service.ts"),
      "utf8",
    );
    expect(servico).not.toContain("exigirRecurso(");
    expect(servico).not.toContain("garantirRecurso(");
    expect(servico).not.toContain("DELIVERY_AVANCADO");
  });
});
