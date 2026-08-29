import "server-only";

// Which files a project — or a person — is allowed to see.
//
// Ed, 2026-08-27: *"the internal editor needs to be ever so slightly different,
// with aquaCRM repo locked down to this portal's files as we can't expose the
// whole repo in Fulfilment … I'd love to just give a dev staff access to one
// folder, or maybe even one file, or even multiple files in folders."*
//
// Today `site-editor/files` serves from `process.cwd()` and confines only
// against traversal, so opening the aquaCRM project in the editor exposes the
// entire repository to anyone who may open the editor at all.
//
// ── Two scopes, and they INTERSECT ────────────────────────────────────────
//
// The two halves of Ed's sentence are different concerns and both are real:
//
//   • the PROJECT declares the maximum surface — "this project is the portal
//     files", a property of the project that applies to everyone;
//   • a GRANT may narrow further within it — "this person gets one folder",
//     a property of the person.
//
// They intersect, never union, which is the same rule `_pageScope.ts` already
// uses for surfaces and roles: a grant naming a path the project does not expose
// does not thereby expose it. That way widening always requires touching the
// project, which is the thing an owner reviews.
//
// ── The matching rule, and the bug it is written to avoid ─────────────────
//
// A folder entry matches on SEGMENT BOUNDARIES. `src/app` must allow
// `src/app/page.tsx` and must NOT allow `src/application.ts` — a naive
// `startsWith` says yes to both, and that is the classic way a path allowlist
// leaks its neighbours. Every comparison here goes through `segments()`.

// ── What these paths are RELATIVE TO ─────────────────────────────────────
//
// The editor's root, not the git repository's. `site-editor/files` reads from
// `process.cwd()`, which for this app is the `portal/` directory — so the
// entries are `src/app/portal`, never `portal/src/app/portal`.
//
// Worth stating because the first scope set through the real UI used the
// repository-relative form, matched nothing, and produced an EMPTY file tree
// with no error — a scope that silently matches nothing looks identical to a
// broken editor. The form's placeholder shows the correct form for that reason.

/** A normalised, root-relative path. Empty string means "the root itself". */
export type RepoPath = string;

/**
 * Normalise a requested path to a comparable repo-relative form, or null when
 * it is not expressible as one.
 *
 * Rejects, rather than sanitises, anything containing a traversal segment: a
 * request for `a/../../etc` is not a mistake to be tidied up, and quietly
 * rewriting it to something valid is how an allowlist ends up approving a path
 * the caller never asked for.
 */
export function normaliseRepoPath(value: unknown): RepoPath | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed === "/") return "";
  if (trimmed.includes("\0")) return null;
  const parts = trimmed.split("/").filter(part => part !== "" && part !== ".");
  if (parts.some(part => part === "..")) return null;
  return parts.join("/");
}

function segments(path: RepoPath): string[] {
  return path ? path.split("/") : [];
}

/**
 * Does `path` fall inside `entry`?
 *
 * An entry matches ITSELF and everything beneath it, compared segment by
 * segment — so `src/app` covers `src/app/page.tsx` and never
 * `src/application.ts`. That is what "give them this folder" means, and it is
 * what every allowlist of this shape does.
 *
 * A FILE entry therefore also nominally covers paths "beneath" it, which cannot
 * exist on a filesystem — `page.tsx/evil.ts` has no target. That is not left to
 * luck: every enforcement point resolves the request through its own
 * `safeRealPath` and stats it before serving anything, so such a path fails on
 * the filesystem regardless of what this matcher says. The two rules together
 * are what make this safe, and neither is sufficient alone.
 */
function entryCovers(entry: RepoPath, path: RepoPath): boolean {
  if (entry === "") return true;                       // the root covers everything
  const entryParts = segments(entry);
  const pathParts = segments(path);
  if (pathParts.length < entryParts.length) return false;
  return entryParts.every((part, index) => pathParts[index] === part);
}

/**
 * The scope itself.
 *
 * An EMPTY list means unrestricted, which is what every project without a scope
 * has today — adding this file changes nothing until a scope is set. That is
 * deliberate: a default-deny here would lock every existing project out of its
 * own editor on deploy.
 */
export interface DevPathScope {
  /** Repo-relative files and folders. Empty = unrestricted. */
  allow: RepoPath[];
}

export const UNRESTRICTED: DevPathScope = { allow: [] };

/** Build a scope from stored values, dropping anything unusable. */
export function devPathScope(values: readonly unknown[] | undefined | null): DevPathScope {
  if (!values?.length) return UNRESTRICTED;
  const allow: RepoPath[] = [];
  for (const value of values) {
    const path = normaliseRepoPath(value);
    // A traversal entry is dropped, not treated as the root. Normalising it to
    // "" would turn one bad entry into "unrestricted" — the exact inversion of
    // what an allowlist is for.
    if (path === null || path === "") continue;
    if (!allow.includes(path)) allow.push(path);
  }
  return allow.length ? { allow } : UNRESTRICTED;
}

export function isUnrestricted(scope: DevPathScope): boolean {
  return scope.allow.length === 0;
}

/** May this scope see this path? */
export function scopeAllows(scope: DevPathScope, requested: unknown): boolean {
  const path = normaliseRepoPath(requested);
  if (path === null) return false;                     // traversal, or not a path
  if (isUnrestricted(scope)) return true;
  if (path === "") return true;                        // the root listing itself
  return scope.allow.some(entry => entryCovers(entry, path));
}

/**
 * May this scope WRITE this path?
 *
 * Separate from reading because the root is readable (you must be able to list
 * it to navigate) but is never itself writable — and because a caller that
 * forgets the difference should fail closed rather than inherit the read rule.
 */
