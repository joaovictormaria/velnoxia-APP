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

/* ------------------------------------------------------------------------- *
 * O TIPO DE CONTROLE, e por que ele substitui a dedução acima.
 *
 * Tudo até aqui responde "o produto sabe de onde tirar o que vende?" olhando o
 * que existe no banco. Era o que dava para fazer sem um campo, e errava nos
 * dois sentidos: uma Coca com ficha criada por engano parava de baixar a lata
 * (a ficha vence o vínculo, e o vínculo era ignorado em silêncio), e um produto
 * sem nenhum dos dois passava sem que tela nenhuma pudesse dizer isso ao dono.
 *
 * A partir daqui o dono DECLARA o comportamento, e a regra confere se a
 * declaração está de pé. As funções antigas continuam vivas e não mudaram uma
 * linha: elas são o caminho de quem tem `tipoDeControle` nulo, que é todo
 * produto anterior a esta fase.
 * ------------------------------------------------------------------------- */

/**
 * Como o produto do cardápio se comporta na venda.
 *
 * Espelha `TipoDeControleDeEstoque` do Prisma. Repetido aqui, e não importado,
 * porque este arquivo roda em vitest sem banco e sem client gerado — a mesma
 * disciplina que mantém `regra-financeira.ts` testável.
 */
export type TipoDeControle = "NAO_CONTROLA" | "REVENDA" | "PRODUCAO";

/**
 * NULO NÃO É `NAO_CONTROLA`, e confundir os dois apagaria a distinção que a
 * migration existe para preservar:
 *
 *   null          o dono ainda não escolheu → comportamento legado, e a tela
 *                 mostra "Configuração pendente"
 *   NAO_CONTROLA  escolha explícita de não controlar este produto
 */
export type TipoDeControleOuNulo = TipoDeControle | null;

/** O que o item de estoque É no depósito. Espelha `InventoryItem.itemType`. */
export type TipoDeItem = "INGREDIENT" | "RESALE" | "PREPARED" | "PACKAGING";

/**
 * Os fatos de configuração de um produto, já resolvidos contra a loja.
 *
 * `itemVinculadoTipo` é o tipo do item que `inventoryItemId` aponta — nulo
 * quando não há vínculo. Vem separado porque é ele que distingue as duas formas
 * de PRODUÇÃO: vincular um `PREPARED` é produzir em lote; vincular um `RESALE`
 * é revender, e num produto marcado PRODUÇÃO isso é erro.
 */
export type ConfiguracaoDeEstoque = {
  temFichaComIngrediente: boolean;
  inventoryItemId: string | null;
  itemVinculadoTipo: TipoDeItem | null;
};

/** Por que uma configuração foi recusada. Um código por regra. */
export type MotivoDeRecusa =
  | "REVENDA_SEM_ITEM"
  | "REVENDA_COM_FICHA"
  | "REVENDA_ITEM_INCOMPATIVEL"
  | "PRODUCAO_SEM_ORIGEM"
  | "PRODUCAO_COM_DUAS_ORIGENS"
  | "PRODUCAO_ITEM_NAO_E_PREPARADO"
  | "NAO_CONTROLA_COM_ORIGEM";

/** A frase que o dono lê. Mora aqui porque a recusa vem do servidor e precisa
 *  explicar-se sozinha até numa chamada direta à server function. */
export const MOTIVOS: Record<MotivoDeRecusa, string> = {
  REVENDA_SEM_ITEM:
    "Produto de revenda precisa de um item de estoque vinculado. " +
    "Escolha o item que sai da prateleira quando este produto é vendido.",
  REVENDA_COM_FICHA:
    "Produto de revenda não tem receita. Uma lata de refrigerante é comprada " +
    "pronta — se este produto é preparado pela casa, marque-o como Produção.",
  REVENDA_ITEM_INCOMPATIVEL:
    "Este item de estoque não serve para revenda. Escolha um item de revenda " +
    "ou um ingrediente — embalagem e preparado não são vendidos como vieram.",
  PRODUCAO_SEM_ORIGEM:
    "Produto de produção precisa de uma receita com pelo menos um ingrediente, " +
    "ou de um preparado vinculado.",
  PRODUCAO_COM_DUAS_ORIGENS:
    "Escolha uma origem só: a receita deste produto OU um preparado vinculado. " +
    "Com as duas, os ingredientes desceriam duas vezes — uma na produção do " +
    "preparado e outra na venda.",
  PRODUCAO_ITEM_NAO_E_PREPARADO:
    "Só um item do tipo Preparado pode ser vinculado a um produto de produção. " +
    "Se este produto é comprado pronto, marque-o como Revenda.",
  NAO_CONTROLA_COM_ORIGEM:
    "Este produto está marcado para não controlar estoque, mas ainda tem " +
    "receita ou item vinculado. Remova a configuração antes, ou escolha " +
    "Revenda ou Produção.",
};

