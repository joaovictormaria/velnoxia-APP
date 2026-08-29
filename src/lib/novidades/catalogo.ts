import type { Novidade } from "./tipos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  O CATÁLOGO DE NOVIDADES DA VELNOX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este é o ÚNICO arquivo que se edita para lançar uma novidade. Nenhum modal
 * novo, nenhum tour novo, nenhuma rota, nenhuma tabela, nenhuma migration.
 *
 * ── PARA LANÇAR UMA NOVIDADE ───────────────────────────────────────────────
 *
 *   1. Acrescente um objeto neste array, com `publicada: false`.
 *   2. Ponha `data-tour="..."` nos elementos que o tour vai destacar.
 *   3. Coloque o vídeo em `public/novidades/<id>.mp4`, se houver.
 *   4. Troque para `publicada: true` no dia do lançamento.
 *
 * ── O QUE UMA NOVIDADE PODE SER ────────────────────────────────────────────
 *
 *   · só aviso           → sem `video`, sem `passos`
 *   · só vídeo           → com `video`, sem `passos`
 *   · só tour            → sem `video`, com `passos`
 *   · vídeo + tour       → os dois
 *
 * As quatro combinações funcionam. O modal se ajusta sozinho: sem `video` não
 * há área de vídeo, sem `passos` o botão principal vira "Entendi" e conclui
 * ali mesmo, em vez de abrir um tour vazio.
 *
 * ── SOBRE O ID ─────────────────────────────────────────────────────────────
 *
 * O `id` é PERMANENTE e não acompanha o título. É por ele que o sistema sabe
 * quem já viu o quê: renomear a funcionalidade não pode fazer o aviso voltar
 * para quem já o dispensou.
 *
 * A ordem do array é a ordem de exibição. Uma por vez.
 */
