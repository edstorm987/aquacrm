import "server-only";
// Plugin storage with the writes taken away.
//
// Some plugin hooks run on a READ path. `healthcheck` is the clearest case: it
// answers a GET, and `makeCtx` hands every hook the module's real read/write
// storage — so polling a module's health could mutate its data, and nothing in
// the type would say so.
//
// That is the hidden-write-on-a-read-path class issue #21 spent a day removing,
// and it is what `scripts/smoke-read-path-mutations.test.ts` exists to catch.
// `lib/server/compliance/retention.ts` already answers it the same way, keeping
// `findExpired` separate so a render cannot reach `mutate`. This does it
// structurally instead of by convention: the hook is handed an object that
// cannot write, so a future healthcheck cannot introduce the bug by accident.
//
// It REFUSES rather than silently ignoring. A swallowed write would let a
// module look like it worked while its data never changed — the exact shape of
// mask this codebase keeps removing.

import type { PluginStorage } from "@/built-ins/runtime/_types";

export class ReadOnlyPluginStorageError extends Error {
  constructor(operation: string, context: string) {
    super(`${context} attempted to ${operation} — this hook is read-only.`);
    this.name = "ReadOnlyPluginStorageError";
  }
}

/**
 * A read-only view of a plugin's storage.
 *
 * `context` names the caller in the error, so an operator reading an unhealthy
 * row learns which hook misbehaved rather than just that something threw.
 */
export function readOnlyPluginStorage(storage: PluginStorage, context: string): PluginStorage {
  // REJECTS rather than throwing synchronously. Every `PluginStorage` method
  // declares a Promise return, so a caller is entitled to write
  // `storage.set(...).catch(...)` — a synchronous throw would escape that and
  // surface as an unhandled error somewhere unrelated. Matching the declared
  // contract is the difference between a clear refusal and a confusing crash.
  const refuse = (operation: string) => (): Promise<never> =>
    Promise.reject(new ReadOnlyPluginStorageError(operation, context));
  return {
    get: key => storage.get(key),
    list: prefix => storage.list(prefix),
    set: refuse("write"),
    del: refuse("delete"),
    setIfAbsent: refuse("create a key"),
    runExclusive: refuse("take a lock"),
  };
}
