import { useNavigate, useLocation } from "@tanstack/react-router";
import { useStore } from "./store-provider";
import type { MouseEvent } from "react";

const HOME_PATH = "/$storeSlug";
const CARDAPIO_SECTION_ID = "cardapio";

function scrollToSection(id: string) {
  const scroll = () =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  scroll();
  // The hero's photo carousel and other images are often still loading right
  // after navigating Home, which shifts everything below the fold — nudge
  // the scroll back at the section a few more times so it settles there
  // instead of drifting back toward the top once those images land.
  [150, 400, 800].forEach((delay) => setTimeout(scroll, delay));
}

/**
 * The cardápio lives entirely on the Home page (section #cardapio), not on its
 * own route. Every "Cardápio" trigger — header nav, hero CTA, cart's "continuar
 * comprando" — needs the same behavior: scroll there directly if already on
 * Home, or navigate Home first and scroll once it has mounted.
 */
export function useGoToSection() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { slug: storeSlug } = useStore();
  const home = `/${storeSlug}`;
  const isHome = pathname === home || pathname === `${home}/`;

  return function goToSection(
    id: string,
    e?: Pick<MouseEvent, "preventDefault">,
  ) {
    e?.preventDefault?.();
    if (isHome) {
      scrollToSection(id);
      return;
    }
    navigate({ to: HOME_PATH, params: { storeSlug } }).then(() => {
      // Wait for the Home route to mount and paint before measuring its layout.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => scrollToSection(id)),
      );
    });
  };
}

/** Every section link behaves the same way; the cardápio is just the one with
 *  enough callers to deserve its own name. */
export function useGoToCardapio() {
  const goToSection = useGoToSection();
  return (e?: Pick<MouseEvent, "preventDefault">) =>
    goToSection(CARDAPIO_SECTION_ID, e);
}
