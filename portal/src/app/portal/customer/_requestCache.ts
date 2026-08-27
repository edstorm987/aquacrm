import "server-only";

import { cache } from "react";

/**
 * React owns the lifetime of this cache, so one Server Component request gets
 * one snapshot while later requests always resolve fresh data.
 */
export function createCustomerPortalRequestLoader<T>(load: () => Promise<T>): () => Promise<T> {
  return cache(load);
}
