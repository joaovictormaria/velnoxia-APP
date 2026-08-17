import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";

/** How often to re-check the menu while the tab is actually being looked at. */
const POLL_MS = 20_000;

/**
 * Keeps the storefront in sync with the admin without a manual refresh.
 *
 * The layout loader runs once per page load, so a menu edited in the admin
 * stays invisible in an already-open storefront tab. This re-runs that loader
 * when the tab regains attention (the case that matters when the same person
 * is editing in one tab and checking in another) and, while the tab is
 * visible, on a slow interval so a customer sitting on the page still picks
 * changes up.
 *
 * Deliberately cheap: nothing runs while the tab is hidden, and the loader
 * itself is a single query the server answers in tens of milliseconds.
 */
export function useLiveMenu() {
  const router = useRouter();
  // Guards against overlapping invalidations when focus and the interval land
  // together — invalidate() re-runs loaders and returns a promise.
  const inFlight = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const refresh = () => {
      if (inFlight.current || document.hidden) return;
      inFlight.current = true;
      void router.invalidate().finally(() => {
        inFlight.current = false;
      });
    };

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(refresh, POLL_MS);
    };

    const stopPolling = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }
      // Coming back to the tab is the moment the data is most likely stale.
      refresh();
      startPolling();
    };

    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);
}
