import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { CustoDoPreparado } from "@/server/services/custo-do-preparado";
import {
  calcularCompra,
  calcularMovimentoDeCompra,
  conteudoDaEmbalagem,
} from "@/lib/embalagem-de-compra";

/*
 * Embalagem de compra × unidade de controle, contra o Postgres local.
 *
 * NASCEU DE UM CADASTRO IMPOSSÍVEL. "Ovos, unidade un, custo 15, quantidade
 * inicial 1" — o operador queria dizer "uma caixa de 30 ovos por R$ 15,00", e o
 * sistema gravou UM ovo custando QUINZE REAIS. Não havia campo onde dizer que
 * aquilo era uma caixa.
 *
 * O caso de referência é o dele, com os números dele:
 *   caixa de 30 ovos a R$ 15,00  →  R$ 0,50 por ovo, nunca R$ 15,00
 *   5 caixas                     →  150 ovos, R$ 75,00 no total, e AINDA R$ 0,50/ovo
 *
 * O erro que estes cenários existem para impedir é `preço × quantidade` virar
 * custo unitário: comprar mais caixas não encarece o ovo.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";

let storeId = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
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
  storeId = (await prisma.store.create({
    data: { slug: `emb-${Date.now()}`, name: "Cozinha" },
  })).id;
});

afterAll(limparBanco);

/** Ovos: contados em `un`, comprados em caixa de 30. */
async function criarOvos(caixas: number, precoPorCaixa: number | null, porCaixa = 30) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    {
      name: "Ovos",
      baseUnitId: "unit_un",
      itemType: "INGREDIENT",
      purchasePackSize: porCaixa,
      purchasePackLabel: "caixa",
    } as any,
    { quantidade: caixas, precoDaEmbalagem: precoPorCaixa },
  );
}

const saldo = async (id: string) =>
  Number((await prisma.inventoryItem.findUnique({ where: { id } }))!.quantityOnHand);
const custo = async (id: string) => {
  const c = (await prisma.inventoryItem.findUnique({ where: { id } }))!.cost;
  return c == null ? null : Number(c);
};

describe("a conta, isolada", () => {
  it("01 · 1 caixa × 30 ovos = 30 ovos em estoque", () => {
    const r = calcularCompra({ embalagens: 1, conteudoPorEmbalagem: 30, precoDaEmbalagem: 15 });
    expect(r.quantidadeEmEstoque).toBe(30);
  });

  it("02 · 5 caixas × 30 ovos = 150 ovos", () => {
    const r = calcularCompra({ embalagens: 5, conteudoPorEmbalagem: 30, precoDaEmbalagem: 15 });
    expect(r.quantidadeEmEstoque).toBe(150);
  });

  it("03 · R$ 15 por caixa de 30 = R$ 0,50 por ovo", () => {
    const r = calcularCompra({ embalagens: 1, conteudoPorEmbalagem: 30, precoDaEmbalagem: 15 });
    expect(r.custoPorUnidade).toBeCloseTo(0.5, 6);
  });

  it("04 · 5 caixas a R$ 15 cada = R$ 75,00 de custo total", () => {
    const r = calcularCompra({ embalagens: 5, conteudoPorEmbalagem: 30, precoDaEmbalagem: 15 });
    expect(r.custoTotal).toBeCloseTo(75, 6);
  });

  it("05 · comprar MAIS caixas não encarece o ovo", () => {
    /*
     * A asserção central. `preço × quantidade` daria R$ 75,00 POR OVO — que é
     * exatamente o erro que este conceito existe para impedir. Comprar cinco
     * caixas não muda quanto vale um ovo.
     */
    const uma = calcularCompra({ embalagens: 1, conteudoPorEmbalagem: 30, precoDaEmbalagem: 15 });
    const cinco = calcularCompra({ embalagens: 5, conteudoPorEmbalagem: 30, precoDaEmbalagem: 15 });

    expect(cinco.custoPorUnidade).toBeCloseTo(0.5, 6);
    expect(cinco.custoPorUnidade).toBe(uma.custoPorUnidade);
    expect(cinco.custoPorUnidade).not.toBeCloseTo(75, 2);
    expect(cinco.custoPorUnidade).not.toBeCloseTo(15, 2);
  });

  it("06 · embalagem de conteúdo diferente calcula certo", () => {
    // Fardo com 12, a R$ 24,00 → R$ 2,00 cada.
    const fardo = calcularCompra({ embalagens: 3, conteudoPorEmbalagem: 12, precoDaEmbalagem: 24 });
    expect(fardo.quantidadeEmEstoque).toBe(36);
    expect(fardo.custoTotal).toBeCloseTo(72, 6);
    expect(fardo.custoPorUnidade).toBeCloseTo(2, 6);

    // Pacote de 5 kg a R$ 40,00 → R$ 8,00 o kg.
    const pacote = calcularCompra({ embalagens: 2, conteudoPorEmbalagem: 5, precoDaEmbalagem: 40 });
    expect(pacote.quantidadeEmEstoque).toBe(10);
    expect(pacote.custoPorUnidade).toBeCloseTo(8, 6);

    // Garrafa de 500 ml a R$ 3,00 → R$ 0,006 o ml.
    const garrafa = calcularCompra({ embalagens: 1, conteudoPorEmbalagem: 500, precoDaEmbalagem: 3 });
    expect(garrafa.quantidadeEmEstoque).toBe(500);
    expect(garrafa.custoPorUnidade).toBeCloseTo(0.006, 6);
  });

  it("07 · sem embalagem, o conteúdo é 1 e a compra é direta", () => {
    // O caminho de todo item anterior a este conceito.
    expect(conteudoDaEmbalagem(null)).toBe(1);
    expect(conteudoDaEmbalagem(undefined)).toBe(1);
    expect(conteudoDaEmbalagem(0)).toBe(1);
    expect(conteudoDaEmbalagem(-3)).toBe(1);

    const r = calcularCompra({ embalagens: 5.2, conteudoPorEmbalagem: null, precoDaEmbalagem: 41.6 });
    expect(r.quantidadeEmEstoque).toBeCloseTo(5.2, 6);
    expect(r.custoPorUnidade).toBeCloseTo(41.6, 6);
  });

  it("08 · o custo unitário sai de preço ÷ conteúdo, não de total ÷ quantidade", () => {
    /*
     * As duas contas dão o mesmo número quando há embalagens. Esta versão
     * continua definida com zero embalagens, que é o estado do formulário antes
     * de a pessoa dizer quantas caixas vai comprar.
     */
    const semQuantidade = calcularCompra({
      embalagens: 0, conteudoPorEmbalagem: 30, precoDaEmbalagem: 15,
    });
    expect(semQuantidade.quantidadeEmEstoque).toBe(0);
    expect(semQuantidade.custoPorUnidade).toBeCloseTo(0.5, 6);
    expect(Number.isFinite(semQuantidade.custoPorUnidade!)).toBe(true);
  });
});

