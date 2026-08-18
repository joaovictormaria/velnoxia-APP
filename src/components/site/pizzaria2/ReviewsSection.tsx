import { useEffect, useState } from "react";
import { Heart, Star } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { getVisitorId } from "@/lib/pizzaria2/visitor-id";
import { loadCustomerDetails } from "@/lib/pizzaria2/customer-details";
import { listReviewsFn, submitReviewFn, toggleReviewLikeFn } from "@/server/functions/reviews.fn";
import { cn } from "@/lib/utils";

type Review = Awaited<ReturnType<typeof listReviewsFn>>["reviews"][number];

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={value + " de 5 estrelas"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("h-4 w-4", i <= value ? "fill-tomato text-tomato" : "text-charcoal/20")}
        />
      ))}
    </span>
  );
}

export function ReviewsSection({ storeSlug }: { storeSlug: string }) {
  const [visitorId, setVisitorId] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState({ average: 0, total: 0 });
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // localStorage only exists after hydration, so the id and the remembered name
  // are read in an effect — reading them while rendering would break SSR.
  useEffect(() => {
    const id = getVisitorId();
    setVisitorId(id);
    setName(loadCustomerDetails(storeSlug)?.name ?? "");
    listReviewsFn({ data: { storeSlug, visitorId: id || null } })
      .then((r) => {
        setReviews(r.reviews);
        setSummary(r.summary);
      })
      .catch(() => undefined);
  }, [storeSlug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!visitorId) {
      setError("Ative o armazenamento do navegador para avaliar.");
      return;
    }
    if (rating === 0) {
      setError("Escolha de 1 a 5 estrelas.");
      return;
    }
    setBusy(true);
    try {
      const res = await submitReviewFn({ data: { storeSlug, visitorId, name, rating, comment } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent(true);
      setComment("");
      setRating(0);
      const fresh = await listReviewsFn({ data: { storeSlug, visitorId } });
      setReviews(fresh.reviews);
      setSummary(fresh.summary);
    } catch {
      setError("Não foi possível enviar sua avaliação. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  function flip(id: string) {
    setReviews((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, likedByMe: !r.likedByMe, likeCount: r.likeCount + (r.likedByMe ? -1 : 1) }
          : r,
      ),
    );
  }

  async function like(reviewId: string) {
    if (!visitorId) return;
    // Optimistic: the heart answers immediately and the server number replaces it
    // a moment later. Waiting on a round trip to fill a heart feels broken.
    flip(reviewId);
    try {
      const res = await toggleReviewLikeFn({ data: { storeSlug, reviewId, visitorId } });
      if (res.ok) {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === reviewId ? { ...r, likedByMe: res.likedByMe, likeCount: res.likeCount } : r,
          ),
        );
      } else {
        flip(reviewId);
      }
    } catch {
      flip(reviewId);
    }
  }

  return (
    <div id="avaliacoes" className="scroll-mt-24 border-t border-charcoal/8 pt-10 lg:border-t-0 lg:pt-0">
      <div>
        <Reveal variant="up">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-tomato">
                <span className="h-1.5 w-1.5 rounded-full bg-tomato" />
                Avaliações
              </span>
              <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-charcoal sm:text-4xl">
                O que estão achando
              </h2>
            </div>
            {summary.total > 0 && (
              <div className="flex items-center gap-3">
                <span className="font-display text-4xl font-extrabold text-charcoal">
                  {summary.average.toFixed(1)}
                </span>
                <div>
                  <Stars value={Math.round(summary.average)} />
                  <p className="mt-1 text-xs text-charcoal/55">
                    {summary.total} {summary.total === 1 ? "avaliação" : "avaliações"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Reveal>

        <div className="mt-6 space-y-5">
          <Reveal variant="left">
            <form
              onSubmit={submit}
              className="rounded-[24px] border border-charcoal/8 bg-white p-6 shadow-[0_20px_50px_-35px_rgba(23,23,23,0.35)]"
            >
              <p className="font-display text-lg font-bold text-charcoal">Deixe sua avaliação</p>
              <p className="mt-1 text-sm text-charcoal/55">Conte o que achou da loja e do site.</p>

              {sent ? (
                <p className="mt-6 rounded-xl bg-tomato/10 px-4 py-3 text-sm text-charcoal">
                  Obrigado! Sua avaliação já está no ar.
                </p>
              ) : (
                <>
                  <div className="mt-5 flex gap-1" onMouseLeave={() => setHover(0)}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={i + (i === 1 ? " estrela" : " estrelas")}
                        onClick={() => setRating(i)}
                        onMouseEnter={() => setHover(i)}
                        className="p-0.5 transition-transform hover:scale-110"
                      >
                        <Star
                          className={cn(
                            "h-7 w-7",
                            i <= (hover || rating) ? "fill-tomato text-tomato" : "text-charcoal/25",
                          )}
                        />
                      </button>
                    ))}
                  </div>

                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    required
                    maxLength={60}
                    className="mt-4 w-full rounded-xl border border-charcoal/12 bg-white px-4 py-2.5 text-sm text-charcoal outline-none focus:border-tomato"
                  />
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="O que você achou?"
                    required
                    rows={4}
                    maxLength={1000}
                    className="mt-3 w-full resize-none rounded-xl border border-charcoal/12 bg-white px-4 py-3 text-sm text-charcoal outline-none focus:border-tomato"
                  />

                  {error && <p className="mt-3 text-sm text-tomato">{error}</p>}

                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-4 w-full rounded-full bg-tomato px-6 py-3 text-sm font-semibold text-[color:var(--on-primary)] transition-transform hover:scale-[1.02] disabled:opacity-60"
                  >
                    {busy ? "Enviando..." : "Enviar avaliação"}
                  </button>
                </>
              )}
            </form>
          </Reveal>

          <div className="space-y-4">
            {reviews.length === 0 ? (
              <p className="rounded-[24px] border border-dashed border-charcoal/15 p-10 text-center text-sm text-charcoal/50">
                Ninguém avaliou ainda. Seja a primeira pessoa!
              </p>
            ) : (
              reviews.map((r, i) => (
                <Reveal key={r.id} variant="up" delay={Math.min(i * 40, 240)}>
                  <article className="rounded-[24px] border border-charcoal/8 bg-white p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-display text-sm font-bold text-charcoal">
                          {r.customerNameSnapshot}
                        </p>
                        <p className="text-xs text-charcoal/45">
                          {dateFormat.format(new Date(r.createdAt))}
                        </p>
                      </div>
                      <Stars value={r.rating} />
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-charcoal/70">{r.comment}</p>

                    {r.response && (
                      <div className="mt-4 rounded-xl border-l-2 border-tomato bg-charcoal/[0.03] px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-tomato">
                          Resposta da loja
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-charcoal/70">{r.response}</p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => like(r.id)}
                      disabled={!visitorId}
                      aria-pressed={r.likedByMe}
                      className={cn(
                        "mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        r.likedByMe
                          ? "border-tomato/30 bg-tomato/10 text-tomato"
                          : "border-charcoal/12 text-charcoal/55 hover:border-tomato/30 hover:text-tomato",
                      )}
                    >
                      <Heart className={cn("h-3.5 w-3.5", r.likedByMe && "fill-tomato")} />
                      {r.likeCount > 0 ? r.likeCount : "Curtir"}
                    </button>
                  </article>
                </Reveal>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
