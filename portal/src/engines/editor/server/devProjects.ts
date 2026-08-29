import "server-only";

import crypto from "node:crypto";

import { logActivity } from "@/server/activity";
import { getState, mutate } from "@/server/storage";
import type {
  DevProject,
  DevProjectKind,
  DevProjectMap,
  DevProjectMapStatus,
  DevProjectTagMap,
  DevProjectTagState,
} from "@/server/types";
import { getIntegrationConnection, resolveIntegrationConnectionValues } from "@/lib/server/integrations/integrationConnections";
import { devPathScope } from "@/lib/server/dev/devPathScope";

// Re-exported so callers that already import from here keep one import, while
// the shape itself stays in `@/server/types` where a client component can name
// it without dragging `server-only` into the browser bundle.
export type { DevProjectMapStatus, DevProjectTagState };

// ─── Dev Editor Engine — projects ────────────────────────────────────────────
//
// The binding that unifies the engine. Everything a project points at already
// existed — the repo/branch were typed ad-hoc into the code workspace, GitHub
// and Vercel credentials lived in `integrationConnections` (resolved per-agency,
// never per-project), and the Aqua Tag was mapped elsewhere. A DevProject ties
// one project's pieces together so the engine can host MANY projects, each with
// its own repo and its own token.
//
// Secrets never live here: a project stores CONNECTION IDS, and the token is
// resolved at call time from the encrypted vault, so credentials keep exactly
// one home.

const VALID_KINDS = new Set<DevProjectKind>(["software", "website", "portal"]);

