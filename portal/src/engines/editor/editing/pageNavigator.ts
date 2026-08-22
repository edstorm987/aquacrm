/**
 * The navigator — how you reach a project's OTHER pages.
 *
 * Ed, on pointing the editor at a real website: *"if i put in a website id get
 * stuck"*. The browser loaded exactly one address and there was nothing on
 * screen that could take you anywhere else. A URL bar is not an answer: it
 * asks the operator to already know the site's routes, which is the thing the
 * editor is supposed to know for them.
 *
 * So this is a LIST YOU PICK FROM, and the one rule it lives by is that it
 * must say WHO ANSWERED. There are three possible answerers and they know
 * genuinely different things:
 *
 *   • **This portal's own pages** — an Aqua-hosted portal document. Exact and
 *     complete: the document IS the list. Picking one changes the section the
 *     preview renders, not a URL.
 *   • **The repository's routes** — derived from the file tree the editor
 *     already reads (`app/…/page.tsx`, `pages/…`, plain `.html`). Exact about
 *     what EXISTS in the source, and silent about anything generated at
 *     runtime. A dynamic route (`[slug]`) is listed and NOT openable, because
 *     opening it without a real value is a 404 with the editor's name on it.
 *   • **The links the Aqua Tag can see** — what is actually reachable from the
 *     page in front of you, same-origin only. Exact about this one page and
 *     blind to everything nothing links to.
 *
 * Two of those can answer at once (a repo-backed project with a tag on its
 * site), and when they do, the operator is told both — grouped, and counted.
 * Never merged into one anonymous list: "12 pages" that is half source-derived
 * and half link-scraped is a claim the editor cannot stand behind.
 *
 * Client-safe: no server imports, no Node built-ins, no `next/*`. The route
 * derivation is pure so the same function answers in the browser and in a
 * test, and so a repository's routes can be checked without GitHub.
 */

import type { AquaTagPageLink } from "./aquaTagBridge";

/** Who answered. Every destination carries the one that produced it. */
export type NavigatorSourceId = "portal" | "repository" | "page-links";

export interface NavigatorDestination {
  /** The option value. Unique across every group in a plan. */
  id: string;
  /** What to call it in the list. */
  label: string;
  source: NavigatorSourceId;
  /**
   * What picking it MEANS, and the meaning differs by source:
   *   portal      — a portal section id, or `custom:<pageId>`
   *   repository  — a route path (`/`, `/about`), joined onto the browser's
   *                 current origin by `navigatorHref`
   *   page-links  — an absolute same-origin URL the tag read off the page
   */
  target: string;
  /**
   * False when the destination exists but cannot be opened from a list.
   * Only dynamic routes are ever false, and the reason is in `note`.
   */
  openable: boolean;
  /** Why it cannot be opened. Rendered on the option, never swallowed. */
  note?: string;
  /**
   * The repository path this route was DERIVED FROM — `app/about/page.tsx`.
   * Only ever set on a `repository` destination, because it is the only source
   * that knows a file: a portal page is a document and a tag's link is a URL.
   *
   * Added for phase 9 (per-page SEO), which has to write into the page's own
   * head and therefore needs the file, not the route. It is carried here
   * rather than re-derived by the SEO module so there is exactly ONE rule
   * turning paths into pages — deriving it twice is how the two answers start
   * disagreeing about which file `/about` is.
   */
  file?: string;
}

export interface NavigatorGroup {
  source: NavigatorSourceId;
  /** The optgroup heading. It NAMES the source; it is not a category word. */
  label: string;
  destinations: NavigatorDestination[];
}

export interface NavigatorPlan {
  groups: NavigatorGroup[];
  /** Every destination, flat, in group order — for lookup by option value. */
  destinations: NavigatorDestination[];
  /**
   * The one line under the control. It says which source answered and how
   * many it found, or — when nothing could answer — what would make one able
   * to. It is never a guess and never a bare count with no provenance.
   */
  sentence: string;
  /** Nothing could list a page. The control is still shown; the line explains. */
  empty: boolean;
}

/** A page's own routes cap. A select with 500 rows is not a list, it is a wall. */
export const NAVIGATOR_ROUTE_LIMIT = 200;

// ── The repository's routes ─────────────────────────────────────────────────
//
// Derived from paths alone. Nothing here opens a file: a route is a fact about
// where a file SITS in a Next.js project, and reading the file would not make
// the answer better.

