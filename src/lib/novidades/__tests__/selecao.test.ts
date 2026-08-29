import { describe, expect, it } from "vitest";
import { cumpriuPorNavegacao, escolherNovidade, haNovidadePublicada } from "../selecao";
import type { Novidade, Passo, Registro } from "../tipos";

/**
 * A REGRA DE "APARECE OU NÃO APARECE", exercitada sozinha.
 *
 * `escolherNovidade` é pura de propósito — sem React, sem DOM, sem rede —, e é
 * por isso que estes testes rodam no ambiente `node` que a suíte já usa, sem
 * jsdom e sem nenhuma dependência nova.
 */

function novidade(sobrescreve: Partial<Novidade> = {}): Novidade {
  return {
    id: "n1",
    publicada: true,
    titulo: "Título",
    descricao: "Descrição",
    ...sobrescreve,
  };
}

describe("haNovidadePublicada", () => {
  it("é falso com o catálogo vazio", () => {
    expect(haNovidadePublicada([])).toBe(false);
  });

  it("é falso quando tudo está despublicado — o portão que desliga o sistema", () => {
    expect(haNovidadePublicada([novidade({ publicada: false })])).toBe(false);
  });

  it("basta uma publicada", () => {
    expect(
      haNovidadePublicada([novidade({ id: "a", publicada: false }), novidade({ id: "b" })]),
    ).toBe(true);
  });
});

describe("escolherNovidade", () => {
  it("01 · publicada e sem estado nenhum → aparece", () => {
    expect(escolherNovidade([novidade()], [], "OWNER")?.id).toBe("n1");
  });

  it("02 · CONCLUIDA → não aparece", () => {
    const registros: Registro[] = [{ novidadeId: "n1", estado: "CONCLUIDA" }];
    expect(escolherNovidade([novidade()], registros, "OWNER")).toBeNull();
  });

  it("03 · DISPENSADA → não aparece", () => {
    const registros: Registro[] = [{ novidadeId: "n1", estado: "DISPENSADA" }];
    expect(escolherNovidade([novidade()], registros, "OWNER")).toBeNull();
  });

  it("04 · publicada: false nunca aparece, mesmo sem estado", () => {
    expect(escolherNovidade([novidade({ publicada: false })], [], "OWNER")).toBeNull();
  });

  it("05 · papel fora da lista → não aparece", () => {
    const n = novidade({ papeis: ["OWNER"] });
    expect(escolherNovidade([n], [], "MANAGER")).toBeNull();
    expect(escolherNovidade([n], [], "OWNER")?.id).toBe("n1");
  });

  it("06 · sem `papeis`, vale para qualquer papel", () => {
    expect(escolherNovidade([novidade()], [], "MANAGER")?.id).toBe("n1");
    expect(escolherNovidade([novidade()], [], "COURIER")?.id).toBe("n1");
  });

  it("07 · duas pendentes → devolve a primeira do catálogo, uma por vez", () => {
    const catalogo = [novidade({ id: "a" }), novidade({ id: "b" })];
    expect(escolherNovidade(catalogo, [], "OWNER")?.id).toBe("a");
  });

  it("08 · resolvida a primeira, a segunda assume", () => {
    const catalogo = [novidade({ id: "a" }), novidade({ id: "b" })];
    const registros: Registro[] = [{ novidadeId: "a", estado: "CONCLUIDA" }];
    expect(escolherNovidade(catalogo, registros, "OWNER")?.id).toBe("b");
  });

  it("09 · catálogo vazio → null, sem lançar", () => {
    expect(escolherNovidade([], [], "OWNER")).toBeNull();
  });

  it("10 · novidade sem vídeo é válida", () => {
    const escolhida = escolherNovidade([novidade()], [], "OWNER");
    expect(escolhida).not.toBeNull();
    expect(escolhida?.video).toBeUndefined();
  });

  it("11 · novidade sem passos é válida — lançamento só de aviso", () => {
    const escolhida = escolherNovidade([novidade()], [], "OWNER");
    expect(escolhida).not.toBeNull();
    expect(escolhida?.passos).toBeUndefined();
  });

  it("12 · estado desconhecido é IGNORADO e não encerra a novidade", () => {
    // Um valor de uma versão futura não pode esconder um aviso: errar para o
    // lado de mostrar de novo é melhor do que sumir com ele em silêncio.
    const registros = [{ novidadeId: "n1", estado: "SEI_LA" }] as unknown as Registro[];
    expect(escolherNovidade([novidade()], registros, "OWNER")?.id).toBe("n1");
  });

  it("13 · registro de id que não está no catálogo não quebra nada", () => {
    const registros: Registro[] = [{ novidadeId: "novidade-que-sumiu", estado: "CONCLUIDA" }];
    expect(escolherNovidade([novidade()], registros, "OWNER")?.id).toBe("n1");
  });

  it("14 · o estado do usuário A não alcança o usuário B", () => {
    // A separação é por quem chama: cada usuário traz os SEUS registros. Com os
    // do A, some; com os do B (vazios), aparece. O mesmo catálogo, dois
    // resultados — que é o requisito de independência entre usuários.
    const registrosDoA: Registro[] = [{ novidadeId: "n1", estado: "CONCLUIDA" }];
    const registrosDoB: Registro[] = [];
    expect(escolherNovidade([novidade()], registrosDoA, "OWNER")).toBeNull();
    expect(escolherNovidade([novidade()], registrosDoB, "OWNER")?.id).toBe("n1");
  });

  it("15 · adiada na sessão some agora e volta quando a sessão acaba", () => {
    const catalogo = [novidade()];
    expect(escolherNovidade(catalogo, [], "OWNER", ["n1"])).toBeNull();
    // Sessão nova: a lista de adiadas nasce vazia, e a novidade reaparece —
    // fechar o modal nunca foi uma decisão permanente.
    expect(escolherNovidade(catalogo, [], "OWNER", [])?.id).toBe("n1");
  });

  it("16 · sem papel conhecido, nada aparece", () => {
    expect(escolherNovidade([novidade()], [], null)).toBeNull();
    expect(escolherNovidade([novidade()], [], undefined)).toBeNull();
  });
});

