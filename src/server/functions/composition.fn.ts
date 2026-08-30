// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/server/auth/session";
import { CompositionService } from "@/server/services/composition-service";
import {
  createProductCompositionSchema,
  updateProductCompositionSchema,
} from "@/lib/estoque-schemas";
import { productCompositionRepository } from "@/server/repositories";
import { prisma } from "@/server/db/client";
import {
  exigirVinculoDeEstoque,
  exigirConfiguracaoDeEstoque,
  recusaFichaTecnica,
  nasceInativoPorFaltaDeVinculo,
} from "@/server/inventory/guarda-de-receita";
import { numeros } from "./serializar";

/**
 * Admin only: Create a new recipe/composition
 */
export const adminCreateComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    const items = data?.items || [];
    const productName = data?.productId;
    const categoryIdOrName = data?.categoryId;

    console.log("ðŸ” [adminCreateComposition] Recebeu", items.length, "itens para produto:", productName, "categoria:", categoryIdOrName);

    /** O produto nasceu nesta chamada E nasceu inativo? A tela precisa dizer. */
    let produtoCriadoAgoraInativo = false;

    // Buscar ou criar o produto pelo nome
    let product = await prisma.product.findFirst({
      where: { storeId: admin.storeId, name: productName },
    });

    if (!product) {
      console.log(`ðŸ“¦ Produto "${productName}" nÃ£o encontrado. Criando...`);

      // Procurar ou criar categoria
      let category = await prisma.category.findFirst({
        where: { storeId: admin.storeId, id: categoryIdOrName },
      });

      // Se nÃ£o encontrou por ID, procura por nome (categoria nova)
      if (!category && categoryIdOrName) {
        category = await prisma.category.findFirst({
          where: { storeId: admin.storeId, name: categoryIdOrName },
        });

        // Se ainda nÃ£o encontrou, criar categoria nova
        if (!category) {
          const categorySlug = categoryIdOrName.toLowerCase().replace(/\s+/g, "-");
          category = await prisma.category.create({
            data: {
              storeId: admin.storeId,
              name: categoryIdOrName,
              slug: categorySlug,
              kind: "SIMPLE",
              sortOrder: 0,
            },
          });
          console.log(`âœ… Categoria "${categoryIdOrName}" criada`);
        }
      }

      // Se ainda nÃ£o tem categoria, usar primeira disponÃ­vel ou criar padrÃ£o
      if (!category) {
        category = await prisma.category.findFirst({
          where: { storeId: admin.storeId },
        });

        if (!category) {
          category = await prisma.category.create({
            data: {
              storeId: admin.storeId,
              name: "Bebidas",
              slug: "bebidas",
              kind: "SIMPLE",
              sortOrder: 0,
            },
          });
        }
      }

      // Gerar slug Ãºnico
      let baseSlug = productName.toLowerCase().replace(/\s+/g, "-");
      let slug = baseSlug;
      let counter = 1;

      while (await prisma.product.findFirst({
        where: { storeId: admin.storeId, slug }
      })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      /*
       * ESTE CAMINHO CRIA PRODUTO POR EFEITO COLATERAL, e por isso ele também
       * é uma porta da regra de estoque. Sem a mesma disciplina do
       * `saveProductFn`, montar uma ficha técnica com um nome de produto que
       * ainda não existe seria a forma de fazer nascer produto ativo sem
       * passar por guarda nenhuma.
       *
       * Nasce inativo pelo mesmo motivo de lá: a ficha ainda não existe neste
       * ponto — ela é criada logo abaixo, e precisa deste produto para existir.
       */
      const nasceInativo = await nasceInativoPorFaltaDeVinculo(admin.storeId, {
        isActive: true,
        controlaEstoque: true,
      });

      // Criar novo produto
      product = await prisma.product.create({
        data: {
          storeId: admin.storeId,
          categoryId: category.id,
          name: productName,
          slug,
          description: `Produto ${productName} criado automaticamente`,
          basePrice: 0,
          sortOrder: 0,
          isActive: !nasceInativo,
        },
      });
      produtoCriadoAgoraInativo = nasceInativo;

      console.log(`âœ… Produto "${productName}" criado com ID: ${product.id}`);
    }

    /*
     * UM PRODUTO DE REVENDA NÃO TEM RECEITA, e a recusa é aqui — não na tela.
     *
     * Uma Coca-Cola com ficha técnica não é só estranha: ela QUEBRA A BAIXA. O
     * motor, ao ver o tipo REVENDA, segue o item vinculado e ignora a ficha;
     * mas antes do tipo existir a ficha vencia, e essa é exatamente a
     * ambiguidade que esta fase existe para acabar. Deixar a ficha ser criada
     * para depois ignorá-la seria manter no banco um dado que mente sobre o
     * comportamento do produto.
     *
     * Vale mesmo com o controle de estoque DESLIGADO: a receita é errada
     * enquanto o dono a monta, não só quando ele liga o controle. Permitir agora
     * para recusar depois transformaria "ligar o estoque" numa lista de
     * consertos.
     */
    if (await recusaFichaTecnica(admin.storeId, product.id)) {
      throw new Error(
        `"${product.name}" está marcado como Revenda, e produto de revenda não ` +
          `tem receita. Se ele é preparado pela casa, mude o tipo para Produção ` +
          `no cadastro do produto.`,
      );
    }

    const validated = createProductCompositionSchema.parse({
      productId: product.id,
      items,
      isActive: data?.isActive !== false,
    });

    const composicao = await CompositionService.createComposition(
      admin.storeId,
      product.id,
      validated,
    );

    /*
     * O produto pode ter NASCIDO AQUI, e inativo, sem que ninguém tenha pedido
     * um produto. Quem digita um nome novo neste campo está montando uma
     * receita, não cadastrando item de cardápio — e saía daqui achando que
     * terminou, com um produto invisível e de preço zero no cardápio.
     *
     * `produtoCriadoInativo` é acrescentado ao retorno, não o substitui: nada
     * hoje lê os campos da composição devolvida, mas trocar a forma do retorno
     * por um objeto novo quebraria quem viesse a ler.
     */
    return {
      ...(numeros(composicao) as any),
      produtoCriadoInativo: produtoCriadoAgoraInativo,
      produtoCriadoNome: produtoCriadoAgoraInativo ? product.name : null,
    };
  });

