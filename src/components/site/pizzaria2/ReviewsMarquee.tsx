import { useReviews } from "@/lib/pizzaria2/reviews-provider";
import { ReviewCard } from "./ReviewCard";
import { Marquee } from "./Marquee";

export function ReviewsMarquee() {
  const { reviews, like, visitorId } = useReviews();
  // The newest one lives in the column above; this strip carries the ones it
  // pushed out, so it only exists from the second review on.
  const older = reviews.slice(1);
  if (older.length === 0) return null;

  return (
    <Marquee
      items={older}
      keyOf={(r) => r.id}
      label="Avaliações dos clientes"
      className="pb-16 sm:pb-24"
      itemClassName="w-75 sm:w-85"
      renderItem={(review) => (
        <ReviewCard
          review={review}
          onLike={() => like(review.id)}
          canLike={!!visitorId}
        />
      )}
    />
  );
}
