import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { consumoDosFuncionarios } from "@/server/repositories/employee-repository";
import { transitionOrderStatus } from "@/server/services/order-service";

/*
 * O FECHAMENTO DA FOLHA.
 *
 * O sistema entregava comida a funcionário e não tinha tela que dissesse quanto
 * descontar no fim do mês. Concluir um pedido quita o pagamento — MENOS quando
 * o método é `PAYROLL`, que fica `PENDING` de propósito, porque o acerto é no
 * salário. Ninguém somava esses pendentes.
 *
 * DOIS NÚMEROS DE NATUREZAS DIFERENTES convivem aqui, e trocá-los seria o erro
 * caro:
 *
 *   beneficioConcedido   desconto que a loja DEU. Já está dentro de
 *                        `Order.total`; é receita de que ela abriu mão.
 *   aDescontarEmFolha    o que o funcionário DEVE, a lançar no salário.
 *
 * O recorte é o financeiro — `COMPLETED` + `deletedAt IS NULL` — e não o
 * operacional da cota diária, onde um pedido em preparo já conta.
 */

let storeId = "";
let outraLojaId = "";
let categoriaId = "";
let produtoId = "";
let numero = 1;

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
  numero = 1;

  storeId = (await prisma.store.create({
    data: { slug: `folha-${Date.now()}`, name: "Cozinha" },
  })).id;
  outraLojaId = (await prisma.store.create({
    data: { slug: `outra-${Date.now()}`, name: "Outra" },
  })).id;

  categoriaId = (await prisma.category.create({
    data: { storeId, name: "Lanches", slug: `ln-${Date.now()}`, kind: "SIMPLE" },
  })).id;
  produtoId = (await prisma.product.create({
    data: {
      storeId, categoryId: categoriaId, name: "Lanche",
      slug: `lc-${Date.now()}`, description: "", basePrice: 30,
    },
  })).id;
});
afterAll(limparBanco);

async function funcionario(nome: string, opcoes: { ativo?: boolean; loja?: string } = {}) {
  return prisma.employee.create({
    data: {
      storeId: opcoes.loja ?? storeId,
      name: nome,
      phone: `1199${Math.floor(Math.random() * 10000000)}`,
      pinHash: "x",
      isActive: opcoes.ativo ?? true,
    },
  });
}

/** Um pedido de funcionário, opcionalmente levado até COMPLETED. */
async function pedido(opcoes: {
  employeeId: string;
  loja?: string;
  total?: number;
  desconto?: number;
  metodo?: "PAYROLL" | "PIX";
  concluir?: boolean;
  cancelar?: boolean;
  apagado?: boolean;
  nomeNoPedido?: string;
}) {
  const loja = opcoes.loja ?? storeId;
  const p = await prisma.order.create({
    data: {
      storeId: loja,
      number: numero++,
      customerName: "Cliente",
      customerPhone: "11999999999",
      paymentMethod: (opcoes.metodo ?? "PAYROLL") as any,
      employeeId: opcoes.employeeId,
      employeeNameSnapshot: opcoes.nomeNoPedido ?? null,
      employeeDiscount: opcoes.desconto ?? 0,
      subtotal: opcoes.total ?? 30,
      total: opcoes.total ?? 30,
      items: {
        create: [{
          productId: produtoId, productNameSnapshot: "Lanche",
          unitPrice: opcoes.total ?? 30, quantity: 1,
        }],
      },
    },
  });

  if (opcoes.cancelar) {
    await transitionOrderStatus(loja, p.id, "CANCELLED", { authorType: "SYSTEM" } as any);
  } else if (opcoes.concluir !== false) {
    await transitionOrderStatus(loja, p.id, "PREPARING", { authorType: "SYSTEM" } as any);
    await transitionOrderStatus(loja, p.id, "COMPLETED", { authorType: "SYSTEM" } as any);
  }

  if (opcoes.apagado) {
    await prisma.order.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
  }
  return p;
}

