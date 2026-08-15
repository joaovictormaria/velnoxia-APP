import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";

const HOME_PATH = "/pizzaria-2";
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
  const isHome = pathname === HOME_PATH || pathname === `${HOME_PATH}/`;
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