/**
 * A regra que decide se um clique no alvo foi OBEDIÊNCIA (cumpre o passo) ou
 * saída (encerra o tour). É a mais fácil de errar do motor, e é por isso que
 * ela mora numa função pura em vez de dentro de um efeito do React.
 */
describe("cumpriuPorNavegacao", () => {
  const comLink: Passo = {
    alvo: '[data-tour="a-receber"]',
    rota: "/admin",
    titulo: "A Receber",
    texto: "Clique para ver os detalhes.",
    avancaAoChegarEm: "/admin/relatorios/recebimentos",
  };
  const semAcao: Passo = {
    alvo: '[data-tour="total-em-aberto"]',
    titulo: "Total",
    texto: "...",
  };

  it("01 · exibido + chegou na rota esperada → cumpriu", () => {
    expect(cumpriuPorNavegacao(comLink, "/admin/relatorios/recebimentos", comLink)).toBe(true);
  });

  it("02 · ainda na rota do próprio passo → não cumpriu", () => {
    expect(cumpriuPorNavegacao(comLink, "/admin", comLink)).toBe(false);
  });

  it("03 · foi para OUTRA rota qualquer → não cumpriu (vale a regra de sempre)", () => {
    expect(cumpriuPorNavegacao(comLink, "/admin/estoque", comLink)).toBe(false);
  });

  it("04 · ⚠️ na rota certa mas o destaque NUNCA foi mostrado → não cumpriu", () => {
    /*
     * A guarda que impede o passo 1 de ser pulado sem ninguém ver.
     * Cenário real: a pessoa já está em /admin/relatorios/recebimentos quando
     * o tour começa. O motor ainda vai navegar até /admin para mostrar o
     * passo; se a rota atual bastasse, o passo seria dado por cumprido aqui e
     * o tour abriria direto no passo 2.
     */
    expect(cumpriuPorNavegacao(comLink, "/admin/relatorios/recebimentos", null)).toBe(false);
  });

  it("05 · o exibido é OUTRO passo → não cumpriu", () => {
    // Evita o efeito dominó: avançar não pode cumprir o passo seguinte só
    // porque a rota atual coincide com o que ele espera.
    expect(cumpriuPorNavegacao(comLink, "/admin/relatorios/recebimentos", semAcao)).toBe(false);
  });

  it("06 · passo sem `avancaAoChegarEm` nunca cumpre por navegação", () => {
    expect(cumpriuPorNavegacao(semAcao, "/admin/relatorios/recebimentos", semAcao)).toBe(false);
  });

  it("07 · sem passo → false, sem lançar", () => {
    expect(cumpriuPorNavegacao(null, "/admin", null)).toBe(false);
    expect(cumpriuPorNavegacao(undefined, "/admin", undefined)).toBe(false);
  });

  it("08 · a comparação de rota é exata — um prefixo não cumpre", () => {
    expect(cumpriuPorNavegacao(comLink, "/admin/relatorios", comLink)).toBe(false);
    expect(cumpriuPorNavegacao(comLink, "/admin/relatorios/recebimentos/123", comLink)).toBe(false);
  });
});
