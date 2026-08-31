import { listActiveExtras } from "../repositories/extra-repository";
import { listMenuForStorefront } from "../repositories/product-repository";
import { getStoreSettings } from "../repositories/store-settings-repository";
import type {
  CardapioDoBalcao,
  GrupoDoBalcao,
  ProdutoDoBalcao,
} from "@/lib/balcao/tipos";

/**
 * O CARDÁPIO QUE O ATENDENTE VÊ.
 *
 * Nenhuma consulta nova: são as MESMAS três que servem a vitrine, chamadas com
 * o `storeId` da sessão do painel em vez do slug da URL. Não existe lista
 * paralela de produtos.
 *
 * ⚠️ MORA NUM SERVIÇO, E NÃO DENTRO DE `balcao.fn.ts`. Um `export` comum
 * convivendo com server functions no mesmo arquivo obriga o bundler a mandar
 * os imports daquele arquivo para o navegador — e aqui os imports são
 * repositórios, que puxam Prisma. Foi assim que a tela do balcão (e a de
 * pedidos) morreu com `ReferenceError: Buffer is not defined`. Um `.fn.ts` só
 * pode conter server functions e tipos.
 */

function grupoDoBalcao(g: any): GrupoDoBalcao {
  return {
    id: g.id,
    name: g.name,
    minChoices: g.minChoices,
    maxChoices: g.maxChoices,
    freeChoices: g.freeChoices,
    options: (g.options ?? []).map((o: any) => ({
      id: o.id,
      name: o.name,
      price: Number(o.price),
    })),
  };
}

/**
 * Exportada à parte da server function para ser exercível em teste sem
 * sessão — o recorte de loja é o argumento, e é justamente ele que os testes
 * de isolamento precisam variar.
 *
 * Os produtos já chegam com as perguntas da CATEGORIA somadas às DELE, na
 * mesma ordem que `precificarItens` usa no servidor: primeiro o que vale para
 * a categoria inteira, depois o que é só daquele item. Montar isso aqui evita
 * que a tela recomponha a lista e erre a ordem — e a ordem importa, porque é
 * ela que decide qual escolha cai na cota grátis.
 */
export async function montarCardapioDoBalcao(storeId: string): Promise<CardapioDoBalcao> {
  const [categorias, extras, settings] = await Promise.all([
    listMenuForStorefront(storeId),
    listActiveExtras(storeId),
    getStoreSettings(storeId),
  ]);

  const produtos: ProdutoDoBalcao[] = categorias.flatMap((categoria: any) =>
    (categoria.products ?? []).map((p: any) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description ?? "",
      // String vazia vira null aqui: a tela usa `imageUrl ? <img> : <ícone>`, e
      // um `src=""` faria o navegador pedir a própria página como imagem.
      imageUrl: p.imageUrl || null,
      tag: p.tag ?? null,
      basePrice: Number(p.basePrice),
      categoryId: categoria.id,
      categoryName: categoria.name,
      sizes: (p.sizes ?? []).map((s: any) => ({
        id: s.categorySizeId,
        label: s.categorySize?.label ?? "",
        price: Number(s.price),
      })),
      optionGroups: [
        ...(categoria.optionGroups ?? []).map(grupoDoBalcao),
        ...(p.optionGroups ?? []).map(grupoDoBalcao),
      ],
    })),
  );

  return {
    categorias: categorias.map((c: any) => ({
      id: c.id,
      name: c.name,
      /** Quantos produtos a aba mostra — some do filtro quando é zero. */
      quantidade: (c.products ?? []).length,
    })),
    produtos,
    extras: extras.map((e: any) => ({
      id: e.id,
      name: e.name,
      price: Number(e.price ?? 0),
      categoryIds: e.categoryIds,
      productIds: e.productIds,
    })),
    /**
     * As formas que a loja aceita, lidas de onde a vitrine as lê. O balcão não
     * inventa nenhuma: PAYROLL fica de fora porque quem o libera é o plano do
     * funcionário, pessoa a pessoa, e isso é conversa do checkout dele.
     */
    formasDePagamento: (settings.acceptedPaymentMethods as string[]).filter(
      (m) => m !== "PAYROLL",
    ),
  };
}
