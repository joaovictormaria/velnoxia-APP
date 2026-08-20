import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
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
    onSuccess: (res) => {
      if (!res.ok) {
        setError(res.error);
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
          <button type="button" onClick={() => setError(null)} aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
      )}

      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(draft);
          }}
          className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-5 lg:grid-cols-5"
        >
          {/* Topo à direita, como nas outras telas. */}
          {admin && (
            <div className="lg:col-span-2 lg:col-start-4 lg:row-span-3 lg:row-start-1">
              <PreviaDaVitrine
                storeSlug={admin.store.slug}
                foco={foco}
                largura={1200}
                aplicar={(payload) => aplicarRascunhoDePromocao(payload, draft)}
              >
                {/* O carrossel some quando não há promoção nenhuma; a em edição
                    já entra na lista, senão a prévia de uma promoção nova
                    mostraria a faixa vazia. */}
                <PromoCarouselDaPrevia />
              </PreviaDaVitrine>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
            <Field label="Chamada" hint="Linha pequena acima do título.">
              <Input
                onFocus={() => setFoco("chamada-da-promocao")}
                value={draft.eyebrow}
                onChange={(v) => setDraft({ ...draft, eyebrow: v })}
                required
              />
            </Field>
            <Field label="Título">
              <Input
                onFocus={() => setFoco("titulo-da-promocao")}
                value={draft.title}
                onChange={(v) => setDraft({ ...draft, title: v })}
                required
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[200px_1fr] lg:col-span-3">
            <ImageUploadField
              kind="product"
              label="Foto da promoção"
              value={draft.imageUrl}
              onChange={(url) => setDraft({ ...draft, imageUrl: url })}
            />
            <Field label="Descrição">
              <textarea
                onFocus={() => setFoco("descricao-da-promocao")}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                required
                rows={4}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
            <Field label="Selo" hint='Texto livre: "-20%", "Leve 3 pague 2".'>
              <Input
                onFocus={() => setFoco("selo-da-promocao")}
                value={draft.discount}
                onChange={(v) => setDraft({ ...draft, discount: v })}
              />
            </Field>
            <Field label="Preço (R$)" hint="Deixe vazio para não mostrar preço.">
              <Input
                onFocus={() => setFoco("preco-da-promocao")}
                value={draft.price}
                onChange={(v) => setDraft({ ...draft, price: v })}
                type="number"
              />
            </Field>
            <Field label="Preço antigo (R$)" hint="Aparece riscado ao lado.">
              <Input
                onFocus={() => setFoco("preco-da-promocao")}
                value={draft.originalPrice}
                onChange={(v) => setDraft({ ...draft, originalPrice: v })}
                type="number"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                className="size-4 accent-[#E11D2E]"
              />
              <span className="text-sm text-neutral-700">Ativa no site</span>
            </label>
            <Field label="Ordem">
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
            </Field>
          </div>

          <div className="flex gap-2">
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
      )}

      {isPending ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : !data?.length ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Nenhuma promoção cadastrada. Sem elas, o carrossel não aparece no cardápio.
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-neutral-500">{p.eyebrow}</p>
                <p className="font-semibold text-neutral-900">{p.title}</p>
                <p className="text-sm text-neutral-600">{p.description}</p>
              </div>
              {p.discount && (
                <span className="rounded-full bg-[#E11D2E]/10 px-3 py-1 text-xs font-bold text-[#E11D2E]">
                  {p.discount}
                </span>
              )}
              {!p.isActive && (
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
                  Inativa
                </span>
              )}
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
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(p.id)}
                className="rounded-lg border border-neutral-200 p-1.5 text-neutral-400 hover:bg-red-50 hover:text-[#E11D2E]"
                aria-label="Excluir"
              >
                <Trash2 className="size-4" />
              </button>
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
      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
    />
  );
}
