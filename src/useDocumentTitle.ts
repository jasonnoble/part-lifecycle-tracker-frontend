import { useEffect } from "react";

const SUFFIX = "Part Lifecycle Tracker";

/**
 * Set the browser tab title for the current route. Pass a page name to get
 * "Page · Part Lifecycle Tracker"; pass nothing (or while data is still
 * loading) to fall back to the bare product name. Restores the base title on
 * unmount so a stale per-page title never lingers.
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
    return () => {
      document.title = SUFFIX;
    };
  }, [title]);
}
