import { useNavigate, useLocation } from "@tanstack/react-router";
import type { MouseEvent } from "react";

const HOME_PATH = "/pizzaria-2";
const CARDAPIO_SECTION_ID = "cardapio";

function scrollToCardapio() {
  const scroll = () =>
    document.getElementById(CARDAPIO_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
export function useGoToCardapio() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const isHome = pathname === HOME_PATH || pathname === `${HOME_PATH}/`;

  return function goToCardapio(e?: Pick<MouseEvent, "preventDefault">) {
    e?.preventDefault?.();
    if (isHome) {
      scrollToCardapio();
      return;
    }
    navigate({ to: HOME_PATH }).then(() => {
      // Wait for the Home route to mount and paint before measuring its layout.
      requestAnimationFrame(() => requestAnimationFrame(scrollToCardapio));
    });
  };
}
