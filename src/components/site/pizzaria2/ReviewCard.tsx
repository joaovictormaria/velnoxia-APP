import { Heart, Star } from "lucide-react";
import type { Review } from "@/lib/pizzaria2/reviews-provider";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function Stars({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex gap-0.5", className)}
      aria-label={value + " de 5 estrelas"}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i <= value ? "fill-tomato text-tomato" : "text-charcoal/20",
          )}
        />
      ))}
    </span>
  );
}

export function ReviewCard({
  review,
  onLike,
  canLike,
  className,
}: {
  review: Review;
  onLike: () => void;
  canLike: boolean;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-[20px] border border-charcoal/8 bg-white p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-sm font-bold text-charcoal">
            {review.customerNameSnapshot}
          </p>
          <p className="text-xs text-charcoal/45">
            {dateFormat.format(new Date(review.createdAt))}
          </p>
        </div>
        <Stars value={review.rating} />
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-charcoal/70">
        {review.comment}
      </p>

      {review.response && (
        <div
          data-previa="resposta-da-loja"
          className="mt-3 rounded-lg border-l-2 border-tomato bg-charcoal/[0.03] px-3 py-2.5"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-tomato">
            Resposta da loja
          </p>
          <p className="mt-1 text-sm leading-relaxed text-charcoal/70">
            {review.response}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onLike}
        disabled={!canLike}
        aria-pressed={review.likedByMe}
        className={cn(
          "mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          review.likedByMe
            ? "border-tomato/30 bg-tomato/10 text-tomato"
            : "border-charcoal/12 text-charcoal/55 hover:border-tomato/30 hover:text-tomato",
        )}
      >
        <Heart
          className={cn("h-3.5 w-3.5", review.likedByMe && "fill-tomato")}
        />
        {review.likeCount > 0 ? review.likeCount : "Curtir"}
      </button>
    </article>
  );
}
