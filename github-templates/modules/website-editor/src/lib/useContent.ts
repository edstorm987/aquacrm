// useContent — three-tier resolution hook used by content components.
// Adapted from `02/src/lib/useContent.ts`. The hook itself is a thin
// wrapper around `portalCache.ts`; the actual subscription wiring is
// kept simple for round 1.

import { useEffect, useState } from "react";
import type { ContentValue } from "../types/content";
import { getPortalValue, loadPortalCache, onPortalCacheChange } from "./portalCache";

export function useContent<T extends ContentValue>(
  siteId: string,
  key: string,
  fallback: T,
): T | ContentValue {
  const [value, setValue] = useState<T | ContentValue>(() => {
    loadPortalCache(siteId);
    return getPortalValue(siteId, key, fallback);
  });

  useEffect(() => {
    const unsub = onPortalCacheChange(siteId, () => {
      setValue(getPortalValue(siteId, key, fallback));
    });
    return unsub;
  }, [siteId, key, fallback]);

  return value;
}
