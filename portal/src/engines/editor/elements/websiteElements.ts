// Loading the website vocabulary on demand.
//
// The editor needs the 70 website element definitions only when it is pointed
// at something that speaks that surface — a site, a repository, a game build.
// Opening a client portal must not pay for them. So the import is dynamic and
// memoised here, and `./websiteVocabulary.ts` is the module it pulls (read its
// header for what the chunk actually contains and why the indirection cannot
// be removed).
//
// Idempotent twice over: the promise is cached, and
// `registerElementDefinitions` is last-write-wins per type, so a second call
// can neither double-register nor duplicate a palette entry.

import { listElementDefinitions } from "./registry";

let loading: Promise<void> | null = null;
let loaded = false;

/**
 * Ensure `listElementDefinitions("website")` can answer.
 *
 * Resolves once the definitions are registered. Safe to call on every render,
 * from several components, and before or after the vocabulary is already
 * present.
 */
export function ensureWebsiteElements(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= import("./websiteVocabulary").then(() => { loaded = true; });
  return loading;
}

/**
 * Whether the vocabulary is present right now, without awaiting anything.
 *
 * Reads the registry rather than the flag above: another module may have
 * imported `blockRegistry` statically (the website editor's own canvas does),
 * in which case the definitions are already there and nothing needs loading.
 */
export function websiteElementsReady(): boolean {
  return loaded || listElementDefinitions("website").length > 0;
}
