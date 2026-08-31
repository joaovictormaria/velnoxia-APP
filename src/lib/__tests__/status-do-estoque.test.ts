import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  statusDoEstoque,
  rotuloDoStatus,
  faltanteParaOMinimo,
} from "@/lib/status-do-estoque";

/*
 * A REGRA DE ESTOQUE BAIXO, EM UM LUGAR SO.
 *
 * Havia oito implementacoes desta pergunta no projeto, discordando entre si:
 * cinco ignoravam o reservado, tres usavam `<` e uma `<=`, duas comparavam com
 * 30% de `maximumQuantity` em vez do minimo. Um item com 10 unidades e 8
 * prometidas era "normal" em cinco delas — com duas livres.
 *
 * Estes testes sao o contrato da funcao que substituiu as oito.
 */

const St = (onHand: unknown, reserved: unknown, minimum?: unknown) =>
  statusDoEstoque({
    quantityOnHand: onHand,
    quantityReserved: reserved,
    minimumThreshold: minimum,
  });

describe("a matriz obrigatoria", () => {
  const casos: Array<[number, number, number | null, string]> = [
    [10, 0, 3, "NORMAL"],
    [10, 8, 3, "LOW_STOCK"],
    [3, 0, 3, "LOW_STOCK"],
    [3, 3, 3, "OUT_OF_STOCK"],
    [2, 3, 1, "OUT_OF_STOCK"],
    [0, 0, null, "OUT_OF_STOCK"],
    [5, 0, null, "NORMAL"],
    [2.99999999, 0, 3, "LOW_STOCK"],
    [3.00000001, 0, 3, "NORMAL"],
  ];

  for (const [onHand, reserved, minimo, esperado] of casos) {
    it(`${onHand} fisico, ${reserved} reservado, minimo ${minimo} -> ${esperado}`, () => {
      expect(St(onHand, reserved, minimo).status).toBe(esperado);
    });
  }
});

/*
 * O CASO QUE MOTIVOU A UNIFICACAO. Cinco das oito regras antigas respondiam
 * NORMAL aqui, olhando so o saldo fisico. Duas unidades livres nao sao normais
 * quando o minimo e tres.
 */
describe("o reservado conta — era o buraco das regras antigas", () => {
  it("10 fisico + 8 reservado + minimo 3 = LOW_STOCK, nao NORMAL", () => {
    const r = St(10, 8, 3);
    expect(r.disponivel).toBe(2);
    expect(r.status).toBe("LOW_STOCK");
    expect(r.status).not.toBe("NORMAL");
  });

  it("reservado parcial que ainda deixa folga = NORMAL", () => {
    expect(St(10, 4, 3).status).toBe("NORMAL");
    expect(St(10, 4, 3).disponivel).toBe(6);
  });

  it("reservado igual ao fisico = OUT_OF_STOCK", () => {
    const r = St(7, 7, 3);
    expect(r.disponivel).toBe(0);
    expect(r.status).toBe("OUT_OF_STOCK");
  });

  it("reservado MAIOR que o fisico = OUT_OF_STOCK", () => {
    const r = St(2, 5, 1);
    expect(r.disponivel).toBe(-3);
    expect(r.status).toBe("OUT_OF_STOCK");
  });

  it("sem reserva nenhuma, o disponivel e o fisico", () => {
    expect(St(9, 0, 3).disponivel).toBe(9);
  });
});

describe("o minimo: nulo, zero e negativo", () => {
  /*
   * NULO NAO E ZERO. Item sem minimo nunca vira LOW_STOCK — compara-lo contra
   * um zero inventado faria todo insumo nunca configurado virar alarme.
   */
  it("minimo nulo nunca gera LOW_STOCK", () => {
    expect(St(5, 0, null).status).toBe("NORMAL");
    expect(St(0.0001, 0, null).status).toBe("NORMAL");
    expect(St(5, 0, undefined).status).toBe("NORMAL");
    expect(St(5, 0).status).toBe("NORMAL");
  });

  it("minimo nulo NAO impede OUT_OF_STOCK", () => {
    expect(St(0, 0, null).status).toBe("OUT_OF_STOCK");
    expect(St(5, 5, null).status).toBe("OUT_OF_STOCK");
  });

  /* Zero e valor legitimo, e diferente de nulo. */
  it("minimo zero e valido: so alerta quando o disponivel some", () => {
    expect(St(5, 0, 0).status).toBe("NORMAL");
    expect(St(0, 0, 0).status).toBe("OUT_OF_STOCK");
    expect(St(0.00000001, 0, 0).status).toBe("NORMAL");
  });

  it("o minimo volta no resultado, para quem exibe", () => {
    expect(St(5, 0, 3).minimo).toBe(3);
    expect(St(5, 0, 0).minimo).toBe(0);
    expect(St(5, 0, null).minimo).toBeNull();
  });
});

describe("estoque negativo", () => {
  it("fisico negativo e OUT_OF_STOCK", () => {
    // O Queijo mucarela do banco local esta assim: -0,05 un.
    const r = St(-0.05, 0, null);
    expect(r.disponivel).toBeCloseTo(-0.05, 8);
    expect(r.status).toBe("OUT_OF_STOCK");
  });

  it("o numero negativo NAO se perde: quem exibe ainda o ve", () => {
    expect(St(-2, 0, 5).disponivel).toBe(-2);
  });
});

