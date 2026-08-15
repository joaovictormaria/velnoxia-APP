import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { ImageUploadField } from "./ImageUploadField";
import { saveProductFn } from "@/server/functions/products.fn";

const SIZES = [
  { key: "BROTINHO", label: "Brotinho" },
  { key: "MEDIA", label: "Média" },
  { key: "GRANDE", label: "Grande" },
  { key: "GIGANTE", label: "Gigante" },
] as const;

type SizeKey = (typeof SIZES)[number]["key"];

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
  sizes: { size: SizeKey; price: number; isAvailable: boolean }[];
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
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ProductFormValues>(initial);
  // Only auto-derive the slug for new products; editing keeps the public URL stable.
  const [slugTouched, setSlugTouched] = useState(productId !== null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function sizeFor(key: SizeKey) {
    return values.sizes.find((s) => s.size === key);
  }

  function toggleSize(key: SizeKey, enabled: boolean) {
    setValues((v) => ({
      ...v,
      sizes: enabled
        ? [...v.sizes, { size: key, price: v.basePrice, isAvailable: true }]
        : v.sizes.filter((s) => s.size !== key),
    }));
  }

  function setSizePrice(key: SizeKey, price: number) {
    setValues((v) => ({
      ...v,
      sizes: v.sizes.map((s) => (s.size === key ? { ...s, price } : s)),
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr_300px]">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <ImageUploadField
            kind="product"
            label="Foto do produto"
            value={values.imageUrl}
            onChange={(url) => set("imageUrl", url)}
          />
        </div>

        <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <Field label="Nome do produto">
            <input
              value={values.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (!slugTouched) set("slug", slugify(e.target.value));
              }}
              required
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
            />
          </Field>

          <Field label="Identificador na URL (slug)">
            <input
              value={values.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
              required
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoria">
              <select
                value={values.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                required
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900"
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
                value={values.basePrice}
                onChange={(e) => set("basePrice", Number(e.target.value))}
                required
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
              />
            </Field>
          </div>

          <Field label="Descrição">
            <textarea
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
            />
          </Field>

          <Field label="Selo (opcional)">
            <input
              value={values.tag ?? ""}
              onChange={(e) => set("tag", e.target.value || null)}
              placeholder="Ex: Mais pedida, Novidade"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-900">Tamanhos disponíveis</p>
            <div className="space-y-2">
              {SIZES.map(({ key, label }) => {
                const size = sizeFor(key);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <label className="flex flex-1 items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        checked={Boolean(size)}
                        onChange={(e) => toggleSize(key, e.target.checked)}
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
                      onChange={(e) => setSizePrice(key, Number(e.target.value))}
                      placeholder="—"
                      className="w-28 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400"
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Sem tamanhos marcados, o produto é vendido pelo preço base (bebidas, porções).
            </p>
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm font-semibold text-neutral-900">Opções</p>

          <Toggle
            label="Produto disponível"
            checked={values.isActive}
            onChange={(v) => set("isActive", v)}
          />

          <Toggle
            label="Permitir meia-pizza (2 sabores)"
            checked={values.allowHalfAndHalf}
            onChange={(v) => set("allowHalfAndHalf", v)}
          />

          <Field label="Regra de preço meia-pizza">
            <select
              value={values.halfPizzaPricingRule}
              disabled={!values.allowHalfAndHalf}
              onChange={(e) =>
                set("halfPizzaPricingRule", e.target.value as ProductFormValues["halfPizzaPricingRule"])
              }
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400"
            >
              <option value="HIGHEST_PRICE">Maior preço entre os sabores</option>
              <option value="AVERAGE_PRICE">Média entre os sabores</option>
            </select>
          </Field>

          <p className="text-xs text-neutral-500">
            O preço da meia-pizza será baseado no sabor mais caro selecionado.
          </p>

          <Field label="Ordem de exibição">
            <input
              type="number"
              value={values.sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
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
