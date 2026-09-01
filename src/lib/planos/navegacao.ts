import type { Recurso } from "./tipos";

/**
 * QUAL RECURSO CADA TELA DO PAINEL PERTENCE — e o único lugar que sabe disso.
 *
 * ─── ISTO NÃO É UMA SEGUNDA MATRIZ ─────────────────────────────────────────
 *
 * `catalogo.ts` responde "qual PLANO tem qual RECURSO". Este arquivo responde
 * outra pergunta, que não existia em lugar nenhum: "qual ROTA pertence a qual
 * RECURSO". São dois eixos independentes — mover Estoque de plano é editar o
 * catálogo, e mudar o endereço da tela de estoque é editar aqui.
 *
 * O que ele NÃO faz é decidir permissão. Quem decide continua sendo
 * `recursoNoEstado()`, e quem consome este mapa apenas descobre O QUE
 * perguntar a ela.
 *
 * ─── POR QUE UM MAPA, E NÃO UMA MARCA EM CADA ITEM DO MENU ─────────────────
 *
 * Porque a barra lateral não é a única interessada. A guarda de rota da Fase 6
 * também precisa da mesma correspondência, e um teste compara as duas: se o
 * menu disser que `/admin/estoque` é ESTOQUE e a rota exigir outro recurso, o
 * projeto reclama antes de o cliente ver um cadeado que não abre nada.
 *
 * TODAS as rotas do painel estão aqui, inclusive as do BASIC. Ter o mapa
 * completo é o que permite ao teste cobrar que nenhum item de menu fique sem
 * recurso — um item não mapeado seria uma tela que ninguém sabe classificar.
 */
export const RECURSO_DA_ROTA: Readonly<Record<string, Recurso>> = {
  // ── Essenciais ──
  "/admin": "DASHBOARD",
  "/admin/balcao": "BALCAO",
  "/admin/pedidos": "PEDIDOS",
  "/admin/cardapio": "CARDAPIO",
  "/admin/cardapio/categorias": "CARDAPIO",
  "/admin/cardapio/extras": "CARDAPIO",
  "/admin/clientes": "CLIENTES",
  "/admin/assinatura": "ASSINATURA",
  "/admin/configuracoes": "CONFIGURACOES",

  // ── Premium ──
  "/admin/estoque": "ESTOQUE",
  "/admin/mesas": "MESAS",
  "/admin/entregadores": "DELIVERY_AVANCADO",
  "/admin/funcionarios": "FUNCIONARIOS",
  "/admin/funcionarios/planos": "BENEFICIOS",
  "/admin/promocoes": "MARKETING",
  "/admin/cupons": "MARKETING",
  "/admin/avaliacoes": "MARKETING",
  "/admin/auditoria": "AUDITORIA",
  "/admin/relatorios": "RELATORIOS",
  /*
   * MARGEM E RENTABILIDADE, e não uma lista de produtos: esta tela consome
   * `getProductProfitability` e `getFinancialKPIs`. Classificá-la por estar
   * sob `/admin/relatorios` faria o menu prometer um cadeado de Relatórios
   * onde o servidor recusa por Financeiro.
   */
  "/admin/relatorios/produtos": "FINANCEIRO",
  /*
   * As quatro abaixo não são itens de menu — chega-se a elas pelo índice de
   * relatórios. Estão no mapa porque ele é a lista completa das telas do
   * painel, e é por ela que o teste de classificação percorre: uma tela
   * fora do mapa seria uma tela que ninguém classificou.
   */
  "/admin/relatorios/receita": "FINANCEIRO",
  "/admin/relatorios/dashboard-kpi": "FINANCEIRO",
  "/admin/relatorios/historico": "FINANCEIRO",
  "/admin/relatorios/perdas": "FINANCEIRO",
  /*
   * FUNCIONARIOS, e não RELATORIOS: a tela entrega o consumo da equipe, e a
   * rota exige esse recurso. Classificá-la pela pasta faria o menu prometer
   * um cadeado de Relatórios onde o servidor recusa por Funcionários.
   */
  "/admin/relatorios/funcionarios": "FUNCIONARIOS",
  /*
   * Pagamentos em aberto é FIADO, e não RELATORIOS, ainda que more sob
   * `/admin/relatorios`. O endereço é herança de organização; o recurso é o
   * que o lojista compra. Classificá-la pela pasta faria o cadeado errado
   * aparecer no dia em que Fiado e Relatórios ficassem em planos diferentes.
   */
  "/admin/relatorios/recebimentos": "FIADO",
};

/** O recurso desta rota, ou `null` se ela não estiver mapeada. */
export function recursoDaRota(rota: string): Recurso | null {
  return RECURSO_DA_ROTA[rota] ?? null;
}
