import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { ImageUploadField } from "@/components/admin/products/ImageUploadField";
import {
  deletePromotionFn,
  listPromotionsFn,
  savePromotionFn,
} from "@/server/functions/promotions.fn";
import { PreviaDaVitrine } from "@/components/admin/preview/PreviaDaVitrine";
import { PromoCarouselDaPrevia } from "@/components/admin/preview/PromoCarouselDaPrevia";
import { aplicarRascunhoDePromocao } from "@/lib/previa/aplicar-rascunho";

export const Route = createFileRoute("/admin/promocoes/")({
  component: PromotionsPage,
});

type Draft = {
  id: string | null;
  eyebrow: string;
  title: string;
  description: string;
  discount: string;
  price: string;
  originalPrice: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

const EMPTY: Draft = {
  id: null,
  eyebrow: "Oferta da semana",
  title: "",
  description: "",
  discount: "",
  price: "",
  originalPrice: "",
  imageUrl: null,
  sortOrder: 0,
  isActive: true,
};

/** Empty means "no price shown", which is different from zero. */
const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));

function PromotionsPage() {
  const queryClient = useQueryClient();
  const { admin } = useRouteContext({ from: "/admin" });
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Onde a prévia deve olhar. Muda quando um campo recebe o cursor. */
  const [foco, setFoco] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["promotions"],
    queryFn: () => listPromotionsFn(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["promotions"] });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      savePromotionFn({
        data: {
          id: d.id,
          data: {
            eyebrow: d.eyebrow,
            title: d.title,
            description: d.description,
            discount: d.discount || null,
            price: toNumber(d.price),
            originalPrice: toNumber(d.originalPrice),
            imageUrl: d.imageUrl,
            sortOrder: d.sortOrder,
            isActive: d.isActive,
          },
        },
      }),
    onSuccess: (res: any) => {
      const result = res as { ok: boolean; error?: string };
      if (!result.ok) {
        setError(result.error || "Erro ao salvar");
        return;
      }
      invalidate();
      setDraft(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePromotionFn({ data: { id } }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Promoções</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Aparecem no carrossel &ldquo;Oferta da semana&rdquo; do seu cardápio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setDraft({ ...EMPTY, sortOrder: (data?.length ?? 0) + 1 });
          }}
          className="flex items-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a]"
        >
          <Plus className="size-4" />
          Nova promoção
        </button>
      </header>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fechar"
            className="-m-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-9999 flex items-end justify-center bg-black/50 p-4 sm:p-8">
          <div className="flex w-full max-w-3xl flex-col max-h-[90vh] overflow-auto rounded-t-2xl sm:rounded-2xl">
            <div className="flex items-center gap-2 rounded-t-2xl border border-b-0 border-neutral-200 bg-white px-5 py-3">
              <h2 className="text-base font-semibold text-neutral-900">
                {draft.id ? "Editar promoção" : "Nova promoção"}
              </h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                aria-label="Fechar"
                className="ml-auto rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="size-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(draft);
              }}
              className="rounded-b-2xl border border-neutral-200 bg-white p-5 grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6"
            >
              {/* Foto - Desktop: esquerda pequena, Mobile: topo grande */}
              <div className="lg:col-span-1">
                <style>{`
                  @media (max-width: 1024px) {
                    .promo-image-upload-mobile {
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      justify-content: center;
                      gap: 1rem;
                    }
                    .promo-image-upload-mobile .overflow-hidden {
                      width: 96px !important;
                      height: 96px !important;
                      border-radius: 9999px !important;
                      margin: 0 auto;
                    }
                    .promo-image-upload-mobile {
                      width: 100% !important;
                    }
                  }
                  @media (min-width: 1025px) {
                    .promo-image-upload-mobile {
                      width: 160px !important;
                    }
                  }
                `}</style>
                <div className="promo-image-upload-mobile">
                  <ImageUploadField
                    kind="product"
                    label=""
                    value={draft.imageUrl}
                    onChange={(url) => setDraft({ ...draft, imageUrl: url })}
                  />
                </div>
              </div>

              {/* Campos - Desktop: direita e ocupam todo espaço, Mobile: abaixo da foto */}
              <div className="lg:col-span-1 space-y-5">
                {/* Linha 1: Título | Chamada | Selo */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Título */}
                  <Field label="Título">
                    <Input
                      onFocus={() => setFoco("titulo-da-promocao")}
                      value={draft.title}
                      onChange={(v) => setDraft({ ...draft, title: v })}
                      required
                    />
                  </Field>

                  {/* Chamada */}
                  <Field label="Chamada" hint="Linha pequena acima do título.">
                    <Input
                      onFocus={() => setFoco("chamada-da-promocao")}
                      value={draft.eyebrow}
                      onChange={(v) => setDraft({ ...draft, eyebrow: v })}
                      required
                    />
                  </Field>

                  {/* Selo */}
                  <Field label="Selo" hint='Texto livre: "-20%", "Leve 3"'>
                    <Input
                      onFocus={() => setFoco("selo-da-promocao")}
                      value={draft.discount}
                      onChange={(v) => setDraft({ ...draft, discount: v })}
                    />
                  </Field>
                </div>

                {/* Linha 2: Ordem | Preço | Preço antigo */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Ordem */}
                  <Field label="Ordem">
                    <input
                      type="number"
                      value={draft.sortOrder}
                      onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900"
                    />
                  </Field>

                  {/* Preço */}
                  <Field label="Preço (R$)" hint="Deixe vazio para não mostrar.">
                    <Input
                      onFocus={() => setFoco("preco-da-promocao")}
                      value={draft.price}
                      onChange={(v) => setDraft({ ...draft, price: v })}
                      type="number"
                    />
                  </Field>

                  {/* Preço antigo + Status */}
                  <div className="space-y-1.5">
                    <Field label="Preço antigo (R$)" hint="Aparece riscado.">
                      <Input
                        onFocus={() => setFoco("preco-da-promocao")}
                        value={draft.originalPrice}
                        onChange={(v) => setDraft({ ...draft, originalPrice: v })}
                        type="number"
                      />
                    </Field>
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                        className="size-4 accent-[#E11D2E]"
                      />
                      <span className="text-sm text-neutral-700">Ativa no site</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Descrição - Full width, ocupa ambas colunas */}
              <div className="lg:col-span-2">
                <Field label="Descrição">
                  <textarea
                    onFocus={() => setFoco("descricao-da-promocao")}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    required
                    rows={3}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900"
                  />
                </Field>
              </div>

              {/* Prévia - Full width, ocupa ambas colunas */}
              {admin && (
                <div className="lg:col-span-2">
                  <PreviaDaVitrine
                    storeSlug={admin.store.slug}
                    foco={foco}
                    largura={1200}
                    aplicar={(payload) => aplicarRascunhoDePromocao(payload, draft)}
                  >
                    <PromoCarouselDaPrevia />
                  </PreviaDaVitrine>
                </div>
              )}

              {/* Botões - Full width, ocupa ambas colunas */}
              <div className="lg:col-span-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={save.isPending}
                  className="rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
                >
                  {save.isPending ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-xl border border-neutral-300 px-5 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPending ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : !data?.length ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Nenhuma promoção cadastrada. Sem elas, o carrossel não aparece no cardápio.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
          {data.map((p) => (
            <div
              key={p.id}
              className="flex flex-col rounded-2xl border border-neutral-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Imagem */}
              {p.imageUrl && (
                <div className="relative w-full pt-[66.67%] bg-neutral-100 overflow-hidden">
                  <img
                    src={p.imageUrl}
                    alt={p.title}
                    className="absolute inset-0 size-full object-cover"
                  />
                  {p.discount && (
                    <div className="absolute top-2 right-2 bg-[#E11D2E] text-white px-2 py-1 rounded-lg text-xs font-bold">
                      {p.discount}
                    </div>
                  )}
                </div>
              )}

              {/* Conteúdo */}
              <div className="flex flex-col flex-1 p-3">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide font-medium">
                  {p.eyebrow}
                </p>
                <h3 className="font-bold text-neutral-900 text-sm mt-1 line-clamp-2">
                  {p.title}
                </h3>
                <p className="text-xs text-neutral-600 mt-1 line-clamp-2 flex-1">
                  {p.description}
                </p>

                {/* Preço */}
                {(p.price || p.originalPrice) && (
                  <div className="mt-2 flex items-baseline gap-1">
                    {p.originalPrice && (
                      <span className="text-xs text-neutral-500 line-through">
                        R$ {Number(p.originalPrice).toFixed(2).replace(".", ",")}
                      </span>
                    )}
                    {p.price && (
                      <span className="text-sm font-bold text-[#E11D2E]">
                        R$ {Number(p.price).toFixed(2).replace(".", ",")}
                      </span>
                    )}
                  </div>
                )}

                {/* Status */}
                <div className="mt-2 flex gap-1 flex-wrap">
                  {!p.isActive && (
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] text-neutral-500 uppercase font-medium">
                      Inativa
                    </span>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="border-t border-neutral-200 p-2 flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      id: p.id,
                      eyebrow: p.eyebrow,
                      title: p.title,
                      description: p.description,
                      discount: p.discount ?? "",
                      price: p.price?.toString() ?? "",
                      originalPrice: p.originalPrice?.toString() ?? "",
                      imageUrl: p.imageUrl,
                      sortOrder: p.sortOrder,
                      isActive: p.isActive,
                    })
                  }
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors text-xs font-semibold"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate(p.id)}
                  className="p-1.5 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                  aria-label="Excluir"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-neutral-900">{label}</span>
      {children}
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

function Input({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900"
    />
  );
}
