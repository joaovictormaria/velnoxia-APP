import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { recursoDaRota } from "@/lib/planos/navegacao";
import { bloqueioDaRotaNoPlano } from "@/components/admin/planos/cadeado-do-menu";
import { resolverPlano } from "@/lib/planos/resolucao";

/*
 * A VISÃO GERAL DOS RELATÓRIOS.
 *
 * A tela era um índice de cinco links soltos, com o aviso "funcionalidade em
 * desenvolvimento" — e obrigava a abrir um relatório para responder a pergunta
 * mais comum, que é "como foi o período". Os números passaram a morar aqui; o
 * detalhe continua em cada relatório.
 *
 * Sem jsdom no projeto, isto lê a fonte. O que se prova é o que pode
 * apodrecer: a lista de destinos divergir do mapa central de rotas, e o
 * resumo financeiro ser buscado por quem não tem o módulo.
 */

const tela = readFileSync(resolve(__dirname, "../index.tsx"), "utf8");

const semComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** Os destinos que a tela oferece, lidos da própria lista. */
const destinos = [...tela.matchAll(/to: "(\/admin\/relatorios\/[a-z-]+)"/g)].map((m) => m[1]);

describe("os cards de relatório", () => {
  it("oferece os cinco relatórios", () => {
    expect(new Set(destinos)).toEqual(
      new Set([
        "/admin/relatorios/receita",
        "/admin/relatorios/dashboard-kpi",
        "/admin/relatorios/historico",
        "/admin/relatorios/produtos",
        "/admin/relatorios/funcionarios",
      ]),
    );
  });

  /*
   * O TESTE QUE MAIS VALE AQUI. Um destino fora de `RECURSO_DA_ROTA` seria um
   * card que ninguém sabe classificar — e que apareceria aberto para quem não
   * tem o módulo, porque o cadeado não teria o que perguntar.
   */
  it("todo destino está no mapa central de rotas", () => {
    for (const rota of destinos) {
      expect(recursoDaRota(rota), `${rota} fora de RECURSO_DA_ROTA`).not.toBeNull();
    }
  });

  it("a tela não mantém lista de permissão própria", () => {
    const codigo = semComentarios(tela);
    expect(codigo).toContain("bloqueioDaRotaNoPlano(admin?.store.plano, r.to)");
    expect(codigo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
    expect(codigo).not.toContain("RECURSOS_DO_PLANO");
  });

  /*
   * O CARD BLOQUEADO NÃO SOME. Escondê-lo faria a loja nunca descobrir que o
   * relatório existe — e é ele que dá motivo para assinar. Mesma escolha da
   * barra lateral e das abas do estoque.
   */
  it("o bloqueado aparece com cadeado, e sem link", () => {
    expect(tela).toContain("if (bloqueado) {");
    expect(tela).toContain("<Lock");
    expect(tela).toContain("Disponível no Premium");
    // O nome do módulo vem do catálogo, não digitado.
    expect(tela).toContain("ROTULO_DO_RECURSO[bloqueado]");
  });

  /*
   * A prova de que o cadeado responde ao plano de verdade: hoje o relatório
   * de funcionários exige FUNCIONARIOS, e o BASIC não tem.
   */
  it("no BASIC, os cards pagos acendem o cadeado", () => {
    const basic = resolverPlano("BASIC", false);
    for (const rota of destinos) {
      expect(bloqueioDaRotaNoPlano(basic, rota), rota).not.toBeNull();
    }
  });

  it("no PREMIUM, nenhum acende", () => {
    const premium = resolverPlano("PREMIUM", false);
    for (const rota of destinos) {
      expect(bloqueioDaRotaNoPlano(premium, rota), rota).toBeNull();
    }
  });
});

describe("o resumo financeiro", () => {
  /*
   * O RESUMO É FINANCEIRO; A TELA É RELATORIOS. Hoje andam juntos no Premium,
   * mas a pergunta é feita mesmo assim: separados um dia, a consulta nem sai,
   * em vez de disparar uma requisição que o servidor recusaria e deixar a tela
   * com um erro no lugar dos números.
   */
  it("não é buscado por quem não tem FINANCEIRO", () => {
    expect(tela).toContain(
      'recursoNoEstado(admin.store.plano, "FINANCEIRO") !== "BLOQUEADO"',
    );
    expect(tela).toContain("enabled: temFinanceiro,");
    expect(tela).toContain("{temFinanceiro && (");
  });

  it("usa a função que já existe, sem consulta nova", () => {
    expect(tela).toContain("getFinancialKPIs({ data: { days: dias } })");
    // Nenhum número é recalculado na tela: os quatro cards leem o que veio.
    expect(tela).toContain("kpi?.totalSalesValue");
    expect(tela).toContain("kpi?.totalProfit");
    expect(tela).toContain("kpi?.averageOrderValue");
    expect(tela).toContain("kpi?.totalCost");
  });

  /*
   * A RESSALVA DA COBERTURA É O QUE IMPEDE A LEITURA ERRADA: o lucro só mede
   * o que tem custo conhecido. Sem ela, uma loja com metade do cardápio sem
   * ficha técnica leria a margem como se fosse do faturamento inteiro — e
   * decidiria preço com ela.
   */
  it("avisa quando a apuração não cobre tudo", () => {
    expect(tela).toContain("kpi.cobertura < 100");
    expect(tela).toContain("saíram sem custo conhecido");
    expect(tela).toContain("moeda(kpi.receitaSemCusto)");
  });

  it("e não avisa quando não há o que ressalvar", () => {
    // A condição exige cobertura conhecida E abaixo de 100.
    expect(tela).toContain("kpi.cobertura != null && kpi.cobertura < 100");
  });

  /*
   * O esqueleto tem a mesma altura do número. Sem isso os cards mudam de
   * tamanho quando a consulta responde, e a página inteira pula.
   */
  it("o carregamento não faz a página pular", () => {
    expect(tela).toContain("animate-pulse");
    expect(tela).toContain("h-9 w-32");
  });

  it("a margem nula é dita, e não virada em zero", () => {
    expect(tela).toContain("kpi?.margemApurada == null");
    expect(tela).toContain("Margem ainda não apurada");
  });
});

describe("o que saiu da tela", () => {
  /*
   * O aviso "Funcionalidade em desenvolvimento" ficou anos numa tela que era
   * o índice de cinco relatórios prontos — e dizia ao lojista que o módulo
   * pelo qual ele paga ainda não existe.
   */
  it("não diz mais que está em desenvolvimento", () => {
    expect(tela).not.toContain("em desenvolvimento");
  });

  it("os links soltos com <br> deram lugar a cards", () => {
    expect(tela).not.toContain("<br />");
    expect(tela).toContain("CartaoDeRelatorio");
  });
});
