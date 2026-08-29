/**
 * OS TIPOS DA CENTRAL DE NOVIDADES.
 *
 * Este arquivo não importa nada — nem React, nem Prisma, nem o roteador. É de
 * propósito: `selecao.ts` e `persistencia.ts` são lógica pura e precisam rodar
 * no ambiente `node` da suíte de testes, sem DOM e sem banco.
 *
 * O PAPEL É REDECLARADO AQUI, e não importado de `@prisma/client`, pelo mesmo
 * motivo. A união é estruturalmente idêntica à de `CurrentAdmin["role"]`, então
 * o compilador reclama se as duas divergirem — que é a proteção que o import
 * daria, sem a dependência que ele traria junto.
 */

export type Papel = "OWNER" | "MANAGER" | "COURIER";

/** De que lado do alvo o balão aparece. `baixo` é o padrão do motor. */
export type Posicao = "topo" | "baixo" | "esquerda" | "direita";

export type Passo = {
  /**
   * O seletor do elemento. A convenção da casa é `[data-tour="nome"]`.
   *
   * É um seletor completo, e não só o nome, porque um passo futuro pode
   * precisar de algo que não é um `data-tour` — e travar isso agora custaria
   * uma refatoração no motor no dia em que acontecer.
   */
  alvo: string;
  titulo: string;
  texto: string;
  /** Onde o alvo mora. Sem isto, o passo é procurado na tela atual. */
  rota?: string;
  posicao?: Posicao;
  /**
   * Um alvo que pode legitimamente não existir — uma lista vazia, um botão que
   * só aparece com dado. Não achou, pula, e o tour segue. Sem isto, uma loja
   * sem nenhuma conta em aberto veria o tutorial morrer no meio.
   */
  opcional?: boolean;
  /**
   * O PASSO SE DÁ POR CUMPRIDO QUANDO O USUÁRIO CHEGA A ESTA ROTA.
   *
   * Existe porque um passo pode destacar um link e mandar clicar nele — e aí o
   * clique é a resposta certa, não uma fuga do tutorial. Sem este campo, sair
   * da rota fazia o alvo sumir e o tour encerrar: o tutorial punia quem
   * obedeceu à instrução.
   *
   * Só vale depois que o destaque chegou a ser mostrado. Um tour que começa já
   * na rota de destino navega até o passo primeiro, mostra, e só então passa a
   * aceitar a chegada como cumprimento.
   *
   * É o primeiro (e por ora o único) tipo de "cumprir por ação" do motor. O
   * dia em que existir "cumprir ao clicar" ou "cumprir ao preencher", eles
   * entram como irmãos deste campo, sem mexer no resto.
   */
  avancaAoChegarEm?: string;
};

export type Video = {
  src: string;
  poster?: string;
};

/**
 * O BLOCO EXPLICATIVO que aparece abaixo do vídeo.
 *
 * Existe porque um vídeo sozinho não é lido por quem está com pressa, e a
 * descrição do topo é curta demais para listar o que a funcionalidade entrega.
 * Este bloco é o meio-termo: escaneável, sem virar um manual.
 *
 * Todos os campos além do título são opcionais — uma novidade pode querer só a
 * lista, só o parágrafo, ou os dois. Sem `destaques` na novidade, nada disso é
 * renderizado e o modal fica exatamente como era.
 */
export type Destaques = {
  /** Cabeçalho da seção. Ex.: "💡 O que há de novo?" */
  titulo: string;
  /** Uma linha de chamada, com mais peso que o corpo. */
  chamada?: string;
  /** Um parágrafo curto explicando a mudança. */
  texto?: string;
  /**
   * O que a pessoa ganha, uma linha cada.
   *
   * O emoji faz parte da string, e não de um campo próprio: assim cada item é
   * um texto só, e quem escreve o catálogo escolhe o ícone sem depender de um
   * mapa de nomes mantido em outro arquivo.
   */
  itens?: string[];
};

export type Novidade = {
  /**
   * PERMANENTE. É por ele que o sistema sabe quem já viu o quê, então ele não
   * pode acompanhar o título: se "A Receber" virar "Pagamentos pendentes"
   * amanhã, o id continua `pagamentos-em-aberto-2026` e ninguém recebe o
   * mesmo aviso duas vezes.
   */
  id: string;
  /** `false` = invisível para todo mundo. É o interruptor de lançamento. */
  publicada: boolean;
  titulo: string;
  descricao: string;
  /** Ausente = todo mundo que alcança o painel. */
  papeis?: Papel[];
  /** Ausente = modal sem vídeo, e isso é um caso válido. */
  video?: Video;
  /** Ausente = sem o bloco explicativo. O modal segue inteiro sem ele. */
  destaques?: Destaques;
  /** Ausente ou vazio = novidade só de aviso, sem tour. Também é válido. */
  passos?: Passo[];
};

/**
 * Os dois estados que ENCERRAM uma novidade para um usuário.
 *
 * Fechar o modal não está aqui, e não é esquecimento: fechar é adiar, vive só
 * na sessão e não é uma decisão que mereça memória permanente.
 */
export type Estado = "CONCLUIDA" | "DISPENSADA";

export type Registro = {
  novidadeId: string;
  estado: Estado;
};
