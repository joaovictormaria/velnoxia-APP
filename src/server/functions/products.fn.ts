// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { prisma } from "../db/client";
import {
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  setProductActive,
  updateProduct,
} from "../repositories/product-repository";
import { listActiveCategories } from "../repositories/category-repository";
import {
  exigirConfiguracaoDeEstoque,
  avaliarCriacaoDeProduto,
} from "../inventory/guarda-de-receita";
import { optionGroupsSchema } from "../validation/option-group-schema";
import { convertProductForServal, convertProductsForServal } from "../utils/decimal-converter";
import { mensagemDeSlugDuplicado } from "@/lib/slug-de-produto";

const sizeSchema = z.object({
  /** Aponta para um tamanho da categoria; o repositÃ³rio confere se Ã© dela. */
  categorySizeId: z.string().min(1),
  price: z.number().nonnegative(),
  isAvailable: z.boolean(),
});

const productSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9\-Ã¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¯Ã³Ã´ÃµÃ¶ÃºÃ§Ã±]+$/, "Use apenas letras, nÃºmeros e hÃ­fens."),
  description: z.string().default(""),
  categoryId: z.string().min(1, "Escolha uma categoria."),
  basePrice: z.number().nonnegative(),
  imageUrl: z.string().nullish(),
  tag: z.string().nullish(),
  isActive: z.boolean(),
  /**
   * Se este produto participa do controle de estoque da loja.
   *
   * `default(true)` e nunca `optional()`: um payload antigo, sem o campo, tem
   * de cair na REGRA, não na exceção. Fosse opcional com fallback `false`,
   * omitir o campo viraria o bypass mais barato da guarda inteira — bastava
   * mandar um JSON sem ele.
   */
  controlaEstoque: z.boolean().default(true),
  /**
   * Como este produto controla o estoque.
   *
   * `.nullish()` e NÃO `.default(...)`: um payload sem o campo tem de
   * significar "não mexe na classificação", e não "reclassifique para X". Um
   * default aqui faria toda edição de preço regravar o tipo do produto.
   *
   * O valor é só uma string até a guarda julgá-lo. O Zod não sabe se o item
   * vinculado é da loja, nem se existe ficha — quem sabe é
   * `exigirConfiguracaoDeEstoque`, com o `storeId` da sessão.
   */
  tipoDeControle: z
    .enum(["NAO_CONTROLA", "REVENDA", "PRODUCAO"])
    .nullish(),
  /**
   * O item de estoque que o produto consome, gravado JUNTO com o produto.
   *
   * Ausente não mexe no vínculo; `null` desvincula. O id é conferido contra a
   * loja da sessão no handler — aqui ele é só uma string, e o Zod não tem como
   * saber de quem ela é.
   */
  inventoryItemId: z.string().nullish(),
  allowHalfAndHalf: z.boolean(),
  halfPizzaPricingRule: z.enum(["HIGHEST_PRICE", "AVERAGE_PRICE"]),
  sortOrder: z.number().int().default(0),
  sizes: z.array(sizeSchema).default([]),
  /**
   * Perguntas sÃ³ deste produto, somadas Ã s que a categoria jÃ¡ faz. Ã‰ o que
   * deixa o suco perguntar laranja ou maracujÃ¡ sem obrigar o refrigerante da
   * mesma categoria a oferecer a mesma lista.
   */
  optionGroups: optionGroupsSchema,
});

export const listProductsFn = createServerFn({ method: "GET" })
  .validator(
    z.object({ categoryId: z.string().optional(), search: z.string().optional() }).optional(),
  )
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const [products, categories] = await Promise.all([
      listProducts(storeId, data),
      listActiveCategories(storeId),
    ]);
    return { products: convertProductsForServal(products), categories };
  });

export const getProductFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    const [product, categories] = await Promise.all([
      getProductById(storeId, data.id),
      listActiveCategories(storeId),
    ]);
    return { product: product ? convertProductForServal(product) : null, categories };
  });

export const getProductFormOptionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return { categories: await listActiveCategories(storeId) };
});