/**
 * App Router: `app/…/page.tsx` — at the REPOSITORY ROOT, or under `src/`.
 *
 * Anchored, and that anchor is load-bearing rather than tidiness. A router
 * directory is a fact about the project root; a folder merely NAMED `app` or
 * `pages` somewhere down the tree is not one. Left unanchored, this codebase's
 * own `src/built-ins/modules/agency-finance/src/pages/ActivityPage.tsx` read as
 * the route `/ActivityPage`, and the navigator would have offered 181 rows of
 * which a third were 404s it had promised were pages. A route the navigator
 * misses is a gap the sentence admits to; a route it invents is a lie.
 *
 * The cost, stated: a monorepo whose app lives at `apps/web/app/…` yields
 * nothing, and the plan then says "no routes were found in <repo> — nothing
 * there looks like a page file", which is true.
 */
const APP_PAGE = /^(?:src\/)?app\/(.*\/)?page\.(tsx|jsx|js|mjs|mdx)$/;
/** Pages Router: `pages/…`, anchored for exactly the same reason. */
const PAGES_FILE = /^(?:src\/)?pages\/(.+)\.(tsx|jsx|js|mjs|mdx)$/;
/**
 * A plain static site: an `.html`/`.htm` at the repository root, or anything
 * under `public/`. The EXTENSION IS PART OF THE ROUTE, and that is a fix.
 *
 * It used to be stripped — `public/thanks.html` was offered as `/thanks` — and
 * on Next that is a 404 with the editor's name on it: files under `public/`
 * are served verbatim, at `/thanks.html`. Keeping the extension is also the
 * only answer that is true on BOTH hosts this can be: a static host rooted at
 * `public/` serves `/thanks.html` too, and `/thanks` needs a clean-URL setting
 * neither the navigator nor anything else here can see. The one exception is a
 * root `index.html`, which every host on earth serves at `/` as the directory
 * index — `public/index.html` does not get that, because under Next `/` is the
 * router's, not the folder's.
 */
const ROOT_HTML = /^([^/]+\.html?)$/i;
const PUBLIC_HTML = /^public\/(.+\.html?)$/i;

/** `[slug]`, `[...slug]`, `[[...slug]]` — a route that needs a real value. */
const DYNAMIC_SEGMENT = /^\[.+\]$/;
/** `(marketing)` — organisational only, contributes nothing to the URL. */
const ROUTE_GROUP = /^\(.+\)$/;

function joinRoute(segments: string[]): string {
  const path = segments.filter(Boolean).join("/");
  return path ? `/${path}` : "/";
}

/**
 * One App Router file → its route, or null when the file is not addressable.
 *
 * Null rather than a guess for the three cases that genuinely are not pages:
 * a private folder (`_components`), a parallel route slot (`@modal` — its page
 * renders INSIDE another route and has no URL of its own), and an intercepting
 * route (`(.)photo` — reachable only from the route that intercepts to it).
 */
function appRouterRoute(path: string): { route: string; dynamic: boolean } | null {
  const match = APP_PAGE.exec(path);
  if (!match) return null;
  const raw = (match[1] ?? "").split("/").filter(Boolean);
  const kept: string[] = [];
  for (const segment of raw) {
    if (segment.startsWith("_")) return null;
    if (segment.startsWith("@")) return null;
    // `(.)`, `(..)`, `(...)` — an intercept, not a group. Checked before the
    // group rule, which would otherwise silently swallow it.
    if (/^\(\.+\)/.test(segment)) return null;
    if (ROUTE_GROUP.test(segment)) continue;
    kept.push(segment);
  }
  return { route: joinRoute(kept), dynamic: kept.some(segment => DYNAMIC_SEGMENT.test(segment)) };
}

/** One Pages Router file → its route, or null when it is not a page. */
function pagesRouterRoute(path: string): { route: string; dynamic: boolean } | null {
  const match = PAGES_FILE.exec(path);
  if (!match) return null;
  const raw = (match[1] ?? "").split("/").filter(Boolean);
  // `pages/api/**` is an API handler, and `_app`/`_document`/`_error` are the
  // framework's own files. Neither is somewhere an operator can navigate.
  if (raw[0] === "api") return null;
  if (raw.some(segment => segment.startsWith("_"))) return null;
  const kept = [...raw];
  if (kept[kept.length - 1] === "index") kept.pop();
  return { route: joinRoute(kept), dynamic: kept.some(segment => DYNAMIC_SEGMENT.test(segment)) };
}

