import { useState } from "react";
import { Link, useRouteContext, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { ImageUploadField } from "./ImageUploadField";
import {
  OptionGroupEditor,
  type GrupoRascunho,
} from "@/components/admin/menu/OptionGroupEditor";
import { saveProductFn } from "@/server/functions/products.fn";
import { getBusinessTypeFn } from "@/server/functions/settings.fn";
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
  allowHalfAndHalf: boolean;
  halfPizzaPricingRule: "HIGHEST_PRICE" | "AVERAGE_PRICE";
  sortOrder: number;
  sizes: { categorySizeId: string; price: number; isAvailable: boolean }[];
  /** Perguntas só deste produto, além das que a categoria já faz. */
  optionGroups: GrupoRascunho[];
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

  const save = useMutation({
    mutationFn: () => saveProductFn({ data: { id: productId, data: values } }),
    onSuccess: async () => {
      // Await the refetch so the list never flashes the pre-save values.
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      router.navigate({ to: "/admin/cardapio" });
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
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
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            to="/admin/cardapio"
            className="mb-1 flex items-center gap-1.5 text-sm text-[#E11D2E] hover:underline"
          >
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
          <h1 className="text-3xl font-bold text-neutral-900">
            {productId ? "Editar Produto" : "Novo Produto"}
          </h1>
        </div>
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c4172a] disabled:opacity-60"
        >
          {save.isPending ? "Salvando..." : "Salvar alterações"}
        </button>
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Topo à direita, como na tela de categorias: os campos ficam ao lado
            e a prévia acompanha o que se digita sem sair do campo de visão. */}
        <div className="hidden lg:col-span-2 lg:col-start-4 lg:row-span-2 lg:row-start-1 lg:block">
          {/* O produto no meio do cardápio, como o cliente o encontra: foto,
              etiqueta, descrição e preço já no lugar. É a resposta para "como isso
              vai ficar", que antes exigia salvar e abrir a loja noutra aba. */}
          {storeSlug && (
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
                // O rótulo do tamanho mora na categoria; o formulário guarda só o
                // id, e a vitrine precisa do nome para escrever "Grande".
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
          )}
        </div>

        <div
          className="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-1"
          onFocusCapture={() => setFoco("foto-do-produto")}
        >
          <ImageUploadField
            kind="product"
            label="Foto do produto"
            value={values.imageUrl}
            onChange={(url) => set("imageUrl", url)}
          />
        </div>

        <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-2">
          <Field label="Nome do produto">
            <input
              onFocus={() => setFoco("nome-do-produto")}
              value={values.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (enderecoSegueONome) set("slug", slugify(e.target.value));
              }}
              required
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900"
            />
          </Field>

          {/*
           * Só de leitura: quem monta o endereço é o sistema, a partir do nome.
           *
           * Editável, ele convidava a lojista a mexer no que é a identidade da
           * página do produto — e um endereço digitado à mão é onde nascem
           * acento, espaço e slug repetido, que o cliente só descobre quando o
           * link não abre. Fica à mostra porque é o endereço que ela manda no
           * WhatsApp; só não se digita nele.
           */}
          <Field label="Endereço do produto no site">
            <input
              value={values.slug}
              readOnly
              tabIndex={-1}
              aria-describedby="dica-do-slug"
              className="w-full cursor-default rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-base text-neutral-500 md:text-sm"
            />
            <span id="dica-do-slug" className="mt-1 block text-xs text-neutral-500">
              Criado sozinho a partir do nome do produto.
            </span>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Categoria">
              <select
                value={values.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                required
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base md:text-sm text-neutral-900"
              >
                <option value="">Selecione...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Preço base">
              <input
                type="number"
                step="0.01"
                min="0"
                onFocus={() => setFoco("preco-do-produto")}
                value={values.basePrice}
                onChange={(e) => set("basePrice", Number(e.target.value))}
                required
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900"
              />
            </Field>
          </div>

          <Field label="Descrição">
            <textarea
              onFocus={() => setFoco("descricao-do-produto")}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900"
            />
          </Field>

          <Field label="Selo (opcional)">
            <input
              onFocus={() => setFoco("etiqueta-do-produto")}
              value={values.tag ?? ""}
              onChange={(e) => set("tag", e.target.value || null)}
              placeholder="Ex: Mais pedida, Novidade"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-900">Tamanhos disponíveis</p>

            {!values.categoryId ? (
              <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-sm text-neutral-600">
                Escolha uma categoria acima. São os tamanhos dela que aparecem aqui.
              </p>
            ) : tamanhosDaCategoria.length === 0 ? (
              <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-sm text-neutral-600">
                A categoria escolhida não tem tamanhos, então este produto é vendido pelo preço
                base — o normal para bebidas e porções. Para vender por tamanho (P/M/G,
                300ml/500ml, Brotinho/Grande), cadastre os tamanhos dela em Cardápio →
                Categorias.
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
                          className="w-28 rounded-lg border border-neutral-200 px-3 py-1.5 text-base md:text-sm text-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400"
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

          {/* Perguntas do produto, separadas das da categoria.
              "Bebidas" tem refrigerante e suco: os sabores de um não são os do
              outro, e uma pergunta na categoria obrigaria os dois à mesma
              lista. Aqui o dono pergunta só do item que está editando. */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-sm font-semibold text-neutral-900">
              Perguntas só deste produto
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              O que o cliente escolhe antes de adicionar ao carrinho — o sabor do suco, o
              tipo de pão. Vale só para este produto.
            </p>

            {categoriaEscolhida && categoriaEscolhida.optionGroups.length > 0 && (
              <p className="mt-2.5 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                A categoria {categoriaEscolhida.name} já pergunta{" "}
                <span className="font-semibold">
                  {categoriaEscolhida.optionGroups.map((g) => g.name).join(", ")}
                </span>{" "}
                em todos os produtos dela. Não precisa repetir aqui.
              </p>
            )}

            <div className="mt-3">
              <OptionGroupEditor
                value={values.optionGroups}
                onChange={(optionGroups) => set("optionGroups", optionGroups)}
                businessType={businessType ?? ""}
              />
            </div>
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-3">
          <p className="text-sm font-semibold text-neutral-900">Opções</p>

          <Toggle
            label="Produto disponível"
            checked={values.isActive}
            onChange={(v) => set("isActive", v)}
          />

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

          <Field label="Ordem de exibição">
            <input
              type="number"
              value={values.sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-base md:text-sm text-neutral-900"
            />
          </Field>
        </div>
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
