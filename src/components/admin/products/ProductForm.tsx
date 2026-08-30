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
          data: { ...values, inventoryItemId: itemDeEstoque || null },
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
                    temFichaComIngrediente={temFichaComIngrediente}
                    produtoNovo={productId === null}
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
                temFichaComIngrediente={temFichaComIngrediente}
                produtoNovo={productId === null}
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
 * Tudo que o produto tem a ver com estoque, num lugar só.
 *
 * COMPONENTE, E NÃO DOIS BLOCOS IGUAIS. O formulário tem dois layouts — um
 * `md:hidden` e um `hidden md:flex` — e a seção de estoque existia apenas no
 * primeiro. No computador, que é onde o dono trabalha, não havia como vincular
 * um item de estoque nem isentar um produto: a regra do servidor era
 * obedecível só pelo celular. Duplicar o bloco resolveria hoje e divergiria na
 * primeira alteração; um componente não tem como divergir de si mesmo.
 *
 * A TELA NÃO É A AUTORIDADE. Nada aqui desabilita o botão de salvar — quem
 * recusa é a guarda no servidor. Aqui só se diz o que falta, para o dono não
 * descobrir pelo silêncio.
 */
function SecaoDeEstoque({
  itemDeEstoque,
  setItemDeEstoque,
  itens,
  rotuloDoTipo,
  controleAtivo,
  controlaEstoque,
  setControlaEstoque,
  temFichaComIngrediente,
  produtoNovo,
}: {
  itemDeEstoque: string;
  setItemDeEstoque: (v: string) => void;
  itens: any[];
  rotuloDoTipo: Record<string, string>;
  controleAtivo: boolean;
  controlaEstoque: boolean;
  setControlaEstoque: (v: boolean) => void;
  temFichaComIngrediente: boolean;
  produtoNovo: boolean;
}) {
  const temOrigem = Boolean(itemDeEstoque) || temFichaComIngrediente;
  /*
   * "(opcional)" só é verdade quando não está sendo exigido. Com o controle
   * ligado e o produto participando, chamar de opcional o que o servidor vai
   * cobrar é dizer ao dono o contrário do que vai acontecer.
   */
  const exigido = controleAtivo && controlaEstoque;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1">
          Item de estoque vinculado{exigido ? "" : " (opcional)"}
        </label>
        <select
          value={itemDeEstoque}
          onChange={(e) => setItemDeEstoque(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900"
        >
          <option value="">Nenhum item vinculado</option>
          {itens.map((it: any) => (
            <option key={it.id} value={it.id}>
              {it.nome} — {rotuloDoTipo[it.tipo] ?? it.tipo} — {it.unidade} —
              saldo {it.saldo.toLocaleString("pt-BR")}
            </option>
          ))}
        </select>
        {itemDeEstoque ? (
          <p className="text-xs text-neutral-600 mt-1">
            Cada venda deste produto reserva <strong>1 unidade</strong> desse
            item. Se ele for um preparado, os ingredientes da receita{" "}
            <strong>não</strong> são baixados de novo — já saíram na produção.
          </p>
        ) : (
          <p className="text-xs text-neutral-600 mt-1">
            Deixe em branco se este produto não sai do estoque. Preparados e
            itens de revenda aparecem no topo da lista.
          </p>
        )}
      </div>

      {/*
        Numa loja que não usa estoque isto seria uma pergunta a mais sobre um
        assunto que ela não tem — e a maioria das lojas não tem.
      */}
      {controleAtivo && (
        <div className="rounded-lg border border-neutral-200 p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={controlaEstoque}
              onChange={(e) => setControlaEstoque(e.target.checked)}
              className="mt-0.5 size-4 accent-[#E11D2E]"
            />
            <span className="text-sm text-neutral-700">
              Participa do controle de estoque
              <span className="block text-xs text-neutral-500">
                Desmarque para o que ocupa uma linha do cardápio sem sair da
                prateleira: taxa de entrega, couvert, serviço.
              </span>
            </span>
          </label>

          {controlaEstoque &&
            (temOrigem ? (
              <p className="mt-3 text-xs font-medium text-emerald-700">
                {itemDeEstoque
                  ? "✓ Item de estoque vinculado"
                  : "✓ Receita cadastrada"}
              </p>
            ) : (
              <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p>
                  Este produto precisa de uma <strong>receita</strong> ou de um{" "}
                  <strong>item de estoque vinculado</strong> para participar do
                  controle de estoque.
                  {produtoNovo &&
                    " Ele será criado inativo; ative-o depois de configurar."}
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
        </div>
      )}
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