/** A plain `.html` file → its route, or null. */
function staticHtmlRoute(path: string): { route: string; dynamic: boolean } | null {
  const root = ROOT_HTML.exec(path);
  if (root) {
    // The one directory index worth claiming. Everything else keeps its name.
    if (/^index\.html?$/i.test(root[1])) return { route: "/", dynamic: false };
    return { route: `/${root[1]}`, dynamic: false };
  }
  const inPublic = PUBLIC_HTML.exec(path);
  if (!inPublic) return null;
  const segments = inPublic[1].split("/").filter(Boolean);
  if (!segments.length) return null;
  return { route: joinRoute(segments), dynamic: false };
}

/**
 * The routes a repository's file list describes.
 *
 * Deduplicated (a route reachable two ways is still one page), `/` first, then
 * alphabetical — the order somebody reads a site in, not tree order, which
 * buries the home page under whichever folder sorts first.
 *
 * HONEST LIMIT, stated here rather than discovered later: this sees the
 * SOURCE. A route that only exists because something generates it at build or
 * request time — a CMS slug, a redirect, a rewrite in `next.config` — is not
 * in the file tree and is therefore not in this list. That is exactly why the
 * tag's link list is a separate source and not folded into this one.
 */
export function repositoryRoutes(paths: readonly string[]): NavigatorDestination[] {
  const byRoute = new Map<string, { route: string; dynamic: boolean; file: string }>();
  for (const path of paths) {
    if (typeof path !== "string" || !path) continue;
    const normalized = path.replace(/^\.\//, "");
    const found = appRouterRoute(normalized) ?? pagesRouterRoute(normalized) ?? staticHtmlRoute(normalized);
    if (!found) continue;
    const existing = byRoute.get(found.route);
    // A static file and a dynamic one landing on the same route: the static
    // one wins, because it is the one that can actually be opened.
    if (existing && !existing.dynamic) continue;
    // The path is carried through so phase 9 knows which file's head to write.
    byRoute.set(found.route, { ...found, file: normalized });
  }
  return [...byRoute.values()]
    .sort((left, right) => (left.route === "/" ? -1 : right.route === "/" ? 1 : left.route.localeCompare(right.route)))
    .map(entry => ({
      id: `repository:${entry.route}`,
      label: entry.route,
      source: "repository" as const,
      target: entry.route,
      openable: !entry.dynamic,
      note: entry.dynamic ? "needs a real value" : undefined,
      file: entry.file,
    }));
}

// ── The links the tag can see ───────────────────────────────────────────────

/** What survived the origin policy, and how many did not. */
export interface PageLinkAnswer {
  destinations: NavigatorDestination[];
  /**
   * Links the tag reported that are NOT on the trusted origin. Counted, never
   * silently dropped — a tag reporting somewhere else is worth saying out loud.
   */
  refused: number;
}

/**
 * The tag's link report → destinations, ON THE EDITOR'S OWN ORIGIN POLICY.
 *
 * ── Why this takes an origin, and why it fails closed ───────────────────────
 *
 * The tag filters same-origin before it sends. That is the right thing for the
 * TAG to do and it is not a policy the EDITOR may rely on: the tag runs inside
 * somebody else's page, its script is served with `stale-while-revalidate`, and
 * a page can post whatever it likes into the frame. Trusting the sender to
 * enforce the receiver's rule is not a rule.
 *
 * It matters more here than anywhere else in the protocol because picking a row
 * MOVES THE BROWSER. `browserUrl` is what `aquaTagOrigin` derives the single
 * trusted origin from — so a link the editor accepted and opened would become
 * the origin the editor trusts, and a page that handed the editor
 * `https://evil.example/` would be answered, patched and quoted to the
 * assistant as if it were the operator's own site. One tampered array widening
 * the trust boundary, silently, is exactly the class of bug the exact-string
 * origin comparison exists to prevent.
 *
 * So: exactly this origin, exact string comparison, and no origin at all means
 * no links — the same posture `isAquaTagMessageTrusted` takes. An unparseable
 * href is refused for the same reason (an origin that cannot be read cannot be
 * compared), which is a change: it used to be KEPT.
 *
 * The label prefers the link's own words, because "Pricing" is what the
 * operator clicked on the site and `/pricing` is not always what it is called.
 */
export function pageLinkDestinations(
  links: readonly AquaTagPageLink[],
  allowedOrigin: string | null | undefined,
): PageLinkAnswer {
  const origin = typeof allowedOrigin === "string" ? allowedOrigin : "";
  // Defence in depth: these are the two values that would make every origin
  // equal to every other. `aquaTagOrigin` cannot produce them; a caller could.
  const usable = origin.length > 0 && origin !== "*" && origin !== "null";
  const seen = new Set<string>();
  const destinations: NavigatorDestination[] = [];
  let refused = 0;
  for (const link of links) {
    if (!link || typeof link.href !== "string" || !link.href) continue;
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    if (!usable) { refused += 1; continue; }
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      refused += 1;
      continue;
    }
    if (url.origin !== origin) { refused += 1; continue; }
    const path = url.pathname || "/";
    const words = typeof link.label === "string" ? link.label.trim() : "";
    destinations.push({
      id: `page-links:${link.href}`,
      label: words ? `${words} — ${path}` : path,
      source: "page-links",
      target: link.href,
      openable: true,
    });
  }
  return { destinations, refused };
}

