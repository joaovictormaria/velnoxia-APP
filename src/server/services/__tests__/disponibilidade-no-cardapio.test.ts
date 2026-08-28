import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/server/db/client";
import { InventoryService } from "@/server/services/inventory-service";
import { createOrderFromCheckout } from "@/server/services/order-service";
import { listMenuForStorefront } from "@/server/repositories/product-repository";
import { estaEsgotado } from "@/lib/pizzaria2/cart";

/*
 * O CARDÁPIO DIZ O QUE NÃO DÁ PARA VENDER — mas quem impede é a reserva.
 *
 * Antes, produto esgotado continuava comprável: a vitrine não olhava estoque em
 * lugar nenhum, e o cliente só descobria quando o pedido era recusado no fim.
 *
 * `esgotado` é DERIVADO na consulta, nunca gravado: um campo persistido
 * precisaria ser mantido a cada movimento, e uma segunda fonte de verdade
 * diverge. E os saldos não podem vazar — a vitrine é pública.
 *
 * DOIS NÍVEIS, e a ordem importa. O cardápio é uma fotografia do instante em
 * que a página carregou; o estoque pode acabar enquanto o cliente decide. A
 * garantia é a reserva síncrona, sob lock. O cenário 12 prova os dois juntos.
 */

const SEED_UNIDADES = "20260826210000_semear_unidades_base";
let storeId = "";
let slugDaLoja = "";
let categoriaId = "";

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
  // Zerado a cada teste: o TRUNCATE apaga a categoria, e o id guardado
  // apontaria para uma linha que não existe mais.
  categoriaId = "";
  slugDaLoja = `disp-${Date.now()}`;
  const loja = await prisma.store.create({ data: { slug: slugDaLoja, name: "Cozinha" } });
  storeId = loja.id;
  await prisma.storeSettings.create({
    data: { storeId, whatsappNumber: "11999999999" },
  });
});
afterAll(limparBanco);

async function itemComSaldo(nome: string, unidades: number) {
  return InventoryService.criarItemComSaldoInicial(
    storeId,
    { name: nome, baseUnitId: "unit_un", itemType: "PREPARED" } as any,
    unidades > 0 ? { quantidade: unidades, precoDaEmbalagem: 10 } : undefined,
  );
}

async function produto(nome: string, inventoryItemId?: string) {
  if (!categoriaId) {
    categoriaId = (
      await prisma.category.create({
        data: {
          storeId,
          name: "Doces",
          slug: `doces-${Date.now()}`,
          icon: "🍰",
          kind: "SIMPLE",
          isActive: true,
        },
      })
    ).id;
  }
  return prisma.product.create({
    data: {
      storeId,
      categoryId: categoriaId,
      name: nome,
      slug: `${nome.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 7)}`,
      description: nome,
      basePrice: 25,
      isActive: true,
      ...(inventoryItemId ? { inventoryItemId } : {}),
    },
  });
}

/** Repete o que a server function faz, sobre o que a consulta devolve. */
async function esgotadoNoCardapio(slug: string) {
  const categorias = await listMenuForStorefront(storeId);
  const p: any = categorias
    .flatMap((c: any) => c.products)
    .find((x: any) => x.slug === slug);
  if (!p) return null;
  const inv = p.inventoryItem;
  return inv != null && inv.isActive === true
    ? Number(inv.quantityOnHand) - Number(inv.quantityReserved) <= 0
    : false;
}

