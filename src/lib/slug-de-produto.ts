/**
 * O endereço público de um produto, derivado do nome.
 *
 * FONTE ÚNICA, e essa é a razão de existir. Havia três geradores no projeto e
 * eles discordavam: o formulário tirava acentos e trocava tudo que não fosse
 * letra ou número por hífen; os dois do servidor só trocavam espaço por hífen e
 * mantinham acento e pontuação. "Pão de Açúcar" virava `pao-de-acucar` num
 * caminho e `pão-de-açúcar` no outro — dois endereços diferentes para o mesmo
 * produto, e a colisão de um deles não previa a do outro.
 *
 * O endereço vai para o link que a lojista manda no WhatsApp, então ele precisa
 * ser previsível a partir do nome, e igual em qualquer caminho que crie produto.
 */
export function gerarSlugDeProduto(nome: string): string {
  return nome
    .normalize("NFD")
    // Combining Diacritical Marks: o acento separado do caractere pelo NFD.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * O nome não produziu endereço nenhum.
 *
 * Acontece com nome só de símbolos — "★★★" vira string vazia. Quem chama
 * precisa recusar ANTES de gravar, apontando para o campo que a pessoa
 * consegue editar, que é o nome.
 */
export const slugVazio = (slug: string) => slug.length === 0;

/**
 * O erro do banco para um slug repetido, traduzido.
 *
 * A UNICIDADE É A REGRA, e não um acidente: `@@unique([storeId, slug])` existe
 * porque dois produtos não podem dividir o mesmo endereço público. Um sufixo
 * automático — "-2" — resolveria o erro e criaria outro problema: a lojista
 * cadastraria dois produtos com o mesmo nome sem perceber, e o link do segundo
 * não seria o que ela espera. Então o sistema recusa e explica, em vez de
 * inventar um endereço que ninguém pediu.
 *
 * Devolve `null` quando o erro é outro: quem chama relança o original.
 */
export function mensagemDeSlugDuplicado(erro: unknown): string | null {
  const e = erro as {
    code?: string;
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: { originalMessage?: string; constraint?: { fields?: unknown } };
      };
    };
  };
  if (e?.code !== "P2002") return null;

  /*
   * TRÊS FORMAS DE DESCOBRIR QUAL ÍNDICE ESTOUROU, e as três são necessárias.
   *
   * `meta.target` é a forma clássica do Prisma — e com o adaptador `pg` deste
   * projeto ela simplesmente NÃO VEM. O que chega é
   * `meta.driverAdapterError.cause`, com os campos do índice e a mensagem crua
   * do Postgres. A primeira versão desta função olhava só `target`, devolvia
   * `null` para toda colisão real, e o erro de banco continuava vazando —
   * exatamente o que ela existe para impedir. Foi um teste que mostrou isso;
   * a leitura do código não mostraria.
   */
  const causa = e.meta?.driverAdapterError?.cause;
  const deTarget = Array.isArray(e.meta?.target)
    ? (e.meta?.target as string[])
    : typeof e.meta?.target === "string"
      ? [e.meta.target as string]
      : [];
  const doAdaptador = Array.isArray(causa?.constraint?.fields)
    ? (causa?.constraint?.fields as string[])
    : [];
  const campos = [...deTarget, ...doAdaptador].map((c) => String(c).toLowerCase());

  /*
   * Só o índice de slug. A mesma tabela tem outras uniques, e responder
   * "já existe um produto com esse nome" para a violação de outra delas seria
   * mandar a lojista renomear um produto cujo nome está certo.
   */
  const ehSlug =
    campos.some((c) => c.includes("slug")) ||
    /product_storeid_slug/i.test(causa?.originalMessage ?? "");
  if (!ehSlug) return null;
  return "Já existe um produto com esse nome nesta loja. Escolha outro nome.";
}
