/**
 * OS TIPOS DO CONTRATO DE PLANOS.
 *
 * Este arquivo não importa NADA — nem Prisma, nem React, nem o roteador. É a
 * mesma escolha de `src/lib/novidades/tipos.ts` e pelo mesmo motivo: o
 * catálogo e a regra de entitlement precisam rodar no ambiente `node` da
 * suíte, sem banco e sem DOM, e precisam poder ser importados tanto pelo
 * servidor quanto pelo navegador sem arrastar dependência nenhuma junto.
 *
 * ─── O QUE É PLANO E O QUE NÃO É ───────────────────────────────────────────
 *
 * `Plano` tem DOIS valores, e só dois. TRIAL não está aqui, e a ausência é a
 * decisão mais importante deste arquivo: trial é um ESTADO TEMPORAL da conta,
 * não um terceiro conjunto de recursos. Enquanto o teste corre, a loja usa o
 * conjunto do PREMIUM — o mesmo objeto, não uma cópia. Se TRIAL fosse um
 * `Plano`, alguém teria de manter uma terceira lista sincronizada com a do
 * PREMIUM, e o dia em que as duas divergissem seria o dia em que um cliente em
 * teste deixaria de ver algo que lhe foi vendido.
 *
 * Quem decide o plano efetivo é `planoEfetivo()`, em `entitlements.ts`.
 */

/** Os dois planos comerciais da Velnoxia. TRIAL não é plano — ver acima. */
export type Plano = "BASIC" | "PREMIUM";

/**
 * Os recursos que um plano libera.
 *
 * GRANULARIDADE DE MÓDULO, e não de microfunção. Um recurso aqui corresponde
 * a uma área que o cliente reconhece e que a tabela comercial nomeia — não a
 * cada botão do painel. Entitlement por microfunção vira uma lista de centenas
 * de chaves que ninguém administra, e a primeira consequência é que a tabela
 * de preços deixa de descrever o produto.
 *
 * O nome é PERMANENTE, como o `id` de uma novidade: ele vai aparecer em
 * guardas de rota e de server function, e renomeá-lo é reescrever chamadas
 * espalhadas. O rótulo comercial pode mudar sem tocar aqui.
 */
export type Recurso =
  // ---- Essenciais: presentes nos dois planos ----
  | "CARDAPIO"
  | "PEDIDOS"
  | "BALCAO"
  | "DASHBOARD"
  | "CLIENTES"
  | "CONFIGURACOES"
  | "ASSINATURA"
  | "DELIVERY_BASICO"
  // ---- Avançados: só no PREMIUM ----
  | "ESTOQUE"
  | "PRODUCAO"
  | "RECEITAS"
  | "FINANCEIRO"
  | "FIADO"
  | "MESAS"
  | "FUNCIONARIOS"
  | "BENEFICIOS"
  | "MARKETING"
  | "RELATORIOS"
  | "AUDITORIA"
  | "DELIVERY_AVANCADO";

/**
 * O estado comercial da loja, do ponto de vista de PLANO.
 *
 * NÃO responde "esta conta pode entrar?" — isso é `conferirAcesso()`, em
 * `src/server/billing/access.ts`, que já existe e continua sendo a única
 * autoridade sobre trial vencido, assinatura vencida, tolerância e suspensão.
 * São duas perguntas diferentes:
 *
 *   conferirAcesso  → a porta da casa está aberta?
 *   temRecurso      → este cômodo faz parte do que ela contratou?
 *
 * Misturar as duas foi o que deixou o `EntitlementsService` antigo devolvendo
 * "plano TRIAL" para uma conta SUSPENDED — um estado que confunde bloqueio
 * com plano e não serve para nenhuma das duas perguntas. A Fase 2 vai juntar
 * os dois vereditos num lugar só; aqui eles ficam separados de propósito.
 */
export type EstadoDoPlano = {
  /**
   * O plano que a loja de fato contratou.
   *
   * Ainda NÃO existe coluna para isto no banco — é a Fase 2 que a cria. Este
   * tipo já a antecipa para que a regra pura possa ser escrita e testada
   * antes, sem migration e sem tocar em produção.
   */
  plano: Plano;
  /**
   * A loja está dentro dos 14 dias de teste NESTE INSTANTE?
   *
   * Booleano, e não a data: a comparação com o relógio pertence a quem tem o
   * relógio. Uma função pura que chamasse `new Date()` por dentro seria
   * impossível de testar em ponto no tempo, e é exatamente por não fazer isso
   * que `conferirAcesso()` é testável — a mesma disciplina vale aqui.
   */
  emTrial: boolean;
};
