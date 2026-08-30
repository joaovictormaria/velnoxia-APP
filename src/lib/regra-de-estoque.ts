/**
 * Quando um produto precisa saber de onde tirar o que vende.
 *
 * NASCEU DE UM ESTOQUE QUE NÃO MEXIA. Com o controle ligado, um produto sem
 * ficha técnica e sem vínculo direto é vendido normalmente e não desce nada:
 * `insumosDoPedido` percorre os dois caminhos, não acha nenhum, e segue em
 * silêncio. O saldo fica parado enquanto a mercadoria sai pela porta, e quem
 * confia no relatório descobre a diferença no inventário do mês seguinte.
 *
 * Aqui ficam as regras, e só as regras: funções puras, sem Prisma e sem
 * `createServerFn`. Mesma disciplina de `regra-financeira.ts`, e pelo mesmo
 * motivo — server function não roda em vitest, então regra escrita dentro do
 * handler é regra que ninguém testa. Quem fala com o banco monta os fatos;
 * quem decide o que eles significam é este arquivo.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ: não sabe o que é uma loja, não lê sessão, não
 * decide de quem é o produto. A guarda de servidor
 * (`@/server/inventory/guarda-de-receita`) é quem resolve o `storeId` a partir
 * da sessão e alimenta estas funções com fatos já isolados por tenant.
 */

/**
 * De onde um produto tira o que vende, exatamente como o motor de estoque lê.
 *
 * Os dois campos são o espelho fiel dos dois caminhos de `insumosDoPedido`, e
 * a ordem entre eles é a de lá: a ficha manda quando existe, o vínculo direto
 * é o que sobra. Qualquer divergência entre este tipo e aquele laço volta a
 * ser um produto que a tela aprova e o estoque ignora.
 */
export type VinculoDeEstoque = {
  /**
   * Existe composição ATIVA com pelo menos um ingrediente.
   *
   * O "pelo menos um" não é preciosismo. Uma ficha de zero linhas não consome
   * nada, e o motor real cai dela para o vínculo direto — tratá-la como
   * receita válida aqui aprovaria justamente o produto que não desce saldo.
   */
  temFichaComIngrediente: boolean;
  /** `Product.inventoryItemId`. O produto É o item de estoque: bebida, revenda. */
  inventoryItemId: string | null;
};

/** Um produto, reduzido ao que decide se a regra o alcança. */
export type ProdutoParaRegra = {
  /** Produto desativado não é vendido, então não tem como furar o estoque. */
  isActive: boolean;
  /**
   * A exceção explícita do dono: "este aqui não participa do estoque".
   *
   * Default `true` no banco, e é o default certo. Fosse `false`, ligar o
   * controle não exigiria nada de ninguém e a regra nasceria decorativa —
   * cada produto teria de ser marcado à mão para valer alguma coisa.
   *
   * Existe porque nem tudo que é cadastrado como produto é mercadoria: taxa
   * de serviço, couvert e entrega ocupam uma linha do cardápio e não saem de
   * prateleira nenhuma. Sem a exceção, o dono seria obrigado a inventar um
   * item de estoque para a própria taxa de entrega só para conseguir ligar o
   * controle.
   */
  controlaEstoque: boolean;
};

/**
 * O produto sabe de onde tirar o que vende?
 *
 * Independe de o controle estar ligado: é um fato sobre o produto, não sobre a
 * configuração da loja. Quem cruza os dois é `produtoEstaIrregular`.
 */
export function produtoTemVinculoDeEstoque(vinculo: VinculoDeEstoque): boolean {
  return vinculo.temFichaComIngrediente || vinculo.inventoryItemId !== null;
}

/**
 * A regra alcança este produto?
 *
 * Com o controle DESLIGADO a resposta é sempre não, e é isso que preserva o
 * comportamento de hoje inteiro: nenhuma loja que não pediu estoque sente
 * qualquer diferença.
 */
export function produtoExigeVinculo(
  controleDeEstoqueAtivo: boolean,
  produto: ProdutoParaRegra,
): boolean {
  if (!controleDeEstoqueAtivo) return false;
  if (!produto.isActive) return false;
  return produto.controlaEstoque;
}

/**
 * A pergunta que a guarda faz: este produto pode ficar como está?
 *
 * É a composição das duas anteriores, e existe para que nenhum chamador
 * escreva `exige && !tem` por conta própria. Duas versões dessa conjunção em
 * arquivos diferentes é como uma delas envelhece sem ninguém notar.
 */
export function produtoEstaIrregular(
  controleDeEstoqueAtivo: boolean,
  produto: ProdutoParaRegra,
  vinculo: VinculoDeEstoque,
): boolean {
  return (
    produtoExigeVinculo(controleDeEstoqueAtivo, produto) &&
    !produtoTemVinculoDeEstoque(vinculo)
  );
}

/**
 * O texto que o dono lê quando a regra recusa.
 *
 * Mora aqui, e não na tela, porque a recusa vem do servidor e precisa
 * explicar-se sozinha em qualquer caminho — inclusive numa chamada direta à
 * server function, onde não há tela nenhuma para traduzir um código de erro.
 *
 * Diz as DUAS saídas de propósito. "Cadastre uma receita" mandaria o dono da
 * lanchonete montar ficha técnica para uma lata de refrigerante, que é
 * exatamente o trabalho que o vínculo direto existe para evitar.
 */
export const MOTIVO_SEM_VINCULO_DE_ESTOQUE =
  "O controle de estoque está ativo: este produto precisa de uma ficha técnica " +
  "com pelo menos um ingrediente ou de um item de estoque vinculado. Se ele não " +
  "deve participar do estoque, desmarque \"Participa do controle de estoque\".";
