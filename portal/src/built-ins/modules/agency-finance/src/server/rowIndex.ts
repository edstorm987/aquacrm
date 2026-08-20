// One shared read helper for every "index array + by-id rows" store in Finance.
//
// The problem it fixes: each record kind keeps an `<area>/index` array of ids
// alongside the rows at `<area>/by-id/<id>`, and appending to that array is a
// read-modify-write. Two records created CONCURRENTLY (two Stripe webhooks, two
// admins, a double-click) both read the same array and the second write wins —
// one id is lost, and its row, though stored perfectly well, becomes invisible
// to every `list()`. For money that means a payment or an invoice silently OFF
// THE BOOKS: an under-count, the mirror of the double-count the idempotency
// guard closes (see lib/idempotency.ts). It also masks double-counting, because
// three duplicate writes can surface as one row.
//
// The fix: reads UNION the index with a prefix scan of the rows themselves. The
// index stays a cheap fast-path, but it is no longer the source of truth — a
// lost slot can't hide real money. `ExpenseService.list` and
// `OperationsService.listRows` already did this inline; this is that same idiom
// extracted so the money stores share one copy rather than six.
//
// Scope is unchanged: plugin storage is namespaced per install
// (`state.pluginData[installId]`, see runtime `makeStorage`), so the scan sees
// exactly the keyspace the index already saw — it widens nothing.

import type { StoragePort } from "./ports";

export async function listRowIds(
  storage: StoragePort,
  indexKey: string,
  prefix: string,
): Promise<string[]> {
  const indexed = (await storage.get<string[]>(indexKey)) ?? [];
  const stored = (await storage.list(prefix))
    .map(key => key.slice(prefix.length))
    .filter(Boolean);
  // Index order first (it carries insertion order, which some callers sort on
  // top of); scan-only strays follow. De-duped, so a healthy index is a no-op.
  return [...new Set([...indexed, ...stored])];
}