describe("o caso real, no banco", () => {
  it("09 · 1 caixa de 30 a R$ 15,00 → 30 ovos a R$ 0,50", async () => {
    const item = await criarOvos(1, 15);

    expect(await saldo(item.id)).toBeCloseTo(30, 4);
    expect(await custo(item.id)).toBeCloseTo(0.5, 4);
    expect(await custo(item.id)).not.toBeCloseTo(15, 2);
  });

  it("10 · 5 caixas → 150 ovos, R$ 0,50 cada, R$ 75,00 gastos", async () => {
    const item = await criarOvos(5, 15);

    expect(await saldo(item.id)).toBeCloseTo(150, 4);
    expect(await custo(item.id)).toBeCloseTo(0.5, 4);

    // O que saiu do caixa: 150 × 0,50 = 75, e também 5 × 15 = 75.
    const gasto = (await saldo(item.id)) * (await custo(item.id))!;
    expect(gasto).toBeCloseTo(75, 4);
  });

  it("11 · a movimentação PURCHASE grava na unidade de ESTOQUE", async () => {
    const item = await criarOvos(5, 15);

    const mov = await prisma.inventoryMovement.findFirst({
      where: { itemId: item.id, type: "PURCHASE" },
    });

    /*
     * 150, não 5. O razão é a fonte da verdade do saldo — gravar "5" ali faria
     * o estoque e o histórico contarem coisas diferentes para sempre.
     */
    expect(Number(mov!.quantity)).toBeCloseTo(150, 4);
    expect(mov!.unitId).toBe("unit_un");
    expect(Number(mov!.costAtTime)).toBeCloseTo(0.5, 4);
  });

  it("12 · o custo histórico congelado é o unitário, e não muda depois", async () => {
    const item = await criarOvos(5, 15);
    const mov = await prisma.inventoryMovement.findFirst({ where: { itemId: item.id } });

    // Uma compra mais cara depois não reescreve o que já foi comprado.
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { cost: 99 } });

    const relido = await prisma.inventoryMovement.findUnique({ where: { id: mov!.id } });
    expect(Number(relido!.costAtTime)).toBeCloseTo(0.5, 4);
  });

  it("13 · a embalagem fica guardada para a próxima compra", async () => {
    const item = await criarOvos(1, 15);
    const relido = await prisma.inventoryItem.findUnique({ where: { id: item.id } });

    expect(Number(relido!.purchasePackSize)).toBe(30);
    expect(relido!.purchasePackLabel).toBe("caixa");
  });

  it("14 · o fluxo ANTIGO continua igual: item sem embalagem", async () => {
    /*
     * 5,2 kg de farinha a R$ 8,00/kg. Nenhuma embalagem envolvida, e o
     * resultado tem que ser byte a byte o de antes deste conceito existir.
     */
    const item = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Farinha", baseUnitId: "unit_kg", itemType: "INGREDIENT" } as any,
      { quantidade: 5.2, precoDaEmbalagem: 8 },
    );

    expect(await saldo(item.id)).toBeCloseTo(5.2, 4);
    expect(await custo(item.id)).toBeCloseTo(8, 4);

    const relido = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(relido!.purchasePackSize).toBeNull();
  });

  it("15 · a conversão de unidade NÃO é aplicada duas vezes", async () => {
    /*
     * Embalagem e conversão de unidade são conceitos independentes, e o risco
     * de somá-los é real: um item em kg comprado em pacote de 5 kg, usado numa
     * receita que pede gramas, passa pelas duas contas — mas cada uma no seu
     * lugar. A embalagem age na COMPRA; a conversão, na RECEITA.
     */
    const farinha = await InventoryService.criarItemComSaldoInicial(
      storeId,
      {
        name: "Farinha", baseUnitId: "unit_kg", itemType: "INGREDIENT",
        purchasePackSize: 5, purchasePackLabel: "pacote",
      } as any,
      { quantidade: 2, precoDaEmbalagem: 40 },
    );

    // 2 pacotes de 5 kg = 10 kg, a R$ 40,00 o pacote = R$ 8,00 o kg.
    expect(await saldo(farinha.id)).toBeCloseTo(10, 4);
    expect(await custo(farinha.id)).toBeCloseTo(8, 4);

    // E a receita, que pede 60 g, converte só a unidade — não a embalagem.
    const bolo = await prisma.inventoryItem.create({
      data: { storeId, name: "Bolo", itemType: "PREPARED", baseUnitId: "unit_un", quantityOnHand: 0 },
    });
    const receita = await prisma.productComposition.create({
      data: {
        storeId, inventoryItemId: bolo.id, version: 1,
        yieldQuantity: 1, yieldUnitId: "unit_un",
        items: { create: [{ inventoryItemId: farinha.id, quantity: 60, unitId: "unit_g" }] },
      },
    });

    // Semeia as conversões, que outra migration cria.
    const conv = readFileSync(
      resolve(__dirname, "../../../../prisma/migrations/20260827000000_semear_conversoes_de_unidade/migration.sql"),
      "utf8",
    ).split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n").trim();
    await prisma.$executeRawUnsafe(conv);

    const { total, linhas } = await CustoDoPreparado.custoDaFicha(storeId, receita.id);

    // 60 g = 0,06 kg × R$ 8,00 = R$ 0,48. A embalagem NÃO entra aqui.
    expect(linhas[0].quantidadeNaBase).toBeCloseTo(0.06, 6);
    expect(Number(total)).toBeCloseTo(0.48, 4);
    // Se a embalagem fosse aplicada de novo: 0,06/5 = 0,012 → R$ 0,096.
    expect(Number(total)).not.toBeCloseTo(0.096, 4);
  });

  it("16 · embalagem sem preço entra no saldo e não mexe no custo", async () => {
    const item = await criarOvos(2, null);

    expect(await saldo(item.id)).toBeCloseTo(60, 4);
    // Brinde, transferência, correção: entra material, não entra preço.
    expect(await custo(item.id)).toBeNull();
  });
});

