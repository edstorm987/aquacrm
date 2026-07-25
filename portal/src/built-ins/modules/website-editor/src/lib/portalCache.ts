// Three-tier resolution cache. Adapted from
// `02/src/lib/admin/portalCache.ts`.
//
// Lookup precedence:
//   1. portal published overrides (per siteId)
//   2. legacy CMS keys (foundation-side)
//   3. compile-time fallbacks (passed by caller)
//
// Round-1 implements the in-memory cache + localStorage persistence and
// exposes a tiny pub/sub for re-rendering when overrides change.

import type { ContentValue } from "../types/content";

interface CacheEntry {
  siteId: string;
  values: Record<string, ContentValue>;
  loadedAt: number;
}

const memoryCache = new Map<string, CacheEntry>();
const subscribers = new Map<string, Set<() => void>>();

const STORAGE_KEY = (siteId: string) => `aqua.portal-cache.${siteId}`;

export function loadPortalCache(siteId: string): Record<string, ContentValue> {
  const cached = memoryCache.get(siteId);
  if (cached) return cached.values;

  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(STORAGE_KEY(siteId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, ContentValue>;
        memoryCache.set(siteId, { siteId, values: parsed, loadedAt: Date.now() });
        return parsed;
      } catch {
        /* fall through to empty */
      }
    }
  }
  return {};
}

export function setPortalCache(siteId: string, values: Record<string, ContentValue>): void {
  memoryCache.set(siteId, { siteId, values, loadedAt: Date.now() });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY(siteId), JSON.stringify(values));
  }
  subscribers.get(siteId)?.forEach((fn) => fn());
}

export function getPortalValue<T extends ContentValue>(
  siteId: string,
  key: string,
  fallback: T,
): T | ContentValue {
  const values = memoryCache.get(siteId)?.values ?? loadPortalCache(siteId);
  return key in values ? (values[key] as ContentValue) : fallback;
}

export function onPortalCacheChange(siteId: string, fn: () => void): () => void {
  let set = subscribers.get(siteId);
  if (!set) {
    set = new Set();
    subscribers.set(siteId, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
  };
}
