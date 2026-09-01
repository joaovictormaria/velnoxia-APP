import { describe, expect, it } from "vitest";
import { recursoNoEstado, resolverPlano } from "../resolucao";
import { TODOS_OS_RECURSOS } from "../catalogo";
import type { Recurso } from "../tipos";

/*
 * DO QUE ESTÁ GRAVADO PARA O QUE VALE AGORA.
 *
 * `resolverPlano` é pura — sem Prisma, sem relógio — então estes testes rodam
 * no ambiente `node` da suíte, sem banco. Quem lê a coluna e olha as horas é
 * `estadoComercialDaLoja()`, testada em `src/server/billing/__tests__/`.
 *
 * O caso que mais importa aqui é o TERCEIRO estado: a loja legada, com
 * `plan = null` e fora do teste. Ela não pode virar BASIC nem PREMIUM por
 * omissão, e é para isso que existe `INDEFINIDO`.
 */

describe("a matriz de resolução — plano armazenado × teste", () => {
  it("BASIC fora do teste → BASIC", () => {
    const r = resolverPlano("BASIC", false);
    expect(r.efetivo).toBe("BASIC");
    expect(r.armazenado).toBe("BASIC");
    expect(r.emTrial).toBe(false);
    expect(r.legado).toBe(false);
  });

  it("PREMIUM fora do teste → PREMIUM", () => {
    const r = resolverPlano("PREMIUM", false);
    expect(r.efetivo).toBe("PREMIUM");
    expect(r.legado).toBe(false);
  });

  it("BASIC EM TESTE → PREMIUM — a regra comercial definitiva", () => {
    const r = resolverPlano("BASIC", true);
    expect(r.efetivo).toBe("PREMIUM");
    // O contratado não é reescrito: acabado o teste, ele volta a valer.
    expect(r.armazenado).toBe("BASIC");
    expect(r.emTrial).toBe(true);
    expect(r.legado).toBe(false);
  });

  it("PREMIUM em teste → PREMIUM, sem rebaixar", () => {
    const r = resolverPlano("PREMIUM", true);
    expect(r.efetivo).toBe("PREMIUM");
    expect(r.armazenado).toBe("PREMIUM");
  });

  /*
   * O CASO COMUM, e não a exceção: toda loja nova nasce `plan = null` em
   * TRIAL. Se o nulo fosse tratado antes do teste, ela abriria o painel sem
   * recurso nenhum — o oposto do que os 14 dias existem para fazer.
   */
  it("SEM PLANO em teste → PREMIUM — é a loja recém-criada", () => {
    const r = resolverPlano(null, true);
    expect(r.efetivo).toBe("PREMIUM");
    expect(r.armazenado).toBeNull();
    expect(r.legado).toBe(false);
  });
});

describe("a loja legada — sem plano e sem teste", () => {
  const legada = resolverPlano(null, false);

  it("fica INDEFINIDA, e o armazenado continua nulo", () => {
    expect(legada.efetivo).toBeNull();
    expect(legada.armazenado).toBeNull();
    expect(legada.legado).toBe(true);
  });

  it("NÃO vira BASIC automaticamente", () => {
    expect(legada.efetivo).not.toBe("BASIC");
  });

  it("NÃO vira PREMIUM automaticamente", () => {
    expect(legada.efetivo).not.toBe("PREMIUM");
  });

  /*
   * O ponto do terceiro valor. `false` a rebaixaria a BASIC — e ela usa o
   * sistema inteiro hoje; `true` a promoveria a PREMIUM — entregando de graça
   * o que se vende. As duas são classificações comerciais que ninguém tomou.
   */
  it("nenhum recurso responde PERMITIDO nem BLOQUEADO — todos INDEFINIDO", () => {
    for (const recurso of TODOS_OS_RECURSOS) {
      expect(recursoNoEstado(legada, recurso)).toBe("INDEFINIDO");
    }
  });
});

describe("recursoNoEstado — o veredito por recurso", () => {
  const avancados: Recurso[] = ["PRODUCAO", "RECEITAS", "FINANCEIRO", "FIADO", "MESAS"];
  const essenciais: Recurso[] = ["CARDAPIO", "PEDIDOS", "BALCAO", "DASHBOARD"];

  it("BASIC libera essencial e bloqueia avançado", () => {
    const basic = resolverPlano("BASIC", false);
    for (const r of essenciais) expect(recursoNoEstado(basic, r)).toBe("PERMITIDO");
    for (const r of avancados) expect(recursoNoEstado(basic, r)).toBe("BLOQUEADO");
  });

  it("PREMIUM libera tudo", () => {
    const premium = resolverPlano("PREMIUM", false);
    for (const r of TODOS_OS_RECURSOS) expect(recursoNoEstado(premium, r)).toBe("PERMITIDO");
  });

  it("BASIC em teste libera tudo — inclusive o que o plano dele não tem", () => {
    const emTeste = resolverPlano("BASIC", true);
    for (const r of TODOS_OS_RECURSOS) expect(recursoNoEstado(emTeste, r)).toBe("PERMITIDO");
  });

  /*
   * O trial já foi aplicado ao produzir `efetivo`. Aplicá-lo de novo aqui
   * seria inofensivo hoje (PREMIUM de PREMIUM é PREMIUM) e passaria a mentir
   * no dia em que existisse plano acima do Premium. Por isso a delegação passa
   * `emTrial: false`.
   */
  it("o teste não é aplicado duas vezes", () => {
    const emTeste = resolverPlano("BASIC", true);
    expect(emTeste.efetivo).toBe("PREMIUM");
    expect(recursoNoEstado(emTeste, "ESTOQUE")).toBe("PERMITIDO");
  });
});

describe("o fim do teste devolve o contratado, sem escolher nada", () => {
  it("teste vencido com BASIC contratado → BASIC", () => {
    expect(resolverPlano("BASIC", false).efetivo).toBe("BASIC");
  });

  it("teste vencido com PREMIUM contratado → PREMIUM", () => {
    expect(resolverPlano("PREMIUM", false).efetivo).toBe("PREMIUM");
  });

  it("teste vencido sem nada contratado → INDEFINIDO, nunca um chute", () => {
    expect(resolverPlano(null, false).efetivo).toBeNull();
  });

  it("o armazenado nunca é reescrito pela resolução", () => {
    for (const armazenado of ["BASIC", "PREMIUM", null] as const) {
      for (const emTrial of [true, false]) {
        expect(resolverPlano(armazenado, emTrial).armazenado).toBe(armazenado);
      }
    }
  });
});
