/**
 * WHAT you are working on — the surface — kept apart from HOW DEEP you go.
 *
 * Ed, 2026-08-21: *"website mode im going to need a specialied thing to do the
 * seo and tags and everything like that per page... dont need a portal mode
 * and then normal mode can do portal and software or whatever as its just
 * universal"*. So there are exactly TWO:
 *
 *   • **Website** — adds the per-page specialist work a website needs and
 *     nothing else does: the page's title and description, its social card,
 *     its canonical address, whether search engines may index it, and its
 *     structured data. Per PAGE, which is why it needs the navigator
 *     (phase 8) to say which page it is talking about.
 *   • **Normal** — the universal one. A portal, a piece of software, a game,
 *     a documentation site. Everything the editor already did.
 *
 * ─── ORTHOGONAL TO THE MODES. Do not conflate them. ─────────────────────────
 *
 * `editing/modes.ts` answers "how deep do I want to go?" — assist, visual,
 * developer. This answers "what am I working on?". They are two axes and they
 * multiply: a website at the assist depth and a website at the developer depth
 * are the same website. The one place they meet is `inspectorTabsFor`, which
 * takes both and is the ONLY place either is allowed to gate a tab.
 *
 * ─── AND NOT `projectKind`. ─────────────────────────────────────────────────
 *
 * `projectKind` ("software" | "website" | "portal") is a field somebody typed
 * once when the project was created, and using it to decide what the editor
 * IS caused half of last session's bugs: every project Ed makes defaults to
 * "software", so every project he makes had the browser switched off, an empty
 * palette and a hidden Builder tab. A declared kind is a claim; what is
 * CONNECTED is evidence. So the default below is derived from evidence —
 * an Aqua Tag answering on a real address — and the switcher overrides it,
 * because the operator is better evidence than either.
 *
 * The derivation is deliberately CONSERVATIVE and says so out loud. A project
 * it reads as Normal that is really a website costs one click on a switcher
 * that is right there, with a sentence naming exactly what was missing. A
 * project it reads as Website that is really a game shows an SEO panel that
 * can only write nonsense into somebody's source. Missing is recoverable;
 * inventing is not — the same rule the navigator's route derivation lives by.
 *
 * Client-safe: no server imports, no Node built-ins, no `next/*`. The two
 * storage helpers at the bottom touch `window` and check for it first, so this
 * module still imports and answers in a test.
 */

/** The two. There is no portal surface — Ed was explicit, and Normal covers it. */
export type EditorSurface = "website" | "normal";

export interface EditorSurfaceDefinition {
  id: EditorSurface;
  label: string;
  /** What it is for, in the words of somebody choosing it. */
  summary: string;
}

export const EDITOR_SURFACES: EditorSurfaceDefinition[] = [
  {
    id: "normal",
    label: "Normal",
    // Listed FIRST because it is the default and the wider of the two: an
    // editor that opens claiming to be a website editor is wrong more often
    // than it is right.
    summary: "The universal editor. A portal, an app, a game — anything that is not a public website.",
  },
  {
    id: "website",
    label: "Website",
    summary: "Everything Normal has, plus the per-page SEO work: title, description, social card, canonical, indexing and structured data.",
  },
];

/**
 * A stored or typed surface id → the definition, tolerantly.
 *
 * Migrations are BY NAME, never by falling through to the default — the same
 * rule `editingMode` learned when "simple" merged into "visual". A default
 * that happens to be right today stops being a migration the day the default
 * moves.
 *
 *   "site"                 → website   (an older word for the same thing)
 *   "portal" / "software"  → normal    (the two `projectKind` values that
 *                                       somebody might reasonably have
 *                                       written into a surface slot; both are
 *                                       the universal surface now, because Ed
 *                                       deleted the portal mode on purpose)
 */
export function editorSurface(id: string | null | undefined): EditorSurfaceDefinition {
  let wanted = typeof id === "string" ? id.trim().toLowerCase() : "";
  if (wanted === "site") wanted = "website";
  if (wanted === "portal" || wanted === "software") wanted = "normal";
  return EDITOR_SURFACES.find(surface => surface.id === wanted)
    ?? EDITOR_SURFACES.find(surface => surface.id === "normal")!;
}

// ── Deriving the default from what is CONNECTED ─────────────────────────────

export interface SurfaceSignals {
  /**
   * An Aqua Tag is mapped and answering for this project — the editor's own
   * `tagMapped`. The strongest single piece of evidence there is: somebody
   * pasted a snippet into a page and the page answered.
   */
  tagMapped?: boolean;
  /**
   * The address the browser is pointed at — `aquaTagBrowserUrl(project)`, i.e.
   * the MAPPED `finalUrl` when there is one. An `http(s)` address is a site; a
   * blank is nothing; anything else is not a website address.
   */
  siteUrl?: string;
  /** There is an Aqua-hosted portal document behind this — the editor's `portalTarget`. */
  portalTarget?: boolean;
  /** A GitHub repository is connected. Evidence of source, not of a website. */
  repository?: string;
}