/**
 * De qual produto é esta ficha, recortado pela loja da sessão.
 *
 * `storeId` entra no `findFirst` e não numa conferência posterior: assim uma
 * ficha de outra loja não é encontrada, em vez de ser encontrada e depois
 * recusada. A diferença importa porque a segunda forma já vazou a existência
 * do registro antes de recusar.
 *
 * Devolve `null` para ficha de PREPARADO, que tem `productId` nulo — a regra
 * de vínculo é sobre produto de cardápio, e preparado tem disciplina própria
 * (rendimento obrigatório) em `criarReceitaDePreparado`.
 */
async function produtoDaFicha(storeId: string, compositionId: string) {
  const ficha = await prisma.productComposition.findFirst({
    where: { id: compositionId, storeId },
    select: { productId: true },
  });
  return ficha?.productId ?? null;
}

/**
 * Admin only: Update a recipe (only if not yet used)
 */
/*
 * DECIMAL NÃO ATRAVESSA A FRONTEIRA DA SERVER FUNCTION.
 *
 * O seroval do TanStack Start não sabe serializar o Decimal do Prisma, e o
 * POST morre com "[object Decimal] cannot be parsed/serialized" — 500 na cara
 * do usuário, receita não salva.
 *
 * Havia duas tentativas de conserto aqui, e as duas vazavam:
 *
 *   1. Uma lista manual de campos em `composition-service`, convertendo cinco
 *      dos DEZ campos Decimal de InventoryItem. `purchasePackSize`,
 *      `averageCost`, `minimumThreshold`, `idealQuantity` e `maximumCapacity`
 *      passavam direto. Bastava um insumo comprado em embalagem para quebrar.
 *
 *   2. Um replacer com `constructor.name === 'Decimal'`. No Prisma 7 a classe
 *      se chama `Decimal2`, então nunca casava — e `JSON.stringify` chama
 *      `toJSON()` antes do replacer, então o valor nem chegava lá como Decimal.
 *
 * `numeros()` percorre o objeto inteiro e reconhece Decimal por ter
 * `toNumber()`, sem depender de nome de classe nem de lista de campos: campo
 * novo no schema já sai convertido, sem ninguém lembrar de atualizar nada.
 *
 * PRECISÃO: os campos são Decimal(15,4), (15,6) e (12,4) — no máximo 15 dígitos
 * significativos, dentro do que um double representa sem perder o valor decimal
 * na ida e volta. O Decimal continua sendo o tipo dentro do serviço e no banco,
 * que é onde soma de dinheiro acontece; a conversão é só na saída, para exibir.
 */

export const adminUpdateComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    const updateData: any = {};

    if (data?.items) {
      updateData.items = data.items;
    }

    if (data?.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    const validated = updateProductCompositionSchema.parse(updateData);

    /*
     * DESATIVAR a ficha é removê-la do estoque na prática: `resolverComposicao`
     * só olha `isActive`. Se era a última do produto, o produto volta a ser
     * vendido sem descer saldo.
     *
     * Trocar os itens não precisa de guarda: `updateProductCompositionSchema`
     * exige `items.min(1)`, então a ficha não tem como ficar vazia por aqui.
     */
    if (validated.isActive === false) {
      const productId = await produtoDaFicha(admin.storeId, data.compositionId);
      if (productId) {
        await exigirConfiguracaoDeEstoque(admin.storeId, productId, {
          ignorarComposicaoId: data.compositionId,
        });
      }
    }

    const result = await CompositionService.updateComposition(
      admin.storeId,
      data.compositionId,
      validated
    );

    return numeros(result);
  });

