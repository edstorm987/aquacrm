import "server-only";

import { readFile, readdir, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PROJECT_ROOT } from "@/lib/server/dev/devDocs";
import { localDay } from "@/lib/server/dev/devLocalTime";
import { scanPlanStatuses, type PlanStatus } from "@/lib/server/dev/devTeamBoard";
import { scanTasks, type DevTask } from "@/lib/server/dev/devTeamTasks";
import { scanWorkerSignals } from "@/lib/server/dev/devTeamWorkers";

// The ROADMAP — the outer view.
//
// Everything else in this console looks inward at one level: findings are
// symptoms, plans are documents, phases are steps, tasks are what a worker is
// on. None of them answer the question you ask from the outside: **what is
// coming, and when.**
//
// A roadmap ITEM is an outcome — a feature or capability, in Ed's words. It
// owns zero or more plans; each plan has phases; each phase is a task. So the
// chain is one thing at four zoom levels:
//
//     roadmap item  →  plans  →  phases  →  tasks
//
// Progress is never typed twice: an item's percentage is COMPUTED from the
// tasks under its plans, and "who's on it" comes from live worker check-ins.
// The only things a human writes are the outcome, the horizon, and the date.
//
// Stored as `docs/development/roadmap.md` — one markdown file, the same
// markdown-as-database shape as plans and findings, so it is greppable, shows
// up in the Library, is readable by workers, and outlives this console.

/**
 * The file.
 *
 * Read through a function, not a module-level const, so a test can point the
 * REAL write path at a temp copy. Without that, the only way to exercise
 * addItem/updateItem/removeItem was to mutate the roadmap every worker in this
 * tree is reading — and a killed test process, or any legitimate write landing
 * inside the snapshot/restore window, silently reverted somebody's work.
 */
export function roadmapPath(): string {
  return process.env.PORTAL_ROADMAP_FILE || join(PROJECT_ROOT, "docs", "development", "roadmap.md");
}

export const ROADMAP_REL_PATH = "docs/development/roadmap.md";

export type Horizon = "now" | "next" | "later" | "someday" | "shipped";
export type ItemStatus = "idea" | "planned" | "building" | "shipped" | "parked";
export type ItemSize = "S" | "M" | "L" | "XL";

export const HORIZONS: { value: Horizon; label: string; hint: string }[] = [
  { value: "now", label: "Now", hint: "In flight — someone is on it" },
  { value: "next", label: "Next", hint: "Queued — starts when a slot frees" },
  { value: "later", label: "Later", hint: "After launch" },
  { value: "someday", label: "Someday", hint: "Ideas and requests, undated" },
  { value: "shipped", label: "Shipped", hint: "Done and verified" },
];

export const SIZES: { value: ItemSize; label: string; days: number }[] = [
  { value: "S", label: "S — about a day", days: 1 },
  { value: "M", label: "M — a few days", days: 3 },
  { value: "L", label: "L — about a week", days: 7 },
  { value: "XL", label: "XL — multi-week", days: 21 },
];

export const STATUSES: ItemStatus[] = ["idea", "planned", "building", "shipped", "parked"];

export interface RoadmapItem {
  /** Stable id — written into the file, so it survives a retitle. */
  id: string;
  title: string;
  horizon: Horizon;
  status: ItemStatus;
  /** `YYYY-MM-DD` or `YYYY-MM` (a month is honest when a day would be a guess). */
  target?: string;
  size?: ItemSize;
  /** Worker(s) or person expected to do it. */
  owner?: string;
  /** `YYYY-MM-DD` this landed on the roadmap. */
  added?: string;
  shippedOn?: string;
  /** Why it is worth doing — the one line that justifies the item. */
  why?: string;
  /** Plan file names (no extension) that deliver this item. */
  plans: string[];
  /** Where it came from: `ed`, `finding:<slug>`, `worker:<name>`. */
  source?: string;
  /**
   * The files this outcome owns.
   *
   * With Claude AND Codex workers running against ONE uncommitted tree, two
   * agents in the same file destroys work with no git to recover from. So an
   * item carries its own file map and the console can answer, before anything
   * is handed out, whether two pieces of work collide.
   */
  files?: string[];
  /** Free markdown kept verbatim under the item. */
  notes?: string;
}

