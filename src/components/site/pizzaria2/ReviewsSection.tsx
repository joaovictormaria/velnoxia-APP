import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { loadCustomerDetails } from "@/lib/pizzaria2/customer-details";
import { useReviews } from "@/lib/pizzaria2/reviews-provider";
import { ReviewCard, Stars } from "./ReviewCard";
import { cn } from "@/lib/utils";

/** Only the newest review stays here. When someone writes a new one, the one
 *  that was here moves down to the strip and the new name takes the spot. */
const LIST_LIMIT = 1;

export function ReviewsSection({ storeSlug }: { storeSlug: string }) {
  const { reviews, summary, like, submit, visitorId } = useReviews();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // The remembered name lives in localStorage, which only exists after
  // hydration — reading it while rendering would break the server render.
  useEffect(() => {
    setName(loadCustomerDetails(storeSlug)?.name ?? "");
  }, [storeSlug]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating === 0) {
      setError("Escolha de 1 a 5 estrelas.");
      return;
    }
    setBusy(true);
    const problem = await submit({ name, rating, comment });
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setSent(true);
    setComment("");
    setRating(0);
  }

  return (
    <div
      id="avaliacoes"
      className="scroll-mt-24 border-t border-charcoal/8 pt-10 lg:border-t-0 lg:pt-0"
    >
      <Reveal variant="up">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-tomato">
              <span className="h-1.5 w-1.5 rounded-full bg-tomato" />
              Avaliações
            </span>
            <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-charcoal sm:text-4xl">
              Nos diga como foi sua experiência no atendimento!
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
                  {summary.total}{" "}
                  {summary.total === 1 ? "avaliação" : "avaliações"}
                </p>
              </div>
            </div>
          )}
        </div>
      </Reveal>

      <div className="mt-6 space-y-3">
        <Reveal variant="left">
          <form
            onSubmit={onSubmit}
            className="rounded-[24px] border border-charcoal/8 bg-white p-5 shadow-[0_20px_50px_-35px_rgba(23,23,23,0.35)]"
          >
            <p className="font-display text-base font-bold text-charcoal">
              Deixe sua avaliação
            </p>
            <p className="mt-1 text-sm text-charcoal/55">
              Conte o que achou da loja e do site.
            </p>

            {sent ? (
              <p className="mt-6 rounded-xl bg-tomato/10 px-4 py-3 text-sm text-charcoal">
                Obrigado! Sua avaliação já está no ar.
              </p>
            ) : (
              <>
                <div
                  className="mt-4 flex gap-1"
                  onMouseLeave={() => setHover(0)}
                >
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
                          "h-6 w-6",
                          i <= (hover || rating)
                            ? "fill-tomato text-tomato"
                            : "text-charcoal/25",
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
                  className="mt-4 w-full rounded-xl border border-charcoal/12 bg-white px-4 py-2.5 text-base md:text-sm text-charcoal outline-none focus:border-tomato"
                />
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="O que você achou?"
                  required
                  rows={3}
                  maxLength={1000}
                  className="mt-3 w-full resize-none rounded-xl border border-charcoal/12 bg-white px-4 py-3 text-base md:text-sm text-charcoal outline-none focus:border-tomato"
                />

                {error && <p className="mt-3 text-sm text-tomato">{error}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-4 w-full rounded-full bg-tomato px-6 py-2.5 text-sm font-semibold text-[color:var(--on-primary)] transition-transform hover:scale-[1.02] disabled:opacity-60"
                >
                  {busy ? "Enviando..." : "Enviar avaliação"}
                </button>
              </>
            )}
          </form>
        </Reveal>

        {reviews.length === 0 ? (
          <p className="rounded-[24px] border border-dashed border-charcoal/15 p-10 text-center text-sm text-charcoal/50">
            Ninguém avaliou ainda. Seja a primeira pessoa!
          </p>
        ) : (
          reviews.slice(0, LIST_LIMIT).map((review) => (
            <Reveal key={review.id} variant="up">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-charcoal/40">
                Feedback mais recente
              </p>
              <ReviewCard
                review={review}
                onLike={() => like(review.id)}
                canLike={!!visitorId}
              />
            </Reveal>
          ))
        )}
      </div>
    </div>
  );
}