function clean(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

/** "owner/repository" or blank (blank = read the local working tree). */
export function normalizeRepository(value: string | undefined): string {
  const repository = clean(value, 200).replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  if (!repository) return "";
  // Keep only owner/name — a deeper path is not a repository.
  const parts = repository.split("/").filter(Boolean);
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "";
}

/**
 * The address MAP will fetch, or blank.
 *
 * http/https only, and stored WITHOUT credentials. A bare domain gets https —
 * the scheme almost every site redirects to anyway, and typing "example.com"
 * is what people actually do. Anything else (`javascript:`, `file:`, `data:`,
 * an unparseable string) comes back blank rather than half-accepted, so a
 * project can never hold an address the browser pane would be asked to load.
 */
export function normalizeProjectSiteUrl(value: string | undefined): string {
  const trimmed = clean(value, 500);
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  if (url.username || url.password) return "";
  if (!url.hostname) return "";
  return url.toString();
}

export function listDevProjects(agencyId: string): DevProject[] {
  return Object.values(getState().devProjects)
    .filter(project => project.agencyId === agencyId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDevProject(agencyId: string, id: string): DevProject | null {
  const project = getState().devProjects[id];
  return project?.agencyId === agencyId ? project : null;
}

/** Projects for one client workspace — what Dev Mode injection reads. */
export function listDevProjectsForClient(agencyId: string, clientId: string): DevProject[] {
  return listDevProjects(agencyId).filter(project => project.clientId === clientId);
}

/**
 * The projects INSIDE one project — Ed's flat second level, nothing deeper.
 *
 * Same tenant rule as every read here: the agency is part of the question, so
 * a foreign project id yields an empty list, exactly as if it did not exist.
 */
export function listDevProjectChildren(agencyId: string, id: string): DevProject[] {
  return listDevProjects(agencyId).filter(project => project.parentProjectId === id);
}

export interface SaveDevProjectInput {
  agencyId: string;
  id?: string;
  name: string;
  description?: string;
  kind?: DevProjectKind;
  repository?: string;
  ref?: string;
  githubConnectionId?: string;
  vercelConnectionId?: string;
  aquaTagId?: string;
  siteUrl?: string;
  clientId?: string;
  /**
   * Where the project lives. Three meanings, and the first is load-bearing:
   *
   *   undefined  → CARRIED from the existing record. `saveDevProject` rebuilds
   *                the record field by field (no spread), so a caller that
   *                does not know about nesting — a rename, the editor's
   *                Settings form — must never silently promote a child to
   *                top level by omission.
   *   "" / null  → top level. Clearing the parent is a statement, made by
   *                sending the empty value on purpose.
   *   an id      → inside that project, subject to the two-level rule below.
   */
  parentProjectId?: string | null;
  /**
   * The files this project exposes. Omit to LEAVE UNCHANGED — this record is
   * rebuilt field by field with no spread, so an omitted field is otherwise
   * dropped, and an unrelated rename would silently unlock the whole repository.
   */
  allowedPaths?: string[];
  actorUserId: string;
  now?: number;
}

/**
 * Create or update a project.
 *
 * A referenced connection must exist AND belong to this agency — otherwise a
 * project could name another tenant's connection id and resolve their token.
 */
export function saveDevProject(input: SaveDevProjectInput): DevProject {
  const name = clean(input.name, 120);
  if (!name) throw new Error("Project name required.");

  const kind: DevProjectKind = input.kind && VALID_KINDS.has(input.kind) ? input.kind : "software";
  const now = input.now ?? Date.now();
  const existing = input.id ? getDevProject(input.agencyId, input.id) : null;
  if (input.id && !existing) throw new Error("project_not_found");

  // Tenant first (the lookup above), then the nesting rules — in the STORE,
  // so no UI and no route can create a third level however it phrases the
  // request.
  const parentProjectId = resolveParentProjectId(input, existing);

  const githubConnectionId = assertConnection(input.agencyId, input.githubConnectionId, "github");
  const vercelConnectionId = assertConnection(input.agencyId, input.vercelConnectionId, "vercel");

  const project: DevProject = {
    id: existing?.id ?? `devproj_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    agencyId: input.agencyId,
    name,
    description: clean(input.description, 400) || undefined,
    kind,
    repository: normalizeRepository(input.repository),
    ref: clean(input.ref, 120) || "main",
    githubConnectionId,
    vercelConnectionId,
    aquaTagId: clean(input.aquaTagId, 120) || undefined,
    siteUrl: normalizeProjectSiteUrl(input.siteUrl) || undefined,
    clientId: clean(input.clientId, 120) || undefined,
    parentProjectId,
    // Normalised through the scope module on the way IN, so a stored scope is
    // always already clean and no reader has to wonder. `undefined` rather than
    // `[]` when empty: an empty array and "unrestricted" mean the same thing
    // here, and storing the shorter one keeps old records and new ones alike.
    allowedPaths: input.allowedPaths === undefined
      ? existing?.allowedPaths
      : (devPathScope(input.allowedPaths).allow.length ? devPathScope(input.allowedPaths).allow : undefined),
    // Carried, never re-derived. A rename is not a reason to forget that the
    // repository was mapped an hour ago.
    map: existing?.map,
    createdBy: existing?.createdBy ?? input.actorUserId,
    updatedBy: input.actorUserId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  mutate(state => { state.devProjects[project.id] = project; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "settings",
    action: existing ? "dev_project.updated" : "dev_project.created",
    message: `${existing ? "Updated" : "Created"} dev project ${project.name}.`,
  });
  return project;
}

/**
 * The nesting guards — Ed's two-level rule, enforced where it cannot be
 * bypassed.
 *
 * The model (Ed, 2026-08-21): a project can contain projects — "one project
 * could be a website they might have a software going on with it too" — and
 * EXACTLY TWO LEVELS: "project → inner projects and that's it". A flat
 * parent/child pair, not a tree. So, in the tenant-first order this module
 * always uses:
 *
 *   1. the parent must exist AND be this agency's — a foreign parent id and an
 *      invented one are the same answer, so a request can learn nothing about
 *      another tenant's projects by probing ids;
 *   2. the intended parent may not itself be a child (no third level, said
 *      from the child's side);
 *   3. a project that HAS children may not become a child (no third level,
 *      said from the parent's side);
 *   4. a project may not contain itself — the one degenerate loop rules 2 and
 *      3 alone would admit, because a project with no parent and no children
 *      passes both and would then be its own parent.
 *
 * Together these make a CYCLE inexpressible, not merely forbidden: any cycle
 * of length ≥ 2 needs some project to be both a parent and a child, which is
 * exactly what 2 and 3 refuse, and the length-1 cycle is rule 4. Reparenting
 * an existing child to another (top-level) project passes all four, and
 * clearing the parent is always allowed — see `SaveDevProjectInput`.
 */
function resolveParentProjectId(input: SaveDevProjectInput, existing: DevProject | null): string | undefined {
  // undefined = not mentioned = carried, so an unrelated save can never
  // silently promote a child to top level. "" / null = clear on purpose.
  const requested = input.parentProjectId === undefined
    ? existing?.parentProjectId ?? ""
    : clean(input.parentProjectId ?? "", 120);
  if (!requested) return undefined;

  if (existing && requested === existing.id) throw new Error("project_cannot_contain_itself");

  const parent = getDevProject(input.agencyId, requested);
  if (!parent) throw new Error("parent_project_not_found");
  if (parent.parentProjectId) throw new Error(`parent_is_child:${parent.name}`);
  if (existing && listDevProjectChildren(input.agencyId, existing.id).length > 0) {
    throw new Error("project_has_children_cannot_nest");
  }
  return parent.id;
}

function assertConnection(agencyId: string, connectionId: string | undefined, provider: "github" | "vercel"): string | undefined {
  const id = clean(connectionId, 120);
  if (!id) return undefined;
  const connection = getIntegrationConnection(agencyId, id);
  // Tenant check first: a wrong-agency id must never resolve a token.
  if (!connection) throw new Error("integration_not_found");
  if (connection.provider !== provider) throw new Error(`connection_provider_mismatch:${provider}`);
  return id;
}

/**
 * Why this project may not be deleted right now, or null when it may be.
 *
 * ONE definition, read by the store's own delete AND by the route BEFORE it
 * runs the destructive cleanup (AI key, history) that precedes a delete — so
 * the refusal is the same sentence everywhere, and it NAMES the children,
 * because "cannot delete" without saying who is in the way sends the operator
 * hunting. A parent is never cascaded: deleting it silently taking the
 * projects inside it would be the worst available reading of one click.
 */
export function devProjectDeleteRefusal(agencyId: string, id: string): string | null {
  const project = getDevProject(agencyId, id);
  if (!project) return null; // not found is its own, existing answer
  const children = listDevProjectChildren(agencyId, id);
  if (children.length === 0) return null;
  const names = children.map(child => `"${child.name}"`);
  const listed = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `"${project.name}" still contains ${listed}. Disconnect or move ${children.length === 1 ? "that project" : "those projects"} first — deleting a parent never takes the projects inside it with it.`;
}

export function deleteDevProject(agencyId: string, id: string, actorUserId: string): DevProject | null {
  const project = getDevProject(agencyId, id);
  if (!project) return null;
  // A parent with children refuses, out loud, in the STORE — a caller that
  // never asked `devProjectDeleteRefusal` still cannot orphan a child.
  const refusal = devProjectDeleteRefusal(agencyId, id);
  if (refusal) throw new Error(refusal);
  mutate(state => { delete state.devProjects[id]; });
  logActivity({
    agencyId,
    actorUserId,
    category: "settings",
    action: "dev_project.deleted",
    message: `Deleted dev project ${project.name}.`,
  });
  return project;
}

/**
 * The GitHub token for a project, or null when it has no connection bound.
 *
 * Resolved from the vault at call time — the project only ever holds an id.
 * Callers fall back to their existing agency-wide / environment resolution so
 * behaviour is unchanged for projects (and callers) with nothing bound.
 */
export function devProjectGitHubToken(agencyId: string, project: DevProject): string | null {
  if (!project.githubConnectionId) return null;
  try {
    const values = resolveIntegrationConnectionValues(agencyId, project.githubConnectionId);
    return values.token || null;
  } catch {
    return null;
  }
}

/**
 * True when a project has an Aqua Tag mapped. That alone is the gate.
 *
 * This used to also require `kind !== "software"`, and that clause was the bug.
 * Every project Ed creates is `software` (it is the default, and the setup form
 * has no kind picker at all), so the browser was gated off everything he
 * builds. Ed's rule, stated many times:
 *
 *   "the aqua tag must be connected for browser to work. or anything to work
 *    really other than the dev since it can just use repo files directly"
 *
 * A tagged game build is still a tagged page and still gets a browser. What the
 * project happens to be written in was never the question — whether a live page
 * can answer is. Dev mode needs no tag because it reads repo files directly.
 */
export function devProjectVisualEditorUnlocked(project: DevProject): boolean {
  return Boolean(project.aquaTagId);
}

/**
 * Two addresses that mean the same page.
 *
 * A redirect from `example.com` to `https://www.example.com/` is worth saying
 * out loud; one from `https://example.com` to `https://example.com/` is a
 * trailing slash and saying it would be noise.
 */
function sameAddress(a: string | undefined, b: string | undefined): boolean {
  const normalize = (value: string | undefined) => {
    if (!value) return "";
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
    } catch {
      return value.trim().replace(/\/+$/, "").toLowerCase();
    }
  };
  return normalize(a) === normalize(b);
}

/**
 * Which of the eight tag situations a project is in.
 *
 * Ed's ask, in his words: say what is true at each step — no tag yet, snippet
 * not installed, installed and answering, or answering at a DIFFERENT address
 * after a redirect. The extra states exist because pretending an unreachable
 * site, an empty page and somebody else's key are the same thing would send
 * the operator to fix the wrong thing.
 *
 * "dead-snippet" is the eighth, found live on the first real client run: the
 * snippet was on the page with the right key, but pointed its script at
 * `localhost` — every visitor's browser refused the fetch, so the tag never
 * executed and no mode got any elements. It is checked BEFORE answering and
 * redirected because presence is not execution; calling that page "answering"
 * is exactly the lie the check used to tell.
 */
export function devProjectTagState(project: DevProject): DevProjectTagState {
  const tag = project.map?.tag;
  if (!tag) return project.siteUrl || project.aquaTagId ? "unchecked" : "none";
  if (!tag.reachable) return "unreachable";
  if (!tag.tagPresent) return "absent";
  if (!tag.keyMatches) return "foreign";
  if (tag.scriptUnloadableReason) return "dead-snippet";
  return tag.finalUrl && !sameAddress(tag.url, tag.finalUrl) ? "redirected" : "answering";
}

/**
 * That situation, as one sentence somebody can act on.
 *
 * Kept next to the state rather than in the screen so the editor, the setup
 * surface and any future caller say the same thing — the "no tag, no browser,
 * and Dev mode never needed one" rule especially, which Ed has restated more
 * times than anything else in this subsystem.
 */
export function devProjectTagSentence(project: DevProject): string {
  const tag = project.map?.tag;
  const where = tag?.url || project.siteUrl || "the site";
  switch (devProjectTagState(project)) {
    case "none":
      return "No Aqua Tag yet, so there is no browser. Paste the snippet into the site's HTML, add its address, and check it. Dev mode works without one — it reads the repository files directly.";
    case "unchecked":
      return `The Aqua Tag has not been checked yet. Paste the snippet into ${where} and press Check it.`;
    case "unreachable":
      return `${where} could not be read, so the tag could not be checked.${tag?.error ? ` ${tag.error}` : ""}`;
    case "absent":
      // A definitive negative REVOKES the tag id (`aquaTagIdFromCheck`), so
      // this sentence and the gate now agree: the browser is off.
      return `${where} was read, but the Aqua Tag snippet is not on the page, so there is no browser — a tag this check disproves is revoked, not kept on trust. Paste it into the site's HTML and check again.`;
    case "foreign":
      return `A tag answered at ${where}, but it carries a different site key — that is not this agency's Aqua Tag, so there is no browser for this project until its own tag answers there.`;
    case "dead-snippet":
      // The reason VERBATIM: the detector already names the env fix (set
      // NEXT_PUBLIC_PORTAL_BASE_URL, regenerate, repaste), and paraphrasing it
      // here is how the screen and the detector would drift apart.
      return `The Aqua Tag snippet is on ${where} with this agency's key, but its script cannot load, so the tag never runs and there is no browser. ${tag?.scriptUnloadableReason ?? "The snippet's script could not be loaded by a visitor's browser."}`;
    case "redirected":
      return `The Aqua Tag is installed and answering, but at ${tag?.finalUrl} rather than ${where} — that address redirects. The browser will load the one that answered.`;
    case "answering":
      return `The Aqua Tag is installed and answering at ${tag?.finalUrl ?? where}. The browser is available.`;
  }
}

/**
 * What is connected, what is mapped, and what is still missing — in words.
 *
 * Pure, so the same answer drives the setup screen, the editor and the tests
 * rather than each re-deriving the rule and drifting. `missing` is written for
 * a human to read straight out; `browserAvailable` is
 * `devProjectVisualEditorUnlocked` and nothing else, so the gate has exactly
 * one definition.
 */
export function devProjectMapStatus(project: DevProject): DevProjectMapStatus {
  const repo = project.map?.repo;
  const tag = project.map?.tag;
  const state = devProjectTagState(project);
  const repoMapped = Boolean(repo && !repo.error);
  const tagged = devProjectVisualEditorUnlocked(project);
  // "Verified" means the tag RUNS for a visitor, not merely that its snippet
  // is in the HTML — a dead snippet is present, key-matched, and still not
  // verified, which is the distinction the first real client run was missing.
  const tagVerified = Boolean(tag?.tagPresent && tag.keyMatches && !tag.scriptUnloadableReason);

  const missing: string[] = [];
  if (!repoMapped) {
    missing.push(project.repository
      ? `${project.repository} has not been mapped yet — press Map.`
      : "No repository mapped yet — press Map to read this workspace.");
  }
  if (!tagged) {
    // Ed's rule, said to the operator rather than left as a disabled button.
    // A dead snippet gets its own line: "no tag connected" would send the
    // operator to paste a snippet that is already there.
    missing.push(state === "dead-snippet" && tag?.scriptUnloadableReason
      ? `The Aqua Tag snippet is installed but its script cannot load, so there is no browser. ${tag.scriptUnloadableReason}`
      : "No Aqua Tag connected, so there is no browser. Dev mode still works — it reads the repo files directly.");
  } else if (!tagVerified) {
    missing.push(tag
      ? `The Aqua Tag did not answer at ${tag.url}. ${tag.error ?? "The tag was not found on the page."}`
      : "The Aqua Tag has not been checked yet — press Map to confirm it answers.");
  }

  return {
    repoMapped,
    tagged,
    tagVerified,
    browserAvailable: tagged,
    neverMapped: !project.map,
    missing,
    tagState: state,
    tagSentence: devProjectTagSentence(project),
  };
}

/**
 * The ONE rule for concluding "this page carries our tag".
 *
 * Both the Map path and the tag-only check path mint the id through here, so
 * there is a single answer to what may set the gate — and to what may take it
 * away. Three properties matter and all are load-bearing:
 *
 *   - the id comes from the key the page ACTUALLY carried, never from anything
 *     a caller sent, so "tagged" cannot be claimed into existence;
 *   - a DEFINITIVE negative revokes it. The page was read fine and the snippet
 *     is not there (`absent`), a tag answered with somebody else's key
 *     (`foreign`), or our snippet is there but its script points somewhere no
 *     visitor's browser can fetch (`dead-snippet` — installed is not running,
 *     and the browser genuinely cannot work) — any of these and the tag this
 *     project relied on is gone; keeping the browser on would leave the card
 *     saying "browser available" next to "until it answers there is no
 *     browser";
 *   - an INDETERMINATE result keeps it. `unreachable` means the page could not
 *     be read at all — a transient network failure or a site that is briefly
 *     down is not a site that lost its tag, and quietly revoking the browser
 *     because a fetch timed out would be its own bug. The card already says the
 *     check could not run.
 */
export function aquaTagIdFromCheck(tag: DevProjectTagMap | undefined, existing: string | undefined): string | undefined {
  // A snippet whose script no visitor's browser can fetch is installed but
  // DEAD — present with the right key, and still not a tag that answers.
  const verified = Boolean(tag?.tagPresent && tag.keyMatches && tag.detectedSiteKey && !tag.scriptUnloadableReason);
  if (verified) return clean(tag!.detectedSiteKey, 120) || existing;
  // The page was READ and did not carry a working copy of this agency's tag:
  // absent, foreign, or a dead snippet. A definitive no, so the gate closes.
  if (tag?.reachable) return undefined;
  // No check at all, or the page could not be read — nothing was learned, so
  // nothing already earned is taken away.
  return existing;
}

/**
 * Record what a MAP run found.
 *
 * Separate from `saveDevProject` on purpose: mapping is a RESULT, not a field
 * somebody types, and routing it through the save path would let a crafted
 * request claim a project is tagged without a tag ever answering.
 *
 * A verified tag mints `aquaTagId` from the key the page actually carried —
 * which is what Ed means by "you connect it you have to press map then it
 * creates the aqua tag browser". A tag that does not answer never sets it; a
 * page that was read and did NOT carry it revokes it; an unreachable page
 * changes nothing, because a site that is briefly down is not a site that lost
 * its tag. The rule lives in `aquaTagIdFromCheck`.
 */
export function recordDevProjectMap(input: {
  agencyId: string;
  id: string;
  map: DevProjectMap;
  actorUserId: string;
}): DevProject | null {
  const existing = getDevProject(input.agencyId, input.id);
  if (!existing) return null;

  const updated: DevProject = {
    ...existing,
    aquaTagId: aquaTagIdFromCheck(input.map.tag, existing.aquaTagId),
    map: input.map,
    updatedBy: input.actorUserId,
    updatedAt: input.map.lastMappedAt,
  };
  mutate(state => { state.devProjects[updated.id] = updated; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "settings",
    action: "dev_project.mapped",
    message: `Mapped dev project ${updated.name}.`,
  });
  return updated;
}

/**
 * Record a TAG-ONLY check — "I have pasted the snippet, is it answering yet?"
 *
 * The same conclusion rule as a full Map (`aquaTagIdFromCheck`), and
 * deliberately NOT a second way to write the gate. What differs is what it
 * leaves alone: pressing Check it does not walk the repository, so the
 * repository half of the last Map, and the `lastMappedAt` that describes it,
 * are carried through untouched. Bumping that timestamp would make the card
 * claim the tree had been re-read when only one address had been fetched —
 * a small lie, but exactly the kind this screen exists to avoid.
 *
 * (`lastMappedAt` is only ever set from here when there was no Map at all, so
 * a project that has never been mapped still gets a coherent record.)
 */
export function recordDevProjectTagCheck(input: {
  agencyId: string;
  id: string;
  tag: DevProjectTagMap;
  actorUserId: string;
  now?: number;
}): DevProject | null {
  const existing = getDevProject(input.agencyId, input.id);
  if (!existing) return null;
  const now = input.now ?? Date.now();

  const updated: DevProject = {
    ...existing,
    aquaTagId: aquaTagIdFromCheck(input.tag, existing.aquaTagId),
    map: {
      repo: existing.map?.repo,
      tag: input.tag,
      lastMappedAt: existing.map?.lastMappedAt ?? now,
      lastMappedBy: existing.map?.lastMappedBy ?? input.actorUserId,
    },
    updatedBy: input.actorUserId,
    updatedAt: now,
  };
  mutate(state => { state.devProjects[updated.id] = updated; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "settings",
    action: "dev_project.tag_checked",
    message: `Checked the Aqua Tag on ${updated.name} — ${devProjectTagState(updated)}.`,
  });
  return updated;
}