// ── A portal's own pages ────────────────────────────────────────────────────

export interface NavigatorPortalPages {
  /** The core sections, in the portal's own order, already labelled. */
  sections: ReadonlyArray<{ id: string; label: string }>;
  /** Whatever the operator added. `custom:<id>` is the target convention. */
  customPages: ReadonlyArray<{ id: string; label: string }>;
}

export function portalPageDestinations(pages: NavigatorPortalPages): NavigatorDestination[] {
  return [
    ...pages.sections.map(section => ({
      id: `portal:${section.id}`,
      label: section.label,
      source: "portal" as const,
      target: section.id,
      openable: true,
    })),
    ...pages.customPages.map(page => ({
      id: `portal:custom:${page.id}`,
      label: page.label,
      source: "portal" as const,
      target: `custom:${page.id}`,
      openable: true,
    })),
  ];
}

// ── The plan ────────────────────────────────────────────────────────────────

export interface NavigatorInput {
  /** The portal document's pages, when there is a portal behind this target. */
  portal?: NavigatorPortalPages | null;
  /** The repository's file list, exactly as the repo read answered. */
  repository?: {
    /** Named in the sentence — the operator learns WHICH repo answered. */
    name: string;
    files: readonly string[];
    /** GitHub truncated the tree. Said out loud; a short list is not a full one. */
    truncated?: boolean;
  } | null;
  /** Why the repository could not answer. Stated instead of an empty list. */
  repositoryError?: string;
  /** Still reading. "Not yet" is a different sentence from "nothing found". */
  repositoryLoading?: boolean;
  /** What the tag reported. An empty array is an ANSWER: no links on this page. */
  pageLinks?: readonly AquaTagPageLink[] | null;
  /** Why the tag could not answer — no tag, or a build too old to know the message. */
  pageLinksError?: string;
  /**
   * The ONE origin the editor trusts for the frame these links came from —
   * `aquaTagOrigin(previewSrc)`, the same value the message handler compares
   * against. Every reported link is checked against it here; see
   * `pageLinkDestinations` for why the tag's own filtering is not enough.
   * Absent or null refuses every link rather than trusting the sender.
   */
  pageLinksOrigin?: string | null;
}

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Everything that can answer, grouped and counted, with the line that says so.
 *
 * The groups are in the order they are TRUSTED: a portal document is the page
 * list; the repository's source is next; the tag's view of one page is last,
 * because it can only ever see what that page links to.
 */