/*
 * A COMPRA SEGUINTE.
 *
 * O cadastro é uma vez; a compra é toda semana. O formulário de movimentação
 * pergunta outra coisa que o cadastro — ali se informa o preço de UMA caixa,
 * aqui o TOTAL da nota, que é o que está impresso nela — e tem que chegar no
 * mesmo R$ 0,50 por ovo. É onde o erro reapareceria sem ninguém notar: o item
 * já está cadastrado certo, e só a entrada nova sai torta.
 */
describe("a compra seguinte", () => {
  it("17 · 5 caixas de 30 entram como 150 unidades no saldo", () => {
    const m = calcularMovimentoDeCompra({
      digitado: 5,
      conteudoDoItem: 30,
      emEmbalagens: true,
      totalPago: 75,
    });
    expect(m.quantity).toBe(150);
  });

  it("18 · R$ 75,00 por 5 caixas de 30 congela R$ 0,50 por ovo", () => {
    const m = calcularMovimentoDeCompra({
      digitado: 5,
      conteudoDoItem: 30,
      emEmbalagens: true,
      totalPago: 75,
    });
    // NÃO R$ 15,00 (75 ÷ 5 caixas), que é o erro que este campo existe
    // para não cometer.
    expect(m.custoUnitario).toBeCloseTo(0.5, 6);
    expect(m.custoUnitario).not.toBeCloseTo(15, 2);
  });

  it("19 · o cadastro e a compra seguinte chegam no mesmo unitário", () => {
    // Duas perguntas diferentes — "preço da caixa" e "total da nota" — sobre a
    // mesma compra. Divergir aqui faria o custo do item oscilar sozinho.
    const cadastro = calcularCompra({
      embalagens: 5,
      conteudoPorEmbalagem: 30,
      precoDaEmbalagem: 15,
    });
    const seguinte = calcularMovimentoDeCompra({
      digitado: 5,
      conteudoDoItem: 30,
      emEmbalagens: true,
      totalPago: 75,
    });
    expect(seguinte.quantity).toBeCloseTo(cadastro.quantidadeEmEstoque, 6);
    expect(seguinte.custoUnitario!).toBeCloseTo(cadastro.custoPorUnidade!, 6);
  });

  it("20 · compra avulsa não multiplica pela embalagem", () => {
    // O item vem em caixa de 30, mas hoje se comprou 12 ovos soltos. Travar em
    // múltiplos da caixa obrigaria a mentir no número.
    const m = calcularMovimentoDeCompra({
      digitado: 12,
      conteudoDoItem: 30,
      emEmbalagens: false,
      totalPago: 6,
    });
    expect(m.quantity).toBe(12);
    expect(m.custoUnitario).toBeCloseTo(0.5, 6);
  });

  it("21 · item sem embalagem: 5,2 kg por R$ 41,60 = R$ 8,00/kg", () => {
    // O caminho de tudo que existia antes deste conceito. Continua idêntico.
    const m = calcularMovimentoDeCompra({
      digitado: 5.2,
      conteudoDoItem: null,
      emEmbalagens: true,
      totalPago: 41.6,
    });
    expect(m.quantity).toBeCloseTo(5.2, 6);
    expect(m.custoUnitario).toBeCloseTo(8, 6);
  });

  it("22 · perda não vira custo mesmo com valor enviado por engano", () => {
    const m = calcularMovimentoDeCompra({
      digitado: 3,
      conteudoDoItem: 30,
      emEmbalagens: true,
      totalPago: null,
    });
    expect(m.quantity).toBe(90);
    expect(m.custoUnitario).toBeNull();
  });

  it("23 · dobrar a nota e as caixas juntas mantém o unitário", () => {
    const a = calcularMovimentoDeCompra({
      digitado: 5,
      conteudoDoItem: 30,
      emEmbalagens: true,
      totalPago: 75,
    });
    const b = calcularMovimentoDeCompra({
      digitado: 10,
      conteudoDoItem: 30,
      emEmbalagens: true,
      totalPago: 150,
    });
    expect(b.quantity).toBe(a.quantity * 2);
    expect(b.custoUnitario!).toBeCloseTo(a.custoUnitario!, 6);
  });

  it("24 · a segunda compra reaproveita a embalagem do cadastro", async () => {
    const item = await criarOvos(1, 15); // caixa de 30, R$ 15,00 → 30 un
    expect(await saldo(item.id)).toBeCloseTo(30, 4);

    // A tela manda 5 e a flag; o conteúdo vem do ITEM, não do formulário.
    const gravado = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: item.id },
      select: { purchasePackSize: true, baseUnitId: true },
    });
    const m = calcularMovimentoDeCompra({
      digitado: 5,
      conteudoDoItem: Number(gravado.purchasePackSize),
      emEmbalagens: true,
      totalPago: 75,
    });

    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#COMPRA_SEGUINTE#${item.id}`,
      itemId: item.id,
      type: "PURCHASE",
      quantity: m.quantity,
      unitId: gravado.baseUnitId,
      costAtTime: m.custoUnitario!,
      authorType: "ADMIN",
    } as any);

    // 30 do cadastro + 150 desta compra.
    expect(await saldo(item.id)).toBeCloseTo(180, 4);
    expect(await custo(item.id)).toBeCloseTo(0.5, 4);
  });
});
