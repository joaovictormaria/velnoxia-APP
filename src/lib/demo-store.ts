/**
 * Store opened by the landing's "ver demonstração" flow. It is a real tenant
 * like any other — named here only because the landing has no store context of
 * its own.
 *
 * Configurable so swapping the showcase store never needs a code change: set
 * VITE_DEMO_STORE_SLUG in the environment. The fallback is a store that exists
 * today, so a missing variable degrades to a working link rather than a 404.
 */
export const DEMO_STORE_SLUG =
  import.meta.env.VITE_DEMO_STORE_SLUG ?? "desenvolvedor-38fm";
