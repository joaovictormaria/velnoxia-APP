import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  VALIDADE_MS,
  atualizarContextoDeMesa,
  gravarContextoDeMesa,
  lerContextoDeMesa,
  limparContextoDeMesa,
} from "./contexto-de-mesa";

/*
 * PÚBLICO ≠ MESA — do lado do navegador.
 *
 * Este módulo é a única porta para o estado de mesa, e é ele que decide se um
 * pedido é de mesa ou é público. `null` significa vitrine pública, e o que
 * estes testes trancam é a lista de coisas que NÃO podem virar uma mesa:
 * contexto de outra loja, contexto vencido e as chaves globais da versão
 * antiga, que ficavam para sempre no aparelho de quem escaneasse uma mesa uma
 * única vez.
 */

/** `localStorage` de mentira: o módulo só usa estes três métodos. */
function storageFalso() {
  const mapa = new Map<string, string>();
  return {
    getItem: (k: string) => mapa.get(k) ?? null,
    setItem: (k: string, v: string) => void mapa.set(k, v),
    removeItem: (k: string) => void mapa.delete(k),
    get chaves() {
      return [...mapa.keys()];
    },
    bruto: mapa,
  };
}

let storage: ReturnType<typeof storageFalso>;
const janelaOriginal = (globalThis as any).window;

beforeEach(() => {
  storage = storageFalso();
  (globalThis as any).window = { localStorage: storage };
});

afterAll(() => {
  (globalThis as any).window = janelaOriginal;
});

const LOJA = "cantina-do-ze";
const OUTRA = "pizzaria-da-esquina";
const MESA = "mesa-uuid-1";

describe("mesa aberta pelo QR", () => {
  it("01 · devolve o contexto da loja onde foi aberto", () => {
    gravarContextoDeMesa(LOJA, { tableId: MESA, tableNumber: 7 });

    const c = lerContextoDeMesa(LOJA);
    expect(c?.tableId).toBe(MESA);
    expect(c?.tableNumber).toBe(7);
  });

  it("02 · o deviceToken do segundo aparelho entra depois, pelo PIN", () => {
    // O primeiro aparelho recebe o token no scan; o segundo, só quando o PIN
    // passa — telas adiante, com o contexto já aberto.
    gravarContextoDeMesa(LOJA, { tableId: MESA });
    expect(lerContextoDeMesa(LOJA)?.deviceToken).toBeNull();

    atualizarContextoDeMesa(LOJA, { deviceToken: "tok-123" });
    expect(lerContextoDeMesa(LOJA)?.deviceToken).toBe("tok-123");
  });

  it("03 · escanear de novo recomeça, não acumula", () => {
    gravarContextoDeMesa(LOJA, { tableId: MESA, deviceToken: "tok-velho" });
    gravarContextoDeMesa(LOJA, { tableId: "mesa-uuid-2" });

    const c = lerContextoDeMesa(LOJA);
    expect(c?.tableId).toBe("mesa-uuid-2");
    // O token da mesa anterior não sobrevive à troca de mesa.
    expect(c?.deviceToken).toBeNull();
  });

  it("04 · limpar encerra o contexto", () => {
    gravarContextoDeMesa(LOJA, { tableId: MESA });
    limparContextoDeMesa(LOJA);

    expect(lerContextoDeMesa(LOJA)).toBeNull();
  });
});

