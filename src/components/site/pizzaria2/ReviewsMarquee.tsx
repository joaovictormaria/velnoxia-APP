import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/site/Reveal";
import { useReviews } from "@/lib/pizzaria2/reviews-provider";
import { ReviewCard } from "./ReviewCard";

/** Seconds each card takes to cross, so more reviews means a longer loop rather
 *  than a faster one. */
const SECONDS_PER_CARD = 7;

/** Few older reviews would leave gaps on a wide screen, so the list repeats
 *  until it is at least this long before the loop is built. */
const MIN_TRACK_CARDS = 6;

const PAUSE_MS = 3000;

export function ReviewsMarquee() {
  const { reviews } = useReviews();
  // The newest one lives in the column above; this strip carries the ones it
  // pushed out, so it only exists from the second review on.
  const older = reviews.slice(1);
  if (older.length === 0) return null;
  return <Marquee older={older} />;
}

function Marquee({
  older,
}: {
  older: ReturnType<typeof useReviews>["reviews"];
}) {
  const { like, visitorId } = useReviews();
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

  const base = [...older];
  while (base.length < MIN_TRACK_CARDS) base.push(...older);

  // Two copies of the base back to back: the animation travels exactly one
  // copy's width and starts over, so the seam never shows.
  const track = [...base, ...base];

  return (
    <section
      aria-label="Avaliações dos clientes"
      className="overflow-hidden pb-16 sm:pb-24"
      onPointerDown={pauseBriefly}
    >
      <Reveal variant="up">
        <div
          className="animate-reviews-marquee flex w-max gap-4"
          style={{
            ["--marquee-duration" as string]: `${base.length * SECONDS_PER_CARD}s`,
            animationPlayState: paused ? "paused" : "running",
          }}
        >
          {track.map((review, i) => (
            <ReviewCard
              key={`${review.id}-${i}`}
              review={review}
              onLike={() => like(review.id)}
              canLike={!!visitorId}
              className="w-75 shrink-0 sm:w-85"
            />
          ))}
        </div>
      </Reveal>
    </section>
  );
}
