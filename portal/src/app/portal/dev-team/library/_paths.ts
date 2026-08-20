// Shared route helpers for the Dev Team Library.
//
// The Library reuses the dev-docs BACKEND wholesale (`listDevDocs`/`readDevDoc`/
// `scanBlockers` in `@/lib/server/devDocs`), but the dev-docs *view* components
// hardcode `/portal/agency/dev-docs` in their links via a module-local `docHref`
// and can't be parameterised without editing them (off-limits). So the Library
// re-implements only the link-generating views (index, tree, viewer) against
// THIS base — keeping every click inside the Dev Team hub instead of bouncing
// out to the agency dev-docs page.
export const LIBRARY_BASE = "/portal/dev-team/library";

/** `?doc=<relPath>` link into the Library viewer — mirror of the dev-docs docHref. */
export function libraryDocHref(relPath: string): string {
  return `${LIBRARY_BASE}?doc=${encodeURIComponent(relPath)}`;
}