describe("o que NÃO pode virar uma mesa", () => {
  it("05 · loja sem contexto nenhum é pública", () => {
    expect(lerContextoDeMesa(LOJA)).toBeNull();
  });

  it("06 · contexto da loja A não vale na loja B", () => {
    /*
     * O CASO QUE CRUZAVA RESTAURANTES. A chave era global (`tableId`), então
     * escanear uma mesa num lugar e abrir o cardápio de outro mandava a mesa
     * do primeiro junto com o pedido do segundo.
     */
    gravarContextoDeMesa(LOJA, { tableId: MESA, deviceToken: "tok-123" });

    expect(lerContextoDeMesa(OUTRA)).toBeNull();
    expect(lerContextoDeMesa(LOJA)?.tableId).toBe(MESA);
  });

  it("07 · contexto vencido não é devolvido — e some na leitura", () => {
    gravarContextoDeMesa(LOJA, { tableId: MESA });

    // 24h + 1s depois: a mesma validade da sessão no banco.
    const guardado = JSON.parse(storage.getItem(`contextoDeMesa_${LOJA}`)!);
    guardado.expiraEm = Date.now() - 1000;
    storage.setItem(`contextoDeMesa_${LOJA}`, JSON.stringify(guardado));

    expect(lerContextoDeMesa(LOJA)).toBeNull();
    // Não basta ignorar: some, para não voltar a valer se o relógio mudar.
    expect(storage.getItem(`contextoDeMesa_${LOJA}`)).toBeNull();
  });

  it("08 · a validade é de 24 horas", () => {
    const antes = Date.now();
    gravarContextoDeMesa(LOJA, { tableId: MESA });
    const { expiraEm } = JSON.parse(storage.getItem(`contextoDeMesa_${LOJA}`)!);

    expect(VALIDADE_MS).toBe(24 * 60 * 60 * 1000);
    expect(expiraEm).toBeGreaterThanOrEqual(antes + VALIDADE_MS);
    expect(expiraEm).toBeLessThanOrEqual(Date.now() + VALIDADE_MS);
  });

  it("09 · atualizar NÃO renova o prazo", () => {
    /*
     * A validade é da sessão da mesa, contada de quando ela abriu. Se cada
     * remendo empurrasse o prazo, um aparelho ativo manteria a mesa viva no
     * navegador depois de o servidor já a ter encerrado — a divergência que
     * este módulo existe para acabar.
     */
    gravarContextoDeMesa(LOJA, { tableId: MESA });
    const antes = JSON.parse(storage.getItem(`contextoDeMesa_${LOJA}`)!).expiraEm;

    atualizarContextoDeMesa(LOJA, { deviceToken: "tok-123" });
    const depois = JSON.parse(storage.getItem(`contextoDeMesa_${LOJA}`)!).expiraEm;

    expect(depois).toBe(antes);
  });

  it("10 · atualizar sem contexto aberto não cria mesa nenhuma", () => {
    // Um PIN validado não inventa uma mesa que este navegador nunca escaneou.
    atualizarContextoDeMesa(LOJA, { deviceToken: "tok-123" });

    expect(lerContextoDeMesa(LOJA)).toBeNull();
  });

  it("11 · conteúdo corrompido é descartado, não adivinhado", () => {
    storage.setItem(`contextoDeMesa_${LOJA}`, "{isto não é json");
    expect(lerContextoDeMesa(LOJA)).toBeNull();

    storage.setItem(`contextoDeMesa_${LOJA}`, JSON.stringify({ semTableId: true }));
    expect(lerContextoDeMesa(LOJA)).toBeNull();
  });
});

describe("estado legado das chaves globais", () => {
  /** O aparelho de quem escaneou uma mesa antes desta mudança existir. */
  const semearLegado = () => {
    storage.setItem("tableId", "mesa-antiga");
    storage.setItem("tableNumber", "3");
    storage.setItem("deviceToken", "tok-antigo");
    storage.setItem("sessionId", "sessao-antiga");
    storage.setItem("pin", "1234");
  };

  it("12 · o legado NUNCA vira um contexto de mesa", () => {
    /*
     * O BUG DE PRODUÇÃO. Estas chaves eram globais e perpétuas — nada no
     * sistema apagava `tableId`. Quem escaneasse uma mesa uma vez pedia pela
     * vitrine pública para sempre como se estivesse sentado nela, e levava
     * "Sessão de mesa expirou ou PIN inválido" num pedido sem mesa nenhuma.
     */
    semearLegado();

    expect(lerContextoDeMesa(LOJA)).toBeNull();
  });

  it("13 · o legado é apagado na primeira leitura", () => {
    semearLegado();
    lerContextoDeMesa(LOJA);

    for (const k of ["tableId", "tableNumber", "deviceToken", "sessionId", "pin"]) {
      expect(storage.getItem(k)).toBeNull();
    }
  });

  it("14 · o legado também é apagado ao abrir uma mesa nova", () => {
    semearLegado();
    gravarContextoDeMesa(LOJA, { tableId: MESA });

    expect(storage.getItem("tableId")).toBeNull();
    expect(storage.getItem("deviceToken")).toBeNull();
    expect(lerContextoDeMesa(LOJA)?.tableId).toBe(MESA);
  });

  it("15 · o mapa de números da mesa, que já era por loja, fica", () => {
    // `tableNumbers_<slug>` sempre foi escopado e é usado no scan seguinte;
    // a limpeza mira só as chaves globais que causavam o vazamento.
    storage.setItem(`tableNumbers_${LOJA}`, JSON.stringify({ [MESA]: 7 }));
    semearLegado();

    lerContextoDeMesa(LOJA);

    expect(storage.getItem(`tableNumbers_${LOJA}`)).not.toBeNull();
  });
});

describe("sem navegador", () => {
  it("16 · no servidor não existe mesa, e nada quebra", () => {
    // O checkout renderiza no servidor antes de hidratar; ali não há storage.
    (globalThis as any).window = undefined;

    expect(lerContextoDeMesa(LOJA)).toBeNull();
    expect(() => gravarContextoDeMesa(LOJA, { tableId: MESA })).not.toThrow();
    expect(() => limparContextoDeMesa(LOJA)).not.toThrow();
  });

  it("17 · storage que lança vira ausência de mesa, não exceção", () => {
    // Aba anônima, cota estourada, site bloqueado: na dúvida, público.
    (globalThis as any).window = {
      localStorage: {
        getItem: () => {
          throw new Error("bloqueado");
        },
        setItem: () => {
          throw new Error("bloqueado");
        },
        removeItem: () => {
          throw new Error("bloqueado");
        },
      },
    };

    expect(lerContextoDeMesa(LOJA)).toBeNull();
    expect(() => gravarContextoDeMesa(LOJA, { tableId: MESA })).not.toThrow();
  });
});
