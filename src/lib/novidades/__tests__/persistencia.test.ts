import { beforeEach, describe, expect, it } from "vitest";
import { criarPersistencia, type ArmazenamentoSimples } from "../persistencia";

/**
 * A CAMADA QUE GUARDA O ESTADO, testada sem navegador.
 *
 * `criarPersistencia` recebe de onde tirar o armazenamento, em vez de alcançar
 * `window` por dentro. É o que permite exercitar aqui tanto o caminho feliz
 * quanto o armazenamento que EXPLODE — o caso da aba anônima, que é justamente
 * o que não dá para reproduzir num teste de navegador comum.
 */

/** Um `Storage` de mentira: o módulo só usa estes cinco membros. */
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

/** Um que falha em tudo, como o `localStorage` de uma aba anônima. */
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
  let local: ReturnType<typeof armazenamentoFalso>;
  let sessao: ReturnType<typeof armazenamentoFalso>;
  let p: ReturnType<typeof criarPersistencia>;

  beforeEach(() => {
    local = armazenamentoFalso();
    sessao = armazenamentoFalso();
    p = criarPersistencia(
      () => local,
      () => sessao,
    );
  });

  it("01 · marca CONCLUIDA e lê de volta", async () => {
    await p.marcar("u1", "n1", "CONCLUIDA");
    expect(await p.ler("u1")).toEqual([{ novidadeId: "n1", estado: "CONCLUIDA" }]);
  });

  it("02 · marca DISPENSADA e lê de volta", async () => {
    await p.marcar("u1", "n1", "DISPENSADA");
    expect(await p.ler("u1")).toEqual([{ novidadeId: "n1", estado: "DISPENSADA" }]);
  });

  it("03 · marcar de novo ATUALIZA, não duplica", async () => {
    await p.marcar("u1", "n1", "DISPENSADA");
    await p.marcar("u1", "n1", "CONCLUIDA");
    const registros = await p.ler("u1");
    expect(registros).toHaveLength(1);
    expect(registros[0].estado).toBe("CONCLUIDA");
  });

  it("04 · usuários no MESMO navegador têm estados independentes", async () => {
    // O caso real: o dono e o gerente usando o mesmo PC do balcão.
    await p.marcar("dono", "n1", "CONCLUIDA");
    expect(await p.ler("dono")).toHaveLength(1);
    expect(await p.ler("gerente")).toEqual([]);
  });

  it("05 · novidades diferentes do mesmo usuário não se atropelam", async () => {
    await p.marcar("u1", "n1", "CONCLUIDA");
    await p.marcar("u1", "n2", "DISPENSADA");
    const registros = await p.ler("u1");
    expect(registros).toHaveLength(2);
    expect(registros.find((r) => r.novidadeId === "n1")?.estado).toBe("CONCLUIDA");
    expect(registros.find((r) => r.novidadeId === "n2")?.estado).toBe("DISPENSADA");
  });

  it("06 · um id com dois-pontos sobrevive ao formato da chave", async () => {
    // A chave é `prefixo:usuario:id`. Se o id fosse recortado por split(':'),
    // um id assim voltaria truncado — e a novidade reapareceria para sempre.
    await p.marcar("u1", "recurso:2026:v2", "CONCLUIDA");
    expect(await p.ler("u1")).toEqual([{ novidadeId: "recurso:2026:v2", estado: "CONCLUIDA" }]);
  });

  it("07 · valor irreconhecível no armazenamento é ignorado, não quebra a leitura", async () => {
    await p.marcar("u1", "bom", "CONCLUIDA");
    local.dados.set("velnox:novidade:u1:estranho", "LIXO");
    const registros = await p.ler("u1");
    expect(registros).toEqual([{ novidadeId: "bom", estado: "CONCLUIDA" }]);
  });

  it("08 · chaves de outros sistemas no mesmo domínio são ignoradas", async () => {
    local.dados.set("velnox-painel-menu-recolhido", "1");
    local.dados.set("velnoxia:seen-orders", "[]");
    await p.marcar("u1", "n1", "CONCLUIDA");
    expect(await p.ler("u1")).toHaveLength(1);
  });

  it("09 · adiamento de sessão é por usuário e não vaza para o permanente", () => {
    p.adiarNaSessao("u1", "n1");
    expect(p.adiadasNaSessao("u1")).toEqual(["n1"]);
    expect(p.adiadasNaSessao("u2")).toEqual([]);
    // O ponto do adiamento: NADA é gravado no armazenamento permanente.
    expect(local.dados.size).toBe(0);
  });

  it("10 · armazenamento que EXPLODE não derruba nada — degrada em silêncio", async () => {
    const seguro = criarPersistencia(
      () => armazenamentoQueExplode,
      () => armazenamentoQueExplode,
    );
    await expect(seguro.marcar("u1", "n1", "CONCLUIDA")).resolves.toBeUndefined();
    // Sem estado gravado, a novidade reaparece — que é o pior caso aceitável.
    expect(await seguro.ler("u1")).toEqual([]);
    expect(() => seguro.adiarNaSessao("u1", "n1")).not.toThrow();
    expect(seguro.adiadasNaSessao("u1")).toEqual([]);
  });

  it("11 · armazenamento ausente (SSR) não quebra", async () => {
    const semJanela = criarPersistencia(
      () => null,
      () => null,
    );
    expect(await semJanela.ler("u1")).toEqual([]);
    await expect(semJanela.marcar("u1", "n1", "CONCLUIDA")).resolves.toBeUndefined();
    expect(semJanela.adiadasNaSessao("u1")).toEqual([]);
  });

  it("12 · até o ACESSO ao armazenamento pode lançar, e isso é tratado", async () => {
    // Em aba anônima, `window.localStorage` explode antes de qualquer getItem.
    const acessoProibido = criarPersistencia(
      () => {
        throw new Error("SecurityError");
      },
      () => {
        throw new Error("SecurityError");
      },
    );
    expect(await acessoProibido.ler("u1")).toEqual([]);
    expect(acessoProibido.adiadasNaSessao("u1")).toEqual([]);
  });
});
