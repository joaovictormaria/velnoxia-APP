import { useRef, useState } from "react";
import { Link, useRouteContext, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { ImageUploadField } from "./ImageUploadField";
import {
  OptionGroupEditor,
  type GrupoRascunho,
} from "@/components/admin/menu/OptionGroupEditor";
/*
 * `adminLinkProductToInventory` saiu daqui: o vínculo agora viaja dentro de
 * `saveProductFn`, gravado pelo mesmo comando que grava o produto. A função
 * continua existindo e guardada, para quem vincula de fora do formulário.
 */
import { saveProductFn } from "@/server/functions/products.fn";
import { adminListarItensParaVinculo } from "@/server/functions/inventory.fn";
import { getActiveComposition } from "@/server/functions/composition.fn";
import { CompositionBuilder } from "@/components/admin/inventory/CompositionBuilder";
import {
  listarEmbalagensDoProduto,
  listarItensDeEmbalagem,
  salvarEmbalagemDoProduto,
  removerEmbalagemDoProduto,
} from "@/server/functions/embalagem.fn";
import {
  getBusinessTypeFn,
  getControleDeEstoqueFn,
} from "@/server/functions/settings.fn";
/*
  O DIALOG DO PROJETO, e nao um modal novo.

  E o mesmo componente que ModalDeNovidade e ListaDeExtras ja usam: vem com
  foco preso, ESC, overlay e botao de fechar prontos. O cardapio tinha um
  modal artesanal so para editar produto - esse saiu, senao seriam dois
  padroes de modal no mesmo fluxo.
*/
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PreviaDaVitrine } from "@/components/admin/preview/PreviaDaVitrine";
import { CardsDoCardapio } from "@/components/admin/preview/CardsDoCardapio";
import { aplicarRascunhoDeProduto } from "@/lib/previa/aplicar-rascunho";
import { gerarSlugDeProduto } from "@/lib/slug-de-produto";

/**
 * Um produto em branco.
 *
 * Estava dentro da rota /admin/cardapio/novo, que era o unico lugar que
 * criava produto. Agora o cardapio tambem cria, sem sair da lista, e os dois
 * precisam partir exatamente do mesmo ponto - inclusive do `tipoDeControle`
 * nulo, que e o que faz a etapa 2 pedir a escolha em vez de responder por
 * quem cadastra.
 */
export const PRODUTO_EM_BRANCO: ProductFormValues = {
  name: "",
  slug: "",
  description: "",
  categoryId: "",
  basePrice: 0,
  imageUrl: null,
  tag: null,
  isActive: true,
  // Regra, não exceção: produto novo nasce participando do estoque.
  controlaEstoque: true,
  /*
   * SEM ESCOLHA PRÉVIA, de propósito.
   *
   * Um default aqui responderia a pergunta pelo dono — e a resposta errada
   * seria invisível, porque o rádio já viria marcado. Nulo faz a tela pedir a
   * escolha, que é o único momento em que ela é barata: quem está cadastrando
   * a Coca-Cola sabe agora que ela é revenda.
   */
  tipoDeControle: null,
  allowHalfAndHalf: false,
  halfPizzaPricingRule: "HIGHEST_PRICE",
  sortOrder: 0,
  sizes: [],
  optionGroups: [],
  // Produto novo nasce sem vinculo; escolhe-se no formulario.
  inventoryItemId: null,
};

/** As tres paradas do cadastro. A terceira so existe quando ha receita a montar. */
type Etapa = "produto" | "tipo" | "receita";

/*
  O DESLOCAMENTO E CURTO DE PROPOSITO: 48px, nao a largura inteira.

  Com um deslize de 100% o painel que sai precisaria da altura antiga para
  nao ser recortado, e as duas etapas tem alturas muito diferentes - a 1 tem
  foto, sete campos e previa; a 2 tem uma pergunta. O painel que sai esta
  fora do fluxo, entao o trilho ja assumiu a altura do que entra: um percurso
  longo mostraria o conteudo antigo sendo cortado no meio do caminho.

  48px com fade le como deslize lateral e nao expoe esse corte.
*/
const ANIMACAO_DAS_ETAPAS = `
@keyframes etapa-entra-direita {
  from { opacity: 0; transform: translate3d(48px, 0, 0); }
  to { opacity: 1; transform: none; }
}
@keyframes etapa-entra-esquerda {
  from { opacity: 0; transform: translate3d(-48px, 0, 0); }
  to { opacity: 1; transform: none; }
}
@keyframes etapa-sai-esquerda {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translate3d(-48px, 0, 0); }
}
@keyframes etapa-sai-direita {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translate3d(48px, 0, 0); }
}
@media (prefers-reduced-motion: reduce) {
  [data-etapa], [data-etapa] ~ * { animation: none !important; }
}
`;

const BOTAO_PRIMARIO =
  "w-full rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white " +
  "transition-colors hover:bg-[#c4172a] disabled:opacity-60 sm:w-auto";
const BOTAO_SECUNDARIO =
  "w-full rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm " +
  "font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 sm:w-auto";

export type ProductFormValues = {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  basePrice: number;
  imageUrl: string | null;
  tag: string | null;
  isActive: boolean;
  /**
   * Se o produto participa do controle de estoque da loja.
   *
   * Só significa algo quando a loja ligou o controle. Com ele desligado o
   * campo viaja no payload e ninguém o consulta.
   */
  controlaEstoque: boolean;
  /**
   * Como este produto controla o estoque.
   *
   * NULO é um estado real e não um "ainda não carregou": significa que o dono
   * nunca escolheu. Produto legado abre assim, cai no comportamento antigo e
   * aparece como "Configuração pendente" até alguém responder.
   */
  tipoDeControle: "NAO_CONTROLA" | "REVENDA" | "PRODUCAO" | null;
  allowHalfAndHalf: boolean;
  halfPizzaPricingRule: "HIGHEST_PRICE" | "AVERAGE_PRICE";
  sortOrder: number;
  sizes: { categorySizeId: string; price: number; isAvailable: boolean }[];
  /** Perguntas só deste produto, além das que a categoria já faz. */
  optionGroups: GrupoRascunho[];
  /**
   * Item de estoque que este produto consome ao ser vendido.
   *
   * Vender um "Bolo de Chocolate" reserva UMA unidade do item Bolo de
   * Chocolate e para ali — não desce nos ovos nem na farinha, que já foram
   * debitados quando o bolo foi PRODUZIDO.
   *
   * NÃO vai no `saveProductFn`: o vínculo tem função própria, e num produto
   * novo o id só existe depois de salvar.
   */
  inventoryItemId?: string | null;
};

