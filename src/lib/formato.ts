/**
 * Números do estoque, escritos como se escreve em português.
 *
 * A tela mostrava `10.00 un`, `1.00 kg` e `R$ 6.00` — `toFixed(2)` cru, com
 * ponto decimal e duas casas obrigatórias. Ninguém escreve "dez vírgula zero
 * zero ovos", e o ponto no lugar da vírgula faz o olho tropeçar toda vez.
 *
 * FORMATAR NÃO É ARREDONDAR. O custo do óleo é R$ 0,008889 por ml, e forçar
 * duas casas mostraria R$ 0,01 — o mesmo erro de 12% que a migration de
 * precisão existiu para consertar. Quem decide quantas casas mostrar é a
 * grandeza do número, não um padrão fixo.
 */

const PT = "pt-BR";

/**
 * Quantidade de estoque: `10 un`, `1,5 kg`, `0,24 L`, `0,00000556 un`.
 *
 * Sem casas quando é inteiro — 10 ovos são dez ovos, não "10,00".
 *
 * QUATRO CASAS NORMALMENTE, ATÉ OITO QUANDO QUATRO MENTEM. O saldo passou a ser
 * gravado em `DECIMAL(19,8)` porque o estoque por conteúdo de embalagem produz
 * dízima: 40 ml tirados de uma garrafa de 900 ml gastam 0,04444444 de unidade.
 * Mostrar as oito casas sempre encheria a lista de `1.500,12345678`, que ninguém
 * consegue ler. Mostrar quatro sempre tinha um caso pior que feio: um item com
 * `0,00000556 un` aparecia como **`0`** — a tela dizia que o estoque acabou
 * quando não tinha acabado.
 *
 * O critério é o mesmo de `moeda()` logo abaixo, e de propósito: mede-se o
 * estrago, não o tamanho do número. Uma ideia neste arquivo, não duas.
 */
export function quantidade(valor: unknown): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return "0";

  /*
   * Duas perguntas, e basta uma responder "sim" para abrir as oito casas:
   *
   *   zerou?      um saldo que existe não pode ser exibido como nenhum.
   *   distorceu?  meio por cento é o limiar herdado de `moeda()`. Acima disso o
   *               número na tela deixa de representar o que está no banco.
   *
   * O teto é oito porque é a escala da coluna. Além dela não há número, há
   * ruído de ponto flutuante.
   */
  const emQuatroCasas = Math.round(n * 1e4) / 1e4;
  const mente =
    n !== 0 &&
    (emQuatroCasas === 0 || Math.abs(emQuatroCasas - n) / Math.abs(n) > 0.005);

  return n.toLocaleString(PT, {
    // Zero à esquerda do mínimo: `0,10` sai `0,1`, e `6` continua `6`.
    minimumFractionDigits: 0,
    maximumFractionDigits: mente ? 8 : 4,
  });
}

/**
 * Dinheiro: `R$ 6,00`, `R$ 0,008889`.
 *
 * Duas casas é o piso, não o teto. Preço de venda sempre tem centavo redondo;
 * CUSTO é resultado de divisão — R$ 8,00 a garrafa ÷ 900 ml — e cortar em duas
 * casas transformaria R$ 0,008889 em R$ 0,01, que é mentira por 12%.
 *
 * O teto de seis acompanha a precisão da coluna `cost`, DECIMAL(15,6).
 */
export function moeda(valor: unknown): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return "—";
  /*
   * O CRITÉRIO É QUANTO SE PERDE, e não o tamanho do número.
   *
   * Um limiar fixo de "abaixo de um centavo" não serve: o chocolate custa
   * R$ 0,011429 por grama, está ACIMA de um centavo, e ainda assim duas casas
   * o transformariam em R$ 0,01 — 12% de erro, o mesmo que a migration de
   * precisão consertou no banco.
   *
   * Então mede-se o estrago: se arredondar para duas casas zera o valor ou
   * distorce mais de meio por cento, mostram-se as seis. R$ 4,166667 vira
   * R$ 4,17 porque perder 0,008% não muda decisão nenhuma.
   */
  const emDuasCasas = Math.round(n * 100) / 100;
  const distorce =
    n !== 0 &&
    (emDuasCasas === 0 || Math.abs(emDuasCasas - n) / Math.abs(n) > 0.005);
  const casas = distorce ? 6 : 2;
  return n.toLocaleString(PT, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: casas,
  });
}

/**
 * Custo com a unidade que ele mede: `R$ 6,00 / kg`, `R$ 0,008889 / ml`.
 *
 * A unidade não é enfeite. `R$ 6,00` sozinho não diz se é o quilo, o pacote ou
 * a garrafa — e foi exatamente essa ambiguidade que deixou o óleo a R$ 8,00 o
 * mililitro passar despercebido numa tabela inteira.
 */
export function custoPorUnidade(valor: unknown, unidade?: string | null): string {
  if (valor == null || !Number.isFinite(Number(valor))) return "—";
  const texto = moeda(valor);
  return unidade ? `${texto} / ${unidade}` : texto;
}
