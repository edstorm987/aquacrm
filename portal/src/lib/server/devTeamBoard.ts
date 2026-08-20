import "server-only";
// Dev Team board — a LIVE "what we're working on" model, parsed straight off the
// shared docs the same way the launch-blocker strip is (`parseBlockers` in
// devDocs.ts). Two sources, two pure parsers:
//
//   • `## Workers in flight` in docs/context/state.md   → `parseWorkers`
//   • each docs/development/plans/*.md `**Status: …**`   → `parsePlanStatus`
//
// …plus a reuse of `scanBlockers()` for the blocked lane. Every parser is a
// pure function over markdown; each has a thin `scan*` wrapper that reads the
// real file(s) off disk. Read-only by contract — this module never writes, and
// (like devDocs.ts) all reads are confined to the repo `docs/` tree under
// `PROJECT_ROOT`. The gate lives on the page, not here (mirrors `scanBlockers`).

import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  PROJECT_ROOT,
  scanBlockers,
  type DevDocBlocker,
} from "@/lib/server/devDocs";

// state.md lives here; worker Plan links are relative to this directory.
const STATE_DOC_REL = "docs/context/state.md";
const STATE_DOC_DIR = "docs/context";
const PLANS_DIR_REL = "docs/development/plans";

// Status glyphs we surface as-is on the board (kept out of text cleaning).
const STATUS_MARKERS = ["✅", "🔴", "🟠", "🟡", "🐛", "⚠", "🎉"] as const;

// ---- shared shapes ---------------------------------------------------------

/** shipped = done · building = in flight · planned = ready-to-assign · blocked. */
export type StatusKind = "shipped" | "building" | "planned" | "blocked";
/** A worker's live state, as read from the in-flight table. */
export type WorkerStatusKind = "complete" | "building" | "blocked";

export interface DevTeamWorker {
  /** Cleaned worker name, e.g. "Radar worker", "(this chat) Commander". */
  name: string;
  /** True when the row name is struck through (~~…~~) — the doc's "done" mark. */
  done: boolean;
  /** First plan link text in the Plan cell (may be a bare filename). */
  planLabel?: string;
  /** Repo-relative path the FIRST Plan link resolves to — the display link. */
  planRelPath?: string;
  /**
   * Every plan the row owns, in cell order. A worker frequently carries two
   * plans (the Meta-inbox row owns meta-inbox-connect + internal-chat-attention),
   * and the reconciliation rule below has to reach ALL of them — otherwise the
   * worker's live status governs one plan and the other silently follows its own
   * (possibly stale) `**Status:` line.
   */
  planRelPaths: string[];
  /** The Plan cell carries a 🔴 launch-priority flag. */
  planFlagged: boolean;
  /** The row says the work was PARKED / PAUSED / put ON HOLD — stopped, not finished. */
  parked: boolean;
  /** Cleaned "Owns (files/areas)" cell. */
  owns: string;
  /** Cleaned Status cell (markdown stripped, emoji kept). */
  status: string;
  /** Status glyphs present in the row, for display. */
  markers: string[];
  statusKind: WorkerStatusKind;
}

export interface ParsedPlanStatus {
  /** Cleaned status text from the opening `**Status: …**`, emoji kept. */
  status: string;
  statusKind: StatusKind;
  markers: string[];
}

export interface PlanStatus extends ParsedPlanStatus {
  /** Repo-relative path, e.g. docs/development/plans/radar-upgrade.md — the id + link target. */
  relPath: string;
  /** Bare filename without extension, e.g. "radar-upgrade". */
  name: string;
  /** First heading, "Plan — " prefix trimmed; falls back to a humanised name. */
  title: string;
}

export interface DevTeamBoard {
  workers: DevTeamWorker[];
  planStatuses: PlanStatus[];
  blockers: DevDocBlocker[];
  scannedAtMs: number;
}

