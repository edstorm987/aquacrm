/**
 * Which files matter for the thing being edited right now.
 *
 * A repository browser that always shows all 1,700 files is only useful to
 * somebody who already knows the codebase. Editing a client portal and being
 * shown the marketing site, the API routes and the test suite is not "more
 * power", it is the answer buried in noise.
 *
 * So the tree is filtered to what renders the thing on screen, with a toggle
 * back to everything — because the filter will sometimes be wrong, and an
 * editor that cannot be argued with is worse than one that guesses.
 */

export interface RelevanceScope {
  /** Shown on the toggle: "portal files", "website files". */
  label: string;
  /** Path fragments that make a file part of this scope. */
  patterns: string[];
}

/** What renders a client portal, as opposed to everything else in the repo. */
export const PORTAL_SCOPE: RelevanceScope = {
  label: "portal files",
  patterns: [
    "client-preview",
    "clientPortal",
    "portals/editor",
    "components/portal",
    "built-ins/modules/client-portal",
  ],
};

export const WEBSITE_SCOPE: RelevanceScope = {
  label: "website files",
  patterns: [
    "app/(site)",
    "agencyWebsite",
    "development/website",
    "built-ins/modules/website-editor",
    "components/site",
  ],
};

/**
 * Narrowed further to one page, when a page is selected.
 *
 * "Show me what renders the Billing section" is a more precise question than
 * "show me the portal", and it is usually the one somebody actually has.
 */
export function scopeForSection(base: RelevanceScope, section?: string): RelevanceScope {
  if (!section) return base;
  return {
    label: `${section} files`,
    // Kept alongside the base patterns rather than replacing them: a section's
    // markup usually lives beside the shell that renders it, and a filter that
    // returns three files nobody can edit is not a filter, it is a dead end.
    patterns: [section, ...base.patterns],
  };
}

export function isRelevant(path: string, scope: RelevanceScope): boolean {
  const lower = path.toLowerCase();
  return scope.patterns.some(pattern => lower.includes(pattern.toLowerCase()));
}

/**
 * Filters a flat list, always keeping anything explicitly opened.
 *
 * Without that exception, locating an element through the picker and then
 * switching to the filtered view would hide the very file you were sent to —
 * which reads as the editor losing your place.
 */
export function relevantFiles<T extends { path: string }>(
  files: T[],
  scope: RelevanceScope,
  alwaysKeep: string[] = [],
): T[] {
  const keep = new Set(alwaysKeep);
  return files.filter(file => keep.has(file.path) || isRelevant(file.path, scope));
}
