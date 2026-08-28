import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/client";
import { numeros } from "./serializar";

/*
 * A FRONTEIRA ONDE O DECIMAL MORRE.
 *
 * O TanStack Start serializa o retorno do handler, e um `Decimal` do Prisma não
 * atravessa: ou o compilador recusa o handler, ou o valor chega ao navegador
 * como algo que não é número.
 *
 * A tentativa anterior de resolver isso — um replacer passado a
 * `JSON.stringify` — nunca funcionou, por dois motivos independentes que este
 * arquivo tranca. Os dois são sutis o bastante para alguém "consertar" de novo
 * do mesmo jeito errado.
 */

describe("por que o replacer de JSON.stringify não resolvia", () => {
  it("01 · toJSON roda ANTES do replacer, que recebe uma string", () => {
    /*
     * A ARMADILHA Nº 1. `JSON.stringify` chama `toJSON()` no valor antes de
     * entregá-lo ao replacer. Como o Decimal do Prisma tem `toJSON`, o replacer
     * recebia uma STRING — e qualquer teste de `typeof value === "object"`
     * falhava para todos os Decimals, sempre.
     */
    const tipos: string[] = [];
    JSON.stringify({ preco: new Decimal("10.5") }, (_chave, valor) => {
      if (_chave === "preco") tipos.push(typeof valor);
      return valor;
    });

    expect(tipos).toContain("string");
    expect(tipos).not.toContain("object");
  });

  it("02 · o Decimal do Prisma não se chama 'Decimal'", () => {
    /*
     * A ARMADILHA Nº 2, independente da primeira. Mesmo que o replacer
     * recebesse o objeto, a comparação `constructor.name === "Decimal"` nunca
     * casaria: a classe chega empacotada com outro nome.
     */
    expect(new Decimal("1").constructor.name).not.toBe("Decimal");
  });

  it("03 · o resultado do round-trip é string, não número", () => {
    // O que de fato chegava ao navegador antes da correção.
    const antigo = JSON.parse(
      JSON.stringify({ preco: new Decimal("10.5") }, (_k, v) =>
        v && typeof v === "object" && v.constructor.name === "Decimal" ? Number(v) : v,
      ),
    );
    expect(typeof antigo.preco).toBe("string");
  });
});

describe("numeros: o walker que funciona", () => {
  it("04 · converte Decimal em number de verdade", () => {
    const saida = numeros({ preco: new Decimal("10.5") });
    expect(typeof saida.preco).toBe("number");
    expect(saida.preco).toBeCloseTo(10.5, 6);
  });

  it("05 · identifica pelo comportamento, não pelo nome da classe", () => {
    /*
     * É `toNumber()` que decide. Foi o nome da classe que enganou a versão
     * anterior, e é justamente o que muda quando o Prisma é atualizado.
     */
    const falso = { toNumber: () => 42 };
    expect(numeros({ v: falso }).v).toBe(42);
  });

  it("06 · desce por objetos aninhados", () => {
    const saida = numeros({
      movimento: { quantidade: new Decimal("-3"), item: { custo: new Decimal("8.25") } },
    });
    expect(saida.movimento.quantidade).toBeCloseTo(-3, 6);
    expect(saida.movimento.item.custo).toBeCloseTo(8.25, 6);
  });

  it("07 · desce por arrays", () => {
    const saida = numeros([{ q: new Decimal("1.5") }, { q: new Decimal("2.5") }]);
    expect(saida.map((x) => x.q)).toEqual([1.5, 2.5]);
  });

  it("08 · preserva Date em vez de virar string", () => {
    /*
     * A diferença de comportamento em relação ao round-trip de JSON, e o motivo
     * de valer a pena: `JSON.stringify` transformava toda data em string.
     */
    const d = new Date("2026-03-01T12:00:00Z");
    const saida = numeros({ criadoEm: d });
    expect(saida.criadoEm).toBeInstanceOf(Date);
    expect(saida.criadoEm.getTime()).toBe(d.getTime());
  });

  it("09 · null e undefined atravessam intactos", () => {
    // Custo desconhecido continua desconhecido; virar 0 seria inventar dado.
    const saida = numeros({ custo: null, nota: undefined });
    expect(saida.custo).toBeNull();
    expect(saida.nota).toBeUndefined();
  });

  it("10 · string, boolean e number não são tocados", () => {
    const saida = numeros({ nome: "Farinha", ativo: true, qtd: 7 });
    expect(saida).toEqual({ nome: "Farinha", ativo: true, qtd: 7 });
  });

  it("11 · a forma que vem de getMovementHistory sai inteira em number", () => {
    /*
     * O caso real. O repositório converte à mão `quantity`, `costAtTime` e três
     * campos do item — mas o item tem dez campos Decimal, e `originalMovement`
     * tem mais dois. Eram esses que atravessavam como string.
     */
    const movimento = {
      id: "mov_1",
      createdAt: new Date("2026-03-01T12:00:00Z"),
      quantity: new Decimal("-2"),
      costAtTime: new Decimal("10.4"),
      item: {
        name: "Molho",
        quantityOnHand: new Decimal("4"),
        purchasePackSize: new Decimal("12"),
        averageCost: new Decimal("9.7"),
        minimumThreshold: null,
      },
      originalMovement: {
        quantity: new Decimal("2"),
        costAtTime: new Decimal("10.4"),
      },
    };

    const s = numeros(movimento);

    expect(typeof s.quantity).toBe("number");
    expect(typeof s.item.purchasePackSize).toBe("number");
    expect(typeof s.item.averageCost).toBe("number");
    expect(typeof s.originalMovement.quantity).toBe("number");
    expect(typeof s.originalMovement.costAtTime).toBe("number");
    expect(s.item.minimumThreshold).toBeNull();
    expect(s.createdAt).toBeInstanceOf(Date);
    expect(s.id).toBe("mov_1");
  });
});