export const CATALOGO: Novidade[] = [
  {
    id: "pagamentos-em-aberto-2026",

    /*
     * ⚠️ NÃO PUBLICADA. Enquanto estiver `false`, ninguém vê — e a Central
     * sequer monta: nenhuma leitura de armazenamento, nenhum observer,
     * nenhum listener em nenhuma tela do painel.
     *
     * Trocar para `true` é o lançamento.
     */
    publicada: true,

    /*
     * Só quem tem o painel. O entregador é barrado antes, no `beforeLoad` da
     * rota do admin, mas a lista fica explícita: uma novidade financeira não
     * deve depender de um redirecionamento em outro arquivo para não vazar.
     */
    papeis: ["OWNER", "MANAGER"],

    /*
     * O título é uma PERGUNTA, e é de propósito: "A Receber" nomeava o card do
     * painel, e quem nunca clicou nele não sabia o que o nome queria dizer.
     * A pergunta encontra o dono no problema que ele já tem.
     *
     * Trocar isto não mexe em quem já viu a novidade — a memória é presa ao
     * `id`, não ao texto. É exatamente para isso que o `id` existe.
     */
    titulo: "Clientes da casa pagam depois?",
    /*
     * A descrição RESPONDE o título. Antes ela anunciava a funcionalidade
     * ("agora você acompanha…"), o que servia enquanto o título era o nome do
     * card; com o título virando pergunta, uma segunda frase de anúncio
     * deixava a pergunta no ar.
     */
    descricao:
      "Agora o fiado sai do caderno. Você aceita o pedido, deixa a cobrança em " +
      "aberto e registra o pagamento quando o dinheiro entra.",

    /*
     * O vídeo mora em `public/`, então o caminho é a URL pública — não há
     * import: arquivos de `public/` são servidos direto, sem passar pelo bundle.
     *
     * 1920×1080 — 16:9 EXATO, igual à moldura `aspect-video` do modal. É o
     * único dos vídeos testados que preenche o quadro inteiro: sem tarja em
     * cima, embaixo ou nas laterais, e sem nada cortado.
     *
     * ⚠️ 21,7 MB para 27,5s (~6,3 Mbps). Como `public/` é versionado, este peso
     * entra no histórico do git para sempre. Reduzir a taxa de bits pela metade
     * cortaria o arquivo ao meio sem diferença visível numa gravação de tela.
     */
    video: { src: "/novidades/pagamentos-em-aberto-2026.mp4" },

    /*
     * O bloco explicativo abaixo do vídeo. Some inteiro se este campo sair.
     */
    destaques: {
      /*
       * "O QUE HÁ DE NOVO" SAIU DAQUI porque o título e a descrição já
       * respondem isso. Este bloco passa a responder a pergunta seguinte, que
       * é a que sobra: e na prática, o que muda?
       */
      titulo: "💡 O que muda no dia a dia",

      /*
       * SEM `chamada` E SEM `texto`, de propósito.
       *
       * As duas repetiam a descrição do topo com outras palavras — a novidade
       * era anunciada três vezes antes de alguém chegar ao botão. Sobrou a
       * lista, que é a única parte que diz algo que as frases acima não dizem.
       */

      /*
       * Cada linha é uma capacidade REAL, verificada no código, e não uma
       * paráfrase da anterior:
       *   1. `abrirFiado` põe o pedido em PREPARING — a cozinha não espera
       *   2. o card "Em aberto agora" da tela de recebimentos
       *   3. as colunas cliente / saldo / diasEmAberto da tabela
       *   4. `receberPagamento` aceita valor menor que o saldo
       */
      itens: [
        "🧾 Aceite o pedido sem receber na hora — ele entra na fila normalmente",
        "👀 Veja num lugar só quanto a loja tem para receber",
        "📋 Saiba quem está devendo, quanto e há quantos dias",
        "💰 Registre o pagamento quando ele chegar, inteiro ou em partes",
      ],
    },

    passos: [
      {
        alvo: '[data-tour="a-receber"]',
        rota: "/admin",
        titulo: "A Receber",
        texto:
          "Aqui aparece quanto sua loja ainda tem a receber e quantas contas " +
          "estão em aberto. Clique para ver os detalhes.",
        posicao: "baixo",
        /*
         * O texto acima manda clicar — então o clique precisa CUMPRIR o passo.
         *
         * O alvo é um link para a tela de recebimentos. Sem esta linha, clicar
         * nele tirava o alvo da tela e o tour encerrava por "alvo obrigatório
         * ausente": o tutorial desistia de quem obedeceu à instrução. Com ela,
         * chegar ao destino avança para o passo 2, que é exatamente onde a
         * pessoa acabou de chegar.
         */
        avancaAoChegarEm: "/admin/relatorios/recebimentos",
      },
      {
        alvo: '[data-tour="total-em-aberto"]',
        rota: "/admin/relatorios/recebimentos",
        titulo: "O total em aberto",
        texto:
          "Este é o total em aberto agora. Você também pode chegar aqui pelo " +
          "card do painel ou pelo menu Relatórios → Pagamentos em aberto.",
        posicao: "baixo",
      },
      {
        alvo: '[data-tour="lista-em-aberto"]',
        rota: "/admin/relatorios/recebimentos",
        titulo: "Quem está devendo",
        texto:
          "Aqui você encontra cada cliente, o saldo em aberto e há quantos " +
          "dias o pagamento está pendente.",
        posicao: "topo",
      },
      {
        alvo: '[data-tour="botao-receber"]',
        rota: "/admin/relatorios/recebimentos",
        titulo: "Registrar o recebimento",
        texto:
          "Quando o cliente pagar, clique em Receber. Você também pode " +
          "registrar um pagamento parcial e manter o restante em aberto.",
        posicao: "esquerda",
        /*
         * OPCIONAL, E ISSO NÃO É DETALHE.
         *
         * Este botão só existe numa linha da tabela, e a tabela só tem linha se
         * a loja tiver alguma conta em aberto. Numa loja que nunca fiou — ou
         * numa que acabou de receber tudo — o elemento não existe no DOM.
         *
         * Sem esta marca, o tutorial morreria no último passo exatamente para
         * quem está com as contas em dia.
         */
        opcional: true,
      },
    ],
  },
];
