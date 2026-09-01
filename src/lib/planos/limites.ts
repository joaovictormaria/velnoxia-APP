import { planoEfetivo } from "./entitlements";
import type { EstadoComercial } from "./resolucao";
import type { Plano, Recurso } from "./tipos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  QUANTO — o contrato de LIMITES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FEATURE E LIMITE SÃO PERGUNTAS DIFERENTES, e este arquivo existe para que
 * nunca sejam a mesma:
 *
 *   catalogo.ts  → "o plano TEM Estoque?"        (sim / não)
 *   limites.ts   → "até QUANTOS produtos?"        (um teto)
 *
 * Escrever `ESTOQUE = 100` fundiria as duas e tornaria impossível dizer
 * "tem Estoque, sem teto" ou "não tem Estoque" sem ambiguidade. Aqui um limite
 * é sempre um NÚMERO sobre um recurso que o plano já possui — nunca o
 * substituto de possuí-lo.
 *
 * ── TRIAL NÃO TEM TABELA PRÓPRIA ───────────────────────────────────────────
 *
 * Pelo mesmo mecanismo das features: `tetoDoEstado` lê `estado.efetivo`, que
 * já é PREMIUM durante o teste. Uma tabela de limites do trial teria de ser
 * mantida em sincronia com a do Premium, e divergiria no primeiro esquecimento.
 */

/**
 * Quanto de um recurso um plano pode usar.
 *
 * ── `null` É ILIMITADO, E ISSO NÃO FOI INVENTADO AQUI ──────────────────────
 *
 * É a convenção JÁ APLICADA no projeto, em dois lugares que funcionam hoje:
 * `EmployeeBenefitPlan.limitValue === null` significa cota sem teto
 * (`employee-benefit.ts`), e `Coupon.maxUsage` é nulável com a tela dizendo
 * "Vazio = ilimitado". Adotar outra representação aqui criaria um terceiro
 * dialeto de "sem limite" dentro do mesmo sistema.
 *
 * ── `"A_DEFINIR"` É OUTRA COISA, E PRECISA SER ─────────────────────────────
 *
 * Significa "o número comercial ainda não foi decidido". Não é ilimitado e não
 * é zero. Sem este valor, um limite ainda não definido teria de ser escrito
 * como `null` — e um plano BASIC sem teto de produtos, entregue por omissão,
 * é o oposto do que um limite existe para fazer. Ele obriga a decisão a ser
 * tomada por uma pessoa, e não herdada de um valor de preenchimento.
 *
 * ⚠️ NUNCA testar um teto por veracidade: `if (!teto)` confunde `0`, `null` e
 * ausência. Use `cabeNoLimite()`, que trata os três casos explicitamente.
 */
export type Teto = number | null | "A_DEFINIR";

/**
 * Os limites que existem.
 *
 * ── POR QUE SÓ ESTES DOIS ──────────────────────────────────────────────────
 *
 * Um limite só é comercialmente útil sobre um recurso que o plano JÁ POSSUI.
 * `MAX_FUNCIONARIOS` e `MAX_CUPONS` mediriam FUNCIONARIOS e MARKETING, que o
 * BASIC não tem de forma alguma — limitar de 0 a 10 algo que vale 0 não separa
 * plano nenhum. Eles só passariam a significar algo se aqueles recursos
 * descessem para o BASIC, ou se existisse um terceiro degrau acima do Premium.
 *
 * `MAX_USUARIOS_DO_PAINEL` foi descartado por um motivo mais simples: não há
 * como criar um segundo usuário de painel. Os dois únicos `adminUser.create`
 * do sistema criam o dono, no cadastro, e o entregador, pelo convite. Limitar
 * uma quantidade que ninguém consegue aumentar é limite decorativo.
 *
 * Sobram os dois abaixo: medem CARDAPIO, que os dois planos têm, e crescem
 * naturalmente com o uso do lojista.
 *
 * ACRESCENTAR UM LIMITE é acrescentar uma chave aqui e uma linha em cada plano
 * de `TETOS_DO_PLANO`. O compilador cobra as duas.
 */
export type Limite = "MAX_PRODUTOS" | "MAX_CATEGORIAS";

export const TODOS_OS_LIMITES: readonly Limite[] = ["MAX_PRODUTOS", "MAX_CATEGORIAS"] as const;

/**
 * A qual recurso cada limite pertence.
 *
 * Um limite nunca flutua sozinho: ele mede um recurso do catálogo. Este mapa é
 * o que impede um limite órfão — um teto sobre algo que o plano nem possui — e
 * é o que a tela vai usar para dizer "Cardápio: 40 de 100 produtos".
 */
export const RECURSO_DO_LIMITE: Readonly<Record<Limite, Recurso>> = {
  MAX_PRODUTOS: "CARDAPIO",
  MAX_CATEGORIAS: "CARDAPIO",
};

