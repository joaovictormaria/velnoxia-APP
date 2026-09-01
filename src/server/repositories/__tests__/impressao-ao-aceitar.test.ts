import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { listKanbanOrders } from "../order-repository";

/*
 * A COMANDA SÓ SAI SE A LOJA PEDIU.
 *
 * `autoPrintEnabled` mora em `StoreSettings` desde sempre, nasce `false` — e
 * ninguém o consultava. O quadro de pedidos chamava `window.print()` ao mover
 * um pedido para "em preparo" em TODA loja, inclusive nas que têm a impressão
 * automática desligada, que são todas por padrão. Colocar um pedido na fila
 * abria um diálogo de impressão que ninguém pediu, no horário de pico.
 *
 * O sinalizador viaja com a resposta do quadro, ao lado de `mostrarEntrega` e
 * na mesma consulta de settings: nenhuma ida a mais ao banco.
 */

const DIA = 24 * 60 * 60 * 1000;

async function limpar() {
  await prisma.store.deleteMany({});
}

beforeEach(limpar);
afterAll(limpar);

async function loja(autoPrintEnabled: boolean | undefined) {
  const criada = await prisma.store.create({
    data: {
      slug: `print-${Math.random().toString(36).slice(2, 9)}`,
      name: "Loja da comanda",
      status: "ACTIVE",
      paidUntil: new Date(Date.now() + 30 * DIA),
      ...(autoPrintEnabled === undefined
        ? {}
        : {
            settings: {
              create: {
                storeName: "Loja da comanda",
                whatsappNumber: "11999999999",
                autoPrintEnabled,
              },
            },
          }),
    },
    select: { id: true },
  });
  return criada.id;
}

const hoje = () => new Date().toISOString().slice(0, 10);

describe("o quadro diz se deve imprimir", () => {
  it("impressão automática DESLIGADA: não imprime", async () => {
    const id = await loja(false);
    const r = await listKanbanOrders(id, { date: hoje() });
    expect(r.imprimirAoAceitar).toBe(false);
  });

  it("impressão automática LIGADA: imprime", async () => {
    const id = await loja(true);
    const r = await listKanbanOrders(id, { date: hoje() });
    expect(r.imprimirAoAceitar).toBe(true);
  });

  /*
   * Uma loja sem configuração não deve receber um diálogo de impressão que
   * ninguém pediu. O padrão do banco também é `false`, então as duas pontas
   * concordam.
   */
  it("loja sem settings: não imprime", async () => {
    const id = await loja(undefined);
    const r = await listKanbanOrders(id, { date: hoje() });
    expect(r.imprimirAoAceitar).toBe(false);
  });

  it("o sinalizador vem junto com mostrarEntrega, sem consulta a mais", () => {
    const repo = readFileSync(resolve(__dirname, "../order-repository.ts"), "utf8");
    // Um `select` só, carregando os dois campos.
    expect(repo).toContain("select: { acceptsDelivery: true, autoPrintEnabled: true }");
    expect(repo).toContain("const imprimirAoAceitar = settings?.autoPrintEnabled ?? false;");
    expect(repo).toContain("return { columns, awaiting, mostrarEntrega, imprimirAoAceitar };");
  });
});

describe("a tela respeita o sinalizador", () => {
  const rota = readFileSync(
    resolve(__dirname, "../../../routes/admin/pedidos/index.tsx"),
    "utf8",
  );

  it("o print depende do interruptor da loja", () => {
    expect(rota).toContain(
      'if (vars.status === "PREPARING" && kanban?.imprimirAoAceitar) {',
    );
  });

  /*
   * Uma única chamada, e dentro da condição. Um `window.print()` solto em
   * qualquer outro ponto reabriria o defeito sem ninguém notar.
   *
   * A contagem olha o CÓDIGO sem comentários: o bloco que explica a correção
   * cita `window.print()` duas vezes, e contar o texto cru reprovaria a
   * própria explicação.
   */
  it("não sobrou nenhuma impressão incondicional", () => {
    const codigo = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(codigo.match(/window\.print\(\)/g) ?? []).toHaveLength(1);
    expect(codigo).not.toMatch(/if \(vars\.status === "PREPARING"\) \{\s*setTimeout/);
  });

  /*
   * PREPARING continua sendo a única transição que imprime: recusar não
   * imprime, e avançar para pronto ou concluído também não — a comanda já
   * saiu quando o pedido entrou na fila.
   */
  it("e continua sendo só ao aceitar", () => {
    const bloco = rota.slice(rota.indexOf("const advance = useMutation"), rota.indexOf("const finalizarMesa"));
    expect(bloco).toContain('vars.status === "PREPARING"');
    expect(bloco).not.toMatch(/vars\.status === "(READY|COMPLETED|CANCELLED)"[\s\S]{0,80}window\.print/);
  });
});