export function navigatorPlan(input: NavigatorInput): NavigatorPlan {
  const groups: NavigatorGroup[] = [];
  const clauses: string[] = [];

  if (input.portal) {
    const destinations = portalPageDestinations(input.portal);
    if (destinations.length) {
      groups.push({ source: "portal", label: "Portal pages", destinations });
      clauses.push(`${countLabel(destinations.length, "page", "pages")} from this portal's own document`);
    }
  }

  if (input.repositoryError) {
    clauses.push(`the repository could not be listed — ${input.repositoryError}`);
  } else if (input.repositoryLoading) {
    clauses.push("reading the repository's routes…");
  } else if (input.repository) {
    const all = repositoryRoutes(input.repository.files);
    const destinations = all.slice(0, NAVIGATOR_ROUTE_LIMIT);
    if (destinations.length) {
      groups.push({ source: "repository", label: `Routes in ${input.repository.name}`, destinations });
      const dynamic = destinations.filter(entry => !entry.openable).length;
      let clause = `${countLabel(destinations.length, "route", "routes")} read from ${input.repository.name}`;
      if (all.length > destinations.length) clause += ` (the first ${NAVIGATOR_ROUTE_LIMIT} of ${all.length})`;
      if (dynamic) clause += `, ${dynamic} of which need a real value and cannot be opened from here`;
      if (input.repository.truncated) clause += " — GitHub truncated the tree, so some routes are missing";
      clauses.push(clause);
    } else {
      clauses.push(`no routes were found in ${input.repository.name} — nothing there looks like a page file`);
    }
  }

  if (input.pageLinksError) {
    clauses.push(`the Aqua Tag could not report this page's links — ${input.pageLinksError}`);
  } else if (input.pageLinks) {
    const answer = pageLinkDestinations(input.pageLinks, input.pageLinksOrigin);
    const destinations = answer.destinations;
    // A refusal is never silent. The operator is looking at a list that is
    // shorter than the page's, and the reason is that the editor will not
    // follow the tag off the one origin it is willing to talk to.
    const refusedClause = answer.refused
      ? `${countLabel(answer.refused, "link", "links")} the tag reported ${answer.refused === 1 ? "is" : "are"} not on ${input.pageLinksOrigin || "the address this editor is pointed at"} and ${answer.refused === 1 ? "was" : "were"} refused`
      : "";
    if (destinations.length) {
      groups.push({ source: "page-links", label: "Links on this page", destinations });
      clauses.push(`${countLabel(destinations.length, "link", "links")} the Aqua Tag can see on the page in front of you`);
      if (refusedClause) clauses.push(refusedClause);
    } else if (refusedClause) {
      clauses.push(refusedClause);
    } else {
      clauses.push("the Aqua Tag found no links it could follow on this page");
    }
  }

  const destinations = groups.flatMap(group => group.destinations);
  const sentence = clauses.length
    ? `${clauses.join(" · ")}.`
    : "Nothing here can list this project's pages yet — connect its repository, or install the Aqua Tag on the site so it can report the links it sees.";

  return { groups, destinations, sentence, empty: destinations.length === 0 };
}

/**
 * Where picking a destination points the browser — or null when it cannot.
 *
 * Null is a real answer with three causes, and the caller must handle all
 * three rather than falling back to a guessed URL:
 *   • a PORTAL destination is not a URL at all — it changes which section the
 *     preview renders, and the caller does that instead;
 *   • a repository route has no origin to hang off until the browser is
 *     pointed somewhere (nothing typed, nothing mapped);
 *   • the destination is not openable (a dynamic route).
 *
 * The query and hash of the current address are DROPPED on purpose. They
 * belonged to the page you were on; carrying `?ref=email` onto the next page
 * is how a navigator quietly changes what the site renders.
 *
 * ── AND IT NEVER CHANGES ORIGIN ─────────────────────────────────────────────
 *
 * A repository route could not: it only ever rewrites the current address's
 * path. A tag-reported link could, and that is the whole danger — the address
 * this returns becomes `browserUrl`, which becomes the frame's `src`, which
 * becomes the ONE origin the editor trusts. `pageLinkDestinations` already
 * refuses an off-origin link; this is the second lock on the same door, at the
 * point of use, so the check cannot be lost by a caller building destinations
 * some other way. Null, never a guess.
 */
export function navigatorHref(currentUrl: string, destination: NavigatorDestination): string | null {
  if (!destination.openable) return null;
  if (destination.source === "portal") return null;
  const base = (currentUrl ?? "").trim();
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.origin || url.origin === "null") return null;
  if (destination.source === "page-links") {
    let target: URL;
    try {
      target = new URL(destination.target);
    } catch {
      return null;
    }
    // Exact. Not `startsWith`, not `endsWith` — `https://example.com.evil.net`
    // passes a sloppy comparison and is a completely different site.
    if (target.origin !== url.origin) return null;
    return destination.target;
  }
  url.pathname = destination.target;
  url.search = "";
  url.hash = "";
  return url.toString();
}

/**
 * Which option is currently showing, by what the browser is pointed at.
 *
 * Matched on PATH, not on the whole URL: the tag's links carry an origin and a
 * repository route does not, and both should light up when they name the page
 * on screen. Returns "" when nothing matches — an unlisted address is a normal
 * state (you typed one), not an error, and the select shows its placeholder.
 */
export function navigatorCurrentId(plan: NavigatorPlan, currentUrl: string): string {
  let path = "";
  try {
    path = new URL((currentUrl ?? "").trim()).pathname || "/";
  } catch {
    return "";
  }
  const normalize = (value: string) => (value.length > 1 ? value.replace(/\/+$/, "") : value);
  const wanted = normalize(path);
  for (const destination of plan.destinations) {
    if (destination.source === "portal") continue;
    let candidate = destination.target;
    if (destination.source === "page-links") {
      try {
        candidate = new URL(destination.target).pathname || "/";
      } catch {
        continue;
      }
    }
    if (normalize(candidate) === wanted) return destination.id;
  }
  return "";
}