export const saveProductFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().nullish(), data: productSchema }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();

    /*
     * O VÍNCULO É CONFERIDO CONTRA A LOJA DA SESSÃO, ANTES DE QUALQUER COISA.
     *
     * `storeId` vem de `requireAdminSession()`; do payload vem apenas um id de
     * item, que só é aceito se existir DENTRO dessa loja. Sem esta conferência,
     * mandar o id de um item da loja vizinha satisfaria a guarda e ainda
     * apontaria o produto para estoque alheio.
     *
     * `undefined` significa "não mexe no vínculo" e `null` significa
     * "desvincula" — por isso a distinção explícita, e não um `if (id)`, que
     * trataria os dois como a mesma coisa.
     */
    const vinculoProposto = data.data.inventoryItemId;
    if (vinculoProposto !== undefined && vinculoProposto !== null) {
      const item = await prisma.inventoryItem.findFirst({
        where: { id: vinculoProposto, storeId },
        select: { id: true },
      });
      if (!item) throw new Error("Item de estoque não encontrado.");
    }

    /*
     * A GUARDA DE ESTOQUE, e por que os dois lados dela são diferentes.
     *
     * EDITAR é uma decisão sobre um produto que já existe: se a alteração o
     * deixaria ativo sem de onde tirar o que vende, ela é RECUSADA. O dono tem
     * como consertar — a ficha e o vínculo já estão ao alcance dele.
     *
     * CRIAR não pode ser recusado, e isso não é indulgência. Uma ficha técnica
     * é FK para o produto, então não existe antes dele. Recusar aqui fecharia
     * o cadastro inteiro com o estoque ligado. O produto nasce INATIVO, e a
     * tela é avisada — decisão do João, 29/08/2026.
     *
     * TUDO DENTRO DE UMA TRANSAÇÃO SÓ. A guarda lê a ficha técnica e o vínculo;
     * a gravação escreve o produto. Fora de uma transação, entre uma coisa e
     * outra caberia apagar a receita que autorizou a ativação.
     *
     * E o vínculo agora é COLUNA DA MESMA LINHA, gravado pelo mesmo comando que
     * grava `isActive`. Não existe estado parcial: não há como o produto ficar
     * ativo sem o vínculo, nem vinculado sem a ativação — é uma escrita só.
     */
    if (data.id) {
      const product = await prisma.$transaction(async (tx) => {
        await exigirConfiguracaoDeEstoque(
          storeId,
          data.id!,
          {
            isActive: data.data.isActive,
            controlaEstoque: data.data.controlaEstoque,
            ...(data.data.tipoDeControle !== undefined
              ? { tipoDeControle: data.data.tipoDeControle }
              : {}),
            ...(vinculoProposto !== undefined
              ? { inventoryItemId: vinculoProposto }
              : {}),
          },
          tx,
        );
        return updateProduct(storeId, data.id!, data.data, tx);
      });
      return { ok: true as const, product: convertProductForServal(product) };
    }

    /*
     * O TIPO É OBRIGATÓRIO PARA CRIAR, e a cobrança é aqui — não no Zod.
     *
     * No schema o campo continua `.nullish()` de propósito: editar um produto
     * LEGADO manda `tipoDeControle: null`, e um Zod obrigatório recusaria mexer
     * no preço de um produto que existe desde antes desta pergunta. A
     * obrigatoriedade vale para o que nasce agora, nunca para o que já está lá.
     *
     * `=== undefined` e não `== null`: a tela sempre manda a chave, com `null`
     * enquanto o dono não escolheu. Os dois casos caem aqui, e é o que se quer.
     */
    if (data.data.tipoDeControle == null) {
      throw new Error(
        "Escolha o tipo do produto: Produção, Revenda ou Não controlar estoque.",
      );
    }

    /*
     * A CRIAÇÃO TAMBÉM É UMA TRANSAÇÃO SÓ, e agora ela precisa ser: a avaliação
     * lê o item de estoque para conferir o tipo dele, e a gravação escreve o
     * produto que aponta para esse item. Fora de uma transação, entre uma coisa
     * e a outra caberia trocar o tipo do item — ou apagá-lo.
     */
/*
     * O SLUG REPETIDO SAI COMO FRASE, e não como erro de banco.
     *
     * Sem isto o dono via "Unique constraint failed on the fields:
     * (`storeId`,`slug`)" — que não diz o que fazer, e nem sequer menciona o
     * nome, que é o campo que ele consegue mudar. A unicidade continua sendo a
     * regra; o que muda é quem a explica.
     */
    let criado;
    try {
      criado = await prisma.$transaction(async (tx) => {
        const { nasceInativo } = await avaliarCriacaoDeProduto(
          storeId,
          {
            isActive: data.data.isActive,
            controlaEstoque: data.data.controlaEstoque,
            tipoDeControle: data.data.tipoDeControle ?? null,
            inventoryItemId: vinculoProposto ?? null,
          },
          tx,
        );
        const product = await createProduct(
          storeId,
          { ...data.data, isActive: nasceInativo ? false : data.data.isActive },
          tx,
        );
        return { product, nasceInativo };
      });
    } catch (erro) {
      const recado = mensagemDeSlugDuplicado(erro);
      if (recado) throw new Error(recado);
      throw erro;
    }
    const { product, nasceInativo } = criado;
    return {
      ok: true as const,
      product: convertProductForServal(product),
      /*
       * Não é enfeite. Sem este sinal o dono marca "Ativo", salva sem erro
       * nenhum e o produto simplesmente não aparece na vitrine — ele
       * descobriria pelo silêncio, que é a pior forma de descobrir.
       */
      nasceuInativo: nasceInativo,
      /*
       * Se ele nasceu inativo JÁ COM origem configurada, a tela não deve mandar
       * configurar de novo o que acabou de ser feito.
       */
      nasceuComVinculo: vinculoProposto != null,
    };
  });