/** Como cada limite se chama para quem paga. */
export const ROTULO_DO_LIMITE: Readonly<Record<Limite, string>> = {
  MAX_PRODUTOS: "Produtos no cardápio",
  MAX_CATEGORIAS: "Categorias do cardápio",
};

/**
 * Como cada limite é contado numa frase — "até 50 **produtos**".
 *
 * Separado de `ROTULO_DO_LIMITE` porque os dois textos têm empregos
 * diferentes: aquele nomeia a linha de uma tabela de plano ("Produtos no
 * cardápio"), este entra no meio de uma sentença. Usar um no lugar do outro
 * produziria "permite até 50 Produtos no cardápio.".
 */
export const SUBSTANTIVO_DO_LIMITE: Readonly<Record<Limite, string>> = {
  MAX_PRODUTOS: "produtos",
  MAX_CATEGORIAS: "categorias",
};

/**
 * OS NÚMEROS — decididos por João em 31/08/2026.
 *
 * ⚠️ ESTE É O ÚNICO LUGAR ONDE ELES EXISTEM. Nenhum `50` e nenhum `10`
 * aparecem em server function, repositório, tela ou mensagem: quem precisa do
 * teto pergunta a `tetoDoEstado()`, e quem precisa da frase a monta a partir
 * daqui. Mudar o plano comercial é editar estas quatro linhas.
 *
 * `null` É ILIMITADO, e não "sem limite decidido" — a diferença está escrita
 * em `Teto`, acima. O Premium não tem teto por decisão comercial, e o TRIAL lê
 * exatamente estes mesmos números porque `estado.efetivo` já é PREMIUM
 * enquanto o teste corre. Não existe tabela de trial.
 *
 * Os 50/100/500 do `EntitlementsService` morto continuam sem relação com isto:
 * foram escritos para uma matriz Trial/Starter/Business/Enterprise que nunca
 * foi vendida.
 */
export const TETOS_DO_PLANO: Readonly<Record<Plano, Readonly<Record<Limite, Teto>>>> = {
  BASIC: {
    MAX_PRODUTOS: 50,
    MAX_CATEGORIAS: 10,
  },
  PREMIUM: {
    MAX_PRODUTOS: null,
    MAX_CATEGORIAS: null,
  },
};

/** O teto deste limite neste plano. Consulta seca ao catálogo. */
export function tetoDoPlano(plano: Plano, limite: Limite): Teto {
  return TETOS_DO_PLANO[plano][limite];
}

/**
 * O teto que vale para esta loja agora.
 *
 * `"INDEFINIDO"` aparece num caso só, e é o mesmo da camada de features: loja
 * legada, sem plano e fora do teste. Não se inventa teto para ela, pela mesma
 * razão pela qual não se inventa plano — seria classificá-la comercialmente
 * por omissão.
 *
 * O trial não precisa de tratamento próprio: `estado.efetivo` já é PREMIUM
 * enquanto o teste corre, então a loja em teste lê os tetos do Premium pelo
 * mesmo caminho que um assinante Premium.
 */
export function tetoDoEstado(
  estado: EstadoComercial,
  limite: Limite,
): Teto | "INDEFINIDO" {
  if (estado.efetivo === null) return "INDEFINIDO";
  return tetoDoPlano(estado.efetivo, limite);
}

/**
 * Cabe mais um?
 *
 * Três respostas, pelo mesmo motivo de `VereditoDeRecurso`: um booleano
 * obrigaria a transformar "não sei" em "não pode", e recusar por não saber é
 * decidir sem decidir.
 *
 * `usoAtual < teto` e não `<=`: a pergunta é "cabe MAIS UM?". Com 49 produtos
 * e teto 50, cabe — o 50º entra. Com 50, não cabe, e é o 51º que é recusado.
 *
 * Quem aplica isto é `@/server/billing/guarda-de-limite`, e é o único lugar
 * que o faz.
 */
export type VereditoDeLimite = "CABE" | "ESTOUROU" | "INDEFINIDO";

export function cabeNoLimite(
  teto: Teto | "INDEFINIDO",
  usoAtual: number,
): VereditoDeLimite {
  // Loja legada, ou número comercial ainda não decidido: as duas são "não sei",
  // e nenhuma delas autoriza recusar.
  if (teto === "INDEFINIDO" || teto === "A_DEFINIR") return "INDEFINIDO";
  // Ilimitado — a convenção do `EmployeeBenefitPlan` e do `Coupon`.
  if (teto === null) return "CABE";
  return usoAtual < teto ? "CABE" : "ESTOUROU";
}

/**
 * O plano efetivo desta loja, para quem precisa do plano e não do teto.
 *
 * Reexporta a regra da Fase 1 em vez de repeti-la: quem consome limites quase
 * sempre também precisa saber de que plano eles vieram, e importar de dois
 * módulos convida a chamar `planoEfetivo` com um estado montado à mão.
 */
export function planoDosLimites(estado: EstadoComercial): Plano | null {
  if (estado.efetivo === null) return null;
  return planoEfetivo({ plano: estado.efetivo, emTrial: false });
}