/** An item joined to live plan/task/worker signal — what the UI renders. */
export interface RoadmapItemView extends RoadmapItem {
  planLinks: {
    name: string;
    relPath?: string;
    title: string;
    exists: boolean;
    /** Shipped and moved to plans/archive/ — off the board, still linked. */
    archived?: boolean;
    status?: string;
    done: number;
    total: number;
    tasks: DevTask[];
  }[];
  done: number;
  total: number;
  pct: number;
  /**
   * Plan names on this item that point at no plan file.
   *
   * A missing plan contributes 0/0, so it neither lowers the percentage nor
   * shows up anywhere: an item on `['real-plan' (2/2), 'typo']` renders a full
   * green bar and "2/2 tasks" while half the outcome is unaccounted for. The
   * count has to travel with the view so the COLLAPSED card and the schedule
   * can say so — the existing warning is buried inside the expanded panel.
   */
  missingPlans: string[];
  /** Workers checked in against one of this item's plans, right now. */
  workers: string[];
  /** Days until the target (negative = overdue); undefined when undated. */
  dueInDays?: number;
}

export interface Roadmap {
  items: RoadmapItemView[];
  byHorizon: Record<Horizon, RoadmapItemView[]>;
  /** Dated, unshipped items in date order — the actual schedule. */
  schedule: RoadmapItemView[];
  overdue: RoadmapItemView[];
  counts: Record<Horizon, number>;
  generatedAtMs: number;
}

// ---- text helpers ----------------------------------------------------------

