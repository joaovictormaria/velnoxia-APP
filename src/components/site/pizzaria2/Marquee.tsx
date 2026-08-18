import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Seconds each card takes to cross, so more cards means a longer loop rather
 *  than a faster one. */
const SECONDS_PER_CARD = 7;

/** Few cards would leave gaps on a wide screen, so the list repeats until it is
 *  at least this long before the loop is built. */
const MIN_TRACK_CARDS = 6;

const PAUSE_MS = 3000;

/**
 * A strip that moves on its own. Shared by the reviews and the blog so the two
 * behave identically — touching a card stops it for three seconds and it starts
 * again by itself.
 */
export function Marquee<T>({
  items,
  keyOf,
  renderItem,
  itemClassName,
  className,
  label,
}: {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  itemClassName?: string;
  className?: string;
  label: string;
}) {
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

  const base = [...items];
  while (base.length < MIN_TRACK_CARDS) base.push(...items);

  // Two copies of the base back to back: the animation travels exactly one
  // copy's width and starts over, so the seam never shows.
  const track = [...base, ...base];

  return (
    <div
      aria-label={label}
      className={cn("overflow-hidden", className)}
      onPointerDown={pauseBriefly}
    >
      <div
        className="animate-reviews-marquee flex w-max gap-4"
        style={{
          ["--marquee-duration" as string]: `${base.length * SECONDS_PER_CARD}s`,
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        {track.map((item, i) => (
          <div
            key={`${keyOf(item)}-${i}`}
            className={cn("shrink-0", itemClassName)}
          >
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