/** O mês corrente, que é onde os pedidos do teste caem. */
const mesAtual = () => {
  const agora = new Date();
  return {
    de: new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0),
    ate: new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999),
  };
};

const consumo = async () => {
  const { de, ate } = mesAtual();
  return consumoDosFuncionarios(storeId, de, ate);
};

describe("o valor a descontar em folha", () => {
  it("01 · PAYROLL concluído e PENDENTE entra", async () => {
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 40 });

    const linhas = await consumo();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].aDescontarEmFolha).toBeCloseTo(40, 2);
  });

  it("02 · PAYROLL já PAGO não entra", async () => {
    /*
     * Um PAYROLL que aparece PAID foi acertado por outro caminho. A folha não
     * pode cobrar de novo o que já foi quitado.
     */
    const f = await funcionario("Ana");
    const p = await pedido({ employeeId: f.id, total: 40 });
    await prisma.order.update({ where: { id: p.id }, data: { paymentStatus: "PAID" } });

    expect((await consumo())[0].aDescontarEmFolha).toBe(0);
  });

  it("03 · pedido comum PENDENTE não vira folha", async () => {
    /*
     * OS DOIS FILTROS SÃO NECESSÁRIOS. Um PIX que ficou pendente é problema de
     * caixa, não de folha — cobrar no salário seria descontar do funcionário um
     * pedido que ele nunca combinou descontar.
     */
    const f = await funcionario("Ana");
    const p = await pedido({ employeeId: f.id, total: 40, metodo: "PIX" });
    await prisma.order.update({ where: { id: p.id }, data: { paymentStatus: "PENDING" } });

    const linhas = await consumo();
    expect(linhas[0].aDescontarEmFolha).toBe(0);
    expect(linhas[0].pedidos).toBe(1); // mas o pedido existiu
  });

  it("04 · vários pedidos somam", async () => {
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 30 });
    await pedido({ employeeId: f.id, total: 25.5 });

    const linhas = await consumo();
    expect(linhas[0].aDescontarEmFolha).toBeCloseTo(55.5, 2);
    expect(linhas[0].pedidos).toBe(2);
  });
});

describe("o benefício concedido", () => {
  it("05 · soma o employeeDiscount dos pedidos concluídos", async () => {
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 30, desconto: 12 });
    await pedido({ employeeId: f.id, total: 30, desconto: 8 });

    expect((await consumo())[0].beneficioConcedido).toBeCloseTo(20, 2);
  });

  it("06 · é independente do valor a descontar", async () => {
    /*
     * As duas naturezas convivendo. O benefício é o que a loja deixou de
     * cobrar; a folha é o que ela vai cobrar depois. Confundi-los faria o dono
     * descontar do salário um valor que ele mesmo deu de presente.
     */
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 18, desconto: 12, metodo: "PAYROLL" });

    const l = (await consumo())[0];
    expect(l.beneficioConcedido).toBeCloseTo(12, 2);
    expect(l.aDescontarEmFolha).toBeCloseTo(18, 2);
  });

  it("07 · benefício em pedido pago em PIX conta, e folha não", async () => {
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 20, desconto: 10, metodo: "PIX" });

    const l = (await consumo())[0];
    expect(l.beneficioConcedido).toBeCloseTo(10, 2);
    expect(l.aDescontarEmFolha).toBe(0);
  });
});

describe("o recorte financeiro", () => {
  it("08 · pedido CANCELLED não entra", async () => {
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 40, desconto: 5, cancelar: true });

    expect(await consumo()).toHaveLength(0);
  });

  it("09 · pedido não concluído ainda não entra", async () => {
    /*
     * Aqui o recorte financeiro se separa do operacional: a cota diária já
     * considera este pedido, mas ele ainda não é venda reconhecida.
     */
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 40, concluir: false });

    expect(await consumo()).toHaveLength(0);
  });

  it("10 · pedido apagado (deletedAt) não entra", async () => {
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 40, apagado: true });

    expect(await consumo()).toHaveLength(0);
  });

  it("11 · pedido fora do mês não entra", async () => {
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 40 });

    // Uma janela de um mês inteiro no passado.
    const antes = await consumoDosFuncionarios(
      storeId,
      new Date(2020, 0, 1),
      new Date(2020, 0, 31, 23, 59, 59, 999),
    );
    expect(antes).toHaveLength(0);
  });
});

