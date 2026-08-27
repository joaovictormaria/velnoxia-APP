import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { calcularMovimentoDeCompra } from "@/lib/embalagem-de-compra";

/*
 * Informar a embalagem DEPOIS, num item que já existe.
 *
 * NASCEU DE UM CASO REAL. "Ovos" foi cadastrado certo — contado em `un`, saldo
 * de 30 — mas sem dizer que vem em caixa de 30. Os campos da embalagem só
 * apareciam no cadastro, e a cadeia estava cortada em DOIS pontos: a tela não
 * mostrava, e o `.validator` da server function DESCARTAVA os campos antes de o
 * handler ver. Nada dava erro; a embalagem simplesmente não existia.
 *
 * A regra é a mesma da criação, e é a que importa:
 *
 *     R$ 15,00 a caixa ÷ 30 ovos = R$ 0,50 por ovo
 *
 * Nunca R$ 15,00 por ovo, nunca R$ 15,00 × quantidade.
 *
 * E editar a embalagem HOJE não pode reescrever o que a compra de ONTEM
 * custou: `costAtTime` é congelado por movimento.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";

async function limparBanco() {
  const tabelas: Array<{ tablename: string }> = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
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
  storeId = (
    await prisma.store.create({
      data: { slug: `edit-${Date.now()}`, name: "Cozinha" },
    })
  ).id;
});
afterAll(limparBanco);

/** O item como estava: `un`, com saldo, e SEM embalagem cadastrada. */
async function ovosSemEmbalagem(saldoInicial = 30) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: "Ovos", baseUnitId: "unit_un", itemType: "INGREDIENT" } as any,
    saldoInicial > 0 ? { quantidade: saldoInicial } : undefined,
  );
}

const ler = async (id: string) =>
  prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
const saldo = async (id: string) => Number((await ler(id)).quantityOnHand);
const custo = async (id: string) => {
  const c = (await ler(id)).cost;
  return c == null ? null : Number(c);
};

describe("informar a embalagem num item que já existe", () => {
  it("01 · caixa de 30 por R$ 15,00 grava R$ 0,50 por ovo", async () => {
    const item = await ovosSemEmbalagem();

    await InventoryService.updateItem(storeId, item.id, {
      purchasePackSize: 30,
      purchasePackLabel: "Caixa",
      precoDaEmbalagem: 15,
    } as any);

    expect(await custo(item.id)).toBeCloseTo(0.5, 6);
    // Os dois erros que este teste existe para impedir:
    expect(await custo(item.id)).not.toBeCloseTo(15, 2);
    expect(await custo(item.id)).not.toBeCloseTo(450, 2); // 15 × 30
  });

  it("02 · a embalagem fica gravada no item", async () => {
    const item = await ovosSemEmbalagem();
    await InventoryService.updateItem(storeId, item.id, {
      purchasePackSize: 30,
      purchasePackLabel: "Caixa",
      precoDaEmbalagem: 15,
    } as any);

    const depois = await ler(item.id);
    expect(Number(depois.purchasePackSize)).toBe(30);
    expect(depois.purchasePackLabel).toBe("Caixa");
  });

  it("03 · a unidade de estoque NÃO muda ao editar a embalagem", async () => {
    /*
     * `baseUnitId` é imutável de propósito: trocá-lo reinterpretaria em
     * silêncio o saldo (30 un virariam 30 kg), o custo (R$/un viraria R$/kg) e
     * todo movimento já gravado, que guarda a própria unidade.
     */
    const item = await ovosSemEmbalagem();
    await InventoryService.updateItem(storeId, item.id, {
      purchasePackSize: 30,
      purchasePackLabel: "Caixa",
      precoDaEmbalagem: 15,
      baseUnitId: "unit_kg",
    } as any);

    expect((await ler(item.id)).baseUnitId).toBe("unit_un");
  });

  it("04 · o saldo existente não é mexido", async () => {
    const item = await ovosSemEmbalagem(30);
    await InventoryService.updateItem(storeId, item.id, {
      purchasePackSize: 30,
      purchasePackLabel: "Caixa",
      precoDaEmbalagem: 15,
    } as any);

    // 30 ovos continuam 30 ovos: a embalagem descreve a COMPRA, não o saldo.
    expect(await saldo(item.id)).toBeCloseTo(30, 4);
  });

  it("05 · editar a embalagem NÃO reescreve os movimentos históricos", async () => {
    const item = await ovosSemEmbalagem(30);
    const campos = {
      id: true,
      quantity: true,
      costAtTime: true,
      unitId: true,
      type: true,
    } as const;
    const antes = await prisma.inventoryMovement.findMany({
      where: { itemId: item.id },
      select: campos,
      orderBy: { createdAt: "asc" },
    });

    await InventoryService.updateItem(storeId, item.id, {
      purchasePackSize: 30,
      purchasePackLabel: "Caixa",
      precoDaEmbalagem: 15,
    } as any);

    const depois = await prisma.inventoryMovement.findMany({
      where: { itemId: item.id },
      select: campos,
      orderBy: { createdAt: "asc" },
    });

    // Congelado: o que a compra de ontem custou não muda porque hoje se soube
    // que o ovo vem em caixa.
    expect(depois).toEqual(antes);
  });

  it("06 · trocar o conteúdo recalcula pelo NOVO conteúdo", async () => {
    const item = await ovosSemEmbalagem();
    await InventoryService.updateItem(storeId, item.id, {
      purchasePackSize: 30,
      purchasePackLabel: "Caixa",
      precoDaEmbalagem: 15,
    } as any);
    expect(await custo(item.id)).toBeCloseTo(0.5, 6);

    // Mudou de caixa de 30 para bandeja de 12, mesmo preço.
    await InventoryService.updateItem(storeId, item.id, {
      purchasePackSize: 12,
      purchasePackLabel: "Bandeja",
      precoDaEmbalagem: 15,
    } as any);
    expect(await custo(item.id)).toBeCloseTo(1.25, 6);
  });

  it("07 · preço sem mudar o conteúdo usa o conteúdo já cadastrado", async () => {
    const item = await ovosSemEmbalagem();
    await InventoryService.updateItem(storeId, item.id, {
      purchasePackSize: 30,
      purchasePackLabel: "Caixa",
    } as any);

    // Segunda edição, só o preço: o conteúdo vem do item.
    await InventoryService.updateItem(storeId, item.id, {
      precoDaEmbalagem: 15,
    } as any);
    expect(await custo(item.id)).toBeCloseTo(0.5, 6);
  });

  it("08 · item SEM embalagem continua como antes: preço é por unidade", async () => {
    const farinha = await InventoryService.criarItemComSaldoInicial(
      storeId,
      { name: "Farinha", baseUnitId: "unit_kg", itemType: "INGREDIENT" } as any,
    );
    await InventoryService.updateItem(storeId, farinha.id, {
      precoDaEmbalagem: 7,
    } as any);

    // Conteúdo ausente vale 1: R$ 7,00 ÷ 1 = R$ 7,00 por kg.
    expect(await custo(farinha.id)).toBeCloseTo(7, 6);
  });

  it("09 · `cost` direto continua sendo R$ por unidade de estoque", async () => {
    // Quem manda `cost` está declarando o unitário, e nada divide isso.
    const item = await ovosSemEmbalagem();
    await InventoryService.updateItem(storeId, item.id, {
      purchasePackSize: 30,
      purchasePackLabel: "Caixa",
      cost: 0.6,
    } as any);
    expect(await custo(item.id)).toBeCloseTo(0.6, 6);
  });
});