/**
 * Admin only: Activate a specific version
 */
export const adminActivateVersion = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    /*
     * Ativar uma versão DESATIVA todas as outras do mesmo dono, na mesma
     * transação. O resultado, então, é simples de descrever: a única ficha
     * ativa passa a ser esta. Se ela não tem item nenhum, o produto fica sem
     * receita — publicar uma v4 vazia apagaria na prática a v3 que funcionava.
     *
     * `ignorarComposicaoId` não serviria aqui: ele exclui uma ficha do
     * cálculo, mas não sabe que as demais estão prestes a cair.
     */
    const alvo = await prisma.productComposition.findFirst({
      where: { id: data.compositionId, storeId: admin.storeId },
      select: { productId: true, _count: { select: { items: true } } },
    });

    if (alvo?.productId) {
      await exigirConfiguracaoDeEstoque(admin.storeId, alvo.productId, {
        temFichaComIngrediente: alvo._count.items > 0,
      });
    }

    return numeros(await CompositionService.activateVersion(admin.storeId, data.compositionId));
  });

/**
 * Admin only: Delete a composition (soft delete if used)
 */
export const adminDeleteComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    /*
     * "Delete" aqui é desativação (`deleteComposition` chama `deactivate`),
     * e o efeito sobre o estoque é o mesmo de apagar: a ficha deixa de ser
     * resolvida. Se era a última do produto, o produto fica sem origem.
     */
    const productId = await produtoDaFicha(admin.storeId, data.compositionId);
    if (productId) {
      await exigirConfiguracaoDeEstoque(admin.storeId, productId, {
        ignorarComposicaoId: data.compositionId,
      });
    }

    return numeros(await CompositionService.deleteComposition(admin.storeId, data.compositionId));
  });

/**
 * Admin only: Delete a specific composition version (recipe)
 */
export const adminDeleteCompositionVersion = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    const composition = await prisma.productComposition.findUnique({
      where: { id: data.compositionId },
    });

    if (!composition) {
      throw new Error("Receita nÃ£o encontrada");
    }

    if (composition.storeId !== admin.storeId) {
      throw new Error("NÃ£o autorizado");
    }

    /*
     * O único caminho que APAGA a ficha de verdade. Sem guarda, era o desvio
     * mais direto de todos: monta-se a receita para conseguir ativar o
     * produto, apaga-se a receita em seguida, e o produto continua ativo
     * vendendo sem descer nada.
     */
    if (composition.productId) {
      await exigirConfiguracaoDeEstoque(admin.storeId, composition.productId, {
        ignorarComposicaoId: data.compositionId,
      });
    }

    await prisma.compositionItem.deleteMany({
      where: { compositionId: data.compositionId },
    });

    await prisma.productComposition.delete({
      where: { id: data.compositionId },
    });

    return { success: true };
  });

/**
 * Admin only: Get composition details
 */
export const adminGetComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return numeros(await productCompositionRepository.findById(admin.storeId, data.compositionId));
  });

/**
 * Admin only: Get all versions of a product
 */
export const adminGetProductVersions = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return numeros(await productCompositionRepository.findAllVersions(admin.storeId, data.productId));
  });

/**
 * Admin only: Calculate composition cost
 */
export const adminCalculateCompositionCost = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return numeros(await CompositionService.calculateCost(admin.storeId, data.compositionId));
  });

/**
 * Public: Get active composition for a product
 */
export const getActiveComposition = createServerFn({ method: "POST" })
  .handler(async (context: any) => {
    const admin = await requireAdminSession();
    const data = context?.data?.data || context?.data;

    return numeros(await CompositionService.getActiveComposition(admin.storeId, data.productId));
  });

/**
 * Public: Get all compositions for a store (for admin UI)
 */
export const adminGetAllCompositions = createServerFn({ method: "POST" })
  .handler(async () => {
    const admin = await requireAdminSession();

    return numeros(
      await productCompositionRepository.findAllByStore(admin.storeId, {
        activeOnly: false,
      }),
    );
  });

/**
 * Admin: Get all products with compositions for a store
 */
export const adminGetAllProducts = createServerFn({ method: "POST" })
  .handler(async () => {
    const admin = await requireAdminSession();

    /*
     * `deletedAt: null` e `isActive` são desta correção, e os dois pelo mesmo
     * motivo: esta lista é onde o dono procura o produto para montar a receita.
     *
     * Produto na lixeira aparecia aqui e podia receber ficha técnica — trabalho
     * jogado fora num produto que não existe mais para o cardápio.
     *
     * E o produto que MAIS chega a esta tela é justamente o que nasceu inativo
     * por falta de origem de estoque. Sem `isActive`, ele se confundia com os
     * demais e o dono não tinha como saber que ainda faltava ativá-lo.
     */
    const products = await prisma.product.findMany({
      where: { storeId: admin.storeId, deletedAt: null },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    return products;
  });

/**
 * Admin: Consume a composition (recipe) and decrease inventory items
 * Handles unit conversion automatically
 */
