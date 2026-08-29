import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarPersistencia, type ArmazenamentoSimples } from "../persistencia";
import type { Estado, Registro } from "../tipos";

/**
 * O ADAPTADOR, testado sem navegador e sem banco.
 *
 * Depois da migração para o servidor, o que sobrou aqui para testar é
 * exatamente o que o adaptador ainda decide sozinho:
 *
 *   1. que a identidade NÃO atravessa a assinatura — `marcar` recebe dois
 *      argumentos, não três, e é isso que impede o chamador de escolher em
 *      nome de quem gravar;
 *   2. que uma falha de rede degrada para "a novidade reaparece", nunca para
 *      "o painel quebra" nem para "some para sempre";
 *   3. que o adiamento continua sendo de aba, e nunca vai ao servidor.
 *
 * Quem já viu o quê passou a ser assunto do banco, e é testado contra o
 * Postgres em `src/server/services/__tests__/novidades.test.ts`.
 */

/** Um `sessionStorage` de mentira: o módulo só usa estes cinco membros. */
function armazenamentoFalso(): ArmazenamentoSimples & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
    removeItem: (k) => void dados.delete(k),
    key: (i) => [...dados.keys()][i] ?? null,
    get length() {
      return dados.size;
    },
  };
}

/** Um que falha em tudo, como o de uma aba anônima. */
const armazenamentoQueExplode: ArmazenamentoSimples = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
  key: () => {
    throw new Error("SecurityError");
  },
  get length(): number {
    throw new Error("SecurityError");
  },
};

describe("persistência de novidades", () => {
  let sessao: ReturnType<typeof armazenamentoFalso>;
  // Os tipos vão no `vi.fn<...>()`: sem eles o mock infere uma assinatura
  // genérica que não encaixa no parâmetro de `criarPersistencia`.
  let servidor: {
    ler: ReturnType<typeof vi.fn<() => Promise<Registro[]>>>;
    marcar: ReturnType<typeof vi.fn<(novidadeId: string, estado: Estado) => Promise<void>>>;
  };
  let p: ReturnType<typeof criarPersistencia>;

  beforeEach(() => {
    sessao = armazenamentoFalso();
    servidor = {
      ler: vi.fn<() => Promise<Registro[]>>(async () => []),
      marcar: vi.fn<(novidadeId: string, estado: Estado) => Promise<void>>(async () => {}),
    };
    p = criarPersistencia(() => sessao, servidor);
  });

  it("01 · ler devolve o que o servidor respondeu", async () => {
    servidor.ler.mockResolvedValueOnce([
      { novidadeId: "n1", estado: "CONCLUIDA" },
    ] satisfies Registro[]);
    expect(await p.ler()).toEqual([{ novidadeId: "n1", estado: "CONCLUIDA" }]);
  });

  it("02 · ler NÃO envia argumento nenhum — não há o que pedir", async () => {
    await p.ler();
    expect(servidor.ler).toHaveBeenCalledWith();
  });

  it("03 · marcar envia SOMENTE novidadeId e estado", async () => {
    await p.marcar("n1", "CONCLUIDA");
    /*
     * A asserção central desta suíte. Se um dia alguém acrescentar um terceiro
     * argumento com o usuário, este teste cai — e é justamente esse argumento
     * que abriria a porta para gravar em nome de outra pessoa.
     */
    expect(servidor.marcar).toHaveBeenCalledWith("n1", "CONCLUIDA");
    expect(servidor.marcar.mock.calls[0]).toHaveLength(2);
  });

  it("04 · marcar DISPENSADA chega ao servidor como tal", async () => {
    await p.marcar("n1", "DISPENSADA");
    expect(servidor.marcar).toHaveBeenCalledWith("n1", "DISPENSADA");
  });

  it("05 · servidor fora do ar na leitura → lista vazia, sem lançar", async () => {
    servidor.ler.mockRejectedValueOnce(new Error("network"));
    /*
     * Vazio faz a novidade REAPARECER. O oposto — inventar que já foi vista —
     * esconderia o aviso para sempre por causa de uma falha momentânea.
     */
    await expect(p.ler()).resolves.toEqual([]);
  });

  it("06 · servidor fora do ar na gravação → não derruba o painel", async () => {
    servidor.marcar.mockRejectedValueOnce(new Error("500"));
    await expect(p.marcar("n1", "CONCLUIDA")).resolves.toBeUndefined();
  });

  it("07 · adiar é de ABA e nunca vai ao servidor", () => {
    p.adiarNaSessao("n1");
    expect(p.adiadasNaSessao()).toEqual(["n1"]);
    // O ponto do adiamento: nenhuma chamada de rede acontece.
    expect(servidor.marcar).not.toHaveBeenCalled();
  });

  it("08 · id com dois-pontos sobrevive ao formato da chave de sessão", () => {
    // A chave é `prefixo:id`. Recortada por split(':'), voltaria truncada.
    p.adiarNaSessao("recurso:2026:v2");
    expect(p.adiadasNaSessao()).toEqual(["recurso:2026:v2"]);
  });

  it("09 · chaves de outros sistemas na mesma aba são ignoradas", () => {
    sessao.dados.set("velnoxia:seen-orders", "[]");
    sessao.dados.set("velnox:intro-seen", "1");
    p.adiarNaSessao("n1");
    expect(p.adiadasNaSessao()).toEqual(["n1"]);
  });

  it("10 · sessionStorage que EXPLODE não derruba nada", () => {
    const seguro = criarPersistencia(() => armazenamentoQueExplode, servidor);
    expect(() => seguro.adiarNaSessao("n1")).not.toThrow();
    expect(seguro.adiadasNaSessao()).toEqual([]);
  });

  it("11 · sem window (SSR) o adiamento é no-op", () => {
    const semJanela = criarPersistencia(() => null, servidor);
    expect(() => semJanela.adiarNaSessao("n1")).not.toThrow();
    expect(semJanela.adiadasNaSessao()).toEqual([]);
  });

  it("12 · até o ACESSO ao armazenamento pode lançar, e isso é tratado", () => {
    // Em aba anônima, `window.sessionStorage` explode antes de qualquer getItem.
    const acessoProibido = criarPersistencia(() => {
      throw new Error("SecurityError");
    }, servidor);
    expect(acessoProibido.adiadasNaSessao()).toEqual([]);
  });

  it("13 · o adaptador não escreve NADA de permanente no navegador", async () => {
    await p.marcar("n1", "CONCLUIDA");
    await p.ler();
    /*
     * A prova de que o `localStorage` deixou de ser fonte de verdade: depois de
     * concluir e reler, o único armazenamento local tocado é o de sessão — e
     * mesmo ele, só pelo adiamento, que não aconteceu aqui.
     */
    expect(sessao.dados.size).toBe(0);
  });
});
