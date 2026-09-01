import type { Plano, Recurso } from "./tipos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A MATRIZ COMERCIAL DA VELNOXIA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este é o ÚNICO arquivo que se edita para mover um recurso entre os planos.
 * Nenhuma rota, nenhuma server function, nenhuma tela e nenhuma migration.
 *
 * ── PARA MOVER UM RECURSO DE PREMIUM PARA BASIC ────────────────────────────
 *
 *   Tire a linha de `EXCLUSIVOS_DO_PREMIUM` e ponha em `ESSENCIAIS`.
 *   Só isso. O PREMIUM continua tendo o recurso — ver abaixo por quê.
 *
 * ── PREMIUM CONTÉM BASIC, POR CONSTRUÇÃO ───────────────────────────────────
 *
 * `RECURSOS_DO_PREMIUM` é a UNIÃO de `ESSENCIAIS` com `EXCLUSIVOS_DO_PREMIUM`,
 * calculada aqui. Não é uma segunda lista escrita à mão.
 *
 * A diferença não é estética. Com duas listas independentes, acrescentar um
 * recurso ao BASIC e esquecer de acrescentá-lo ao PREMIUM produz o absurdo
 * comercial de um cliente que paga mais e recebe menos — e nada no sistema
 * reclamaria. Aqui esse estado é irrepresentável: tudo que o BASIC tem, o
 * PREMIUM tem, porque é a mesma origem.
 */

/**
 * O que TODO plano inclui — o núcleo que faz a loja funcionar.
 *
 * `ASSINATURA` está aqui e nunca deve sair. É a tela onde se paga: um plano
 * que não a incluísse trancaria o cliente do lado de fora do próprio
 * pagamento. Pela mesma razão, `billing.fn.ts` já não passa por
 * `requireAdminSession()` — a conta bloqueada precisa chegar até lá.
 *
 * `DELIVERY_BASICO` é o pedido de entrega em si: endereço, taxa, frete grátis,
 * pedido mínimo e tempo estimado. O que fica no PREMIUM é `DELIVERY_AVANCADO`
 * — cadastro e convite de entregadores, despacho, posição ao vivo e o link de
 * acompanhamento com rastreio. A loja BASIC entrega; ela só não gerencia uma
 * frota.
 *
 * `ESTOQUE` desceu para cá em 31/08/2026, por decisão comercial de João.
 * É o estoque como controle de quantidade: item, entrada, saída, ajuste,
 * perda, devolução, estorno, saldo, custo de compra, alerta e histórico de
 * movimentação. Uma loja que vende comida precisa saber o que tem na
 * prateleira, e cobrar por isso empurrava o BASIC para a planilha.
 *
 * ⚠️ O QUE **NÃO** DESCEU JUNTO, e a distinção é o coração desta mudança:
 * `PRODUCAO` (preparados, ordem de produção, estorno de produção) e
 * `RECEITAS` (ficha técnica) continuam no Premium. Elas convivem com o
 * estoque na mesma tela e mexem nas mesmas tabelas, mas são outro trabalho:
 * uma conta o que existe, a outra transforma insumo em produto. Ter estoque
 * nunca deve abrir nenhuma das duas.
 */
export const ESSENCIAIS: readonly Recurso[] = [
  "CARDAPIO",
  "PEDIDOS",
  "BALCAO",
  "DASHBOARD",
  "CLIENTES",
  "CONFIGURACOES",
  "ASSINATURA",
  "DELIVERY_BASICO",
  "ESTOQUE",
] as const;

/**
 * O que só o PREMIUM inclui.
 *
 * São os módulos que exigem operação montada — ficha técnica, produção,
 * apuração de custo, contas a receber, salão, folha de benefício. É onde mora
 * o trabalho que a Velnoxia faz e a concorrência de cardápio digital não faz.
 *
 * `RECEITAS` e `PRODUCAO` continuam aqui depois de `ESTOQUE` ter descido para
 * o BASIC, e essa separação em três chaves é exatamente o que tornou a
 * mudança possível: bastou mover uma linha. Se as três fossem uma chave só,
 * levar o controle de quantidade ao BASIC teria levado a ficha técnica junto.
 */
export const EXCLUSIVOS_DO_PREMIUM: readonly Recurso[] = [
  "PRODUCAO",
  "RECEITAS",
  "FINANCEIRO",
  "FIADO",
  "MESAS",
  "FUNCIONARIOS",
  "BENEFICIOS",
  "MARKETING",
  "RELATORIOS",
  "AUDITORIA",
  "DELIVERY_AVANCADO",
] as const;

/**
 * A matriz, indexada pelo plano.
 *
 * `Set` e não array: a pergunta que este módulo responde milhares de vezes é
 * "contém?", e num array isso é uma varredura. Congelado na importação, uma
 * vez por processo.
 */