/**
 * A configuração declarada está de pé?
 *
 * Devolve o motivo, não um booleano: quem chama precisa dizer ao dono QUAL das
 * seis regras ele esbarrou, e um `false` obrigaria cada chamador a redescobrir
 * isso por conta própria.
 *
 * NULO devolve `null` — nada a cobrar. Produto legado é julgado por
 * `produtoEstaIrregular`, a regra antiga, que continua intacta logo acima.
 */
export function motivoDeConfiguracaoInvalida(
  tipo: TipoDeControleOuNulo,
  cfg: ConfiguracaoDeEstoque,
): MotivoDeRecusa | null {
  if (tipo === null) return null;

  if (tipo === "NAO_CONTROLA") {
    /*
     * A EMBALAGEM NÃO ENTRA NESTA CONTA, e é a única coisa que sobrevive aqui.
     * "Não controlar" é não descer o PRODUTO; a sacola sai da prateleira do
     * mesmo jeito, e ela mora em `ProductPackaging`, fora destes dois campos.
     */
    if (cfg.temFichaComIngrediente || cfg.inventoryItemId !== null) {
      return "NAO_CONTROLA_COM_ORIGEM";
    }
    return null;
  }

  if (tipo === "REVENDA") {
    if (cfg.temFichaComIngrediente) return "REVENDA_COM_FICHA";
    if (cfg.inventoryItemId === null) return "REVENDA_SEM_ITEM";
    /*
     * INGREDIENT é aceito ao lado de RESALE de propósito: vender farinha a
     * quilo é legítimo, ainda que raro, e o código já defendia isso antes
     * ("NÃO FILTRA POR TIPO", em adminListarItensParaVinculo). PREPARED fica
     * de fora porque tem casa própria — é a segunda forma de PRODUÇÃO.
     */
    if (
      cfg.itemVinculadoTipo !== "RESALE" &&
      cfg.itemVinculadoTipo !== "INGREDIENT"
    ) {
      return "REVENDA_ITEM_INCOMPATIVEL";
    }
    return null;
  }

  // PRODUCAO — exatamente uma origem, nunca as duas, nunca nenhuma.
  const temPreparado = cfg.inventoryItemId !== null;
  if (cfg.temFichaComIngrediente && temPreparado) {
    return "PRODUCAO_COM_DUAS_ORIGENS";
  }
  if (!cfg.temFichaComIngrediente && !temPreparado) {
    return "PRODUCAO_SEM_ORIGEM";
  }
  if (temPreparado && cfg.itemVinculadoTipo !== "PREPARED") {
    return "PRODUCAO_ITEM_NAO_E_PREPARADO";
  }
  return null;
}

/**
 * A regra alcança este produto?
 *
 * Mesma forma de `produtoExigeVinculo`, e pelos mesmos motivos: controle
 * desligado não cobra nada de ninguém, produto inativo não é vendido.
 *
 * `controlaEstoque` continua sendo consultado porque ele não morreu: é a
 * exceção que o dono já marcou em taxa de entrega e couvert, e ignorá-la aqui
 * ressuscitaria a cobrança justamente onde ele a tinha desligado.
 */
export function tipoDeControleExigido(
  controleDeEstoqueAtivo: boolean,
  produto: ProdutoParaRegra,
): boolean {
  if (!controleDeEstoqueAtivo) return false;
  if (!produto.isActive) return false;
  return produto.controlaEstoque;
}

/**
 * O produto está pendente de classificação?
 *
 * É o selo "Configuração pendente" da tela, e a lista que impede ligar o
 * controle. Só o nulo conta: `NAO_CONTROLA` é uma escolha feita, não uma
 * pendência.
 */
export function precisaEscolherTipo(
  controleDeEstoqueAtivo: boolean,
  produto: ProdutoParaRegra,
  tipo: TipoDeControleOuNulo,
): boolean {
  return tipoDeControleExigido(controleDeEstoqueAtivo, produto) && tipo === null;
}
