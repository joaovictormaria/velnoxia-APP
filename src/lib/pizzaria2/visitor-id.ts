const KEY = "velnox.visitor-id";

/**
 * A random id kept in localStorage. It identifies the browser, not the person:
 * enough to stop the same device liking twice or reviewing twice, and useless
 * for anything else. Clearing site data starts a new one, which is fine.
 */
export function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && existing.length >= 8) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private mode with storage disabled: no id, so likes and reviews are
    // simply unavailable rather than silently broken.
    return "";
  }
}
