import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ESSENCIAIS,
  EXCLUSIVOS_DO_PREMIUM,
  ROTULO_DO_PLANO,
  TODOS_OS_RECURSOS,
} from "@/lib/planos/catalogo";
import { PRECO_MENSAL, precoEscrito } from "@/lib/plano";
import { limitesEscritos, VANTAGENS_DO_BASICO } from "../EscolhaDePlano";

/*
 * A TELA COMERCIAL DOS PLANOS.
 *
 * O projeto não tem jsdom, então não há render aqui. O que se prova é o que
 * de fato pode dar errado numa página de preços:
 *
 *   · o botão do Básico abrir o checkout do Premium;
 *   · a lista de vantagens divergir da matriz que o servidor aplica;
 *   · um preço digitado à mão envelhecer;
 *   · dois cliques abrirem duas assinaturas;
 *   · a loja legada ser classificada por omissão.
 *
 * Os três primeiros são pegos por lógica pura; os outros, lendo a fonte.
 */

const componente = readFileSync(resolve(__dirname, "../EscolhaDePlano.tsx"), "utf8");
const pagina = readFileSync(
  resolve(__dirname, "../../../../routes/admin/assinatura.tsx"),
  "utf8",
);
const porta = readFileSync(
  resolve(__dirname, "../../../../server/functions/billing.fn.ts"),
  "utf8",
);

/*
 * Comentários deste projeto citam o que o código NÃO faz. Toda asserção de
 * ausência olha o código sem eles.
 */
const semComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  1·2 · O BOTÃO MANDA O PLANO CERTO
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("1·2 · cada botão abre o checkout do seu plano", () => {
  it("o plano é obrigatório na porta — não existe padrão para errar", () => {
    expect(porta).toContain('z.enum(["BASIC", "PREMIUM"])');
    expect(porta).toContain("criarCheckout(admin.storeId, data.plano)");
    // Sem plano não há chamada: um `criarCheckout(storeId)` solto voltaria a
    // depender do padrão, e o botão do Básico cobraria Premium.
    expect(semComentarios(porta)).not.toMatch(/criarCheckout\(\s*admin\.storeId\s*\)/);
  });

  it("o card manda o plano dele, e o card é quem sabe qual é", () => {
    expect(componente).toContain("aoContratar={() => aoContratar(atual)}");
    expect(componente).toContain('(["BASIC", "PREMIUM"] as const).map');
  });

  it("a página repassa o plano recebido até a porta", () => {
    expect(pagina).toContain("iniciarAssinaturaFn({ data: { plano } })");
    expect(pagina).toContain("aoContratar={(plano) => assinar.mutate(plano)}");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  3·4 · OS PREÇOS
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("3·4 · os preços exibidos", () => {
  // O pt-BR separa "R$" do número com NBSP (U+00A0), não com espaço comum.
  const semNbsp = (s: string) => s.replace(/ /g, " ");

  it("Básico R$ 267 e Premium R$ 360", () => {
    expect(PRECO_MENSAL.BASIC).toBe(267);
    expect(PRECO_MENSAL.PREMIUM).toBe(360);
    expect(semNbsp(precoEscrito("BASIC"))).toBe("R$ 267,00");
    expect(semNbsp(precoEscrito("PREMIUM"))).toBe("R$ 360,00");
  });

  it("nenhum preço é digitado dentro da tela", () => {
    /*
      A busca é por valor em REAIS. Procurar "300" cru reprovaria
      `text-neutral-300`, que é uma cor do Tailwind e não um preço.
    */
    const codigo = semComentarios(componente);
    expect(codigo).not.toMatch(/R\$\s?\d/);
    expect(codigo).not.toMatch(/\b(267|360)\b/);
    // O preço vem do módulo central, junto com o Price do Stripe.
    expect(codigo).toContain("precoEscrito(");
  });

  it("os tetos viram frase a partir do catálogo, sem número digitado", () => {
    expect(limitesEscritos("BASIC")).toBe("Até 50 produtos e 10 categorias");
    expect(limitesEscritos("PREMIUM")).toBe("Produtos e categorias ilimitados");
    expect(semComentarios(componente)).not.toContain("50 produtos");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  A LISTA DE VANTAGENS NÃO PODE DIVERGIR DA MATRIZ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * É o teste que mais vale deste arquivo. Quando ESTOQUE desceu para o BASIC,
 * uma lista digitada aqui continuaria vendendo como Premium algo que o Básico
 * já tem — e ninguém perceberia até um cliente reclamar.
 */
describe("as vantagens saem do catálogo, não de uma lista escrita à mão", () => {
  it("o Básico anuncia exatamente os essenciais, menos a própria assinatura", () => {
    expect([...VANTAGENS_DO_BASICO].sort()).toEqual(
      [...ESSENCIAIS].filter((r) => r !== "ASSINATURA").sort(),
    );
    expect(VANTAGENS_DO_BASICO).not.toContain("ASSINATURA");
  });

  it("o Básico anuncia ESTOQUE, porque a matriz o inclui", () => {
    expect(VANTAGENS_DO_BASICO).toContain("ESTOQUE");
    expect(EXCLUSIVOS_DO_PREMIUM).not.toContain("ESTOQUE");
  });

  it("o Premium anuncia exatamente os exclusivos", () => {
    expect(componente).toContain("EXCLUSIVOS_DO_PREMIUM");
    for (const recurso of ["PRODUCAO", "RECEITAS", "FINANCEIRO", "AUDITORIA"] as const) {
      expect(EXCLUSIVOS_DO_PREMIUM).toContain(recurso);
    }
  });

  it("os dois blocos juntos cobrem o catálogo inteiro", () => {
    const anunciados = new Set([...VANTAGENS_DO_BASICO, ...EXCLUSIVOS_DO_PREMIUM, "ASSINATURA"]);
    expect([...anunciados].sort()).toEqual([...TODOS_OS_RECURSOS].sort());
  });

  it("nenhum nome de recurso é digitado na tela", () => {
    const codigo = semComentarios(componente);
    expect(codigo).toContain("ROTULO_DO_RECURSO[");
    expect(codigo).toContain("DESCRICAO_DO_RECURSO[");
    // "Fichas técnicas", "Mesas com QR Code" etc. moram no catálogo.
    expect(codigo).not.toContain("Fichas técnicas");
    expect(codigo).not.toContain("Mesas com QR Code");
  });

  it("os nomes dos planos também vêm do catálogo", () => {
    expect(ROTULO_DO_PLANO).toEqual({ BASIC: "Básico", PREMIUM: "Premium" });
    expect(componente).toContain("ROTULO_DO_PLANO[qual]");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  5·6 · O TESTE DE 14 DIAS
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("5·6 · os 14 dias grátis aparecem", () => {
  it("o selo e a promessa estão no cabeçalho", () => {
    expect(componente).toContain("14 dias grátis");
    expect(componente).toContain("Comece grátis por 14 dias com acesso completo ao Premium.");
  });

  it("durante o teste, a tela diz que o Premium está liberado", () => {
    // Ternário, e não `&&`: em teste sai a faixa; fora dele, o selo.
    expect(componente).toContain("plano.emTrial ?");
    expect(componente).toContain("Você está no período de teste");
    expect(componente).toContain("Todos os recursos Premium estão liberados.");
  });

  /*
   * A tela LÊ o trial; não o calcula e não o grava. Um segundo calendário aqui
   * divergiria do `conferirAcesso`, que é quem decide.
   */
  it("a tela não reimplementa o trial", () => {
    const codigo = semComentarios(componente);
    expect(codigo).not.toContain("trialEndsAt");
    expect(codigo).not.toContain("14 *");
    expect(codigo).not.toContain("TRIAL_DAYS");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  7·10 · PLANO ATUAL, E A LOJA QUE NÃO TEM PLANO
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("7·10 · o plano atual, e o legado que não é classificado", () => {
  it("o selo sai do plano ARMAZENADO, não do efetivo", () => {
    /*
     * A distinção é o ponto: uma loja BASIC em teste USA Premium, e dizer
     * "Plano atual: Premium" para ela seria mostrar um plano que ela não
     * contratou — e que some quando o teste acabar.
     */
    expect(componente).toContain("ehPlanoAtual={plano.armazenado === atual}");
    expect(componente).toContain("Plano atual");
    expect(semComentarios(componente)).not.toContain("plano.efetivo");
  });

  it("plan = null não vira BASIC nem PREMIUM", () => {
    /*
      A linha saiu de dentro do card do Básico: ali parecia falar sobre o
      Básico, e texto cinza embaixo de um CTA lê como erro. Agora é uma frase
      da CONTA, abaixo dos dois cards — e some durante o teste, porque o
      cabeçalho já explicou a situação da loja em teste.
    */
    expect(componente).toContain("plano.armazenado === null && !plano.emTrial");
    expect(componente).toContain("Plano não definido");
    const codigo = semComentarios(componente);
    expect(codigo).not.toMatch(/armazenado\s*\?\?\s*"BASIC"/);
    expect(codigo).not.toMatch(/plan(o)?\s*===\s*["'](PREMIUM|BASIC)["']/);
  });

  /*
   * A seleção INICIAL cai no Premium quando não há plano contratado. Isso é
   * escolha de vitrine — qual card já vem em destaque — e não classificação:
   * `naoClassificado` continua verdadeiro e o selo "Plano atual" não acende.
   */
  it("a seleção inicial não é o mesmo que classificar", () => {
    expect(componente).toContain('useState<Plano>(plano.armazenado ?? "PREMIUM")');
    expect(componente).toContain("ehPlanoAtual={plano.armazenado === atual}");
    // O selo "Seu plano atual" continua saindo do armazenado, não da seleção.
    expect(componente).not.toContain("ehPlanoAtual={selecionado");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  8 · DOIS CLIQUES NÃO ABREM DUAS ASSINATURAS
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("8 · carregando, e sem duplo clique", () => {
  it("o estado guarda QUAL plano está abrindo", () => {
    expect(pagina).toContain("useState<Plano | null>(null)");
    expect(pagina).toContain("setContratando(plano)");
  });

  it("qualquer checkout em curso desabilita os DOIS botões", () => {
    // `ocupado` é "algum plano abrindo", não "este plano abrindo".
    expect(componente).toContain("const ocupado = contratando !== null;");
    expect(componente).toContain("disabled={ocupado}");
    expect(componente).toContain("disabled={ocupado || !vendaveis[selecionado]}");
  });

  it("o botão comunica o carregamento a quem não enxerga", () => {
    expect(componente).toContain("aria-busy={contratando}");
    expect(componente).toContain("Abrindo o pagamento…");
    expect(componente).toContain("animate-spin");
  });

  /*
   * Sucesso NÃO destrava o botão: a navegação leva a página embora, e
   * destravá-lo antes daria uma janela para o segundo clique.
   */
  it("o sucesso navega sem devolver o botão", () => {
    const sucesso = pagina.slice(pagina.indexOf("onSuccess:"), pagina.indexOf("onError:"));
    expect(sucesso).toContain("window.location.href = r.url");
    expect(sucesso).toContain("setContratando(null)");
    // O `setContratando(null)` do sucesso só roda no ramo de ERRO devolvido.
    expect(sucesso).toContain("setErro(r.error)");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  9 · ERRO AMIGÁVEL
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("9 · o erro não vaza nada", () => {
  it("a mensagem é de produto", () => {
    expect(pagina).toContain("Não foi possível abrir o pagamento. Tente de novo.");
  });

  it("nem a porta nem a tela devolvem detalhe técnico", () => {
    // O erro do Stripe vai para o log do servidor, nunca para a resposta.
    expect(porta).toContain("console.error(");
    const resposta = porta.slice(porta.indexOf("iniciarAssinaturaFn"));
    expect(resposta).not.toMatch(/error:\s*(erro|String\(erro\)|erro\.message)/);
    expect(semComentarios(pagina)).not.toMatch(/price_|sk_live|prisma/i);
  });

  it("um plano sem Price configurado nem convida", () => {
    expect(porta).toContain("planoVendavel(data.plano)");
    expect(porta).toContain("Este plano ainda não está disponível para contratação.");
    expect(componente).toContain("Este plano ainda não está disponível para contratação.");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  NENHUM CHECKOUT PARALELO, E A ACESSIBILIDADE
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("contrato da tela", () => {
  it("quem já assina troca de plano pelo portal, não por um segundo checkout", () => {
    expect(componente).toContain("temAssinatura ?");
    expect(componente).toContain("Gerenciar assinatura");
    expect(pagina).toContain("abrirPortalFn()");
  });

  it("a escolha é um grupo de opções de verdade", () => {
    expect(componente).toContain('role="radiogroup"');
    expect(componente).toContain('role="radio"');
    expect(componente).toContain("aria-checked={selecionado}");
    expect(componente).toContain('aria-label="Planos disponíveis"');
  });

  it("a expansão dos recursos é anunciada", () => {
    expect(componente).toContain("aria-expanded={comparando}");
    expect(componente).toContain('aria-controls="comparacao-de-planos"');
  });

  /*
   * O elemento INTEIRO, e não só a tag de abertura: um `onClick={() => …}`
   * tem um ">" dentro da seta, e cortar no primeiro ">" deixaria o
   * `className` de fora — o teste reprovaria um botão que tem foco visível.
   */
  it("todo controle tem foco visível", () => {
    const botoes = componente
      .split("<button")
      .slice(1)
      .map((trecho) => trecho.slice(0, trecho.indexOf("</button")));

    expect(botoes.length).toBeGreaterThan(3);
    for (const botao of botoes) {
      expect(botao, botao.slice(0, 80)).toContain("focus-visible:outline");
    }
  });

  /*
   * Ícone DECORATIVO é escondido; ícone que CARREGA a informação é rotulado.
   * O ✓ e o — da tabela de comparação são a resposta inteira daquela célula —
   * escondê-los deixaria a linha muda para quem usa leitor de tela. Por isso a
   * asserção aceita as duas formas, e cobra que nenhuma fique sem nenhuma.
   */
  it("todo ícone é escondido do leitor de tela ou rotulado", () => {
    const icones =
      componente.match(/<(Check|Minus|Sparkles|ArrowRight|ChevronDown|Loader2)[\s\S]*?\/>/g) ?? [];
    expect(icones.length).toBeGreaterThan(5);
    for (const icone of icones) {
      const escondido = icone.includes('aria-hidden="true"');
      const rotulado = icone.includes("aria-label=");
      expect(escondido || rotulado, icone.slice(0, 60)).toBe(true);
    }
  });

  it("respeita quem pediu menos animação", () => {
    const transicoes = componente.match(/transition-\w+/g) ?? [];
    expect(transicoes.length).toBeGreaterThan(0);
    expect(componente).toContain("motion-reduce:transition-none");
  });

  it("empilha no celular e abre em duas colunas no desktop", () => {
    expect(componente).toContain("md:grid-cols-2");
    // A barra fixa do CTA é só do celular; no desktop os cards bastam.
    expect(componente).toContain("md:hidden");
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  O AJUSTE DE UX — compactação, equilíbrio e um aviso só
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("a tela é compacta e os cards se equilibram", () => {
  /*
   * O DESEQUILÍBRIO ERA O PROBLEMA: onze itens no Premium contra oito no
   * Básico faziam o card escuro ficar quase o dobro da altura, e o CTA dele
   * caía fora da primeira tela. Três coisas seguram isso juntas.
   */
  it("os dois cards terminam na mesma linha", () => {
    expect(componente).toContain("items-stretch");
    expect(componente).toContain("flex h-full flex-col");
    // O CTA é empurrado para o fim, então sobra espaço no card mais curto em
    // vez de o mais longo crescer.
    expect(componente).toContain('className="mt-auto pt-5"');
  });

  /*
    A LISTA É DE UMA COLUNA, e as duas tentativas anteriores estão registradas
    aqui porque nenhuma delas deve voltar sem que o card volte a ser largo:

      grade de 2 colunas → as células de uma linha compartilham altura, então
        "Fiado e contas a receber" abria um buraco ao lado de "Financeiro";
      `columns` de texto → resolveu os degraus, mas pressupõe card largo.

    Com 280px de card, qualquer uma das duas deixaria ~112px por coluna e
    "Entregadores e rastreamento" quebraria em três linhas.
  */
  it("a lista de recursos é de uma coluna, à altura do card estreito", () => {
    expect(componente).toContain('<ul className="space-y-1.5">');
    expect(componente).not.toContain("columns-2");
    /*
      A checagem é sobre a LISTA, não sobre o arquivo: `md:grid-cols-2`
      continua existindo, e legitimamente — é a grade que põe os dois CARDS
      lado a lado, que é outra coisa.
    */
    expect(componente).toContain('className="grid items-stretch gap-4 md:grid-cols-2"');
  });

  it("o preço é o maior elemento do card", () => {
    expect(componente).toContain("text-4xl");
    expect(componente).toContain("tabular-nums");
    expect(componente).toContain("/mês");
  });
});

describe("um aviso só sobre o teste", () => {
  /*
   * Havia três: a tarja de situação da página, o selo verde e a faixa verde
   * da seção de planos — a mesma informação em três cores. Agora a situação
   * se cala durante o teste, e quem comunica é o cabeçalho da escolha.
   */
  it("a faixa de situação se cala durante o teste", () => {
    expect(pagina).toContain('data.acesso.motivo !== "trial" && <Situacao data={data} />');
  });

  it("mas continua inteira para os estados que pedem ação", () => {
    // Suspensa, vencida, cartão recusado e cancelamento agendado não aparecem
    // na seção de planos — só esta faixa os comunica.
    expect(pagina).toContain("function Situacao(");
    expect(pagina).toContain("Assinatura vencida");
    expect(pagina).toContain("Não conseguimos cobrar seu cartão");
  });

  it("a data do teste chega pronta, e a tela não a calcula", () => {
    expect(pagina).toContain(
      'fimDoTeste={data.acesso.motivo === "trial" ? dataEscrita(data.trialEndsAt) : null}',
    );
    expect(semComentarios(componente)).not.toContain("trialEndsAt");
    expect(componente).toContain("fimDoTeste");
  });
});

describe("quem já tem o plano não recebe oferta dele", () => {
  it("o card do plano atual troca o CTA por um estado", () => {
    expect(componente).toContain("ehPlanoAtual && !temAssinatura ?");
    // O selo no topo do card…
    expect(componente).toContain("Seu plano atual");
    // …e o lugar onde estaria o botão.
    expect(componente).toContain("              Plano atual\n");
  });

  it("e o outro card mantém o convite", () => {
    expect(componente).toContain("Começar com o {ROTULO_DO_PLANO[qual]}");
  });
});

describe("a comparação completa", () => {
  /*
   * TABELA a partir de 640px, AGRUPADO abaixo disso — e as duas da mesma fonte.
   *
   * A tabela vale também na coluna da direita: quando o teto de largura passou
   * para a coluna dos PLANOS, a comparação virou quem absorve a sobra do
   * monitor e ficou larga o bastante para ela.
   *
   * No celular não cabe tabela. O que estava ali era uma lista que repetia
   * "Básico" e "Premium" em cada uma das vinte linhas — vinte vezes a mesma
   * palavra para dizer o que dois cabeçalhos dizem uma vez. Virou dois grupos,
   * com o plano dito uma vez no topo de cada.
   */
  it("é tabela na faixa larga e agrupada no celular, da mesma fonte", () => {
    expect(componente).toContain("RECURSOS_COMPARADOS");
    expect(componente).toContain("RECURSOS_DO_PLANO[plano].has(recurso)");
    expect(componente).toContain('className="hidden w-full border-collapse text-sm sm:table"');

    // O celular agrupa em vez de repetir o nome do plano linha a linha.
    expect(componente).toContain("<GrupoDeRecursos");
    expect(componente).toContain('titulo="Nos dois planos"');
    expect(componente).not.toContain("sm:max-lg:hidden");
  });

  /*
   * O cabeçalho gruda no topo enquanto a lista rola dentro do painel: sem
   * isso, na décima linha ninguém sabe mais qual coluna é qual.
   */
  it("o cabeçalho da tabela acompanha a rolagem", () => {
    expect(componente).toContain("sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50");
  });

  it("no desktop ela fica ao lado dos planos, e não embaixo", () => {
    /*
      Duas colunas a partir de 1024: planos à esquerda, comparação à direita.

      O teto está na coluna dos PLANOS, e quem absorve a largura extra do
      monitor é a comparação. Invertido — `1fr` nos planos — os cards
      engordariam junto com a tela e o preço ficaria perdido no meio de um
      card de 500px.
    */
    expect(componente).toContain("lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]");
    expect(componente).toContain("<aside");
    // Rolando a comparação, os preços continuam à vista.
    expect(componente).toContain("lg:sticky");
    // E a lista rola dentro do painel, sem esticar a coluna.
    expect(componente).toContain("lg:max-h-[60vh] lg:overflow-y-auto");
  });

  it("continua expansível, e o cabeçalho do painel é o botão", () => {
    expect(componente).toContain("Compare todos os recursos");
    expect(componente).toContain("aria-expanded={comparando}");
    expect(componente).toContain("{comparando && (");
  });

  it("cobre o catálogo inteiro, menos a própria assinatura", () => {
    const esperado = [...VANTAGENS_DO_BASICO, ...EXCLUSIVOS_DO_PREMIUM];
    expect(esperado).toHaveLength(TODOS_OS_RECURSOS.length - 1);
    expect(esperado).not.toContain("ASSINATURA");
  });

  it("a tabela tem cabeçalho de linha e de coluna", () => {
    expect(componente).toContain('scope="col"');
    expect(componente).toContain('scope="row"');
  });
});

describe("o carregamento não faz a página pular", () => {
  /*
   * O rótulo do botão NÃO muda: trocar "Começar com o Premium" por "Abrindo o
   * pagamento…" mudaria a largura e faria o card inteiro pular no clique. Só
   * o ícone vira spinner, e o aviso vai para uma região viva.
   */
  it("só o ícone muda; o texto do botão fica", () => {
    const cta = componente.slice(
      componente.indexOf("onClick={aoContratar}"),
      componente.indexOf("naoClassificado &&"),
    );
    expect(cta).toContain("Começar com o {ROTULO_DO_PLANO[qual]}");
    expect(cta).toContain("animate-spin");
    expect(cta).toContain('<span className="sr-only" role="status">');
    expect(cta).toContain("Abrindo o pagamento…");
  });
});