export function ProductForm({
  productId,
  initial,
  categories,
  onSuccess,
}: {
  productId: string | null;
  initial: ProductFormValues;
  categories: {
    id: string;
    /** Endereço da categoria na vitrine, usado pela prévia. */
    slug: string;
    name: string;
    sizes: { id: string; label: string }[];
    optionGroups: { id: string; name: string }[];
  }[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ProductFormValues>(initial);
  /*
    O ID DO PRODUTO, DEPOIS QUE ELE PASSA A EXISTIR.

    `productId` e prop e nunca muda. Enquanto o save lia a prop, criar o
    produto na etapa 2, voltar da etapa 3 e concluir de novo mandava um segundo
    CREATE com o mesmo slug — e o banco respondia com o P2002 cru na tela.

    Guardando o id devolvido pelo servidor, a segunda submissao vira UPDATE do
    mesmo produto. E o estado, e nao a prop, que sabe se o produto ja nasceu.
  */
  const [idDoProduto, setIdDoProduto] = useState<string | null>(productId);
  /*
   * O endereço público segue o nome enquanto o produto está sendo criado, e
   * congela quando ele passa a existir.
   *
   * Congelar é o ponto: a lojista manda esse link no WhatsApp e ele vira print
   * na conversa do cliente. Se renomear "Pizza Calabresa" para "Pizza
   * Calabresa Especial" mudasse o endereço, todo link já enviado passaria a
   * dar página não encontrada, e ninguém faria a ligação entre uma coisa e
   * outra.
   */
  const enderecoSegueONome = idDoProduto === null;
  const [error, setError] = useState<string | null>(null);
  /** Salvou, mas o servidor mudou algo que o dono precisa saber. Não é erro. */
  const [aviso, setAviso] = useState<string | null>(null);
  /*
   * O produto recém-criado que ainda precisa de receita.
   *
   * Existe porque a ficha é FK para o produto e não pode precedê-lo: para o
   * banco, criar primeiro é obrigatório. O que NÃO é obrigatório é o dono
   * descobrir isso sendo largado noutra tela — com este id em mãos, o
   * `CompositionBuilder` abre aqui mesmo, na sequência do que ele já estava
   * fazendo.
   */
  const [receitaPara, setReceitaPara] = useState<string | null>(null);
  /** Onde a prévia deve olhar. Muda quando um campo recebe o cursor. */
  const [foco, setFoco] = useState<string | null>(null);

  /*
    A ETAPA ATUAL, E O PAINEL QUE ESTA SAINDO.

    `movimento` guarda de onde viemos e para que lado, e existe só durante a
    transição - depois volta a ser nulo. É ele que decide se ha um segundo
    painel montado e qual animação cada um recebe. Nulo também significa
    "primeira pintura": o formulário abre parado, sem deslizar do nada.
  */
  const [etapa, setEtapa] = useState<Etapa>("produto");
  const [movimento, setMovimento] = useState<{ de: Etapa; direcao: "avancar" | "voltar" } | null>(
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  function irPara(destino: Etapa, direcao: "avancar" | "voltar") {
    setMovimento({ de: etapa, direcao });
    setEtapa(destino);
    window.setTimeout(() => setMovimento(null), 280);
  }

  function sair() {
    if (onSuccess) onSuccess();
    else router.navigate({ to: "/admin/cardapio" });
  }

  /** Fecha o cadastro depois da receita montada. Mesma saída do botão antigo. */
  function concluirReceita() {
    setReceitaPara(null);
    sair();
  }

  // Meia a meia é a divisão física do disco de pizza, com regra de preço entre
  // dois sabores. Numa hamburgueria a pergunta não existe — e oferecê-la só
  // gera a dúvida de para que serve, ou um pedido impossível de montar.
  const { data: businessType } = useQuery({
    queryKey: ["business-type"],
    queryFn: () => getBusinessTypeFn(),
  });
  const aceitaMeioAMeio = businessType === "pizzaria";

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    // Mudar de categoria zera os preços por tamanho: eles apontam para
    // tamanhos da categoria antiga, que a nova nem oferece.
    setValues((v) =>
      key === "categoryId" && value !== v.categoryId
        ? { ...v, [key]: value, sizes: [] }
        : { ...v, [key]: value },
    );
  }

/**
   * Os tamanhos oferecidos são os da categoria escolhida agora, não uma lista
   * fixa. Trocar a categoria troca o que aparece aqui — e os preços da
   * categoria anterior deixam de valer, por isso são descartados no set().
   */
  // A loja vem da moldura do painel: este formulário é usado por duas rotas, e
  // exigir a prop de cada uma seria repetir o que a sessão já sabe.
  const { admin } = useRouteContext({ from: "/admin" });
  const storeSlug = admin?.store.slug ?? "";

  const categoriaEscolhida = categories.find((c) => c.id === values.categoryId);
  const slugDaCategoria = categoriaEscolhida?.slug;
  const tamanhosDaCategoria = categoriaEscolhida?.sizes ?? [];

  function sizeFor(categorySizeId: string) {
    return values.sizes.find((s) => s.categorySizeId === categorySizeId);
  }

  function toggleSize(categorySizeId: string, enabled: boolean) {
    setValues((v) => ({
      ...v,
      sizes: enabled
        ? [...v.sizes, { categorySizeId, price: v.basePrice, isAvailable: true }]
        : v.sizes.filter((s) => s.categorySizeId !== categorySizeId),
    }));
  }

  function setSizePrice(categorySizeId: string, price: number) {
    setValues((v) => ({
      ...v,
      sizes: v.sizes.map((s) => (s.categorySizeId === categorySizeId ? { ...s, price } : s)),
    }));
  }

  /*
   * O VÍNCULO É GRAVADO SEPARADO, e de propósito.
   *
   * `saveProductFn` serve todos os produtos do cardápio; enfiar estoque nele
   * mexeria no caminho de quem não usa preparado nenhum. E num produto novo o
   * `productId` só existe depois de salvar, então não haveria como mandar os
   * dois juntos sem mudar aquela função.
   *
   * Se o vínculo falhar, o produto fica criado e sem vínculo, com o erro à
   * vista — corrigível pelo Editar. É menos ruim que perder o produto.
   */
  const [itemDeEstoque, setItemDeEstoque] = useState<string>(
    initial.inventoryItemId ?? "",
  );
  const itensDeEstoque = useQuery({
    queryKey: ["itens-para-vinculo"],
    queryFn: () => adminListarItensParaVinculo(),
  });

  /*
   * A loja liga o controle de estoque? Vem do SERVIDOR, e não de um palpite
   * do formulário — é o mesmo dado que a guarda consulta para recusar.
   */
  const controleDeEstoque = useQuery({
    queryKey: ["controle-de-estoque"],
    queryFn: () => getControleDeEstoqueFn(),
  });
  const controleAtivo = controleDeEstoque.data?.ativo ?? false;

  /*
   * A ficha ativa deste produto, só para o selo dizer a verdade.
   *
   * Produto novo não tem id, então não há o que perguntar — e não haveria
   * ficha mesmo: ela é FK para o produto e não pode precedê-lo.
   */
  const fichaAtiva = useQuery({
    queryKey: ["ficha-ativa", idDoProduto],
    /*
     * SEM O `controleAtivo`, e a remoção é o ponto.
     *
     * Um produto de PRODUÇÃO precisa de receita mesmo na loja que desligou o
     * controle de estoque — a receita é a origem do CUSTO, não do estoque.
     * Enquanto esta consulta dependia da flag, a tela dessas lojas não tinha
     * como saber se a ficha existe, e o selo "✓ Receita cadastrada" nunca
     * aparecia para elas.
     */
    enabled: Boolean(idDoProduto),
    queryFn: () => getActiveComposition({ data: { productId: idDoProduto } } as any),
  });

  const temFichaComIngrediente =
    ((fichaAtiva.data as any)?.items?.length ?? 0) > 0;

  const rotuloDoTipo: Record<string, string> = {
    PREPARED: "Preparado",
    RESALE: "Revenda",
    INGREDIENT: "Ingrediente",
    PACKAGING: "Embalagem",
  };

  const save = useMutation({
    /*
     * UMA CHAMADA SÓ, e o vínculo vai dentro dela.
     *
     * Eram duas: salvava o produto e, depois, gravava o vínculo. Com o controle
     * de estoque ligado isso tornava impossível o gesto mais natural do
     * cadastro — escolher o item de estoque e marcar "Ativo" na mesma tela:
     * a guarda rodava na primeira chamada, lia o banco sem o vínculo (que só
     * chegaria na segunda) e recusava, dizendo que faltava justamente o item
     * que estava selecionado ali na tela.
     *
     * E quando a segunda chamada falhava, o produto ficava salvo sem vínculo,
     * com um aviso pedindo para reabrir em Editar.
     *
     * Agora `inventoryItemId` é uma coluna gravada pelo mesmo comando que grava
     * `isActive`: ou os dois entram, ou nenhum entra.
     */
    mutationFn: () =>
      saveProductFn({
        data: {
          id: idDoProduto,
          data: {
            ...values,
            inventoryItemId: itemDeEstoque || null,
            /*
             * NÃO CONTROLAR não tem item vinculado, por definição — e o
             * servidor recusa a combinação. Limpar aqui evita que um item
             * escolhido antes de trocar para "Não controlar" viaje junto e
             * derrube o salvamento com uma recusa que o dono não entenderia.
             */
            ...(values.tipoDeControle === "NAO_CONTROLA"
              ? { inventoryItemId: null }
              : {}),
          },
        },
      }),
    onSuccess: async (salvo: any) => {
      /*
        O id chega antes de qualquer outra decisao: se o passo seguinte falhar,
        o produto ja existe e a tela nao pode voltar a achar que nao.
      */
      if (salvo?.product?.id) setIdDoProduto(salvo.product.id);
      // Await the refetch so the list never flashes the pre-save values.
      await queryClient.invalidateQueries({ queryKey: ["products"] });

      /*
       * O SERVIDOR GRAVOU INATIVO, e o dono precisa saber disso agora.
       *
       * Com o controle de estoque ligado, produto novo sem ficha e sem vínculo
       * nasce inativo — não há como criar a ficha antes do produto existir.
       * Sem este aviso, ele marca "Ativo", salva sem erro nenhum e o produto
       * simplesmente não aparece na vitrine: descobriria pelo silêncio.
       *
       * Fica na tela em vez de navegar, porque a próxima ação é aqui mesmo —
       * montar a ficha ou vincular o item.
       */
      if (salvo?.nasceuInativo) {
        /*
         * O TOGGLE PRECISA CONTAR A MESMA HISTÓRIA QUE O AVISO.
         *
         * O servidor gravou o produto INATIVO, e a tela continuava mostrando
         * "Disponível" ligado — porque `values.isActive` é o que o dono
         * marcou, não o que foi gravado. A tela dizia duas coisas opostas ao
         * mesmo tempo: um aviso amarelo explicando que nasceu inativo, e um
         * botão verde afirmando que está disponível.
         */
        set("isActive", false);
        /*
         * DOIS TEXTOS, porque são duas situações diferentes. Quem já escolheu
         * o item de estoque na tela não pode ser mandado configurar a origem
         * de novo: pareceria que a escolha dele não funcionou.
         */
        /*
         * PRODUÇÃO SEM RECEITA NÃO VIRA UM AVISO E UM BECO.
         *
         * Este era o ponto em que o dono era informado de que faltava receita
         * e deixado sozinho: a ficha se monta em /admin/estoque, outra área do
         * sistema, e ele tinha de descobrir isso pela mensagem. Agora o
         * `CompositionBuilder` — o mesmo componente daquela tela, não uma cópia
         * — abre aqui, já apontado para o produto que acabou de nascer.
         */
        if (values.tipoDeControle === "PRODUCAO" && !salvo?.nasceuComVinculo) {
          setReceitaPara(salvo?.product?.id ?? null);
          irPara("receita", "avancar");
          setAviso(
            "Produto criado. Falta a receita — monte-a abaixo e o produto fica " +
              "pronto para ser ativado.",
          );
          return;
        }

        /*
         * DOIS TEXTOS, porque são duas situações diferentes. Quem já escolheu
         * o item de estoque na tela não pode ser mandado configurar a origem
         * de novo: pareceria que a escolha dele não funcionou.
         */
        setAviso(
          salvo?.nasceuComVinculo
            ? "Produto criado como inativo. A origem do estoque já está " +
                "configurada — ative o produto quando quiser."
            : "Produto criado como inativo: ele precisa de uma receita ou de um " +
                "item de estoque vinculado antes de ser ativado.",
        );
        return;
      }

      // Se há callback (modal), chamar; senão navegar (rota direta)
      if (onSuccess) {
        onSuccess();
      } else {
        router.navigate({ to: "/admin/cardapio" });
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  /*
    AS REGRAS DE AVANCAR SAO AS MESMAS DE SALVAR, escritas uma vez só.

    Os dois campos obrigatórios que o servidor recusa - categoria e endereço
    - são preenchidos na etapa 1, então cobrá-los ali é melhor que deixar o
    dono descobrir na etapa 2. O resto dos obrigatórios continua sendo os
    `required` que já estavam nos campos: `checkValidity` os consulta em vez
    de reescrevê-los aqui.
  */
  function validarDadosBasicos(): string | null {
    if (!values.categoryId) return "Escolha uma categoria.";
    /*
     * Um nome só de símbolos ("★★★") vira endereço vazio, e o servidor recusa.
     * Agora que o endereço é do sistema, a lojista não tem como consertá-lo —
     * então o erro precisa apontar para o campo que ela pode mexer, que é o
     * nome, em vez de reclamar de um campo que ela nem edita.
     */
    if (!values.slug)
      return (
        "Use letras ou números no nome do produto — é o nome que forma o " +
        "endereço dele no site."
      );
    return null;
  }

  function avancarParaTipo() {
    setError(null);
    setAviso(null);
    const el = formRef.current;
    if (el && !el.checkValidity()) {
      /*
        A COBRANCA PRECISA CAIR NUM CAMPO QUE O DONO ESTA VENDO.

        O formulario monta os campos DUAS vezes — um layout de celular e um de
        desktop — e esconde um com CSS. `form.reportValidity()` escolhe o
        primeiro invalido do DOM, que costuma ser o da copia escondida: o
        navegador nao consegue focar um campo invisivel, registra "not
        focusable" no console e nao mostra balao nenhum. O clique parecia nao
        fazer nada.

        Cobrar do primeiro invalido VISIVEL usa exatamente as mesmas regras —
        sao os `required` que ja estavam nos campos — e cai onde da para ler.
      */
      const invalidos = Array.from(
        el.querySelectorAll<HTMLInputElement | HTMLSelectElement>(":invalid"),
      );
      const naTela = invalidos.find((c) => c.getClientRects().length > 0);
      (naTela ?? el).reportValidity();
      return;
    }
    const problema = validarDadosBasicos();
    if (problema) {
      setError(problema);
      return;
    }
    irPara("tipo", "avancar");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setAviso(null);
    /*
      Enter num campo da etapa 1 é submit, e submit aqui salvaria o produto
      antes de perguntar o tipo dele. Na etapa 1 o Enter avança.
    */
    if (etapa === "produto") {
      avancarParaTipo();
      return;
    }
    /*
      NA ETAPA DA RECEITA O PRODUTO JA EXISTE, e salvar de novo aqui e sempre
      errado. O CompositionBuilder vive dentro deste form, entao qualquer
      submit vindo de la — um Enter num campo, um botao que esqueceu o type —
      chegaria como "salvar o produto" e fecharia o modal no meio da receita.
    */
    if (etapa === "receita") return;
    const problema = validarDadosBasicos();
    if (problema) {
      setError(problema);
      return;
    }
    save.mutate();
  }

  /* Cada painel e uma etapa. So o ativo - e, durante a transicao, o que sai - fica montado. */
  const painelProduto = (
    <div className="space-y-5">
        {/* PERFIL DO PRATO - Card com foto + todos os campos - Full width */}
        <div
          className="rounded-2xl border border-neutral-200 bg-white p-5"
          onFocusCapture={() => setFoco("foto-do-produto")}
        >
            {/* Mobile Layout */}
            <div className="flex md:hidden flex-col gap-4">
              {/* Foto Mobile - Redonda */}
              <div className="flex justify-center">
                <div className="w-40 h-40 rounded-full overflow-hidden">
                  <ImageUploadField
                    kind="product"
                    label=""
                    value={values.imageUrl}
                    onChange={(url) => set("imageUrl", url)}
                  />
                </div>
              </div>

              {/* Campos Mobile */}
              <div className="space-y-3">
                {/* Nome, Categoria, Preço, Selo, Ordem e Disponível - lado a lado */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-2">
                  {/*
                    `col-span-full`, e não `col-span-2`.

                    Este ramo do formulário só existe abaixo de 768px (`md:hidden`
                    no ancestral), então as variantes `md:` e `lg:` da grade acima
                    são código morto: na prática ela é sempre `grid-cols-1`.

                    Pedir `span 2` numa grade de UMA coluna faz o navegador criar
                    uma segunda coluna IMPLÍCITA, dimensionada por conteúdo. Era
                    ela que estragava o celular: a grade resolvia para
                    `9px 213px`, e todo campo que caísse na primeira coluna —
                    Categoria, Ordem exibição — virava uma fatia de 9 pixels, com
                    os rótulos se sobrepondo. Medido a 320px.

                    `col-span-full` (`1 / -1`) ocupa a largura inteira sem inventar
                    coluna nenhuma.
                  */}
                  <div className="col-span-full">
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Nome do produto
                    </label>
                    <input
                      onFocus={() => setFoco("nome-do-produto")}
                      value={values.name}
                      onChange={(e) => {
                        set("name", e.target.value);
                        if (enderecoSegueONome) set("slug", gerarSlugDeProduto(e.target.value));
                      }}
                      required
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Categoria
                    </label>
                    <select
                      value={values.categoryId}
                      onChange={(e) => set("categoryId", e.target.value)}
                      required
                      className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900"
                    >
                      <option value="">Selecione...</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Preço base
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      onFocus={() => setFoco("preco-do-produto")}
                      value={values.basePrice}
                      onChange={(e) => set("basePrice", Number(e.target.value))}
                      required
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Selo (opcional)
                    </label>
                    <input
                      onFocus={() => setFoco("etiqueta-do-produto")}
                      value={values.tag ?? ""}
                      onChange={(e) => set("tag", e.target.value || null)}
                      placeholder="Ex: Mais pedida"
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Ordem exibição
                    </label>
                    <input
                      type="number"
                      value={values.sortOrder}
                      onChange={(e) => set("sortOrder", Number(e.target.value))}
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900"
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                      Disponível
                    </label>
                    <Toggle
                      label=""
                      checked={values.isActive}
                      onChange={(v) => set("isActive", v)}
                    />
                  </div>
                </div>

                {/* Descrição e Tamanhos disponíveis - lado a lado */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* Descrição */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Descrição
                    </label>
                    <textarea
                      onFocus={() => setFoco("descricao-do-produto")}
                      value={values.description}
                      onChange={(e) => set("description", e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900"
                    />
                  </div>

                  {/* Tamanhos disponíveis */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-neutral-700 uppercase tracking-wide">Tamanhos disponíveis</p>

                  {!values.categoryId ? (
                    <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                      Escolha uma categoria. São os tamanhos dela que aparecem aqui.
                    </p>
                  ) : tamanhosDaCategoria.length === 0 ? (
                    <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                      A categoria não tem tamanhos. Produto vendido pelo preço base.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {tamanhosDaCategoria.map(({ id, label }) => {
                          const size = sizeFor(id);
                          return (
                            <div key={id} className="flex items-center gap-3">
                              <label className="flex flex-1 items-center gap-2 text-sm text-neutral-700">
                                <input
                                  type="checkbox"
                                  checked={Boolean(size)}
                                  onChange={(e) => toggleSize(id, e.target.checked)}
                                  className="size-4 accent-[#E11D2E]"
                                />
                                {label}
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                disabled={!size}
                                value={size?.price ?? ""}
                                onChange={(e) => setSizePrice(id, Number(e.target.value))}
                                placeholder="—"
                                className="w-20 rounded-lg border border-neutral-200 px-2 py-1 text-sm text-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400"
                              />
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-neutral-500">
                        Sem tamanhos marcados, o produto é vendido pelo preço base.
                      </p>
                    </>
                  )}
                  </div>
                </div>

                {/* Opções - dentro do card de perfil */}
                {aceitaMeioAMeio && (
                <div className="border-t border-neutral-200 pt-3">
                  <div className="space-y-3">
                    {aceitaMeioAMeio && (
                      <>
                        <Toggle
                          label="Permitir meia a meia (2 sabores)"
                          checked={values.allowHalfAndHalf}
                          onChange={(v) => set("allowHalfAndHalf", v)}
                        />

                        {values.allowHalfAndHalf && (
                          <>
                            <Field label="Regra de preço">
                              <select
                                value={values.halfPizzaPricingRule}
                                onChange={(e) =>
                                  set(
                                    "halfPizzaPricingRule",
                                    e.target.value as ProductFormValues["halfPizzaPricingRule"],
                                  )
                                }
                                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base md:text-sm text-neutral-900"
                              >
                                <option value="HIGHEST_PRICE">Maior preço entre os sabores</option>
                                <option value="AVERAGE_PRICE">Média entre os sabores</option>
                              </select>
                            </Field>

                            <p className="text-xs text-neutral-500">
                              {values.halfPizzaPricingRule === "HIGHEST_PRICE"
                                ? "A pizza sai pelo preço do sabor mais caro dos dois."
                                : "A pizza sai pela média dos preços dos dois sabores."}
                            </p>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                )}
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:flex md:flex-row gap-6">
              {/* Foto Desktop - Quadrada */}
              <div className="w-40 h-40 flex-shrink-0">
                <ImageUploadField
                  kind="product"
                  label=""
                  value={values.imageUrl}
                  onChange={(url) => set("imageUrl", url)}
                />
              </div>

              {/* Campos Desktop */}
              <div className="flex-1 min-w-0 space-y-3">
                {/* Nome, Categoria, Preço, Selo, Ordem e Disponível - lado a lado */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Nome do produto
                    </label>
                    <input
                      onFocus={() => setFoco("nome-do-produto")}
                      value={values.name}
                      onChange={(e) => {
                        set("name", e.target.value);
                        if (enderecoSegueONome) set("slug", gerarSlugDeProduto(e.target.value));
                      }}
                      required
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Categoria
                    </label>
                    <select
                      value={values.categoryId}
                      onChange={(e) => set("categoryId", e.target.value)}
                      required
                      className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900"
                    >
                      <option value="">Selecione...</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Preço base
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      onFocus={() => setFoco("preco-do-produto")}
                      value={values.basePrice}
                      onChange={(e) => set("basePrice", Number(e.target.value))}
                      required
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Selo (opcional)
                    </label>
                    <input
                      onFocus={() => setFoco("etiqueta-do-produto")}
                      value={values.tag ?? ""}
                      onChange={(e) => set("tag", e.target.value || null)}
                      placeholder="Ex: Mais pedida"
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Ordem exibição
                    </label>
                    <input
                      type="number"
                      value={values.sortOrder}
                      onChange={(e) => set("sortOrder", Number(e.target.value))}
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900"
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                      Disponível
                    </label>
                    <Toggle
                      label=""
                      checked={values.isActive}
                      onChange={(v) => set("isActive", v)}
                    />
                  </div>
                </div>

                {/* Descrição e Tamanhos disponíveis - lado a lado */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* Descrição */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                      Descrição
                    </label>
                    <textarea
                      onFocus={() => setFoco("descricao-do-produto")}
                      value={values.description}
                      onChange={(e) => set("description", e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900"
                    />
                  </div>

                  {/* Tamanhos disponíveis */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-neutral-700 uppercase tracking-wide">Tamanhos disponíveis</p>

                  {!values.categoryId ? (
                    <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                      Escolha uma categoria. São os tamanhos dela que aparecem aqui.
                    </p>
                  ) : tamanhosDaCategoria.length === 0 ? (
                    <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                      A categoria não tem tamanhos. Produto vendido pelo preço base.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {tamanhosDaCategoria.map(({ id, label }) => {
                          const size = sizeFor(id);
                          return (
                            <div key={id} className="flex items-center gap-3">
                              <label className="flex flex-1 items-center gap-2 text-sm text-neutral-700">
                                <input
                                  type="checkbox"
                                  checked={Boolean(size)}
                                  onChange={(e) => toggleSize(id, e.target.checked)}
                                  className="size-4 accent-[#E11D2E]"
                                />
                                {label}
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                disabled={!size}
                                value={size?.price ?? ""}
                                onChange={(e) => setSizePrice(id, Number(e.target.value))}
                                placeholder="—"
                                className="w-20 rounded-lg border border-neutral-200 px-2 py-1 text-sm text-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400"
                              />
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-neutral-500">
                        Sem tamanhos marcados, o produto é vendido pelo preço base.
                      </p>
                    </>
                  )}
                  </div>
                </div>

                {/* Opções - dentro do card de perfil */}
                {aceitaMeioAMeio && (
                <div className="border-t border-neutral-200 pt-3">
                  <div className="space-y-3">
                    {aceitaMeioAMeio && (
                      <>
                        <Toggle
                          label="Permitir meia a meia (2 sabores)"
                          checked={values.allowHalfAndHalf}
                          onChange={(v) => set("allowHalfAndHalf", v)}
                        />

                        {values.allowHalfAndHalf && (
                          <>
                            <Field label="Regra de preço">
                              <select
                                value={values.halfPizzaPricingRule}
                                onChange={(e) =>
                                  set(
                                    "halfPizzaPricingRule",
                                    e.target.value as ProductFormValues["halfPizzaPricingRule"],
                                  )
                                }
                                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base md:text-sm text-neutral-900"
                              >
                                <option value="HIGHEST_PRICE">Maior preço entre os sabores</option>
                                <option value="AVERAGE_PRICE">Média entre os sabores</option>
                              </select>
                            </Field>

                            <p className="text-xs text-neutral-500">
                              {values.halfPizzaPricingRule === "HIGHEST_PRICE"
                                ? "A pizza sai pelo preço do sabor mais caro dos dois."
                                : "A pizza sai pela média dos preços dos dois sabores."}
                            </p>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                )}
              </div>
            </div>
          </div>

        {/* PREVIEW - Full width abaixo (hidden on mobile) */}
        {storeSlug && (
        <div className="hidden md:block rounded-2xl border border-neutral-200 bg-white p-6">
          <p className="mb-4 text-sm font-semibold text-neutral-900">Preview do Produto</p>
          <PreviaDaVitrine
            storeSlug={storeSlug}
            foco={foco}
            aplicar={(payload) =>
              aplicarRascunhoDeProduto(payload, {
                id: productId,
                name: values.name,
                slug: values.slug,
                description: values.description,
                categoryId: values.categoryId,
                basePrice: values.basePrice,
                imageUrl: values.imageUrl,
                tag: values.tag,
                isActive: values.isActive,
                allowHalfAndHalf: values.allowHalfAndHalf,
                sortOrder: values.sortOrder,
                sizes: values.sizes.map((t) => ({
                  ...t,
                  label: tamanhosDaCategoria.find((x) => x.id === t.categorySizeId)?.label ?? "",
                })),
              })
            }
            largura={1000}
          >
            <CardsDoCardapio categorySlug={slugDaCategoria} slugEmEdicao={values.slug} />
          </PreviaDaVitrine>
        </div>
        )}
    </div>
  );

  const painelTipo = (
    /*
      Largura própria, e menor que a da etapa 1.

      A etapa 1 usa a linha inteira porque tem foto, sete campos e prévia. A
      etapa 2 tem uma pergunta só: esticá-la na mesma largura deixaria dois
      cartões de 700px com um rádio perdido na ponta esquerda.
    */
    <div className="mx-auto w-full max-w-2xl">
      <SecaoDeEstoque
        itemDeEstoque={itemDeEstoque}
        setItemDeEstoque={setItemDeEstoque}
        itens={itensDeEstoque.data ?? []}
        rotuloDoTipo={rotuloDoTipo}
        controleAtivo={controleAtivo}
        controlaEstoque={values.controlaEstoque}
        setControlaEstoque={(v) => set("controlaEstoque", v)}
        tipoDeControle={values.tipoDeControle}
        setTipoDeControle={(v) => set("tipoDeControle", v)}
        temFichaComIngrediente={temFichaComIngrediente}
        produtoNovo={productId === null}
        productId={productId}
        instancia="etapa"
      />
    </div>
  );

  const painelReceita = (
    <div className="mx-auto w-full max-w-3xl">
    {/*
      A RECEITA, MONTADA AQUI, NA SEQUENCIA DO CADASTRO.

      Este bloco é a resposta ao "não quero que o usuário descubra depois de
      salvar que precisa criar uma receita". A ficha é FK para o produto e não
      pode precedê-lo — então o produto nasce primeiro, por necessidade do
      banco. O que não é necessário é largar o dono em /admin/estoque para
      descobrir onde se monta uma ficha: o `CompositionBuilder` é o MESMO
      componente daquela tela, apontado para o produto que acabou de nascer.
    */}
    {receitaPara && (
      <section className="rounded-xl border border-amber-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">
          Receita de {values.name || "este produto"}
        </h3>
        <p className="mt-0.5 mb-3 text-xs text-neutral-600">
          Adicione os ingredientes e as quantidades. É deles que sai o custo
          do produto — e, com ele, o lucro e a margem.{" "}
          <strong className="font-medium text-neutral-800">
            Um ingrediente sem custo cadastrado deixa o produto de fora dos
            relatórios de rentabilidade
          </strong>{" "}
          — o sistema prefere não mostrar margem a mostrar uma margem
          inventada.
        </p>
        <CompositionBuilder
          storeId={admin?.storeId ?? ""}
          productId={receitaPara}
          categoryId={values.categoryId}
          mode="create"
        />
      </section>
    )}
    </div>
  );

  const painelDe = (e: Etapa) =>
    e === "produto" ? painelProduto : e === "tipo" ? painelTipo : painelReceita;

  return (
    /*
      TRES FAIXAS, E SÓ A DO MEIO ROLA.

      O modal é uma coluna flex com altura máxima da viewport: cabeçalho e
      rodapé são `shrink-0` e ficam parados; a faixa central leva `min-h-0`
      junto do `flex-1` porque, sem ele, um filho de flex nunca encolhe abaixo
      do próprio conteúdo — a barra apareceria na página inteira em vez de
      dentro do modal, e o rodapé sairia da tela.

      `onOpenChange` cobre ESC, clique no fundo e o X de uma vez só, e todos
      caem no mesmo `sair()` que o botão Cancelar sempre usou.
    */
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) sair();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="bg-black/40"
        /*
          `bg-white` explicito, e nao o `bg-background` do Dialog.

          No painel administrativo essa variavel resolve para oklch(0.145 0 0)
          — quase preto. O corpo do formulario tem cartoes brancos proprios e
          disfarcava o problema, mas o cabecalho e o rodape ficavam escuros com
          texto neutral-900 em cima: o titulo "Cadastrar produto" sumia.
        */
        className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0 text-neutral-900 sm:max-h-[calc(100dvh-4rem)] sm:p-0"
      >
        <form ref={formRef} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <style>{ANIMACAO_DAS_ETAPAS}</style>

          <header className="shrink-0 border-b border-neutral-200 px-4 py-3.5 pr-12 sm:px-6">
            <DialogTitle className="text-base font-semibold text-neutral-900">
              {productId ? "Editar produto" : "Cadastrar produto"}
            </DialogTitle>
            <div className="mt-3">
              <TrilhoDeEtapas etapa={etapa} mostrarReceita={receitaPara !== null} />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
        </p>
      )}

      {aviso && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {aviso}
        </p>
      )}
      {/*
        `overflow-hidden` no trilho, e é ele que garante o pedido de nunca
        criar barra horizontal: o painel que sai desliza para fora e é
        recortado aqui, em vez de empurrar a largura da página.

        O painel que sai fica num `<fieldset disabled>`. Não é enfeite: por um
        instante os dois painéis coexistem, e um `required` montado e
        invisível faz o navegador recusar o submit com "not focusable", sem
        mensagem nenhuma na tela. `disabled` num fieldset isenta todos os
        campos de dentro da validação nativa.
      */}
      <div className="relative min-w-0 overflow-hidden">
        {movimento && (
          <fieldset
            disabled
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 m-0 min-w-0 border-0 p-0"
            style={{
              animation: `${
                movimento.direcao === "avancar" ? "etapa-sai-esquerda" : "etapa-sai-direita"
              } 260ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
            }}
          >
            {painelDe(movimento.de)}
          </fieldset>
        )}

        <div
          key={etapa}
          data-etapa={etapa}
          style={
            movimento
              ? {
                  animation: `${
                    movimento.direcao === "avancar"
                      ? "etapa-entra-direita"
                      : "etapa-entra-esquerda"
                  } 260ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
                }
              : undefined
          }
        >
          {painelDe(etapa)}
        </div>
      </div>

          </div>

          {/*
            O rodapé fica FORA da faixa que rola e fora da que anima: ele não
            desliza com as etapas e continua alcançavel com o conteúdo no meio.

            `flex-col-reverse` no celular põe a ação principal EM CIMA da
            secundária: numa tela de 320px o polegar alcança a de baixo
            primeiro, e a de baixo é a que desfaz.
          */}
          <footer className="shrink-0 border-t border-neutral-200 bg-white px-4 py-3.5 sm:px-6">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        {etapa === "produto" && (
          <>
            <button type="button" onClick={sair} className={BOTAO_SECUNDARIO}>
              Cancelar
            </button>
            <button type="button" onClick={avancarParaTipo} className={BOTAO_PRIMARIO}>
              Próximo passo →
            </button>
          </>
        )}

        {etapa === "tipo" && (
          <>
            <button
              type="button"
              onClick={() => irPara("produto", "voltar")}
              className={BOTAO_SECUNDARIO}
            >
              ← Voltar
            </button>
            <button type="submit" disabled={save.isPending} className={BOTAO_PRIMARIO}>
              {save.isPending
                ? "Salvando..."
                : productId
                  ? "Salvar alterações"
                  : "Concluir cadastro"}
            </button>
          </>
        )}

        {etapa === "receita" && (
          <>
            <button
              type="button"
              onClick={() => irPara("tipo", "voltar")}
              className={BOTAO_SECUNDARIO}
            >
              ← Voltar
            </button>
            <button type="button" onClick={concluirReceita} className={BOTAO_PRIMARIO}>
              Concluir cadastro
            </button>
          </>
        )}
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-neutral-900">{label}</span>
      {children}
    </label>
  );
}

/**
 * A pergunta que define o comportamento de estoque e de CUSTO do produto.
 *
 * ELA APARECE SEMPRE, e essa é a regra. A seção sumia quando a loja tinha o
 * controle de estoque desligado — o que amarrava a classificação do produto a
 * uma configuração de ESTOQUE. Só que a receita de um produto de PRODUÇÃO não
 * existe para o estoque: existe para o CUSTO. Sem ela não há CMV, não há lucro
 * e não há margem, com a flag ligada ou não.
 *
 * DUAS OPÇÕES PRINCIPAIS, UMA TERCEIRA DISCRETA. Produção e Revenda são a
 * escolha real de quem cadastra mercadoria. "Não controlar" continua existindo
 * porque nem tudo no cardápio sai de prateleira — taxa de entrega, couvert e
 * serviço — mas não disputa atenção com as duas.
 *
 * O LAYOUT É `grid-cols-1 sm:grid-cols-2`, e não flex-wrap. Wrap decide quebrar
 * pela largura do CONTEÚDO, então em telas estreitas os dois cards ficavam meio
 * quebrados, meio espremidos, dependendo do tamanho do texto. O grid decide
 * pelo BREAKPOINT: ou são duas colunas, ou é uma. Não existe estado torto no
 * meio.
 *
 * A TELA NÃO É A AUTORIDADE. Nada aqui desabilita o botão de salvar: quem
 * recusa é a guarda no servidor, com a mensagem dela. O que a tela faz é dizer
 * o que falta ANTES do clique.
 */
function SecaoDeEstoque({
  itemDeEstoque,
  setItemDeEstoque,
  itens,
  rotuloDoTipo,
  controleAtivo,
  controlaEstoque: _controlaEstoque,
  setControlaEstoque,
  tipoDeControle,
  setTipoDeControle,
  temFichaComIngrediente,
  produtoNovo,
  productId,
  instancia,
}: {
  itemDeEstoque: string;
  setItemDeEstoque: (v: string) => void;
  itens: any[];
  rotuloDoTipo: Record<string, string>;
  controleAtivo: boolean;
  controlaEstoque: boolean;
  setControlaEstoque: (v: boolean) => void;
  tipoDeControle: "NAO_CONTROLA" | "REVENDA" | "PRODUCAO" | null;
  setTipoDeControle: (v: "NAO_CONTROLA" | "REVENDA" | "PRODUCAO" | null) => void;
  temFichaComIngrediente: boolean;
  produtoNovo: boolean;
  productId: string | null;
  /** Duas cópias por layout compartilham o form: o `name` precisa diferir. */
  instancia: string;
}) {
  /*
   * A escolha do dono sobre PRODUÇÃO: a receita deste produto, ou um preparado
   * feito em lote. Deriva do que já está configurado, e cai na receita quando
   * não há nada — que é o caso comum.
   */
  const itemSelecionado = itens.find((i: any) => i.id === itemDeEstoque);
  const formaDeProducao =
    itemSelecionado?.tipo === "PREPARED" ? "PREPARADO" : "RECEITA";

  const PRINCIPAIS = [
    {
      valor: "PRODUCAO" as const,
      titulo: "Produção",
      ajuda: "Produto produzido pela sua loja.",
    },
    {
      valor: "REVENDA" as const,
      titulo: "Revenda",
      ajuda: "Produto comprado pronto para ser vendido.",
    },
  ];

  /*
   * `min-w-0` na raiz, e é ele que impede o overflow horizontal.
   *
   * Esta seção vive dentro de uma grade do formulário. Sem `min-w-0` um filho
   * de grid usa `min-width: auto`, que é a largura do CONTEÚDO — e uma frase
   * longa no aviso empurrava a coluna para além da tela em 320px, levando o
   * formulário inteiro junto.
   */
  return (
    /*
      A largura quem dá é o painel da etapa, e não esta seção.

      Enquanto ela morava dentro da grade dos campos do produto precisava se
      defender sozinha de esticar. Agora é o conteúdo inteiro de uma etapa:
      quem decide o quanto ela ocupa é quem a coloca na tela.
    */
    <fieldset className="min-w-0 space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
      <legend className="px-1 text-sm font-semibold text-neutral-900">
        Tipo de produto <span className="text-[#E11D2E]">*</span>
      </legend>

      {tipoDeControle === null &&
        (produtoNovo ? (
          <p className="text-xs text-neutral-500">
            Escolha uma opção para continuar.
          </p>
        ) : (
          /*
           * O selo do produto LEGADO. Ele não está errado — está sem resposta,
           * e continua funcionando como sempre funcionou até alguém responder.
           */
          <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs leading-snug text-amber-800">
            <strong>Configuração pendente.</strong> Este produto foi cadastrado
            antes desta pergunta existir e continua funcionando como antes.
          </p>
        ))}

      {/* ───── as duas escolhas reais: lado a lado no desktop, empilhadas no celular ───── */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {PRINCIPAIS.map((o) => (
          /*
            O ESCOLHIDO PRECISA SER ÓBVIO SEM O RÁDIO.

            Só a bolinha marcada é pouco: num cartão de 16px de rádio contra
            300px de área, quem olha a tela de relance não vê qual está ativo.
            A borda vermelha de 2px mais o fundo róseo respondem à pergunta à
            distância; a borda transparente no estado normal reserva o mesmo
            espaço, senão o cartão pularia 1px ao ser escolhido.
          */
          <label
            key={o.valor}
            className={`flex min-w-0 cursor-pointer items-start gap-2.5 rounded-xl border-2 p-3 transition-colors ${
              tipoDeControle === o.valor
                ? "border-[#E11D2E] bg-[#E11D2E]/5"
                : "border-transparent bg-neutral-50 ring-1 ring-neutral-200 hover:bg-neutral-100"
            }`}
          >
            <input
              type="radio"
              name={`tipoDeControle-${instancia}`}
              checked={tipoDeControle === o.valor}
              onChange={() => {
                setTipoDeControle(o.valor);
                /*
                 * `controlaEstoque` é o campo antigo, e continua existindo: é a
                 * exceção que o dono já marcou em taxa de entrega e couvert.
                 * Mantê-lo em sincronia evita que as duas regras digam coisas
                 * diferentes sobre o mesmo produto.
                 */
                setControlaEstoque(true);
              }}
              className="mt-0.5 size-4 shrink-0 accent-[#E11D2E]"
            />
            <span className="min-w-0 text-sm font-medium leading-tight text-neutral-800">
              {o.titulo}
              <span className="mt-0.5 block text-xs font-normal leading-snug text-neutral-500">
                {o.ajuda}
              </span>
            </span>
          </label>
        ))}
      </div>

      {/* ───── PRODUÇÃO: aviso compacto + como é produzido ───── */}
      {tipoDeControle === "PRODUCAO" && (
        <div className="min-w-0 space-y-2">
          <p className="flex min-w-0 gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-snug text-amber-900">
            <span aria-hidden className="shrink-0">
              ⚠️
            </span>
            <span className="min-w-0">
              <strong>Este produto é produzido pela sua loja.</strong> Para
              controlar estoque e calcular corretamente o custo e o lucro deste
              produto, você precisa cadastrar uma receita.
            </span>
          </p>

          <p className="text-xs font-medium text-neutral-700">
            Como este produto é produzido?
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label
              className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                formaDeProducao === "RECEITA"
                  ? "border-[#E11D2E] bg-white ring-1 ring-[#E11D2E]/20"
                  : "border-neutral-200 bg-white hover:border-neutral-300"
              }`}
            >
              <input
                type="radio"
                name={`formaDeProducao-${instancia}`}
                checked={formaDeProducao === "RECEITA"}
                onChange={() => setItemDeEstoque("")}
                className="mt-0.5 size-4 shrink-0 accent-[#E11D2E]"
              />
              <span className="min-w-0 text-sm leading-tight text-neutral-800">
                Tenho a receita
                <span className="mt-0.5 block text-xs leading-snug text-neutral-500">
                  A venda baixa os ingredientes.
                </span>
              </span>
            </label>

            <label
              className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                formaDeProducao === "PREPARADO"
                  ? "border-[#E11D2E] bg-white ring-1 ring-[#E11D2E]/20"
                  : "border-neutral-200 bg-white hover:border-neutral-300"
              }`}
            >
              <input
                type="radio"
                name={`formaDeProducao-${instancia}`}
                checked={formaDeProducao === "PREPARADO"}
                onChange={() => {
                  const primeiro = itens.find((i: any) => i.tipo === "PREPARED");
                  if (primeiro) setItemDeEstoque(primeiro.id);
                }}
                className="mt-0.5 size-4 shrink-0 accent-[#E11D2E]"
              />
              <span className="min-w-0 text-sm leading-tight text-neutral-800">
                Preparado em lote
                <span className="mt-0.5 block text-xs leading-snug text-neutral-500">
                  Baixa 1 un; os ingredientes já saíram na produção.
                </span>
              </span>
            </label>
          </div>

          {formaDeProducao === "RECEITA" &&
            (temFichaComIngrediente ? (
              <p className="text-xs font-medium text-emerald-700">
                ✓ Receita cadastrada
              </p>
            ) : (
              <p className="text-xs leading-snug text-amber-800">
                {produtoNovo
                  ? "Ao salvar, a receita será montada aqui mesmo, na sequência."
                  : "Falta a receita. Sem ela o produto não pode ser ativado."}
              </p>
            ))}

          {formaDeProducao === "PREPARADO" && (
            <select
              value={itemDeEstoque}
              onChange={(e) => setItemDeEstoque(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900"
            >
              <option value="">Escolha o preparado</option>
              {itens
                .filter((i: any) => i.tipo === "PREPARED")
                .map((i: any) => (
                  <option key={i.id} value={i.id}>
                    {i.nome} — {i.unidade} — saldo{" "}
                    {i.saldo.toLocaleString("pt-BR")}
                  </option>
                ))}
            </select>
          )}
        </div>
      )}

      {/* ───── REVENDA: só o item de estoque ───── */}
      {tipoDeControle === "REVENDA" && (
        <div className="min-w-0 space-y-1.5">
          <label className="block text-xs font-medium text-neutral-700">
            Item de estoque
          </label>
          <select
            value={itemDeEstoque}
            onChange={(e) => setItemDeEstoque(e.target.value)}
            className="w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900"
          >
            <option value="">Escolha o item</option>
            {itens
              /*
               * Só o que pode ser revendido. Preparado tem casa própria — é a
               * segunda forma de PRODUÇÃO — e embalagem nunca é vendida como
               * veio. Ingrediente fica porque vender farinha a quilo é
               * legítimo, ainda que raro.
               */
              .filter((i: any) => i.tipo === "RESALE" || i.tipo === "INGREDIENT")
              .map((i: any) => (
                <option key={i.id} value={i.id}>
                  {i.nome} — {rotuloDoTipo[i.tipo] ?? i.tipo} — {i.unidade} —
                  saldo {i.saldo.toLocaleString("pt-BR")}
                </option>
              ))}
          </select>
          {itemDeEstoque ? (
            <p className="text-xs font-medium leading-snug text-emerald-700">
              ✓ Cada unidade vendida baixa 1 deste item.
            </p>
          ) : (
            /*
             * A exigência do item continua ATRÁS DA FLAG, e de propósito:
             * preservar integralmente o comportamento atual de REVENDA foi
             * condição explícita. Com o controle desligado o texto convida em
             * vez de cobrar, porque o servidor também não vai cobrar.
             */
            <p className="text-xs leading-snug text-amber-800">
              {controleAtivo
                ? "Obrigatório: escolha o item que sai da prateleira nesta venda."
                : "Escolha o item para que o custo e o lucro possam ser calculados."}
            </p>
          )}
        </div>
      )}

      {/* ───── a terceira opção, deliberadamente discreta ───── */}
      <label className="flex min-w-0 cursor-pointer items-start gap-2 border-t border-neutral-200 pt-3.5">
        <input
          type="radio"
          name={`tipoDeControle-${instancia}`}
          checked={tipoDeControle === "NAO_CONTROLA"}
          onChange={() => {
            setTipoDeControle("NAO_CONTROLA");
            /*
             * Limpa o vínculo na hora. Sem isto, um item escolhido antes da
             * troca continuaria no payload e o servidor recusaria por uma
             * combinação que a tela já não mostra.
             */
            setItemDeEstoque("");
            setControlaEstoque(false);
          }}
          className="mt-0.5 size-3.5 shrink-0 accent-neutral-500"
        />
        <span className="min-w-0 text-xs leading-snug text-neutral-500">
          Não controlar estoque
          <span className="block">
            Para serviços, taxas e couvert — itens que não saem da prateleira.
          </span>
        </span>
      </label>

      {/*
        A EMBALAGEM SEGUE ATRÁS DA FLAG. Ela é consumo de estoque puro — não
        entra no custo por outra via — então a loja que desligou o controle não
        tem o que fazer com ela. Só depois de o produto existir: a linha é FK
        para ele.
      */}
      {controleAtivo && tipoDeControle !== null && productId && (
        <EmbalagemDoProduto productId={productId} />
      )}
    </fieldset>
  );
}

/**
 * A embalagem que sai junto com o produto vendido.
 *
 * FORA DA RECEITA, e a separação é o ponto: a caixa de pizza é comprada pronta,
 * não é ingrediente. Dentro da ficha técnica ela faria a corrida de produção de
 * um preparado consumir caixa — a caixa é usada na venda, não quando a massa é
 * feita — e um produto de REVENDA, que não tem ficha nenhuma, ficaria sem lugar
 * para declarar o copo dele.
 */
function EmbalagemDoProduto({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const [novoItem, setNovoItem] = useState("");
  const [novaQtd, setNovaQtd] = useState("1");
  const [erro, setErro] = useState<string | null>(null);

  const embalagens = useQuery({
    queryKey: ["embalagens", productId],
    queryFn: () => listarEmbalagensDoProduto({ data: { productId } } as any),
  });
  const disponiveis = useQuery({
    queryKey: ["itens-de-embalagem"],
    queryFn: () => listarItensDeEmbalagem(),
  });

  const recarregar = () =>
    queryClient.invalidateQueries({ queryKey: ["embalagens", productId] });

  const adicionar = useMutation({
    mutationFn: () => {
      const item = (disponiveis.data ?? []).find((i: any) => i.id === novoItem);
      if (!item) throw new Error("Escolha a embalagem.");
      return salvarEmbalagemDoProduto({
        data: {
          productId,
          inventoryItemId: item.id,
          quantity: Number(novaQtd),
          unitId: item.baseUnitId,
        },
      } as any);
    },
    onSuccess: async () => {
      setNovoItem("");
      setNovaQtd("1");
      setErro(null);
      await recarregar();
    },
    onError: (e: any) => setErro(e?.message ?? "Não foi possível adicionar."),
  });

  const remover = useMutation({
    mutationFn: (id: string) => removerEmbalagemDoProduto({ data: { id } } as any),
    onSuccess: recarregar,
  });

  const lista: any[] = embalagens.data ?? [];
  const opcoes = (disponiveis.data ?? []).filter(
    (i: any) => !lista.some((l: any) => l.inventoryItemId === i.id),
  );

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
        Embalagem{" "}
        <span className="normal-case text-neutral-400">(opcional)</span>
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">
        Baixa junto com a venda. Não entra na receita.
      </p>

      {lista.length > 0 && (
        <ul className="mt-2 space-y-1">
          {lista.map((l: any) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-2.5 py-1.5 text-sm"
            >
              <span className="text-neutral-800">
                {l.quantidade.toLocaleString("pt-BR")} {l.unidade} — {l.nome}
                <span className="ml-1 text-xs text-neutral-500">
                  (saldo {l.saldo.toLocaleString("pt-BR")})
                </span>
              </span>
              <button
                type="button"
                onClick={() => remover.mutate(l.id)}
                className="text-xs text-neutral-500 underline underline-offset-2 hover:text-red-600"
              >
                remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {opcoes.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select
            value={novoItem}
            onChange={(e) => setNovoItem(e.target.value)}
            className="min-w-[10rem] flex-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm"
          >
            <option value="">Adicionar embalagem…</option>
            {opcoes.map((i: any) => (
              <option key={i.id} value={i.id}>
                {i.nome} — {i.unidade}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="any"
            value={novaQtd}
            onChange={(e) => setNovaQtd(e.target.value)}
            className="w-20 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={!novoItem || adicionar.isPending}
            onClick={() => adicionar.mutate()}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Adicionar
          </button>
        </div>
      ) : (
        lista.length === 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            Nenhum item de embalagem cadastrado no estoque.{" "}
            <Link
              to="/admin/estoque"
              className="font-medium underline underline-offset-2"
            >
              Cadastrar
            </Link>
          </p>
        )
      )}

      {erro && <p className="mt-1.5 text-xs text-red-600">{erro}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-neutral-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-emerald-500" : "bg-neutral-300"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

/**
 * O trilho no topo do modal.
 *
 * Duas paradas, e uma terceira que só aparece quando existe receita a montar:
 * anunciar "Receita" para quem escolheu Revenda seria prometer um passo que
 * nunca vem.
 */
function TrilhoDeEtapas({
  etapa,
  mostrarReceita,
}: {
  etapa: Etapa;
  mostrarReceita: boolean;
}) {
  const etapas: { id: Etapa; rotulo: string }[] = [
    { id: "produto", rotulo: "Produto" },
    { id: "tipo", rotulo: "Tipo" },
  ];
  if (mostrarReceita || etapa === "receita")
    etapas.push({ id: "receita", rotulo: "Receita" });
  const atual = etapas.findIndex((e) => e.id === etapa);

  return (
    <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-x-2">
      {etapas.map((e, i) => (
        <li key={e.id} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <span
            className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
              i === atual
                ? "bg-[#E11D2E] text-white"
                : i < atual
                  ? "bg-emerald-600 text-white"
                  : "bg-neutral-200 text-neutral-600"
            }`}
          >
            {i < atual ? "✓" : i + 1}
          </span>
          <span
            className={`truncate text-xs font-medium ${
              i === atual ? "text-neutral-900" : "text-neutral-500"
            }`}
          >
            {e.rotulo}
          </span>
          {i < etapas.length - 1 && (
            <span aria-hidden className="h-px w-4 shrink-0 bg-neutral-200 sm:w-8" />
          )}
        </li>
      ))}
    </ol>
  );
}