describe("a fronteira do minimo, na precisao do razao", () => {
  /*
   * `quantityOnHand` tem oito casas decimais. Float64 tem ~15 digitos
   * significativos, entao a comparacao nessa escala e exata.
   */
  it("exatamente no minimo ja e LOW_STOCK", () => {
    expect(St(3, 0, 3).status).toBe("LOW_STOCK");
  });

  it("um centesimo de milionesimo abaixo e LOW_STOCK", () => {
    expect(St(2.99999999, 0, 3).status).toBe("LOW_STOCK");
  });

  it("um centesimo de milionesimo acima e NORMAL", () => {
    expect(St(3.00000001, 0, 3).status).toBe("NORMAL");
  });

  /*
   * A mesma fronteira, agora com o reservado produzindo o disponivel. Reservar
   * um centesimo de milionesimo A MAIS derruba o item para LOW_STOCK; reservar
   * um a MENOS o mantem normal.
   */
  it("a fronteira tambem vale quando a folga vem do reservado", () => {
    expect(St(6, 2.99999999, 3).disponivel).toBeCloseTo(3.00000001, 8);
    expect(St(6, 2.99999999, 3).status).toBe("NORMAL");

    expect(St(6, 3, 3).disponivel).toBe(3);
    expect(St(6, 3, 3).status).toBe("LOW_STOCK");

    expect(St(6, 3.00000001, 3).disponivel).toBeCloseTo(2.99999999, 8);
    expect(St(6, 3.00000001, 3).status).toBe("LOW_STOCK");
  });
});

describe("Decimal do Prisma entra sem operador cru", () => {
  const D = (v: string | number) => new Prisma.Decimal(v);

  /*
   * O BUG QUE ESTA FUNCAO ELIMINA. Comparar dois Decimal com `<` faz comparacao
   * de STRING — o valueOf() do decimal.js devolve texto — e responde que 10 e
   * menor que 9. Dois pontos do projeto faziam exatamente isso.
   */
  it("10 contra minimo 9 e NORMAL, e nao LOW_STOCK", () => {
    expect(St(D("10"), D("0"), D("9")).status).toBe("NORMAL");
    // A prova de que o operador cru erraria:
    expect((D("10") as any) < (D("9") as any)).toBe(true);
  });

  it("100 contra minimo 20 e NORMAL", () => {
    expect(St(D("100"), D("0"), D("20")).status).toBe("NORMAL");
  });

  it("2 contra minimo 10 e LOW_STOCK", () => {
    expect(St(D("2"), D("0"), D("10")).status).toBe("LOW_STOCK");
  });

  it("Decimal com oito casas atravessa intacto", () => {
    const r = St(D("5.95555556"), D("0.04444444"), D("3"));
    expect(r.disponivel).toBeCloseTo(5.91111112, 8);
    expect(r.status).toBe("NORMAL");
  });

  it("mistura de Decimal e number funciona", () => {
    expect(St(D("10"), 8, 3).status).toBe("LOW_STOCK");
  });
});

describe("entrada torta nao quebra a tela", () => {
  it("null, undefined e NaN viram zero no saldo", () => {
    expect(St(null, null, null).status).toBe("OUT_OF_STOCK");
    expect(St(undefined, undefined, null).status).toBe("OUT_OF_STOCK");
    expect(St(NaN, 0, null).status).toBe("OUT_OF_STOCK");
    expect(St("lixo", 0, null).status).toBe("OUT_OF_STOCK");
  });

  it("minimo invalido e tratado como nao configurado", () => {
    expect(St(5, 0, NaN).status).toBe("NORMAL");
    expect(St(5, 0, "lixo").status).toBe("NORMAL");
    expect(St(5, 0, NaN).minimo).toBeNull();
  });

  it("string numerica e aceita", () => {
    expect(St("10", "8", "3").status).toBe("LOW_STOCK");
  });
});

describe("rotulo e faltante", () => {
  it("NORMAL nao tem rotulo: a ausencia e a mensagem", () => {
    expect(rotuloDoStatus("NORMAL")).toBeNull();
    expect(rotuloDoStatus("LOW_STOCK")).toBe("Estoque baixo");
    expect(rotuloDoStatus("OUT_OF_STOCK")).toBe("Sem estoque");
  });

  it("o faltante so existe em LOW_STOCK", () => {
    expect(faltanteParaOMinimo(St(10, 8, 3))).toBeCloseTo(1, 8); // 3 - 2
    expect(faltanteParaOMinimo(St(10, 0, 3))).toBeNull(); // NORMAL
    expect(faltanteParaOMinimo(St(0, 0, 3))).toBeNull(); // OUT_OF_STOCK
    expect(faltanteParaOMinimo(St(5, 0, null))).toBeNull(); // sem minimo
  });

  it("o faltante NUNCA e negativo", () => {
    for (const [h, r, m] of [[10, 8, 3], [3, 0, 3], [2.99999999, 0, 3]] as const) {
      const f = faltanteParaOMinimo(St(h, r, m));
      if (f !== null) expect(f).toBeGreaterThan(0);
    }
  });
});