export interface DerivedSurface {
  surface: EditorSurface;
  /**
   * WHY, in a sentence the operator can act on. Never "because of the
   * project's kind" — that sentence was a lie in both directions.
   */
  reason: string;
}

/** The host of an http(s) address, or "" — the only site-ness test worth making. */
function siteHost(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.host;
  } catch {
    return "";
  }
}

/**
 * What this project looks like, on the evidence — and the sentence saying so.
 *
 * ONE rule promotes to Website, and it is Ed's: *"tag + site"*. A tag that
 * answers proves there is a real page, and the address proves where. Every
 * other combination is Normal with a sentence that names the missing half, so
 * the operator learns what to fix rather than being told "no".
 */
export function derivedSurface(signals: SurfaceSignals): DerivedSurface {
  const host = siteHost(signals.siteUrl);
  if (signals.tagMapped && host) {
    return {
      surface: "website",
      reason: `Website, because an Aqua Tag is answering on ${host}.`,
    };
  }
  if (signals.tagMapped && !host) {
    // Genuinely odd — a verified tag with no address recorded — so it is said
    // rather than smoothed over.
    return {
      surface: "normal",
      reason: "Normal. An Aqua Tag is connected but there is no site address recorded for it, so the editor cannot tell which pages it would be doing SEO for.",
    };
  }
  if (host) {
    return {
      surface: "normal",
      reason: `Normal. There is a site address (${host}) but no Aqua Tag answering on it yet, so nothing here proves this is a live website — switch to Website if it is one.`,
    };
  }
  if (signals.portalTarget) {
    return {
      surface: "normal",
      reason: "Normal. This is an Aqua-hosted portal — a private space behind a login, so there is no public page for a search engine to find.",
    };
  }
  if (signals.repository) {
    return {
      surface: "normal",
      reason: `Normal. ${signals.repository} is connected, but a repository on its own says nothing about whether it serves a public website — switch to Website if it does.`,
    };
  }
  return {
    surface: "normal",
    reason: "Normal. Nothing is connected yet, so there is no evidence either way — connect the Aqua Tag to a site and this becomes Website on its own.",
  };
}

export interface ResolvedSurface {
  surface: EditorSurface;
  /** True when the OPERATOR picked it, so the derivation is being overridden. */
  chosen: boolean;
  /** What the evidence says, whether or not it won. */
  derived: EditorSurface;
  /** The one line shown with the switcher. */
  sentence: string;
}

/**
 * The surface actually in force: the operator's choice, or the evidence.
 *
 * A stored choice ALWAYS wins, including when it agrees with the derivation
 * and including when it disagrees — a person who switched to Website on a
 * project with no tag did that on purpose, and having the editor quietly
 * switch back on the next reload is the "it keeps undoing my thing" bug.
 *
 * When a choice overrides the evidence the sentence says BOTH, because the
 * operator should be able to see that the editor disagrees and why.
 */
export function resolveSurface(
  stored: string | null | undefined,
  signals: SurfaceSignals,
): ResolvedSurface {
  const evidence = derivedSurface(signals);
  const hasChoice = typeof stored === "string" && stored.trim() !== "";
  if (!hasChoice) {
    return { surface: evidence.surface, chosen: false, derived: evidence.surface, sentence: evidence.reason };
  }
  const chosen = editorSurface(stored).id;
  if (chosen === evidence.surface) {
    return { surface: chosen, chosen: true, derived: evidence.surface, sentence: evidence.reason };
  }
  return {
    surface: chosen,
    chosen: true,
    derived: evidence.surface,
    sentence: `${editorSurface(chosen).label}, because you chose it. ${evidence.reason}`,
  };
}

// ── Remembering the choice ──────────────────────────────────────────────────
//
// Per PROJECT, like the device: a client's marketing site and an internal tool
// are not the same kind of thing and should not share one answer. The scope
// string is the caller's (`projectId`, or `"portal"` on the portals door),
// exactly as `saveDeviceState` takes it.
//
// Only an explicit choice is ever written. Nothing here writes the DERIVED
// surface: storing a guess turns it into a choice, and then a project that
// later gets a tag would stay Normal for ever because the editor had already
// written its own guess down as if a person had made it.

export const SURFACE_STORAGE_PREFIX = "lk_editor_surface_v1";

export function surfaceStorageKey(scope: string): string {
  return `${SURFACE_STORAGE_PREFIX}:${scope || "portal"}`;
}

/** The stored choice, or null when there is none. Null in a test, and in SSR. */
export function loadSurfaceChoice(scope: string): EditorSurface | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(surfaceStorageKey(scope));
    if (!raw) return null;
    // Round-tripped through the tolerant resolver so a corrupted value is a
    // valid surface rather than a crash — but an ABSENT one stays absent, so
    // the derivation still gets its turn.
    return editorSurface(raw).id;
  } catch {
    return null;
  }
}

export function saveSurfaceChoice(surface: EditorSurface, scope: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(surfaceStorageKey(scope), surface);
  } catch {
    // A full or blocked storage must never take the editor down with it.
  }
}