export function scopeAllowsWrite(scope: DevPathScope, requested: unknown): boolean {
  const path = normaliseRepoPath(requested);
  if (path === null || path === "") return false;
  if (isUnrestricted(scope)) return true;
  return scope.allow.some(entry => entryCovers(entry, path));
}

/**
 * Should this entry be shown when listing `parent`?
 *
 * Listing needs a third rule, because a folder on the way DOWN to an allowed
 * path must stay visible or the user cannot navigate to what they may edit.
 * `src/app/portal` allowed means `src` and `src/app` are listable, while their
 * other children are not.
 */
export function scopeAllowsListing(scope: DevPathScope, requested: unknown): boolean {
  const path = normaliseRepoPath(requested);
  if (path === null) return false;
  if (isUnrestricted(scope)) return true;
  if (path === "") return true;
  if (scope.allow.some(entry => entryCovers(entry, path))) return true;
  // …or it is an ancestor of something allowed.
  return scope.allow.some(entry => entryCovers(path, entry));
}

/**
 * The UNION of several grants held by the SAME person.
 *
 * Two grants on one project — one for `blocks`, one for `styles` — give that
 * person both. Unioning is right here and would be wrong between the project
 * and the grant, and the difference is who is being combined: a person's own
 * grants add up, while a grant may never add to what the project exposes.
 *
 * An UNSCOPED grant contributes no limit, so the union is unrestricted — which
 * is what "this person has the project, without a narrowing" has to mean, or an
 * ordinary grant would silently give nothing.
 */
export function unionPathScopes(scopes: readonly DevPathScope[]): DevPathScope {
  if (!scopes.length) return UNRESTRICTED;
  if (scopes.some(isUnrestricted)) return UNRESTRICTED;
  const allow: RepoPath[] = [];
  for (const scope of scopes) {
    for (const entry of scope.allow) if (!allow.includes(entry)) allow.push(entry);
  }
  return allow.length ? { allow } : UNRESTRICTED;
}

/**
 * The INTERSECTION of a project's surface and a person's narrowing.
 *
 * Intersect, never union — a grant naming a path the project does not expose
 * does not thereby expose it. An unrestricted side contributes no limit, so:
 * project ∩ nothing = project, nothing ∩ grant = grant.
 */
export function intersectPathScopes(project: DevPathScope, grant: DevPathScope): DevPathScope {
  if (isUnrestricted(project)) return grant;
  if (isUnrestricted(grant)) return project;

  const allow: RepoPath[] = [];
  for (const grantEntry of grant.allow) {
    for (const projectEntry of project.allow) {
      // The narrower of the two, when one contains the other. Entries that do
      // not overlap contribute nothing at all.
      if (entryCovers(projectEntry, grantEntry)) { if (!allow.includes(grantEntry)) allow.push(grantEntry); }
      else if (entryCovers(grantEntry, projectEntry)) { if (!allow.includes(projectEntry)) allow.push(projectEntry); }
    }
  }
  // No overlap means no access — NOT unrestricted. `devPathScope([])` would
  // return UNRESTRICTED, which would invert the answer, so build it directly.
  return { allow: allow.length ? allow : [DENY_EVERYTHING] };
}

/**
 * A path no repository can contain, used to express "nothing overlaps".
 *
 * An empty allow-list means unrestricted throughout this module, so an empty
 * intersection cannot be represented that way without flipping its meaning.
 */
export const DENY_EVERYTHING = " deny";


/**
 * Is `next` entirely inside `current` — i.e. does the change only NARROW?
 *
 * Narrowing a project's surface is always safe and should cost nothing;
 * WIDENING it is the same kind of decision as pointing the project at a
 * different repository, and answers to the same capability. Separating them
 * means an owner tightening a scope in a hurry is never blocked by a permission
 * check, while loosening one is always a deliberate act.
 */
export function scopeOnlyNarrows(current: DevPathScope, next: DevPathScope): boolean {
  if (isUnrestricted(current)) return true;              // anything is ⊆ everything
  if (isUnrestricted(next)) return false;                // restricted → open is a widening
  return next.allow.every(entry => current.allow.some(existing => entryCovers(existing, entry)));
}

// ─── The one call an enforcement point makes ──────────────────────────────

export class DevPathScopeError extends Error {
  readonly status = 403;
  readonly code = "path_out_of_scope";
  constructor(requested: string) {
    super(`This project does not expose "${requested}".`);
    this.name = "DevPathScopeError";
  }
}

export type DevPathMode = "read" | "write" | "list";

/**
 * Check a request against a scope, or throw.
 *
 * One call so the four enforcement points cannot drift into three slightly
 * different interpretations of the same allowlist — which is how a path guard
 * ends up holding on three routes and not the fourth.
 *
 * Returns the NORMALISED path, so a caller that uses the return value rather
 * than its own input cannot accidentally act on the raw string it was given.
 */
export function assertPathInScope(
  scope: DevPathScope,
  requested: unknown,
  mode: DevPathMode,
): RepoPath {
  const allowed = mode === "write"
    ? scopeAllowsWrite(scope, requested)
    : mode === "list"
      ? scopeAllowsListing(scope, requested)
      : scopeAllows(scope, requested);
  if (!allowed) throw new DevPathScopeError(typeof requested === "string" ? requested : String(requested));
  const path = normaliseRepoPath(requested);
  // Unreachable while the checks above hold; kept because returning a raw
  // string here would hand the caller the very value the guard rejected.
  if (path === null) throw new DevPathScopeError(String(requested));
  return path;
}