/** One card in a lane, already resolved to a Library link target. */
export interface BoardItem {
  kind: "plan" | "worker" | "blocker";
  title: string;
  detail?: string;
  /** Repo-relative doc to open in the Library; undefined = not linkable. */
  relPath?: string;
  statusKind: StatusKind;
  markers: string[];
}

export interface BoardLanes {
  inFlight: BoardItem[];
  shipped: BoardItem[];
  blocked: BoardItem[];
  readyNext: BoardItem[];
}

// ---- text helpers ----------------------------------------------------------

/** Strip markdown chrome from a table cell / status string; keep emoji + words. */
function cleanInline(s: string): string {
  return s
    .replace(/\\\|/g, "|") // un-escape table pipes
    .replace(/~~/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](href) → text
    .replace(/[`*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function humaniseName(base: string): string {
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function markersIn(s: string): string[] {
  return STATUS_MARKERS.filter(m => s.includes(m));
}

/** First ATX heading in a doc, "Plan — "/"Plan: " prefix trimmed; null if none. */
function firstHeading(md: string): string | null {
  for (const raw of md.split(/\r?\n/)) {
    const m = /^#{1,3}\s+(.+?)\s*#*$/.exec(raw.trim());
    if (m) return cleanInline(m[1]).replace(/^plan\s*[—:-]\s*/i, "").trim() || null;
  }
  return null;
}

/**
 * Resolve a doc-relative href to a repo-relative posix path, e.g.
 * ("docs/context", "../development/plans/x.md") → "docs/development/plans/x.md".
 * Pure string maths — never touches the filesystem, so it cannot escape.
 */
function resolveDocHref(fromDir: string, href: string): string {
  const clean = href.split("#")[0].split("?")[0].trim();
  const stack = clean.startsWith("/") ? [] : fromDir.split("/").filter(Boolean);
  for (const seg of clean.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}

/** Split one markdown table row into trimmed cells, honouring `\|` escapes. */
function splitRow(row: string): string[] {
  const parts = row.split(/(?<!\\)\|/);
  if (parts.length && parts[0].trim() === "") parts.shift();
  if (parts.length && parts[parts.length - 1].trim() === "") parts.pop();
  return parts.map(c => c.trim());
}

// ---- workers ---------------------------------------------------------------

/**
 * Parked = the work STOPPED, which is not the same as finished. A parked row
 * usually still reads "✅ Phase N complete", so without this it classifies as
 * `complete` and drags a not-built plan into the Shipped lane (mfa-login did
 * exactly that: "✅ Phase 4 complete — PARKED by Ed" while its plan file, and
 * the code, still say the login gate is not wired).
 */
function isParked(rawStatus: string): boolean {
  return /\bPARKED\b|\bPAUSED\b|\bON HOLD\b|\bHELD OFF\b/i.test(rawStatus);
}

function classifyWorker(rawStatus: string, done: boolean): WorkerStatusKind {
  // Open trouble in the status cell wins over a "done" strike — the doc strikes
  // a worker through when its code lands, yet still flags a live 🔴 hold.
  if (
    rawStatus.includes("🔴") ||
    /\b(REWORK|LAUNCH BLOCKER)\b/i.test(rawStatus) ||
    /\bNOT\s+(DONE|LAUNCH)/i.test(rawStatus) ||
    /privilege escalation/i.test(rawStatus)
  ) {
    return "blocked";
  }
  if (done || (/✅/.test(rawStatus) && /\b(COMPLETE|SHIPPED|DONE|BUILT)\b/i.test(rawStatus))) {
    return "complete";
  }
  return "building";
}

/**
 * Parse the `## Workers in flight` table from state.md. Rows may be separated
 * by blank lines and the section ends at the next heading; the header + `---`
 * separator + trailing `⚠ …` notes (which don't start with `|`) are skipped.
 */
export function parseWorkers(markdown: string): DevTeamWorker[] {
  const out: DevTeamWorker[] = [];
  let inSection = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const heading = /^(#{2,4})\s+(.+?)\s*#*$/.exec(raw);
    if (heading) {
      inSection = /^workers in flight\b/i.test(heading[2].trim());
      continue;
    }
    if (!inSection) continue;
    const line = raw.trim();
    if (!line.startsWith("|")) continue; // blank lines + ⚠ prose notes
    const cells = splitRow(line);
    if (cells.length < 2) continue;
    if (/^:?-+:?$/.test(cells[0])) continue; // |---| separator
    if (cells[0].replace(/[*`~ ]/g, "").toLowerCase() === "worker") continue; // header

    const rawName = cells[0] ?? "";
    const rawPlan = cells[1] ?? "";
    const rawOwns = cells[2] ?? "";
    const rawStatus = cells[3] ?? "";

    const name = cleanInline(rawName).replace(/[⭐🆕]/g, "").replace(/\s+/g, " ").trim();
    // EVERY link in the Plan cell, not just the first — a row that owns two
    // plans owns both of them for reconciliation purposes.
    const links = [...rawPlan.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    const planRelPaths = [...new Set(links.map(l => resolveDocHref(STATE_DOC_DIR, l[2])).filter(Boolean))];
    const link = links[0];
    const planRelPath = planRelPaths[0];
    const done = /~~/.test(rawName);

    out.push({
      name,
      done,
      planLabel: link ? cleanInline(link[1]) : undefined,
      planRelPath,
      planRelPaths,
      planFlagged: rawPlan.includes("🔴"),
      parked: isParked(rawStatus),
      owns: cleanInline(rawOwns),
      status: cleanInline(rawStatus),
      markers: markersIn(rawStatus),
      statusKind: classifyWorker(rawStatus, done),
    });
  }
  return out;
}

/** Read state.md and parse its in-flight table. Gate-free (page gates). */
export async function scanWorkers(): Promise<DevTeamWorker[]> {
  try {
    const raw = await readFile(join(PROJECT_ROOT, STATE_DOC_REL), "utf8");
    return parseWorkers(raw);
  } catch {
    return [];
  }
}

// ---- plan statuses ---------------------------------------------------------

/** The verdict clause of a status line — up to the first " — " or ";". */
function headOf(text: string): string {
  return text.split(/\s+[—–-]{1,2}\s+|;/)[0].trim();
}

function classifyPlanStatus(text: string): StatusKind {
  const s = text.toLowerCase();
  // Superseded / absorbed — the work lives on under another plan, so it is
  // neither in flight nor waiting to be assigned. Checked FIRST: these lines
  // often also carry a ✅ (the substrate shipped) or name a blocked successor,
  // and without this they fell through to "building" and sat in the In-flight
  // lane forever.
  if (/\bsuperseded\b|\babsorbed\b|⤳/.test(s) || /\bsuperseded\b/.test(text.toLowerCase())) return "shipped";
  // Blocked — an explicit red flag beats everything.
  if (/🔴/.test(text) || (/\bblocked\b/.test(s) && !/\bunblocked\b/.test(s))) return "blocked";
  // Planned — a "PLAN"/"not built" line, checked before "built/shipped" so a
  // negated "not built" can't read as done.
  const notBuilt = /\bnot\s+(yet\s+)?(built|started|wired|done|finished)\b/.test(s);
  // "awaiting" / "pending" / "greenfield" only mean "nobody has built this yet"
  // when the line carries no completion evidence. "✅ SHIPPED — all 6 phases;
  // awaiting commander browser-verify" is finished work waiting on a check, not
  // work waiting to be assigned, and dropping it into Ready next ("Planned,
  // ready to assign") sends a worker at something that only needs verifying.
  //
  // The verdict is the HEAD of the status line — everything after the first
  // dash / semicolon is elaboration ("— all 6 phases; awaiting sign-off"), so
  // reading evidence out of the head keeps "Greenfield — nothing built yet"
  // from counting the word "built" as proof of completion.
  const head = headOf(text);
  const headLower = head.toLowerCase();
  const completed =
    !notBuilt &&
    !/\b(not|nothing|none|never|no)\b/.test(headLower) &&
    (/✅/.test(head) || /\b(shipped|complete|completed|built|fixed)\b/.test(headLower));
  const unstarted = /\bawaiting\b/.test(s) || /\bpending\b/.test(s) || /\bgreenfield\b/.test(s);
  if (/^plan\b/.test(s) || notBuilt || (unstarted && !completed)) {
    return "planned";
  }
  // Shipped / complete.
  if (/✅/.test(text) || /\b(shipped|complete|done|built)\b/.test(s)) return "shipped";
  return "building";
}

/**
 * Parse the opening `**Status: …**` of one plan doc. Two markdown idioms are
 * in use across the plans and BOTH have to parse, or the plan drops out of the
 * board entirely (no card, no lane count, no roadmap status) with no error:
 *
 *   • value INSIDE the bold span — `**Status: ✅ SHIPPED — …**`. The span can
 *     WRAP across lines (aqua-tag, public-bucket), hence `[\s\S]*?`.
 *   • bold LABEL, value after it — `**Status:** ✅ SHIPPED — …`. Here the
 *     non-greedy span above captures the empty string between `:` and `**`, so
 *     the rest of that same line is the real value.
 *
 * Null only when there is no `**Status:` at all, or it carries no text.
 */
export function parsePlanStatus(markdown: string): ParsedPlanStatus | null {
  const rawValue = firstStatusValue(markdown);
  if (rawValue === null) return null;
  const status = cleanInline(rawValue);
  if (!status) return null;
  return { status, statusKind: classifyPlanStatus(rawValue), markers: markersIn(rawValue) };
}

/** The raw text of the first usable `**Status:` in a doc; null if there is none. */
function firstStatusValue(markdown: string): string | null {
  const inside = /\*\*status:\s*([\s\S]*?)\*\*/i.exec(markdown);
  // `**Status:** value` — bold label, value on the remainder of the line.
  const after = /\*\*status:\*\*[ \t]*(.+)/i.exec(markdown);
  const insideOk = inside && cleanInline(inside[1]) ? inside : null;
  const afterOk = after && cleanInline(after[1]) ? after : null;
  // Whichever real value appears first in the doc is "the opening status".
  if (insideOk && afterOk) return insideOk.index <= afterOk.index ? insideOk[1] : afterOk[1];
  if (insideOk) return insideOk[1];
  if (afterOk) return afterOk[1];
  return inside ? inside[1] : null;
}

/**
 * Read every `docs/development/plans/*.md` and return those with a `**Status:`
 * line. Confined to the fixed plans dir (names come from `readdir`, not a
 * caller), and each file re-checked to live under it. Gate-free (page gates).
 */
export async function scanPlanStatuses(): Promise<PlanStatus[]> {
  const dirAbs = join(PROJECT_ROOT, PLANS_DIR_REL);
  let names: string[];
  try {
    names = await readdir(dirAbs);
  } catch {
    return [];
  }
  const mdNames = names.filter(n => n.toLowerCase().endsWith(".md")).sort();

  const built = await Promise.all(
    mdNames.map(async (fileName): Promise<PlanStatus | null> => {
      try {
        const md = await readFile(join(dirAbs, fileName), "utf8");
        const parsed = parsePlanStatus(md);
        if (!parsed) return null;
        const name = basename(fileName).replace(/\.md$/i, "");
        return {
          ...parsed,
          relPath: `${PLANS_DIR_REL}/${fileName}`,
          name,
          title: firstHeading(md) ?? humaniseName(name),
        };
      } catch {
        return null;
      }
    }),
  );
  return built.filter((p): p is PlanStatus => p !== null);
}

// ---- whole board + lanes ---------------------------------------------------

/** Read all three sources at once (gate-free — the page gates before calling). */
export async function scanDevTeamBoard(): Promise<DevTeamBoard> {
  const [workers, planStatuses, blockers] = await Promise.all([
    scanWorkers(),
    scanPlanStatuses(),
    scanBlockers(),
  ]);
  return { workers, planStatuses, blockers, scannedAtMs: Date.now() };
}

/**
 * Compose the four lanes. The workers table is the LIVE truth and reconciles
 * over each plan file's own (sometimes stale) `**Status:` line: a plan whose
 * worker is complete counts as shipped even if its file still says "PLAN", and
 * a worker in trouble drags its plan into Blocked. Open blockers head the
 * Blocked lane; a no-plan worker row (e.g. the Commander) shows on its own.
 */
export function composeLanes(board: DevTeamBoard): BoardLanes {
  const lanes: BoardLanes = { inFlight: [], shipped: [], blocked: [], readyNext: [] };
  const laneFor = (kind: StatusKind): BoardItem[] =>
    kind === "shipped" ? lanes.shipped
      : kind === "planned" ? lanes.readyNext
      : kind === "blocked" ? lanes.blocked
      : lanes.inFlight;

  // Index workers by EVERY plan they own (first row wins per plan). A row that
  // links two plans reconciles both — the live worker status is the truth for
  // all of its work, not just the first link in the cell.
  const workerByPlan = new Map<string, DevTeamWorker>();
  for (const w of board.workers) {
    for (const rel of w.planRelPaths) {
      if (!workerByPlan.has(rel)) workerByPlan.set(rel, w);
    }
  }

  const reconcile = (planKind: StatusKind, w?: DevTeamWorker): StatusKind => {
    if (!w) return planKind;
    // Trouble always wins, parked or not.
    if (w.statusKind === "blocked") return "blocked";
    // Parked: the worker stopped, so its row is no longer the live word on
    // whether the plan is DONE. Fall back to the plan file's own status rather
    // than reading "✅ Phase N complete" as a shipped plan.
    if (w.parked) return planKind;
    if (w.statusKind === "complete") return "shipped";
    return "building";
  };

  const placedPlans = new Set<string>();
  for (const p of board.planStatuses) {
    const w = workerByPlan.get(p.relPath);
    const kind = reconcile(p.statusKind, w);
    placedPlans.add(p.relPath);
    laneFor(kind).push({
      kind: "plan",
      title: p.title,
      // A worker on the plan is the live word; fall back to the plan's own line.
      // A PARKED worker is neither: the plan's line decided the lane, so lead
      // with it and keep the parked note so the card explains itself.
      detail: !w ? p.status : w.parked ? `${p.status} · Worker parked: ${w.status}` : w.status,
      relPath: p.relPath,
      statusKind: kind,
      markers: (w ? w.markers : p.markers),
    });
  }

  // Workers with no plan we've already placed (e.g. Commander, plan cell "—").
  for (const w of board.workers) {
    // Placed under ANY of its plans — the worker is already represented.
    if (w.planRelPaths.some(rel => placedPlans.has(rel))) continue;
    // A parked row has no plan file to defer to, so it lands in Ready-next:
    // not in flight (nobody is on it), not shipped (it stopped early), not
    // blocked (nothing is wrong) — waiting to be picked back up.
    const kind: StatusKind =
      w.statusKind === "blocked" ? "blocked"
        : w.parked ? "planned"
        : w.statusKind === "complete" ? "shipped"
        : "building";
    laneFor(kind).push({
      kind: "worker",
      title: w.name,
      detail: w.status || w.owns,
      relPath: w.planRelPath,
      statusKind: kind,
      markers: w.markers,
    });
  }

  // Open launch blockers are authoritative — put them at the top of Blocked.
  const blockerItems: BoardItem[] = board.blockers
    .filter(b => !b.resolved)
    .map(b => ({
      kind: "blocker" as const,
      title: b.label,
      detail: b.detail,
      relPath: STATE_DOC_REL,
      statusKind: "blocked" as const,
      markers: ["🔴"],
    }));
  lanes.blocked.unshift(...blockerItems);

  return lanes;
}
