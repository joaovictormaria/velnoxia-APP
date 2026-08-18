import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/site/Reveal";
import { useReviews } from "@/lib/pizzaria2/reviews-provider";
import { ReviewCard } from "./ReviewCard";

/** Below this the column above already shows everything; a strip of three cards
 *  sliding past would only repeat it. */
const MIN_REVIEWS = 5;

/** Seconds each card takes to cross, so more reviews means a longer loop rather
 *  than a faster one. */
const SECONDS_PER_CARD = 7;

const PAUSE_MS = 3000;

export function ReviewsMarquee() {
  const { reviews } = useReviews();
  if (reviews.length < MIN_REVIEWS) return null;
  return <Marquee />;
}

function Marquee() {
  const { reviews, like, visitorId } = useReviews();
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  /**
   * Touching a card stops the strip so it can be read — and so the tap that
   * follows lands on a button that is standing still. It restarts on its own
   * after three seconds; each new touch restarts the count rather than adding
   * to it.
   */
  function pauseBriefly() {
    setPaused(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPaused(false), PAUSE_MS);
  }

  // Two copies back to back: the animation travels exactly one copy's width and
  // starts over, so the seam never shows.
  const track = [...reviews, ...reviews];

  return (
    <section
      aria-label="Avaliações dos clientes"
      className="overflow-hidden pb-16 sm:pb-24"
      onPointerDown={pauseBriefly}
    >
      <Reveal variant="up">
        <div
          className="flex w-max gap-4 animate-reviews-marquee"
          style={{
            ["--marquee-duration" as string]: `${reviews.length * SECONDS_PER_CARD}s`,
            animationPlayState: paused ? "paused" : "running",
          }}
        >
          {track.map((review, i) => (
            <ReviewCard
              key={`${review.id}-${i}`}
              review={review}
              onLike={() => like(review.id)}
              canLike={!!visitorId}
              className="w-[300px] shrink-0 sm:w-[340px]"
            />
          ))}
        </div>
      </Reveal>
    </section>
  );
}