export const setProductActiveFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), isActive: z.boolean() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    /*
     * O caminho que NÃO passa pelo formulário: o botão de ligar/desligar da
     * listagem. Sem a guarda aqui, criar o produto inativo e ativá-lo por este
     * botão seria o desvio de uma linha para toda a regra.
     *
     * Desativar nunca é recusado — `produtoExigeVinculo` só cobra de produto
     * ativo, então `isActive: false` passa sempre.
     */
    await exigirConfiguracaoDeEstoque(storeId, data.id, { isActive: data.isActive });
    await setProductActive(storeId, data.id, data.isActive);
    return { ok: true as const };
  });

export const deleteProductFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    await deleteProduct(storeId, data.id);
    return { ok: true as const };
  });

export const adminCreateCategoryFn = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();

    // Verificar se categoria jÃ¡ existe
    let category = await prisma.category.findFirst({
      where: { storeId, name: data.name },
    });

    // Se nÃ£o existe, criar
    if (!category) {
      const slug = data.name.toLowerCase().replace(/\s+/g, "-");
      category = await prisma.category.create({
        data: {
          storeId,
          name: data.name,
          slug,
          kind: "SIMPLE",
          sortOrder: 0,
        },
      });
    }

    return category;
  });

export const adminDeleteCategoryFn = createServerFn({ method: "POST" })
  .validator(z.object({ categoryId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();

    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, storeId },
    });

    if (!category) {
      throw new Error("Categoria nÃ£o encontrada");
    }

    // Deletar apenas se nÃ£o tem produtos associados
    const productCount = await prisma.product.count({
      where: { categoryId: data.categoryId },
    });

    if (productCount === 0) {
      await prisma.category.delete({
        where: { id: data.categoryId },
      });
      return { success: true };
    }

    return { success: false, message: "Categoria tem produtos associados" };
  });

/**
 * Liga um produto de cardápio ao item de estoque que ele consome.
 *
 * O ELO É DE UM NÍVEL SÓ, e é isso que o torna correto. Vender um "Bolo de
 * Chocolate" reserva UMA unidade do item Bolo de Chocolate e para ali — não
 * desce nos ovos, na farinha, no óleo. Esses já foram debitados quando o bolo
 * foi PRODUZIDO. Descer de novo cobraria a farinha duas vezes.
 *
 * `inventoryItemId` nulo DESVINCULA. Sem isso, ligar no item errado não tinha
 * volta pela interface. Desvincular não toca em saldo, movimento, receita nem
 * histórico: só remove a referência.
 */
export const adminLinkProductToInventory = createServerFn({ method: "POST" })
  .validator(z.object({
    productId: z.string(),
    inventoryItemId: z.string().nullable(),
  }))
  .handler(async ({ data }) => {
    const admin = await requireAdminSession();

    const product = await prisma.product.findFirst({
      where: { id: data.productId, storeId: admin.storeId }
    });

    if (!product) {
      throw new Error("Produto nÃ£o encontrado");
    }

    /*
     * Só existe item a conferir quando se está VINCULANDO. Desvincular é a
     * ausência de item, e não um item inexistente.
     */
    if (data.inventoryItemId !== null) {
      const inventoryItem = await prisma.inventoryItem.findFirst({
        where: { id: data.inventoryItemId, storeId: admin.storeId }
      });

      if (!inventoryItem) {
        throw new Error("Item de estoque não encontrado");
      }
    }

    /*
     * DESVINCULAR PODE DEIXAR O PRODUTO SEM NADA, e é por isso que a guarda
     * entra aqui também. Uma bebida ativa cujo único elo com o estoque é este
     * campo volta a ser vendida sem descer saldo no instante em que ele vira
     * nulo — sem passar pelo formulário e sem tocar em ficha nenhuma.
     *
     * A alteração é julgada pelo RESULTADO (`inventoryItemId` proposto), não
     * pelo estado atual: checar o que está gravado aprovaria justamente a
     * remoção, porque no instante da checagem o vínculo ainda está lá.
     */
    await exigirVinculoDeEstoque(admin.storeId, data.productId, {
      inventoryItemId: data.inventoryItemId,
    });

    const updated = await prisma.product.update({
      where: { id: data.productId },
      data: { inventoryItemId: data.inventoryItemId }
    });

    return { success: true, product: updated };
  });