describe("comprar depois de informar a embalagem", () => {
  /** Deixa "Ovos" no caso real: un, caixa de 30 a R$ 15,00, saldo 30. */
  async function ovosComCaixa() {
    const item = await ovosSemEmbalagem(30);
    await InventoryService.updateItem(storeId, item.id, {
      purchasePackSize: 30,
      purchasePackLabel: "Caixa",
      precoDaEmbalagem: 15,
    } as any);
    return item;
  }

  it("10 · integração: Ovos em `un`, caixa de 30, R$ 0,50 o ovo", async () => {
    const item = await ovosComCaixa();
    const o = await ler(item.id);

    expect(o.baseUnitId).toBe("unit_un");
    expect(Number(o.purchasePackSize)).toBe(30);
    expect(o.purchasePackLabel).toBe("Caixa");
    expect(Number(o.cost)).toBeCloseTo(0.5, 6);
    expect(Number(o.quantityOnHand)).toBeCloseTo(30, 4);
  });

  it("11 · comprar 1 caixa entra 30 ovos", async () => {
    const item = await ovosComCaixa();
    const m = calcularMovimentoDeCompra({
      digitado: 1,
      conteudoDoItem: Number((await ler(item.id)).purchasePackSize),
      emEmbalagens: true,
      totalPago: 15,
    });

    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#C1#${item.id}`,
      itemId: item.id,
      type: "PURCHASE",
      quantity: m.quantity,
      unitId: "unit_un",
      costAtTime: m.custoUnitario!,
      authorType: "ADMIN",
    } as any);

    expect(m.quantity).toBe(30);
    expect(await saldo(item.id)).toBeCloseTo(60, 4); // 30 de antes + 30
    expect(await custo(item.id)).toBeCloseTo(0.5, 6);
  });

  it("12 · comprar 5 caixas entra 150 ovos, e NÃO R$ 75 por ovo", async () => {
    const item = await ovosComCaixa();
    const m = calcularMovimentoDeCompra({
      digitado: 5,
      conteudoDoItem: Number((await ler(item.id)).purchasePackSize),
      emEmbalagens: true,
      totalPago: 75,
    });

    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#C5#${item.id}`,
      itemId: item.id,
      type: "PURCHASE",
      quantity: m.quantity,
      unitId: "unit_un",
      costAtTime: m.custoUnitario!,
      authorType: "ADMIN",
    } as any);

    expect(m.quantity).toBe(150);
    expect(await saldo(item.id)).toBeCloseTo(180, 4);
    expect(await custo(item.id)).toBeCloseTo(0.5, 6);
    // Os erros nomeados, os dois:
    expect(await custo(item.id)).not.toBeCloseTo(75, 2);
    expect(await custo(item.id)).not.toBeCloseTo(15, 2);
  });

  it("13 · a embalagem não é aplicada duas vezes", async () => {
    await ovosComCaixa();
    const m = calcularMovimentoDeCompra({
      digitado: 5,
      conteudoDoItem: 30,
      emEmbalagens: true,
      totalPago: 75,
    });

    // 5 × 30 = 150. Não 5 × 30 × 30 = 4500.
    expect(m.quantity).toBe(150);
    expect(m.quantity).not.toBe(4500);
    expect(m.conteudo).toBe(30);
  });

  it("14 · compra avulsa depois da embalagem não multiplica", async () => {
    await ovosComCaixa();
    const m = calcularMovimentoDeCompra({
      digitado: 12,
      conteudoDoItem: 30,
      emEmbalagens: false,
      totalPago: 6,
    });
    expect(m.quantity).toBe(12);
    expect(m.custoUnitario).toBeCloseTo(0.5, 6);
  });
});
