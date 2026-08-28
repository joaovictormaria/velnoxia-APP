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
 * Quantidade de estoque: `10 un`, `1,5 kg`, `0,24 L`.
 *
 * Sem casas quando é inteiro — 10 ovos são dez ovos, não "10,00". Até quatro
 * quando há fração, que é a precisão em que o saldo é gravado.
 */
export function quantidade(valor: unknown): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(PT, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
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