export const RECURSOS_DO_PLANO: Readonly<Record<Plano, ReadonlySet<Recurso>>> = {
  BASIC: new Set(ESSENCIAIS),
  // A união é o ponto do arquivo inteiro. Ver o cabeçalho.
  PREMIUM: new Set([...ESSENCIAIS, ...EXCLUSIVOS_DO_PREMIUM]),
};

/**
 * Todos os recursos que existem, na ordem em que a tabela comercial os mostra.
 *
 * Serve à tela de planos e à sidebar, que precisam percorrer os recursos para
 * desenhar o cadeado — e devem percorrer ESTA lista, nunca uma cópia própria.
 */
export const TODOS_OS_RECURSOS: readonly Recurso[] = [
  ...ESSENCIAIS,
  ...EXCLUSIVOS_DO_PREMIUM,
] as const;

/**
 * Como cada recurso se chama para quem paga.
 *
 * Separado da chave de propósito: a chave é permanente e aparece em guardas
 * espalhadas pelo código; o rótulo é comercial e muda quando o marketing
 * quiser, sem tocar em nenhuma guarda.
 */
export const ROTULO_DO_RECURSO: Readonly<Record<Recurso, string>> = {
  CARDAPIO: "Cardápio",
  PEDIDOS: "Pedidos",
  BALCAO: "Balcão",
  DASHBOARD: "Painel",
  CLIENTES: "Clientes",
  CONFIGURACOES: "Configurações",
  ASSINATURA: "Assinatura",
  DELIVERY_BASICO: "Delivery",
  ESTOQUE: "Estoque",
  PRODUCAO: "Produção",
  RECEITAS: "Fichas técnicas",
  FINANCEIRO: "Financeiro",
  FIADO: "Fiado e contas a receber",
  MESAS: "Mesas com QR Code",
  FUNCIONARIOS: "Funcionários",
  BENEFICIOS: "Planos de benefício",
  MARKETING: "Marketing",
  RELATORIOS: "Relatórios avançados",
  AUDITORIA: "Auditoria",
  DELIVERY_AVANCADO: "Entregadores e rastreamento",
};

/** Como cada plano se chama na tela. */
export const ROTULO_DO_PLANO: Readonly<Record<Plano, string>> = {
  BASIC: "Básico",
  PREMIUM: "Premium",
};

/**
 * O que a pessoa ganha com cada recurso, em uma frase.
 *
 * Existe para a tela de bloqueio poder dizer o que o módulo FAZ, em vez de
 * repetir o nome dele. "Estoque está no Premium" não convence ninguém; "saiba
 * quanto tem, quanto custou e quando vai acabar" descreve o que se compra.
 *
 * Fica ao lado do rótulo, e não dentro do componente de bloqueio: assim uma
 * frase escrita para a barra lateral e outra para a tela cheia não divergem, e
 * quem escreve texto comercial mexe num arquivo só.
 *
 * Os essenciais também têm frase — eles nunca aparecem bloqueados hoje, mas o
 * mapa completo é o que permite ao teste cobrar que nenhum recurso fique sem
 * descrição no dia em que a matriz mudar.
 */
export const DESCRICAO_DO_RECURSO: Readonly<Record<Recurso, string>> = {
  CARDAPIO: "Monte o cardápio com categorias, tamanhos e adicionais.",
  PEDIDOS: "Acompanhe cada pedido do recebimento à entrega.",
  BALCAO: "Lance vendas presenciais direto no balcão.",
  DASHBOARD: "Veja o dia da loja em uma tela só.",
  CLIENTES: "Saiba quem compra e o que já pediu.",
  CONFIGURACOES: "Ajuste horário, entrega, formas de pagamento e a cara do site.",
  ASSINATURA: "Gerencie o plano e a forma de pagamento da sua conta.",
  DELIVERY_BASICO: "Receba pedidos de entrega com taxa, frete grátis e tempo estimado.",
  ESTOQUE:
    "Saiba quanto você tem, quanto custou e quando vai acabar — com alerta antes de faltar.",
  PRODUCAO:
    "Registre cada fornada com a perda real e descubra o custo do que a cozinha fabrica.",
  RECEITAS:
    "Monte a ficha técnica de cada prato e veja o custo sair dos ingredientes, não do chute.",
  FINANCEIRO: "Acompanhe receita, margem e a rentabilidade de cada item do cardápio.",
  FIADO: "Aceite o pedido sem receber na hora e cobre depois, inteiro ou em partes.",
  MESAS: "Cada mesa com seu QR Code e a comanda aberta no celular do cliente.",
  FUNCIONARIOS: "Cadastre a equipe e acompanhe o que cada um consome no mês.",
  BENEFICIOS: "Dê desconto por cargo, com cota mensal e desconto em folha.",
  MARKETING: "Crie promoções e cupons, e responda as avaliações dos clientes.",
  RELATORIOS: "Relatórios de produtos, equipe e histórico para decidir com número.",
  AUDITORIA: "Veja quem mudou o quê, quando, e o valor antes e depois.",
  DELIVERY_AVANCADO:
    "Cadastre entregadores, despache pedidos e mostre ao cliente onde está a entrega.",
};
