import { useState } from "react";
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
import { PreviaDaVitrine } from "@/components/admin/preview/PreviaDaVitrine";
import { CardsDoCardapio } from "@/components/admin/preview/CardsDoCardapio";
import { aplicarRascunhoDeProduto } from "@/lib/previa/aplicar-rascunho";

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

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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
   * O endereço público segue o nome enquanto o produto está sendo criado, e
   * congela quando ele passa a existir.
   *
   * Congelar é o ponto: a lojista manda esse link no WhatsApp e ele vira print
   * na conversa do cliente. Se renomear "Pizza Calabresa" para "Pizza
   * Calabresa Especial" mudasse o endereço, todo link já enviado passaria a
   * dar página não encontrada, e ninguém faria a ligação entre uma coisa e
   * outra.
   */
  const enderecoSegueONome = productId === null;
  const [error, setError] = useState<string | null>(null);
  /** Salvou, mas o servidor mudou algo que o dono precisa saber. Não é erro. */
  const [aviso, setAviso] = useState<string | null>(null);
  /** Onde a prévia deve olhar. Muda quando um campo recebe o cursor. */
  const [foco, setFoco] = useState<string | null>(null);

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
    queryKey: ["ficha-ativa", productId],
    enabled: Boolean(productId) && controleAtivo,
    queryFn: () => getActiveComposition({ data: { productId } } as any),
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
          id: productId,
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
        setAviso(
          salvo?.nasceuComVinculo
            ? "Produto criado como inativo. A origem do estoque já está " +
                "configurada — ative o produto quando quiser."
            : "Produto criado como inativo: com o controle de estoque ligado, " +
                "ele precisa de uma receita ou de um item de estoque vinculado " +
                "antes de ser ativado.",
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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setAviso(null);
    if (!values.categoryId) {
      setError("Escolha uma categoria.");
      return;
    }
    /*
     * Um nome só de símbolos ("★★★") vira endereço vazio, e o servidor recusa.
     * Agora que o endereço é do sistema, a lojista não tem como consertá-lo —
     * então o erro precisa apontar para o campo que ela pode mexer, que é o
     * nome, em vez de reclamar de um campo que ela nem edita.
     */
    if (!values.slug) {
      setError("Use letras ou números no nome do produto — é o nome que forma o endereço dele no site.");
      return;
    }
    save.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
                    Nome do produto
                  </label>
                  <input
                    onFocus={() => setFoco("nome-do-produto")}
                    value={values.name}
                    onChange={(e) => {
                      set("name", e.target.value);
                      if (enderecoSegueONome) set("slug", slugify(e.target.value));
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

                <div className="sm:col-span-2">
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
                    instancia="compacto"
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
                      if (enderecoSegueONome) set("slug", slugify(e.target.value));
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

              {/*
                A MESMA seção de estoque do mobile, e não uma cópia dela.
                Faltava inteira aqui, e é neste layout que o dono trabalha.
              */}
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
                instancia="amplo"
              />

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

      {/* Botão de salvar e cancelar no final */}
      <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c4172a] disabled:opacity-60 w-full sm:w-auto"
        >
          {save.isPending ? "Salvando..." : "Salvar alterações"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (onSuccess) {
              onSuccess();
            } else {
              router.navigate({ to: "/admin/cardapio" });
            }
          }}
          className="flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 w-full sm:w-auto"
          title="Cancelar"
        >
          Cancelar
        </button>
      </div>
    </form>
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
 * A pergunta que define o comportamento de estoque do produto.
 *
 * ELA SUBSTITUIU UM CHECKBOX E UM SELECT SOLTOS. Antes a tela oferecia "item de
 * estoque vinculado" e "participa do controle de estoque" lado a lado, e a
 * combinação dos dois — mais a existência de uma ficha técnica montada em OUTRA
 * tela — é que decidia o que a venda faria. O dono não tinha como saber, olhando
 * aqui, se a venda ia baixar ingredientes, baixar uma unidade, ou não baixar
 * nada.
 *
 * A TELA NÃO É A AUTORIDADE, e isto não mudou. Nada aqui desabilita o botão de
 * salvar: quem recusa é a guarda no servidor, com a mensagem dela. O que a tela
 * faz é dizer o que falta antes de o dono clicar — e esconder o que não importa
 * para a escolha que ele fez.
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
  /**
   * Qual das duas cópias desta seção é esta.
   *
   * O formulário RENDERIZA AS DUAS, uma por layout, e esconde uma com CSS. Sem
   * um nome de grupo por cópia, os seis rádios ficam com o mesmo `name` dentro
   * do mesmo `<form>` — e o navegador trata isso como UM grupo só, onde apenas
   * um rádio pode estar marcado. React marca os dois, o DOM desfaz um, e quem
   * perde é justamente o visível: o dono clicava em "Revenda" e a bolinha não
   * pintava. O estado mudava, a tela não dizia.
   */
  instancia: string;
}) {
  /*
   * Numa loja que não usa estoque, tudo isto seria uma pergunta a mais sobre um
   * assunto que ela não tem. A seção inteira desaparece — inclusive a
   * embalagem, que sem controle não teria o que baixar.
   */
  if (!controleAtivo) return null;

  /*
   * A escolha do dono sobre PRODUÇÃO: a receita deste produto, ou um preparado
   * feito em lote. Deriva do que já está configurado, e cai na receita quando
   * não há nada — que é o caso comum.
   */
  const itemSelecionado = itens.find((i: any) => i.id === itemDeEstoque);
  const formaDeProducao =
    itemSelecionado?.tipo === "PREPARED" ? "PREPARADO" : "RECEITA";

  const OPCOES = [
    {
      valor: "NAO_CONTROLA" as const,
      titulo: "Não controlar estoque",
      ajuda: "Este produto não entra no controle. Taxa de entrega, couvert, serviço.",
    },
    {
      valor: "REVENDA" as const,
      titulo: "Revenda",
      ajuda: "Produto comprado pronto e vendido diretamente.",
    },
    {
      valor: "PRODUCAO" as const,
      titulo: "Produção",
      ajuda: "Produto preparado usando ingredientes.",
    },
  ];

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
      <div>
        <h4 className="text-sm font-semibold text-neutral-900">
          Como este produto controla o estoque?
        </h4>
        {tipoDeControle === null &&
          (produtoNovo ? (
            /*
             * PRODUTO NOVO NÃO TEM PASSADO, e dizer que ele "foi cadastrado
             * antes desta pergunta existir" seria falar de um produto que ainda
             * não existe. Quem está criando a Coca-Cola agora precisa de uma
             * instrução, não de um aviso sobre legado.
             */
            <p className="mt-1 text-xs text-neutral-500">
              Escolha uma opção para o estoque acompanhar este produto.
            </p>
          ) : (
            /*
             * O selo do produto LEGADO. Ele não está errado — está sem
             * resposta, e continua funcionando como sempre funcionou até
             * alguém responder. Dizer isso é o que impede o dono de achar que
             * algo quebrou.
             */
            <p className="mt-1 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
              <strong>Configuração pendente.</strong> Este produto foi
              cadastrado antes desta pergunta existir e continua funcionando
              como antes. Escolha uma opção para o estoque passar a segui-lo
              com precisão.
            </p>
          ))}
      </div>

      <div className="space-y-1.5">
        {OPCOES.map((o) => (
          <label
            key={o.valor}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors ${
              tipoDeControle === o.valor
                ? "border-[#E11D2E] bg-white"
                : "border-neutral-200 bg-white/60 hover:border-neutral-300"
            }`}
          >
            <input
              type="radio"
              name={`tipoDeControle-${instancia}`}
              checked={tipoDeControle === o.valor}
              onChange={() => {
                setTipoDeControle(o.valor);
                /*
                 * Trocar para "Não controlar" limpa o vínculo na hora. Sem
                 * isto, o item escolhido para uma REVENDA continuaria no
                 * payload e o servidor recusaria por uma combinação que a tela
                 * já não mostra — uma recusa impossível de entender.
                 */
                if (o.valor === "NAO_CONTROLA") setItemDeEstoque("");
                /*
                 * `controlaEstoque` é o campo antigo, e continua existindo: ele
                 * é a exceção que o dono já marcou em taxa de entrega e couvert.
                 * Mantê-lo em sincronia com a escolha nova evita que as duas
                 * regras digam coisas diferentes sobre o mesmo produto.
                 */
                setControlaEstoque(o.valor !== "NAO_CONTROLA");
              }}
              className="mt-0.5 size-4 accent-[#E11D2E]"
            />
            <span className="text-sm text-neutral-800">
              {o.titulo}
              <span className="block text-xs text-neutral-500">{o.ajuda}</span>
            </span>
          </label>
        ))}
      </div>

      {/* ───── REVENDA: só o item de estoque ───── */}
      {tipoDeControle === "REVENDA" && (
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-700">
            Item de estoque
          </label>
          <select
            value={itemDeEstoque}
            onChange={(e) => setItemDeEstoque(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900"
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
            <p className="mt-1.5 text-xs font-medium text-emerald-700">
              ✓ Cada unidade vendida baixa 1 deste item.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-amber-800">
              Obrigatório: escolha o item que sai da prateleira quando este
              produto é vendido.
            </p>
          )}
        </div>
      )}

      {/* ───── PRODUÇÃO: receita própria OU preparado ───── */}
      {tipoDeControle === "PRODUCAO" && (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name={`formaDeProducao-${instancia}`}
              checked={formaDeProducao === "RECEITA"}
              onChange={() => setItemDeEstoque("")}
              className="mt-0.5 size-4 accent-[#E11D2E]"
            />
            <span className="text-sm text-neutral-800">
              Tenho a receita deste produto
              <span className="block text-xs text-neutral-500">
                A venda baixa os ingredientes da receita.
              </span>
            </span>
          </label>

          {formaDeProducao === "RECEITA" &&
            (temFichaComIngrediente ? (
              <p className="text-xs font-medium text-emerald-700">
                ✓ Receita cadastrada
              </p>
            ) : (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p>
                  Obrigatório: uma receita com pelo menos um ingrediente.
                  {produtoNovo &&
                    " O produto será criado inativo — a receita só pode ser montada depois que ele existir."}
                </p>
                {/*
                  A receita é montada na aba Estoque, e sem este link o dono não
                  descobre isso sozinho: a mensagem exige uma coisa que mora
                  noutra tela e não diz qual.
                */}
                <Link
                  to="/admin/estoque"
                  className="mt-1.5 inline-block font-medium underline underline-offset-2 hover:text-amber-950"
                >
                  Cadastrar receita
                </Link>
              </div>
            ))}

          <label className="flex cursor-pointer items-start gap-2 border-t border-neutral-100 pt-2">
            <input
              type="radio"
              name={`formaDeProducao-${instancia}`}
              checked={formaDeProducao === "PREPARADO"}
              onChange={() => {
                const primeiro = itens.find((i: any) => i.tipo === "PREPARED");
                if (primeiro) setItemDeEstoque(primeiro.id);
              }}
              className="mt-0.5 size-4 accent-[#E11D2E]"
            />
            <span className="text-sm text-neutral-800">
              É um preparado que produzo em lote
              <span className="block text-xs text-neutral-500">
                A venda baixa 1 unidade do preparado. Os ingredientes não descem
                de novo — já saíram na produção do lote.
              </span>
            </span>
          </label>

          {formaDeProducao === "PREPARADO" && (
            <select
              value={itemDeEstoque}
              onChange={(e) => setItemDeEstoque(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900"
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

      {/*
        A EMBALAGEM É INDEPENDENTE DO TIPO, e aparece para os três — inclusive
        "Não controlar". Não controlar é não descer o PRODUTO; a sacola sai da
        prateleira do mesmo jeito.

        Só depois de o produto existir: a linha é FK para ele.
      */}
      {tipoDeControle !== null && productId && (
        <EmbalagemDoProduto productId={productId} />
      )}
      {tipoDeControle !== null && !productId && (
        <p className="text-xs text-neutral-500">
          A embalagem pode ser configurada depois de salvar o produto.
        </p>
      )}
    </div>
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