function clean(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * A value that has to ride the ` · `-joined meta line.
 *
 * The pair scanner reads a value as `[^·]*`, so a `·` INSIDE one silently
 * truncates it on the next read: `**Owner:** alice · bob` comes back as
 * `alice` and "bob" is gone, with no error anywhere. Owner and source are free
 * text, so the separator has to be taken out of the value rather than trusted
 * not to appear in it.
 */
function metaValue(value: string): string {
  return value.replace(/·/g, "-").replace(/[ \t]+/g, " ").trim();
}

/**
 * Plan names, cleaned, `.md`-stripped, de-duplicated case-insensitively and
 * capped.
 *
 * A repeated name is not harmless: buildRoadmap builds one planLink per entry
 * and SUMS them, so `plans: ['a','a','A']` printed a 2-phase plan as "6/6
 * tasks" — an impossible total on the one surface whose whole promise is that
 * it cannot drift — and rendered three <li> under two colliding React keys.
 * The AddItem field splits on comma with no dedupe, so this is one typo away.
 */
function cleanPlans(plans: readonly string[], max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of plans) {
    const name = clean(raw, 80).replace(/\.md$/i, "");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

/** Strip the markdown that would otherwise round-trip into a value. */
function plain(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/[`*]+/g, "")
    .trim();
}

export function itemId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

/** Accept a day or a month; reject anything else rather than storing nonsense. */
export function normaliseTarget(value: string | undefined): string | undefined {
  const v = clean(value ?? "", 10);
  if (!v) return undefined;
  if (!DATE_RE.test(v)) throw new Error("A target must be a date like 2026-09-04, or a month like 2026-09.");
  return v;
}

function isHorizon(value: string): value is Horizon {
  return HORIZONS.some(h => h.value === value);
}

function isStatus(value: string): value is ItemStatus {
  return (STATUSES as string[]).includes(value);
}

function isSize(value: string): value is ItemSize {
  return SIZES.some(s => s.value === value);
}

// Local day stamps, shared with findings and plans — see devLocalTime.
const todayIso = localDay;


/**
 * Days from `now` to a target. A month-only target means "by the end of that
 * month" — the honest reading, and it stops `2026-09` reading as overdue on
 * the 2nd of September.
 */
export function daysUntil(target: string, now: number): number {
  const end = targetInstant(target);
  if (Number.isNaN(end)) return 0;
  const startOfToday = Date.parse(`${todayIso(now)}T00:00:00Z`);
  return Math.round((end - startOfToday) / 86_400_000);
}

/**
 * The instant a target actually falls due — the ONLY safe thing to sort by.
 *
 * Sorting the raw string put `2026-09` above `2026-09-04`, because it sorts
 * first lexically while falling due 26 days LATER. The schedule strip then
 * printed "end of Sep · in 6 weeks" ABOVE "4 Sep · in 15 days" — a list whose
 * whole job is to say what is next, contradicting the countdown beside it.
 */
export function targetInstant(target: string): number {
  return target.length === 7
    ? Date.UTC(Number(target.slice(0, 4)), Number(target.slice(5, 7)), 0)
    : Date.parse(`${target}T00:00:00Z`);
}

/** Ascending by when it is due, then by title so the order is stable. */
function byDue(a: RoadmapItemView, b: RoadmapItemView): number {
  return targetInstant(a.target!) - targetInstant(b.target!) || a.title.localeCompare(b.title);
}

// ---- parse -----------------------------------------------------------------

/**
 * Read items out of the roadmap markdown. The format is deliberately plain so
 * it can be hand-edited in the Library without breaking the parser:
 *
 *     ## Now
 *     ### Item title
 *     **Id:** slug · **Status:** building · **Target:** 2026-08-22 · **Size:** M
 *     **Plans:** plan-one, plan-two
 *     **Why:** one line
 *
 *     free notes…
 *
 * The `##` section sets the horizon, so moving an item's block by hand into
 * another section means exactly what it looks like it means.
 */
export function parseRoadmap(markdown: string): RoadmapItem[] {
  return parseRoadmapDoc(markdown).items;
}

/**
 * The whole document — items PLUS the header a human wrote above them.
 *
 * `renderRoadmap` regenerates the file from scratch on every write, so anything
 * the parser does not capture is destroyed by the next unrelated edit. The page
 * tells Ed the roadmap is his to hand-edit in the Library, so the header he
 * types there has to survive somebody ticking a status an hour later.
 */
export function parseRoadmapDoc(markdown: string): { preamble?: string; items: RoadmapItem[] } {
  const items: RoadmapItem[] = [];
  let horizon: Horizon = "someday";
  let current: RoadmapItem | null = null;
  let noteLines: string[] = [];
  const preambleLines: string[] = [];
  let inPreamble = true;

  const finish = () => {
    if (!current) return;
    const notes = noteLines.join("\n").trim();
    if (notes) current.notes = notes;
    items.push(current);
    current = null;
    noteLines = [];
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");

    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      finish();
      inPreamble = false;
      const title = clean(plain(heading[1]), 120);
      current = { id: itemId(title), title, horizon, status: "idea", plans: [] };
      continue;
    }

    const section = /^##\s+(.+?)\s*$/.exec(line);
    if (section) {
      finish();
      inPreamble = false;
      const word = plain(section[1]).toLowerCase().split(/[^a-z]+/).find(Boolean) ?? "";
      if (isHorizon(word)) horizon = word;
      continue;
    }

    if (inPreamble) { preambleLines.push(line); continue; }

    if (!current) continue;

    // A horizontal rule is the section separator this file renders between
    // horizons — never content. Swallowing it into the last item's notes would
    // make the file grow a `---` on every single write.
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) continue;

    // `**Why:**` and `**Plans:**` own their whole line — they contain commas
    // and punctuation the pair-scanner would chop.
    const why = /^\*\*Why:\*\*\s*(.+)$/i.exec(line);
    if (why) { current.why = clean(plain(why[1]), 400); continue; }

    const files = /^\*\*Files?:\*\*\s*(.+)$/i.exec(line);
    if (files) {
      // NOT plain() — that strips `*` as markdown emphasis, which would eat the
      // `**` out of a `src/app/portal/x/**` glob and silently widen the claim.
      current.files = files[1]
        .split(",")
        .map(f => clean(f, 200))
        .filter(Boolean);
      continue;
    }

    const plans = /^\*\*Plans?:\*\*\s*(.+)$/i.exec(line);
    if (plans) {
      // No cap on READ — a hand-edited file with more than the write cap must
      // not lose the overflow just by being opened.
      current.plans = cleanPlans(plain(plans[1]).split(","), Number.MAX_SAFE_INTEGER);
      continue;
    }

    if (/^\*\*[A-Za-z ]+:\*\*/.test(line)) {
      // A bold-lead line is only META if it actually carries a key we know.
      // Otherwise it is note prose — "**Blocked by:** the auth rewrite lands
      // first" is exactly what a person writes in the Library — and swallowing
      // it here deleted it on the next write to ANY item.
      let matchedKnownKey = false;
      const pairRe = /\*\*([A-Za-z ]+):\*\*\s*([^·]*)/g;
      let pair: RegExpExecArray | null;
      while ((pair = pairRe.exec(line))) {
        const key = pair[1].trim().toLowerCase();
        const value = clean(plain(pair[2]), 120);
        if (!value) continue;
        const lower = value.toLowerCase();
        const before = matchedKnownKey;
        if (key === "id") current.id = itemId(value);
        else if (key === "status" && isStatus(lower)) current.status = lower;
        else if (key === "horizon" && isHorizon(lower)) current.horizon = lower;
        else if (key === "target" && DATE_RE.test(value)) current.target = value;
        else if (key === "size" && isSize(value.toUpperCase())) current.size = value.toUpperCase() as ItemSize;
        else if (key === "owner") current.owner = value;
        else if (key === "added" && DATE_RE.test(value)) current.added = value;
        else if (key === "shipped" && DATE_RE.test(value)) current.shippedOn = value;
        else if (key === "source") current.source = value;
        else continue;
        matchedKnownKey = true;
        void before;
      }
      if (!matchedKnownKey) noteLines.push(line);
      continue;
    }

    noteLines.push(line);
  }
  finish();

  // Ids must be unique — a duplicate would make two items answer to one edit.
  const seen = new Set<string>();
  for (const item of items) {
    const base = item.id || itemId(item.title) || "item";
    let id = base;
    let n = 2;
    while (seen.has(id)) id = `${base}-${n++}`;
    item.id = id;
    seen.add(id);
  }

  // Drop the trailing blank lines and the `---` rule this file renders between
  // the header and the first horizon — they are separators, not the header, and
  // keeping them would grow one more `---` on every single write.
  while (preambleLines.length) {
    const last = preambleLines[preambleLines.length - 1];
    if (!last.trim() || /^\s*([-*_])\s*(\1\s*){2,}$/.test(last)) preambleLines.pop();
    else break;
  }
  const preamble = preambleLines.join("\n").trim();

  return { preamble: preamble || undefined, items };
}

// ---- render ----------------------------------------------------------------

const PREAMBLE = `# Roadmap

← [state.md](../context/state.md) · [todo.md](todo.md) · **The outer view — what is coming, and when.**

_Written and edited from the Dev Console (\`/portal/dev-team/roadmap\`). Each item is an
OUTCOME; the plans under it are how it gets built, and their phases are the tasks. Progress
is computed from those tasks — never typed here — so this file cannot drift on its own._

**Horizons:** \`Now\` in flight · \`Next\` queued · \`Later\` after launch · \`Someday\` ideas and
requests · \`Shipped\` done.
`;

function renderItem(item: RoadmapItem): string {
  const meta = [
    `**Id:** ${item.id}`,
    `**Status:** ${item.status}`,
    item.target ? `**Target:** ${item.target}` : "",
    item.size ? `**Size:** ${item.size}` : "",
    item.owner ? `**Owner:** ${metaValue(item.owner)}` : "",
    item.added ? `**Added:** ${item.added}` : "",
    item.shippedOn ? `**Shipped:** ${item.shippedOn}` : "",
    item.source ? `**Source:** ${metaValue(item.source)}` : "",
  ].filter(Boolean).join(" · ");

  const lines = [`### ${item.title}`, meta];
  if (item.plans.length) lines.push(`**Plans:** ${item.plans.join(", ")}`);
  if (item.files?.length) lines.push(`**Files:** ${item.files.join(", ")}`);
  if (item.why) lines.push(`**Why:** ${item.why}`);
  if (item.notes) lines.push("", item.notes.trim());
  return lines.join("\n");
}

export function renderRoadmap(items: RoadmapItem[], preamble?: string): string {
  const order: Horizon[] = ["now", "next", "later", "someday", "shipped"];
  const sections = order.map(horizon => {
    const meta = HORIZONS.find(h => h.value === horizon)!;
    const mine = items.filter(i => i.horizon === horizon);
    const body = mine.length ? mine.map(renderItem).join("\n\n") : "_Nothing here yet._";
    return `## ${meta.label}\n_${meta.hint}._\n\n${body}`;
  });
  // Whatever the file already said above the first horizon wins over the
  // built-in header — the constant is the seed for a file that has none, not a
  // thing that overwrites what a person wrote.
  const head = preamble?.trim() || PREAMBLE.trim();
  return `${head}\n\n---\n\n${sections.join("\n\n---\n\n")}\n`;
}

// ---- read / write ----------------------------------------------------------

/** The document as written — items and the header above them. */
async function readDoc(): Promise<{ preamble?: string; items: RoadmapItem[] }> {
  try {
    return parseRoadmapDoc(await readFile(roadmapPath(), "utf8"));
  } catch {
    return { items: [] };
  }
}

export async function readItems(): Promise<RoadmapItem[]> {
  return (await readDoc()).items;
}

async function writeItems(items: RoadmapItem[], preamble?: string): Promise<void> {
  const path = roadmapPath();
  await mkdir(dirname(path), { recursive: true });
  // Temp file + rename: a crash mid-write leaves the previous roadmap intact
  // rather than a half-rendered one.
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, renderRoadmap(items, preamble), "utf8");
  await rename(temp, path);
}

/**
 * One writer at a time.
 *
 * Every mutation is read-modify-write over the WHOLE file, so two that overlap
 * lose one — and the loser still resolves with the item it believes it saved,
 * so the UI shows success and then quietly renders a roadmap without it.
 * Proven: `Promise.all([addItem(A), addItem(B)])` moved the count by one, not
 * two, with both calls resolving happily. Two browser tabs, or a worker's
 * `linkPlan` landing while a status edit saves, is all it takes.
 *
 * A process-level queue is enough here — single process, founder-only console —
 * and is far less to get wrong than file locking.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function serialise<T>(run: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(run, run);
  // Keep the chain alive whether or not this link rejected.
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

// ---- the live view ---------------------------------------------------------

/**
 * Join the written items to what is actually happening: plan files, their
 * phases, and worker check-ins. Nothing here trusts a hand-typed percentage —
 * an item is exactly as done as its tasks are.
 */
export async function buildRoadmap(now = Date.now()): Promise<Roadmap> {
  const [items, planFiles, archivedFiles, planStatuses, planTasks, signals] = await Promise.all([
    readItems(),
    // The plan FILES are the truth about existence: `scanPlanStatuses` only
    // returns plans carrying a `**Status:` line and `scanTasks` only those with
    // phases, so a real handoff doc would otherwise read as a typo.
    readdir(join(PROJECT_ROOT, "docs", "development", "plans")).catch((): string[] => []),
    // Shipped plans move to plans/archive/ so the BOARD stops carrying them —
    // but the roadmap still links to them from its Shipped lane, so existence
    // has to be checked in both places.
    readdir(join(PROJECT_ROOT, "docs", "development", "plans", "archive")).catch((): string[] => []),
    scanPlanStatuses().catch((): PlanStatus[] => []),
    scanTasks().catch(() => []),
    scanWorkerSignals().catch(() => null),
  ]);

  const fileNames = new Set(
    planFiles.filter(n => n.toLowerCase().endsWith(".md")).map(n => n.slice(0, -3).toLowerCase()),
  );
  const archivedNames = new Set(
    archivedFiles.filter(n => n.toLowerCase().endsWith(".md")).map(n => n.slice(0, -3).toLowerCase()),
  );
  const statusByName = new Map(planStatuses.map(p => [p.name.toLowerCase(), p]));
  const tasksByName = new Map(planTasks.map(p => [p.planName.toLowerCase(), p]));
  const checkIns = signals?.checkIns ?? [];

  const views: RoadmapItemView[] = items.map(item => {
    const planLinks = item.plans.map(name => {
      const key = name.toLowerCase();
      const status = statusByName.get(key);
      const tasks = tasksByName.get(key);
      return {
        name,
        relPath: status?.relPath ?? tasks?.planRelPath
          ?? (fileNames.has(key) ? `docs/development/plans/${name}.md` : undefined)
          ?? (archivedNames.has(key) ? `docs/development/plans/archive/${name}.md` : undefined),
        title: status?.title ?? tasks?.planTitle ?? name.replace(/[-_]+/g, " "),
        exists: fileNames.has(key) || archivedNames.has(key) || Boolean(status || tasks),
        archived: archivedNames.has(key) && !fileNames.has(key),
        status: status?.status,
        done: tasks?.done ?? 0,
        total: tasks?.total ?? 0,
        tasks: tasks?.tasks ?? [],
      };
    });

    const total = planLinks.reduce((n, p) => n + p.total, 0);
    const done = planLinks.reduce((n, p) => n + p.done, 0);
    // An item with no phased plan still reads honestly: shipped = 100%, and
    // anything else = 0% rather than a fabricated number.
    const pct = total > 0
      ? Math.round((done / total) * 100)
      : item.status === "shipped" ? 100 : 0;

    const names = new Set(item.plans.map(p => p.toLowerCase()));
    const workers = checkIns
      .filter(c => c.plan && names.has(c.plan.toLowerCase()) && !/^done$/i.test(c.phase ?? ""))
      .map(c => c.name);

    return {
      ...item,
      planLinks,
      done,
      total,
      pct,
      missingPlans: planLinks.filter(p => !p.exists).map(p => p.name),
      workers,
      dueInDays: item.target ? daysUntil(item.target, now) : undefined,
    };
  });

  const byHorizon = { now: [], next: [], later: [], someday: [], shipped: [] } as Record<Horizon, RoadmapItemView[]>;
  for (const view of views) byHorizon[view.horizon].push(view);

  // Within a horizon: dated first (soonest first), then by title.
  for (const horizon of Object.keys(byHorizon) as Horizon[]) {
    byHorizon[horizon].sort((a, b) => {
      if (horizon === "shipped") return (b.shippedOn ?? "").localeCompare(a.shippedOn ?? "");
      if (a.target && b.target) return byDue(a, b);
      if (a.target) return -1;
      if (b.target) return 1;
      return a.title.localeCompare(b.title);
    });
  }

  const schedule = views
    .filter(v => v.target && v.status !== "shipped")
    .sort(byDue);

  return {
    items: views,
    byHorizon,
    schedule,
    overdue: schedule.filter(v => (v.dueInDays ?? 0) < 0),
    counts: (Object.keys(byHorizon) as Horizon[]).reduce((acc, h) => {
      acc[h] = byHorizon[h].length;
      return acc;
    }, {} as Record<Horizon, number>),
    generatedAtMs: now,
  };
}

// ---- mutations -------------------------------------------------------------

export interface NewItemInput {
  title: string;
  why?: string;
  horizon?: Horizon;
  status?: ItemStatus;
  target?: string;
  size?: ItemSize;
  owner?: string;
  plans?: string[];
  /** Files this outcome owns — see RoadmapItem.files and findCollisions. */
  files?: string[];
  source?: string;
  notes?: string;
}

export function addItem(input: NewItemInput, now = Date.now()): Promise<RoadmapItem> {
  return serialise(() => addItemUnsafe(input, now));
}

async function addItemUnsafe(input: NewItemInput, now = Date.now()): Promise<RoadmapItem> {
  const title = clean(input.title ?? "", 120);
  if (!title) throw new Error("Give it a name — what is the thing?");

  const { preamble, items } = await readDoc();
  const base = itemId(title);
  if (!base) throw new Error("That name has no letters or numbers to make an id from.");
  let id = base;
  let n = 2;
  while (items.some(i => i.id === id)) id = `${base}-${n++}`;

  const item: RoadmapItem = {
    id,
    title,
    horizon: input.horizon && isHorizon(input.horizon) ? input.horizon : "someday",
    status: input.status && isStatus(input.status) ? input.status : "idea",
    target: normaliseTarget(input.target),
    size: input.size && isSize(input.size) ? input.size : undefined,
    owner: input.owner ? clean(metaValue(input.owner), 60) || undefined : undefined,
    added: todayIso(now),
    why: input.why ? clean(input.why, 400) : undefined,
    plans: cleanPlans(input.plans ?? []),
    files: (input.files ?? []).map(f => clean(f, 200)).filter(Boolean).slice(0, 60),
    source: input.source ? clean(metaValue(input.source), 80) || "ed" : "ed",
    notes: input.notes ? clean(input.notes, 2000) : undefined,
  };

  await writeItems([...items, item], preamble);
  return item;
}

export interface UpdateItemInput {
  id: string;
  title?: string;
  horizon?: Horizon;
  status?: ItemStatus;
  /** Empty string clears the target. */
  target?: string;
  size?: ItemSize;
  owner?: string;
  why?: string;
  plans?: string[];
  files?: string[];
  notes?: string;
}

export function updateItem(input: UpdateItemInput, now = Date.now()): Promise<RoadmapItem> {
  return serialise(() => updateItemUnsafe(input, now));
}

async function updateItemUnsafe(input: UpdateItemInput, now = Date.now()): Promise<RoadmapItem> {
  const { preamble, items } = await readDoc();
  const item = items.find(i => i.id === input.id);
  if (!item) throw new Error("That roadmap item no longer exists.");

  if (input.title !== undefined) item.title = clean(input.title, 120) || item.title;
  if (input.horizon !== undefined && isHorizon(input.horizon)) item.horizon = input.horizon;
  if (input.status !== undefined && isStatus(input.status)) item.status = input.status;
  if (input.target !== undefined) item.target = input.target === "" ? undefined : normaliseTarget(input.target);
  if (input.size !== undefined) item.size = isSize(input.size) ? input.size : undefined;
  if (input.owner !== undefined) item.owner = clean(metaValue(input.owner), 60) || undefined;
  if (input.why !== undefined) item.why = clean(input.why, 400) || undefined;
  if (input.notes !== undefined) item.notes = clean(input.notes, 2000) || undefined;
  if (input.plans !== undefined) item.plans = cleanPlans(input.plans);
  if (input.files !== undefined) {
    item.files = input.files.map(f => clean(f, 200)).filter(Boolean).slice(0, 60);
  }

  // Shipping is the one status that also moves the item — a shipped thing still
  // sitting under "Now" is exactly the drift this file must not have.
  if (item.status === "shipped") {
    item.horizon = "shipped";
    item.shippedOn ??= todayIso(now);
  } else if (item.horizon === "shipped") {
    item.horizon = "now";
    item.shippedOn = undefined;
  }

  await writeItems(items, preamble);
  return item;
}

/** Attach a plan to an item — used when a plan is generated for it. */
export function linkPlan(id: string, planName: string): Promise<RoadmapItem> {
  return serialise(() => linkPlanUnsafe(id, planName));
}

async function linkPlanUnsafe(id: string, planName: string): Promise<RoadmapItem> {
  const { preamble, items } = await readDoc();
  const item = items.find(i => i.id === id);
  if (!item) throw new Error("That roadmap item no longer exists.");
  // Same cleaning, dedupe and cap as addItem/updateItem — this used to be an
  // exact-case `includes` with no cap, so `Plan-One` re-linked alongside
  // `plan-one` and 15 successive links stored 15 plans.
  item.plans = cleanPlans([...item.plans, planName]);
  if (item.status === "idea") item.status = "planned";
  await writeItems(items, preamble);
  return item;
}

/** Take an item off the roadmap — a mistyped or superseded outcome. */
export function removeItem(id: string): Promise<{ removed: RoadmapItem }> {
  return serialise(() => removeItemUnsafe(id));
}

async function removeItemUnsafe(id: string): Promise<{ removed: RoadmapItem }> {
  const { preamble, items } = await readDoc();
  const index = items.findIndex(i => i.id === id);
  if (index < 0) throw new Error("That roadmap item no longer exists.");
  const [removed] = items.splice(index, 1);
  await writeItems(items, preamble);
  return { removed };
}

// ---- collisions -------------------------------------------------------------

export interface Collision {
  /** The two item ids that would fight. */
  between: [string, string];
  titles: [string, string];
  /** The files they both claim. */
  files: string[];
  /** True when BOTH are live work — the case that actually destroys something. */
  bothLive: boolean;
}

/** Does one file-map entry cover another? `mod/**` covers `mod/a/b.ts`. */
function covers(claim: string, other: string): boolean {
  if (claim === other) return true;
  const glob = claim.endsWith("/**") ? claim.slice(0, -3) : claim.endsWith("/") ? claim.slice(0, -1) : null;
  if (glob && (other === glob || other.startsWith(`${glob}/`))) return true;
  const otherGlob = other.endsWith("/**") ? other.slice(0, -3) : null;
  return Boolean(otherGlob && (claim === otherGlob || claim.startsWith(`${otherGlob}/`)));
}

/**
 * Every pair of items whose file maps overlap.
 *
 * `bothLive` is the one that matters: two items being BUILT that share a file
 * means two agents in the same file, and with no git the loser's work is gone.
 * A live item overlapping a parked one is only worth knowing about later.
 */
export function findCollisions(items: RoadmapItemView[]): Collision[] {
  const withFiles = items.filter(i => (i.files?.length ?? 0) > 0);
  const out: Collision[] = [];
  const isLive = (i: RoadmapItemView) => i.status === "building" || i.workers.length > 0;

  for (let a = 0; a < withFiles.length; a += 1) {
    for (let b = a + 1; b < withFiles.length; b += 1) {
      const left = withFiles[a];
      const right = withFiles[b];
      const shared = left.files!.filter(f => right.files!.some(g => covers(f, g) || covers(g, f)));
      if (!shared.length) continue;
      out.push({
        between: [left.id, right.id],
        titles: [left.title, right.title],
        files: [...new Set(shared)],
        bothLive: isLive(left) && isLive(right),
      });
    }
  }
  // The dangerous ones first.
  return out.sort((x, y) => Number(y.bothLive) - Number(x.bothLive) || y.files.length - x.files.length);
}
