import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Heart, Plus, Star, Trash2, X } from "lucide-react";
import { ImageUploadField } from "@/components/admin/products/ImageUploadField";
import {
  deletePostFn,
  getAboutFn,
  listPostsFn,
  savePostFn,
  saveAboutFn,
} from "@/server/functions/posts.fn";
import {
  listReviewsForAdminFn,
  respondToReviewFn,
  setReviewHiddenFn,
} from "@/server/functions/reviews.fn";

export const Route = createFileRoute("/admin/avaliacoes/")({
  component: AvaliacoesPage,
});

type Tab = "sobre" | "blog" | "avaliacoes";

const TABS: { id: Tab; label: string }[] = [
  { id: "sobre", label: "Nosso restaurante" },
  { id: "blog", label: "Novidades" },
  { id: "avaliacoes", label: "Avaliações" },
];

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function AvaliacoesPage() {
  const [tab, setTab] = useState<Tab>("sobre");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-neutral-900">Avaliações</h1>
        <p className="mt-1 text-sm text-neutral-500">
          O texto da seção &ldquo;Nosso restaurante&rdquo;, suas novidades e o que os clientes
          escreveram.
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

      {tab === "sobre" && <AboutTab />}
      {tab === "blog" && <BlogTab />}
      {tab === "avaliacoes" && <ReviewsTab />}
    </div>
  );
}

/* ---------------------------------------------------------------- sobre --- */

function AboutTab() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["about"], queryFn: () => getAboutFn() });
  const [form, setForm] = useState({
    aboutEyebrow: "",
    aboutTitle: "",
    aboutBody: "",
    aboutImageUrl: null as string | null,
  });
  const [saved, setSaved] = useState(false);

  // The query answers after the first render, so the form fills in from an
  // effect rather than from an initial value that would always be empty.
  useEffect(() => {
    if (!data) return;
    setForm({
      aboutEyebrow: data.aboutEyebrow ?? "",
      aboutTitle: data.aboutTitle ?? "",
      aboutBody: data.aboutBody ?? "",
      aboutImageUrl: data.aboutImageUrl,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveAboutFn({
        data: {
          aboutEyebrow: form.aboutEyebrow,
          aboutTitle: form.aboutTitle,
          aboutBody: form.aboutBody,
          aboutImageUrl: form.aboutImageUrl,
        },
      }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["about"] });
      window.setTimeout(() => setSaved(false), 2500);
    },
  });

  if (isPending) return <p className="text-sm text-neutral-500">Carregando...</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5"
    >
      <p className="text-sm text-neutral-500">
        Deixe qualquer campo vazio para usar o texto padrão do seu ramo.
      </p>

      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <ImageUploadField
          kind="product"
          label="Foto do restaurante"
          value={form.aboutImageUrl}
          onChange={(url) => setForm({ ...form, aboutImageUrl: url })}
        />
        <div className="space-y-4">
          <Field label="Chamada" hint="Linha pequena acima do título.">
            <Input
              value={form.aboutEyebrow}
              onChange={(v) => setForm({ ...form, aboutEyebrow: v })}
              placeholder="Nosso restaurante"
            />
          </Field>
          <Field label="Título">
            <Input
              value={form.aboutTitle}
              onChange={(v) => setForm({ ...form, aboutTitle: v })}
              placeholder="Feito com paixão, servido com carinho."
            />
          </Field>
        </div>
      </div>

      <Field label="Texto" hint="Conte a história da sua loja em um parágrafo.">
        <textarea
          value={form.aboutBody}
          onChange={(e) => setForm({ ...form, aboutBody: e.target.value })}
          rows={5}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-xl bg-[#E11D2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c4172a] disabled:opacity-60"
        >
          {save.isPending ? "Salvando..." : "Salvar"}
        </button>
        {saved && <span className="text-sm text-green-600">Salvo.</span>}
      </div>
    </form>
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
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending } = useQuery({ queryKey: ["posts"], queryFn: () => listPostsFn() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["posts"] });

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
        <p className="text-sm text-neutral-500">
          Cada publicação aparece na seção &ldquo;Novidades&rdquo; do seu cardápio.
        </p>
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
          className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5"
        >
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <ImageUploadField
              kind="product"
              label="Foto da publicação"
              value={draft.imageUrl}
              onChange={(url) => setDraft({ ...draft, imageUrl: url })}
            />
            <div className="space-y-4">
              <Field label="Título">
                <Input
                  value={draft.title}
                  onChange={(v) => setDraft({ ...draft, title: v })}
                  required
                />
              </Field>
              <Field label="Data">
                <input
                  type="date"
                  value={draft.publishedAt}
                  onChange={(e) => setDraft({ ...draft, publishedAt: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                />
              </Field>
            </div>
          </div>

          <Field label="Texto">
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              required
              rows={6}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            />
          </Field>

          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={draft.isPublished}
              onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })}
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
          Nenhuma publicação ainda. Sem elas, a seção &ldquo;Novidades&rdquo; não aparece no
          cardápio.
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
                  {dateFormat.format(new Date(p.publishedAt))}
                </p>
                <p className="font-semibold text-neutral-900">{p.title}</p>
                <p className="line-clamp-2 text-sm text-neutral-600">{p.body}</p>
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
                    publishedAt: new Date(p.publishedAt).toISOString().slice(0, 10),
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

/* ----------------------------------------------------------- avaliações --- */

function ReviewsTab() {
  const queryClient = useQueryClient();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: () => listReviewsForAdminFn(),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });

  const respond = useMutation({
    mutationFn: (v: { id: string; response: string }) => respondToReviewFn({ data: v }),
    onSuccess: () => {
      invalidate();
      setReplyTo(null);
      setReplyText("");
    },
  });

  const setHidden = useMutation({
    mutationFn: (v: { id: string; isHidden: boolean }) => setReviewHiddenFn({ data: v }),
    onSuccess: invalidate,
  });

  if (isPending) return <p className="text-sm text-neutral-500">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        O que o cliente escreveu não pode ser alterado — nem por você, nem por nós. Você pode
        responder publicamente ou ocultar uma avaliação abusiva.
      </div>

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
              {data.summary.total} {data.summary.total === 1 ? "avaliação" : "avaliações"}
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
          <div key={r.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-neutral-900">{r.customerNameSnapshot}</p>
                <p className="text-xs text-neutral-500">
                  {dateFormat.format(new Date(r.createdAt))}
                </p>
              </div>
              <div className="flex items-center gap-3">
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
                        (i <= r.rating ? "fill-amber-400 text-amber-400" : "text-neutral-300")
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
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
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
                  onClick={() => setHidden.mutate({ id: r.id, isHidden: !r.isHidden })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                >
                  {r.isHidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
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
      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
    />
  );
}