describe("isolamento e presença", () => {
  it("12 · funcionário de OUTRA loja não aparece", async () => {
    const daOutra = await funcionario("Bia", { loja: outraLojaId });
    await prisma.category.create({
      data: { storeId: outraLojaId, name: "X", slug: `x-${Date.now()}`, kind: "SIMPLE" },
    });
    await prisma.order.create({
      data: {
        storeId: outraLojaId, number: 999, customerName: "C", customerPhone: "11999999999",
        paymentMethod: "PAYROLL", employeeId: daOutra.id, status: "COMPLETED",
        subtotal: 50, total: 50,
      },
    });

    expect(await consumo()).toHaveLength(0);
  });

  it("13 · dois funcionários não se misturam", async () => {
    const ana = await funcionario("Ana");
    const bia = await funcionario("Bia");
    await pedido({ employeeId: ana.id, total: 30 });
    await pedido({ employeeId: bia.id, total: 70 });

    const linhas = await consumo();
    expect(linhas).toHaveLength(2);
    // Ordenado pelo maior valor a descontar.
    expect(linhas[0].nome).toBe("Bia");
    expect(linhas[0].aDescontarEmFolha).toBeCloseTo(70, 2);
    expect(linhas[1].aDescontarEmFolha).toBeCloseTo(30, 2);
  });

  it("14 · funcionário DESATIVADO com histórico continua aparecendo", async () => {
    const f = await funcionario("Ana", { ativo: false });
    await pedido({ employeeId: f.id, total: 40 });

    const l = (await consumo())[0];
    expect(l.nome).toBe("Ana");
    expect(l.ativo).toBe(false);
    expect(l.aDescontarEmFolha).toBeCloseTo(40, 2);
  });

  it("15 · funcionário EXCLUÍDO com histórico continua aparecendo", async () => {
    /*
     * O desligamento não pode apagar a dívida. `deletedAt` é exclusão suave, e
     * o pedido continua apontando para a pessoa.
     */
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 40 });
    await prisma.employee.update({
      where: { id: f.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    const l = (await consumo())[0];
    expect(l.desligado).toBe(true);
    expect(l.aDescontarEmFolha).toBeCloseTo(40, 2);
  });

  it("16 · o nome vem do snapshot do pedido, não do cadastro de hoje", async () => {
    // Renomear alguém não pode reescrever o fechamento de um mês passado.
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 40, nomeNoPedido: "Ana Silva" });
    await prisma.employee.update({ where: { id: f.id }, data: { name: "Ana Souza" } });

    expect((await consumo())[0].nome).toBe("Ana Silva");
  });

  it("17 · funcionário SEM movimentação no mês não vira linha", async () => {
    await funcionario("Ana");
    await funcionario("Bia");

    // Existem no cadastro, mas o fechamento da folha não tem o que dizer deles.
    expect(await consumo()).toHaveLength(0);
  });

  it("18 · pedido de cliente comum, sem funcionário, é ignorado", async () => {
    const f = await funcionario("Ana");
    await pedido({ employeeId: f.id, total: 40 });
    await prisma.order.create({
      data: {
        storeId, number: 500, customerName: "Cliente", customerPhone: "11988888888",
        paymentMethod: "PIX", status: "COMPLETED", subtotal: 200, total: 200,
      },
    });

    const linhas = await consumo();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].aDescontarEmFolha).toBeCloseTo(40, 2);
  });
});
