import type { Novidade, Papel, Passo, Registro } from "./tipos";

/**
 * QUAL NOVIDADE MOSTRAR AGORA — e a resposta quase sempre é "nenhuma".
 *
 * Função pura: entra catálogo, estado do usuário, papel e adiamentos de
 * sessão; sai uma novidade ou `null`. Sem React, sem DOM, sem rede, sem
 * relógio. É o que permite testar as treze regras abaixo no ambiente `node`
 * que a suíte já tem, sem jsdom e sem dependência nova.
 *
 * Toda a decisão de "aparece ou não aparece" mora aqui. A Central só desenha.
 */

/**
 * Existe alguma novidade publicada, sequer?
 *
 * O portão mais barato do sistema, e o mais importante para a performance: com
 * o catálogo todo em `publicada: false`, a Central devolve `null` antes de
 * montar hook nenhum — nada de leitura de armazenamento, nada de observer,
 * nada de listener. O custo em toda tela do painel vira uma comparação de
 * booleano feita uma vez na importação do módulo.
 */
export function haNovidadePublicada(catalogo: Novidade[]): boolean {
  return catalogo.some((n) => n.publicada);
}

/**
 * A primeira novidade aplicável, ou `null`.
 *
 * UMA POR VEZ, na ordem do catálogo. Duas novidades pendentes não abrem dois
 * modais nem um carrossel: a segunda espera a primeira ser resolvida. Empilhar
 * avisos é o jeito mais rápido de ensinar alguém a fechar sem ler.
 *
 * @param registros  o que este usuário já concluiu ou dispensou
 * @param papel      o papel da sessão. `null` quando ainda não se sabe
 * @param adiadas    ids fechados nesta sessão — voltam numa sessão futura
 */
export function escolherNovidade(
  catalogo: Novidade[],
  registros: Registro[],
  papel: Papel | null | undefined,
  adiadas: string[] = [],
): Novidade | null {
  /*
   * Sem papel conhecido, nada aparece.
   *
   * A alternativa seria mostrar as novidades sem restrição para quem não
   * identificamos — e isso erra para o lado de exibir demais. Numa janela em
   * que a sessão ainda não resolveu, esperar é sempre correto: o modal aparece
   * meio segundo depois, e ninguém perde nada.
   */
  if (!papel) return null;

  const encerradas = new Set(
    registros
      // Um estado que não conhecemos NÃO encerra a novidade. Ele é ignorado, e
      // a novidade continua disponível — o caminho seguro entre "esconder algo
      // que deveria aparecer" e "mostrar de novo algo já visto".
      .filter((r) => r.estado === "CONCLUIDA" || r.estado === "DISPENSADA")
      .map((r) => r.novidadeId),
  );
  const adiadasAgora = new Set(adiadas);

  for (const novidade of catalogo) {
    if (!novidade.publicada) continue;
    // `papeis` ausente vale para todo mundo; presente, é uma lista fechada.
    if (novidade.papeis && !novidade.papeis.includes(papel)) continue;
    if (encerradas.has(novidade.id)) continue;
    if (adiadasAgora.has(novidade.id)) continue;
    return novidade;
  }

  /*
   * Registros de novidades que saíram do catálogo simplesmente não encontram
   * par neste laço. Não são erro e não são limpos: uma novidade despublicada
   * hoje pode voltar amanhã, e a memória de quem já a viu tem que sobreviver
   * a isso.
   */
  return null;
}

/**
 * O USUÁRIO CUMPRIU ESTE PASSO NAVEGANDO?
 *
 * Um passo pode destacar um link e pedir que a pessoa clique nele. Quando ela
 * clica, a rota muda, o alvo do passo deixa de existir e — pela regra geral —
 * um passo obrigatório sem alvo encerraria o tour. Ou seja: o tutorial
 * desistiria justamente de quem seguiu a instrução.
 *
 * Esta função separa os dois casos. Chegou à rota que o passo esperava, foi
 * obediência e o tour avança; foi para qualquer outro lugar, vale a regra de
 * sempre.
 *
 * ⚠️ `passoJaExibido` NÃO É DETALHE. Sem ele, um tour iniciado enquanto o
 * usuário já está na rota de destino cumpriria o passo 1 ANTES de mostrá-lo —
 * a pessoa nunca veria o destaque, e o tour começaria no passo 2. A condição
 * é "o destaque apareceu e depois a pessoa navegou", nunca só a rota atual.
 *
 * Pura de propósito: é a regra mais fácil de errar de todo o motor, e assim
 * ela é testável no ambiente `node` da suíte, sem DOM.
 *
 * @param passoJaExibido o último passo cujo alvo chegou a ser destacado
 */
export function cumpriuPorNavegacao(
  passo: Passo | null | undefined,
  pathname: string,
  passoJaExibido: Passo | null | undefined,
): boolean {
  if (!passo?.avancaAoChegarEm) return false;
  if (passoJaExibido !== passo) return false;
  return pathname === passo.avancaAoChegarEm;
}
