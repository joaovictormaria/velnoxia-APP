import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { rotaPremium } from "@/components/admin/planos/rota-premium";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Eye, EyeOff, Heart, Plus, Star, Trash2, X } from "lucide-react";
import { ImageUploadField } from "@/components/admin/products/ImageUploadField";
import { deletePostFn, listPostsFn, savePostFn } from "@/server/functions/posts.fn";
import {
  listReviewsForAdminFn,
  respondToReviewFn,
  setReviewHiddenFn,
} from "@/server/functions/reviews.fn";
import { PreviaDaVitrine } from "@/components/admin/preview/PreviaDaVitrine";
import { aplicarRascunhoDePublicacao } from "@/lib/previa/aplicar-rascunho";
import { PublicacoesDaPrevia } from "@/components/admin/preview/PublicacoesDaPrevia";
import { RespostaDaPrevia } from "@/components/admin/preview/RespostaDaPrevia";

/*
  MÓDULO PAGO — MARKETING.

  A GESTÃO de avaliações e do blog — responder, ocultar, publicar.
  Enviar e ler avaliação continua público e BASIC: o que é pago é administrá-las.
*/
export const Route = createFileRoute("/admin/avaliacoes/")(
  rotaPremium("MARKETING", AvaliacoesPage),
);

/*
  "NOSSO RESTAURANTE" SAIU DAQUI — foi para Configurações.

  Ele edita `StoreSettings.about*`, que é apresentação da loja e não
  campanha: com esta tela virando paga, a loja BASIC ficaria sem como
  escrever a própria história. A tela é a mesma, e as server functions
  também — só o endereço mudou.
*/
type Tab = "blog" | "avaliacoes";

const TABS: { id: Tab; label: string }[] = [
  { id: "blog", label: "Novidades" },
  { id: "avaliacoes", label: "Avaliações" },
];

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function AvaliacoesPage() {
  const [tab, setTab] = useState<Tab>("blog");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-neutral-900">Avaliações</h1>
        <p className="mt-1 text-sm text-neutral-500">
          O texto da seção &ldquo;Nosso restaurante&rdquo;, suas novidades e o
          que os clientes escreveram.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 rounded-xl bg-neutral-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors " +
              (tab === t.id
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "blog" && <BlogTab />}
      {tab === "avaliacoes" && <ReviewsTab />}
    </div>
  );
}

/* ----------------------------------------------------------------- blog --- */

type PostDraft = {
  id: string | null;
  title: string;
  body: string;
  imageUrl: string | null;
  isPublished: boolean;
  publishedAt: string;
};

const today = () => new Date().toISOString().slice(0, 10);

/** How long this publication still has. Reads from createdAt because that is
 *  what the two-day life is counted from, not the date typed in the form. */
