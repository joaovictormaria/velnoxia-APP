import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { useStore } from "./store-provider";
export const HERO_BOUNDARY_ID = "pizzaria2-hero-boundary";
const HEADER_HEIGHT = 67;

/**
 * True while the fixed header sits over the Home hero's red gradient (so its
 * text should render light). Watches a boundary marker dropped at the seam
 * between the gradient row and the cream content below — other routes have
 * no marker, so they fall through to dark text immediately.
 */
export function useHeaderOverHero(): boolean {
  const pathname = useLocation({ select: (location) => location.pathname });
  // The resolved path, not the route pattern: the browser is at /padaria-x9k2,
  // never at the literal "/$storeSlug". Comparing against the pattern was always
  // false, so the header believed it had left the hero from the first paint and
  // painted its links dark over the brand color.
  const { slug: storeSlug } = useStore();
  const home = `/${storeSlug}`;
  const isHome = pathname === home || pathname === `${home}/`;
  const [overHero, setOverHero] = useState(isHome);

  useEffect(() => {
    if (!isHome) {
      setOverHero(false);
      return;
    }
    setOverHero(true);

    const boundary = document.getElementById(HERO_BOUNDARY_ID);
    if (!boundary) return;

    const observer = new IntersectionObserver(
      ([entry]) => setOverHero(entry.isIntersecting),
      { rootMargin: `-${HEADER_HEIGHT}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(boundary);
    return () => observer.disconnect();
  }, [isHome]);

  return overHero;
}