describe("o estoque não decide o que está à venda", () => {
  /*
   * ESTOQUE É CONTROLE INTERNO, NÃO AUTORIZAÇÃO DE COMPRA.
   *
   * Este bloco afirmava o contrário: saldo zerado marcava o produto como
   * esgotado e ele saía da vitrine. Era o número da cozinha decidindo o que o
   * cliente pode comprar — e esse número quase nunca reflete a prateleira:
   * sobra do dia anterior, entrega que chegou e ninguém lançou, contagem
   * atrasada. Perder a venda por isso é o pior desfecho possível.
   *
   * Quem quer parar de vender continua tendo como: desativar o PRODUTO, que é
   * outra coisa e segue funcionando.
   */
  it("01 · estoque positivo → aparece", async () => {
    const item = await itemComSaldo("Bolo", 5);
    const p = await produto("Bolo", item.id);
    expect(await esgotadoNoCardapio(p.slug)).toBe(false);
  });

  it("02 · estoque baixo → aparece", async () => {
    // O caso da tela: 0,93 restante bloqueava a compra de 3.
    const item = await itemComSaldo("Bolo", 1);
    const p = await produto("Bolo", item.id);
    expect(await esgotadoNoCardapio(p.slug)).toBe(false);
  });

  it("03 · estoque ZERO → aparece", async () => {
    const item = await itemComSaldo("Bolo", 0);
    const p = await produto("Bolo", item.id);
    expect(await esgotadoNoCardapio(p.slug)).toBe(false);
  });

  it("04 · tudo reservado para outros pedidos → aparece", async () => {
    const item = await itemComSaldo("Bolo", 3);
    await InventoryService.reserveForOrder(storeId, item.id, 3, "pedido-antigo");
    const p = await produto("Bolo", item.id);

    expect(await esgotadoNoCardapio(p.slug)).toBe(false);
  });

  it("05 · saldo NEGATIVO → aparece", async () => {
    const item = await itemComSaldo("Bolo", 1);
    // CONSUMPTION permite negativo de propósito: a cozinha já usou.
    await InventoryService.recordMovement(storeId, {
      idempotencyKey: `${storeId}#NEG#${item.id}`,
      itemId: item.id,
      type: "CONSUMPTION",
      quantity: -3,
      unitId: "unit_un",
      authorType: "SYSTEM",
      permitirSaldoNegativo: true,
    } as any);
    const p = await produto("Bolo", item.id);

    expect(await esgotadoNoCardapio(p.slug)).toBe(false);
  });

  it("06 · produto SEM vínculo de estoque → aparece", async () => {
    const p = await produto("Refrigerante");
    expect(await esgotadoNoCardapio(p.slug)).toBe(false);
  });

  it("07 · produto DESATIVADO pelo admin continua oculto", async () => {
    /*
     * A única chave que ainda esconde. É decisão explícita de quem administra,
     * e é justamente o que sobra quando o estoque para de mandar na vitrine.
     */
    const item = await itemComSaldo("Bolo", 5);
    const p = await produto("Bolo", item.id);
    await prisma.product.update({ where: { id: p.id }, data: { isActive: false } });

    const categorias = await listMenuForStorefront(storeId);
    const slugs = categorias.flatMap((c: any) => c.products).map((x: any) => x.slug);

    expect(slugs).not.toContain(p.slug);
  });

  it("08 · produto com estoque zerado CONTINUA na vitrine", async () => {
    const item = await itemComSaldo("Bolo", 0);
    const p = await produto("Bolo", item.id);

    const categorias = await listMenuForStorefront(storeId);
    const slugs = categorias.flatMap((c: any) => c.products).map((x: any) => x.slug);

    expect(slugs).toContain(p.slug);
  });
});

describe("a barreira do carrinho", () => {
  const cardapio = [
    { slug: "bolo", esgotado: true },
    { slug: "refrigerante", esgotado: false },
    { slug: "suco" },
  ];

  it("08 · recusa produto esgotado", () => {
    expect(estaEsgotado("bolo", cardapio)).toBe(true);
  });

  it("09 · aceita produto disponível", () => {
    expect(estaEsgotado("refrigerante", cardapio)).toBe(false);
  });

  it("10 · produto sem a marca é tratado como disponível", () => {
    expect(estaEsgotado("suco", cardapio)).toBe(false);
  });

  it("11 · slug desconhecido não bloqueia", () => {
    /*
     * O carrinho é `localStorage` e sobrevive a recarregamentos: pode conter um
     * produto que saiu do cardápio. Bloquear pelo desconhecido travaria o
     * carrinho inteiro; quem recusa esse caso é o checkout.
     */
    expect(estaEsgotado("produto-que-nao-existe-mais", cardapio)).toBe(false);
  });
});

describe("os dois níveis, juntos", () => {
  it("12 · o estoque acaba e nada muda para o cliente", async () => {
    const item = await itemComSaldo("Bolo", 1);
    const p = await produto("Bolo", item.id);

    // A página carregou com o produto disponível.
    expect(await esgotadoNoCardapio(p.slug)).toBe(false);

    // Outro cliente levou a última unidade enquanto este decidia.
    await InventoryService.reserveForOrder(storeId, item.id, 1, "pedido-do-outro");

    // A vitrine continua igual: o saldo não manda mais nela.
    expect(await esgotadoNoCardapio(p.slug)).toBe(false);

    const r = await createOrderFromCheckout(storeId, {
      storeSlug: slugDaLoja,
      items: [{ productSlug: p.slug, quantity: 1, extraIds: [] }],
      customerName: "Cliente",
      customerPhone: "11999999999",
      type: "PICKUP",
      paymentMethod: "CASH",
    } as any);

    /*
     * E O PEDIDO PASSA, com o estoque já comprometido. Os dois níveis dizem a
     * mesma coisa agora: estoque é assunto interno. A falta vira aviso para o
     * salão, não recusa para quem está comprando.
     */
    expect(r.ok).toBe(true);

    const pedido = await prisma.order.findFirstOrThrow({ where: { storeId } });
    expect(pedido.inventoryInconsistentAt).not.toBeNull();

  });

  it("13 · o cardápio não expõe saldo nem reservado", async () => {
    /*
     * A vitrine é pública. Quanto há em estoque é informação de negócio, e o
     * concorrente do outro lado da rua também abre a página.
     */
    const item = await itemComSaldo("Bolo", 7);
    await produto("Bolo", item.id);

    const categorias = await listMenuForStorefront(storeId);
    const bruto = categorias.flatMap((c: any) => c.products)[0];

    /*
     * A consulta nem traz mais os saldos: com o estoque fora da decisão de
     * venda, a vitrine deixou de ter motivo para lê-los — e o dado sensível
     * parou de sair do banco numa consulta pública.
     */
    expect(bruto.inventoryItem).toBeUndefined();
    expect(JSON.stringify(bruto)).not.toMatch(/quantityOnHand|quantityReserved/);
  });
});
