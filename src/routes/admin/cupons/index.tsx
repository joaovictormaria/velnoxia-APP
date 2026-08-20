import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { deleteCouponFn, listCouponsFn, saveCouponFn } from "@/server/functions/coupons.fn";
import { PreviaDaVitrine } from "@/components/admin/preview/PreviaDaVitrine";
import { CupomDaPrevia } from "@/components/admin/preview/CupomDaPrevia";

export const Route = createFileRoute("/admin/cupons/")({
  component: CouponsPage,
});

type Draft = {
  id: string | null;
  code: string;
  description: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: string;
  minOrderValue: string;
  maxUsage: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => day(new Date(Date.now() + n * 86_400_000));

const EMPTY: Draft = {
  id: null,
  code: "",
  description: "",
  discountType: "PERCENTAGE",
  discountValue: "",
  minOrderValue: "",
  maxUsage: "",
  validFrom: day(new Date()),
  validUntil: inDays(30),
  isActive: true,
};

/** Empty means "no limit", which is different from zero. */
const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function CouponsPage() {
  const queryClient = useQueryClient();
  const { admin } = useRouteContext({ from: "/admin" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending } = useQuery({ queryKey: ["coupons"], queryFn: () => listCouponsFn() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["coupons"] });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      saveCouponFn({
        data: {
          id: d.id,
          data: {
            code: d.code,
            description: d.description,
            discountType: d.discountType,
            discountValue: Number(d.discountValue),
            minOrderValue: toNumber(d.minOrderValue),
            maxUsage: toNumber(d.maxUsage),
            validFrom: d.validFrom,
            validUntil: d.validUntil,
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
    mutationFn: (id: string) => deleteCouponFn({ data: { id } }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Descontos / Cupons</h1>
          <p className="mt-1 text-sm text-neutral-500">
            O cliente digita o código no carrinho e o desconto entra no total.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setDraft({ ...EMPTY, validFrom: day(new Date()), validUntil: inDays(30) });
          }}
          className="flex items-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a]"
        >
          <Plus className="size-4" />
          Novo cupom
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
          {/* Topo à direita, como nas outras telas. O cupom não aparece na
              loja: o cliente digita o código no fechamento do pedido. Então a
              prévia mostra o que ele vê ali, e quanto o desconto tira. */}
          {admin && (
            <div className="hidden lg:col-span-2 lg:col-start-4 lg:row-span-3 lg:row-start-1 lg:block">
              <PreviaDaVitrine storeSlug={admin.store.slug} foco={foco} largura={720}>
                <CupomDaPrevia cupom={draft} />
              </PreviaDaVitrine>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
            <Field label="Código" hint="Sem espaços nem acentos. Ex.: BEMVINDO10">
              <Input
                onFocus={() => setFoco("campo-do-cupom")}
                value={draft.code}
                onChange={(v) => setDraft({ ...draft, code: v.toUpperCase() })}
                required
                maxLength={24}
              />
            </Field>
            <Field label="Descrição" hint="Só para você se lembrar do que é.">
              <Input
                value={draft.description}
                onChange={(v) => setDraft({ ...draft, description: v })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
            <Field label="Tipo">
              <select
                value={draft.discountType}
                onChange={(e) =>
                  setDraft({ ...draft, discountType: e.target.value as Draft["discountType"] })
                }
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              >
                <option value="PERCENTAGE">Porcentagem (%)</option>
                <option value="FIXED_AMOUNT">Valor fixo (R$)</option>
              </select>
            </Field>
            <Field label={draft.discountType === "PERCENTAGE" ? "Desconto (%)" : "Desconto (R$)"}>
              <Input
                onFocus={() => setFoco("desconto-do-cupom")}
                value={draft.discountValue}
                onChange={(v) => setDraft({ ...draft, discountValue: v })}
                required
                type="number"
                step="0.01"
              />
            </Field>
            <Field label="Pedido mínimo (R$)" hint="Vazio = sem mínimo.">
              <Input
                onFocus={() => setFoco("desconto-do-cupom")}
                value={draft.minOrderValue}
                onChange={(v) => setDraft({ ...draft, minOrderValue: v })}
                type="number"
                step="0.01"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
            <Field label="Válido de">
              <input
                type="date"
                value={draft.validFrom}
                onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
            </Field>
            <Field label="Válido até" hint="Vale o dia inteiro.">
              <input
                type="date"
                value={draft.validUntil}
                onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
            </Field>
            <Field label="Limite de usos" hint="Vazio = ilimitado.">
              <Input
                value={draft.maxUsage}
                onChange={(v) => setDraft({ ...draft, maxUsage: v })}
                type="number"
              />
            </Field>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              className="size-4 accent-[#E11D2E]"
            />
            <span className="text-sm text-neutral-700">Aceitar este cupom</span>
          </label>

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
          Nenhum cupom criado. O campo no carrinho continua lá, só não aceita nada ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((c) => {
            const esgotado = c.maxUsage !== null && c.usageCount >= c.maxUsage;
            const vencido = new Date(c.validUntil) < new Date();
            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold text-neutral-900">{c.code}</p>
                  <p className="text-sm text-neutral-600">
                    {c.discountType === "PERCENTAGE"
                      ? `${c.discountValue}% de desconto`
                      : `${money(c.discountValue)} de desconto`}
                    {c.minOrderValue !== null && ` · a partir de ${money(c.minOrderValue)}`}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {dateFormat.format(new Date(c.validFrom))} até{" "}
                    {dateFormat.format(new Date(c.validUntil))} · usado {c.usageCount}
                    {c.maxUsage !== null ? ` de ${c.maxUsage}` : " vez(es)"}
                  </p>
                </div>

                {/* Three different reasons a coupon stops working; naming which
                    one saves the owner from guessing why it was refused. */}
                {!c.isActive && <Tag>Desativado</Tag>}
                {c.isActive && vencido && <Tag>Vencido</Tag>}
                {c.isActive && !vencido && esgotado && <Tag>Esgotado</Tag>}

                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      id: c.id,
                      code: c.code,
                      description: c.description ?? "",
                      discountType: c.discountType,
                      discountValue: String(c.discountValue),
                      minOrderValue: c.minOrderValue?.toString() ?? "",
                      maxUsage: c.maxUsage?.toString() ?? "",
                      validFrom: day(new Date(c.validFrom)),
                      validUntil: day(new Date(c.validUntil)),
                      isActive: c.isActive,
                    })
                  }
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate(c.id)}
                  className="rounded-lg border border-neutral-200 p-1.5 text-neutral-400 hover:bg-red-50 hover:text-[#E11D2E]"
                  aria-label="Excluir"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
      {children}
    </span>
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