function timeLeft(createdAt: string | Date) {
  const endsAt = new Date(createdAt).getTime() + 2 * 24 * 60 * 60 * 1000;
  const hours = Math.floor((endsAt - Date.now()) / (60 * 60 * 1000));
  if (hours <= 0) return "expira em instantes";
  if (hours < 24) return `expira em ${hours}h`;
  return `expira em ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

const EMPTY_POST: PostDraft = {
  id: null,
  title: "",
  body: "",
  imageUrl: null,
  isPublished: true,
  publishedAt: today(),
};

function BlogTab() {
  const queryClient = useQueryClient();
  const { admin } = useRouteContext({ from: "/admin" });
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["posts"],
    queryFn: () => listPostsFn(),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["posts"] });

  const save = useMutation({
    mutationFn: (d: PostDraft) =>
      savePostFn({
        data: {
          id: d.id,
          data: {
            title: d.title,
            body: d.body,
            imageUrl: d.imageUrl,
            isPublished: d.isPublished,
            publishedAt: d.publishedAt || null,
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
    mutationFn: (id: string) => deletePostFn({ data: { id } }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <p className="text-sm text-neutral-700">
            Poste momentos de clientes e alegrias do estabelecimento — a chapa
            cheia, o bolo de aniversário na mesa, o time novo, a fila na porta.
          </p>
          <p className="text-sm text-neutral-500">
            Aparecem na seção &ldquo;Novidades&rdquo; do seu cardápio e somem
            sozinhas depois de 2 dias.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setDraft({ ...EMPTY_POST, publishedAt: today() });
          }}
          className="flex items-center gap-2 rounded-xl bg-[#E11D2E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a]"
        >
          <Plus className="size-4" />
          Nova publicação
        </button>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#E11D2E]">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fechar"
          >
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
          {/* Topo à direita, como nas outras telas. A seção "Novidades" some
              quando não há publicação nenhuma, e a em edição já entra na lista:
              quem escreve a primeira precisa vê-la nascer. */}
          {admin && (
            <div className="hidden lg:col-span-2 lg:col-start-4 lg:row-span-3 lg:row-start-1 lg:block">
              <PreviaDaVitrine
                storeSlug={admin.store.slug}
                foco={foco}
                largura={900}
                aplicar={(payload) => aplicarRascunhoDePublicacao(payload, draft)}
              >
                <PublicacoesDaPrevia />
              </PreviaDaVitrine>
            </div>
          )}

          <div
            className="grid gap-4 sm:grid-cols-[200px_1fr] lg:col-span-3"
            onFocusCapture={() => setFoco("foto-da-publicacao")}
          >
            <div onFocusCapture={() => setFoco("foto-da-publicacao")}>
              <ImageUploadField
                kind="product"
                label="Foto da publicação"
                value={draft.imageUrl}
                onChange={(url) => setDraft({ ...draft, imageUrl: url })}
              />
            </div>
            <div className="space-y-4">
              <Field label="Título">
                <Input
                  onFocus={() => setFoco("titulo-da-publicacao")}
                  value={draft.title}
                  onChange={(v) => setDraft({ ...draft, title: v })}
                  required
                />
              </Field>
              <Field label="Data">
                <input
                  type="date"
                  onFocus={() => setFoco("data-da-publicacao")}
                  value={draft.publishedAt}
                  onChange={(e) =>
                    setDraft({ ...draft, publishedAt: e.target.value })
                  }
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900"
                />
              </Field>
            </div>
          </div>

          <div className="lg:col-span-3">
          <Field label="Texto">
            <textarea
              onFocus={() => setFoco("texto-da-publicacao")}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              required
              rows={6}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900"
            />
          </Field>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 lg:col-span-3">
            <input
              type="checkbox"
              checked={draft.isPublished}
              onChange={(e) =>
                setDraft({ ...draft, isPublished: e.target.checked })
              }
              className="size-4 accent-[#E11D2E]"
            />
            <span className="text-sm text-neutral-700">Publicada no site</span>
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
          Nenhuma publicação ainda. Sem elas, a seção &ldquo;Novidades&rdquo;
          não aparece no cardápio.
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-neutral-500">
                  {dateFormat.format(new Date(p.publishedAt))} ·{" "}
                  {timeLeft(p.createdAt)}
                </p>
                <p className="font-semibold text-neutral-900">{p.title}</p>
                <p className="line-clamp-2 text-sm text-neutral-600">
                  {p.body}
                </p>
              </div>
              {!p.isPublished && (
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
                  Rascunho
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    id: p.id,
                    title: p.title,
                    body: p.body,
                    imageUrl: p.imageUrl,
                    isPublished: p.isPublished,
                    publishedAt: new Date(p.publishedAt)
                      .toISOString()
                      .slice(0, 10),
                  })
                }
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(p.id)}
                className="rounded-lg border border-neutral-200 flex min-h-11 min-w-11 items-center justify-center text-neutral-400 hover:bg-red-50 hover:text-[#E11D2E]"
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

/* ----------------------------------------------------------- avaliações --- */

function ReviewsTab() {
  const { admin } = useRouteContext({ from: "/admin" });
  const queryClient = useQueryClient();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: () => listReviewsForAdminFn(),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });

  const respond = useMutation({
    mutationFn: (v: { id: string; response: string }) =>
      respondToReviewFn({ data: v }),
    onSuccess: () => {
      invalidate();
      setReplyTo(null);
      setReplyText("");
    },
  });

  /** A avaliação que está sendo respondida, para a prévia mostrar qual é. */
  const respondendo = data?.reviews.find((r) => r.id === replyTo);

  const setHidden = useMutation({
    mutationFn: (v: { id: string; isHidden: boolean }) =>
      setReviewHiddenFn({ data: v }),
    onSuccess: invalidate,
  });

  if (isPending)
    return <p className="text-sm text-neutral-500">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        O que o cliente escreveu não pode ser alterado — nem por você, nem por
        nós. Você pode responder publicamente ou ocultar uma avaliação abusiva.
      </div>

      {/* Só enquanto se responde. A resposta sai pública, embaixo da crítica,
          para qualquer um que abra a loja — ver isso enquanto se escreve muda
          o tom do que se escreve. Fora disso não há o que prever: o texto da
          avaliação é do cliente, e esta tela não o edita. */}
      {admin && replyTo && respondendo && (
        <PreviaDaVitrine storeSlug={admin.store.slug} foco="resposta-da-loja" largura={760}>
          <RespostaDaPrevia avaliacao={respondendo} resposta={replyText} />
        </PreviaDaVitrine>
      )}

      {data && data.summary.total > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-5 py-4">
          <span className="text-3xl font-bold text-neutral-900">
            {data.summary.average.toFixed(1)}
          </span>
          <div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className={
                    "size-4 " +
                    (i <= Math.round(data.summary.average)
                      ? "fill-amber-400 text-amber-400"
                      : "text-neutral-300")
                  }
                />
              ))}
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              {data.summary.total}{" "}
              {data.summary.total === 1 ? "avaliação" : "avaliações"}
            </p>
          </div>
        </div>
      )}

      {!data?.reviews.length ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Nenhuma avaliação ainda.
        </p>
      ) : (
        data.reviews.map((r) => (
          <div
            key={r.id}
            className="rounded-2xl border border-neutral-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-neutral-900">
                  {r.customerNameSnapshot}
                </p>
                <p className="text-xs text-neutral-500">
                  {dateFormat.format(new Date(r.createdAt))}
                </p>
              </div>
              <div className="flex items-center gap-3 lg:col-span-3">
                <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                  <Heart className="size-3.5" />
                  {r._count.likes}
                </span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={
                        "size-4 " +
                        (i <= r.rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-neutral-300")
                      }
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Rendered as text, never as an input: there is no way to edit it here. */}
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-700">
              {r.comment}
            </p>

            {r.response && (
              <div className="mt-4 rounded-xl border-l-2 border-[#E11D2E] bg-neutral-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#E11D2E]">
                  Sua resposta
                </p>
                <p className="mt-1 text-sm text-neutral-700">{r.response}</p>
              </div>
            )}

            {replyTo === r.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  respond.mutate({ id: r.id, response: replyText });
                }}
                className="mt-4 space-y-2"
              >
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  required
                  rows={3}
                  placeholder="Responda ao cliente..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base md:text-sm text-neutral-900"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={respond.isPending}
                    className="rounded-lg bg-[#E11D2E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
                  >
                    Publicar resposta
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(r.id);
                    setReplyText(r.response ?? "");
                  }}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                >
                  {r.response ? "Editar resposta" : "Responder"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setHidden.mutate({ id: r.id, isHidden: !r.isHidden })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                >
                  {r.isHidden ? (
                    <Eye className="size-3.5" />
                  ) : (
                    <EyeOff className="size-3.5" />
                  )}
                  {r.isHidden ? "Mostrar no site" : "Ocultar do site"}
                </button>
                {r.isHidden && (
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
                    Oculta
                  </span>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/* --------------------------------------------------------------- campos --- */

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
