import "server-only";
// Dev Team → Updates — the dev changelog, read LIVE off the project's own
// running record `docs/development/updates.md` (the file every worker writes an
// entry to after a change), plus the one WRITE this portal makes: authoring a
// new entry from the UI so Ed can "check in" without opening an editor.
//
// Same shape as `devTeamBoard.ts`: a pure parser over markdown + a thin `scan*`
// wrapper that reads the real file off disk, with the gate on the page/route
// rather than here. The write half is deliberately narrow:
//
//   • ONE file. The path is a constant, resolved and re-checked to live under
//     `PROJECT_ROOT/docs` — nothing caller-supplied ever reaches the filesystem.
//   • INSERT-ONLY. The doc is append-only-ish by convention (other workers write
//     it concurrently), so `appendUpdateEntry` splices a new block into the raw
//     file text at one offset — `head + block + tail` — and never re-serialises,
//     reformats or re-indents an existing entry. Bytes outside the insertion
//     point come through untouched, so a concurrent worker's entry can't be
//     mangled by our round-trip.
//   • Serialised + optimistic. Two guards, because there are two kinds of
//     concurrent writer:
//       – OURS. Every append in this process queues on one promise chain, so a
//         double-submit or two open tabs can never both read the same snapshot.
//         (Before that chain existed, N concurrent calls all returned 201 and
//         N-1 entries were silently overwritten.)
//       – THEIRS. A sibling worker writes this doc straight off disk and takes
//         no lock of ours, so all we can do is narrow the window: the file is
//         stat'd before the read AND again immediately before the write, and
//         the attempt is dropped + retried if either stat moved. A change that
//         lands inside the last few microseconds before `writeFile` still wins;
//         nothing short of an OS lock closes that, and the other side would
//         have to cooperate.

import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { PROJECT_ROOT } from "@/lib/server/dev/devDocs";

/** The running record. Repo-relative — also the Library link target. */
export const UPDATES_DOC_REL = "docs/development/updates.md";

/** Writes are confined to the docs tree; the doc path is re-checked against it. */
const DOCS_ROOT = resolve(PROJECT_ROOT, "docs");

/** Newest-first read cap — the real file carries hundreds of entries. */
export const MAX_ENTRIES = 40;

// Authoring limits — "sane lengths", enforced server-side (the composer mirrors
// them, but the route is the one that counts).
const MAX_TITLE_CHARS = 160;
const MAX_BULLET_CHARS = 2000;
const MAX_BULLETS = 40;

/** Control characters (tab/newline excluded — those are collapsed as whitespace). */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * One piece of an entry's body, in document order.
 *
 * The real doc is prose-FIRST: nearly every entry opens with a paragraph or two
 * explaining what shipped, and only then lists bullets. A bullets-only shape
 * (what this used to be) has nowhere to put that prose, so it was dropped
 * silently — the reader saw the trailing bullets and no explanation.
 */
export interface DevUpdateBlock {
  kind: "paragraph" | "bullet";
  /** Raw markdown for one block, whitespace-collapsed, wrapped lines rejoined. */
  text: string;
}

export interface DevUpdateEntry {
  /** `YYYY-MM-DD`, exactly as written in the heading. */
  date: string;
  /** Heading text after the date + dash. Raw markdown (the view renders inline). */
  title: string;
  /** The whole body in document order — paragraphs AND bullets. */
  blocks: DevUpdateBlock[];
  /**
   * The bullet blocks' text, in order. Derived from `blocks`; kept because the
   * composer and `renderUpdateEntry` author bullets and nothing else.
   */
  bullets: string[];
}

/** Thrown for bad authoring input — the route maps this to a 400. */
export class UpdateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateInputError";
  }
}

// ---- text helpers ----------------------------------------------------------

/** Strip control chars and flatten to a single whitespace-collapsed line. */
function oneLine(value: string): string {
  return value.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

/** Today in Europe/London as `YYYY-MM-DD` — the heading format the doc uses. */
export function todayIsoDay(nowMs: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// ---- parse -----------------------------------------------------------------

// `## 2026-08-19 — Title` (em-dash, en-dash or hyphen; title optional).
const ENTRY_HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s*(?:[—–-]\s*)?(.*)$/;
const ANY_HEADING = /^#{1,6}\s/;
const BULLET = /^\s*[-*+]\s+(.+)$/;

/** Body blocks kept per entry — bounded so a 300KB doc can't blow up a render. */
const MAX_BLOCKS = 120;

/**
 * Parse `docs/development/updates.md` into entries, newest first (the file is
 * already newest-first, so document order is kept as-is — no re-sorting, which
 * would lie about same-day ordering).
 *
 * Format: `## YYYY-MM-DD — Title`, then a body of paragraphs and `- ` bullets in
 * whatever order the author wrote them, until the next heading. The intro prose
 * above the first `---` is ignored (it has no dated heading). Stops after
 * `MAX_ENTRIES` so a 240KB doc doesn't cost a full parse on every page view.
 *
 * Line joining is tracked by what was last emitted, NOT by "is there a bullet
 * yet". The old rule glued a paragraph that FOLLOWED a bullet onto the end of
 * that bullet (run-on nonsense), and threw away any paragraph that came BEFORE
 * the first bullet — which is where most entries keep their explanation. Here a
 * line only rejoins the previous block when it is a genuine hard-wrap
 * continuation of it: same block kind, no blank line in between.
 */
export function parseUpdates(markdown: string, limit: number = MAX_ENTRIES): DevUpdateEntry[] {
  const out: DevUpdateEntry[] = [];
  let current: DevUpdateEntry | null = null;
  // The block the previous non-blank line went into — null after a blank line
  // or a heading, which is what ends a hard-wrap run.
  let open: DevUpdateBlock | null = null;

  const push = (entry: DevUpdateEntry, block: DevUpdateBlock): DevUpdateBlock | null => {
    if (entry.blocks.length >= MAX_BLOCKS) return null;
    if (block.kind === "bullet" && entry.bullets.length >= MAX_BULLETS) return null;
    entry.blocks.push(block);
    if (block.kind === "bullet") entry.bullets.push(block.text);
    return block;
  };

  for (const raw of markdown.split(/\r?\n/)) {
    if (ANY_HEADING.test(raw)) {
      open = null;
      const heading = ENTRY_HEADING.exec(raw);
      if (!heading) {
        current = null; // a non-entry heading closes the block
        continue;
      }
      if (out.length >= limit) break; // cap reached — stop before the next entry
      current = {
        date: heading[1],
        title: oneLine(heading[2]) || "Update",
        blocks: [],
        bullets: [],
      };
      out.push(current);
      continue;
    }
    if (!current) continue;

    const bullet = BULLET.exec(raw);
    if (bullet) {
      const text = oneLine(bullet[1]);
      open = text ? push(current, { kind: "bullet", text }) : null;
      continue;
    }

    const line = oneLine(raw);
    // A blank line (or the `---` rule) ends the current block: whatever comes
    // next is new prose, not a continuation.
    if (!line || line === "---") {
      open = null;
      continue;
    }
    if (open) {
      // Hard-wrap continuation of the block we're already inside.
      open.text = `${open.text} ${line}`;
      if (open.kind === "bullet") current.bullets[current.bullets.length - 1] = open.text;
      continue;
    }
    open = push(current, { kind: "paragraph", text: line });
  }

  return out;
}

/** How the view lays an entry's body out: prose paragraphs and bullet lists. */
export type UpdateRenderRun =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

/**
 * Collapse an entry's blocks into render runs — consecutive bullets become one
 * list, prose stays its own paragraph, and document order is preserved.
 *
 * Lives here rather than in the view so it can be tested without pulling React
 * in: the bug it exists to close was that prose had nowhere to be rendered at
 * all, which is a shape question, not a styling one.
 */
export function groupUpdateBlocks(blocks: DevUpdateBlock[]): UpdateRenderRun[] {
  const runs: UpdateRenderRun[] = [];
  for (const block of blocks) {
    if (block.kind === "paragraph") {
      runs.push({ kind: "paragraph", text: block.text });
      continue;
    }
    const last = runs[runs.length - 1];
    if (last && last.kind === "list") last.items.push(block.text);
    else runs.push({ kind: "list", items: [block.text] });
  }
  return runs;
}

// ---- read ------------------------------------------------------------------

/**
 * Resolve the updates doc and re-assert it lives under `PROJECT_ROOT/docs`.
 * The path is a module constant (never caller-supplied), so this is belt-and-
 * braces: it makes the confinement explicit and fails loudly if the constant or
 * `PROJECT_ROOT` ever changes shape.
 */
function updatesDocPath(): string {
  const abs = resolve(PROJECT_ROOT, UPDATES_DOC_REL);
  if (!abs.startsWith(DOCS_ROOT + sep)) {
    throw new Error("The updates log resolved outside the docs tree.");
  }
  return abs;
}

/** Read the real updates log and parse it. Gate-free — the page/route gates. */
export async function scanUpdates(limit: number = MAX_ENTRIES): Promise<DevUpdateEntry[]> {
  try {
    const raw = await readFile(updatesDocPath(), "utf8");
    return parseUpdates(raw, limit);
  } catch {
    return [];
  }
}

// ---- write (insert-only) ---------------------------------------------------

/**
 * Render one entry back to the doc's markdown format. Block-aware, so an entry
 * that carries prose round-trips as prose (a blank line before and after, the
 * doc's own convention) rather than being flattened into bullets.
 */
export function renderUpdateEntry(entry: DevUpdateEntry): string {
  const lines = [`## ${entry.date} — ${entry.title}`];
  const blocks: DevUpdateBlock[] = entry.blocks.length
    ? entry.blocks
    : entry.bullets.map(text => ({ kind: "bullet" as const, text }));
  let previous: DevUpdateBlock["kind"] | null = null;
  for (const block of blocks) {
    if (block.kind === "paragraph") {
      lines.push("", block.text);
      previous = "paragraph";
      continue;
    }
    if (previous === "paragraph") lines.push("");
    lines.push(`- ${block.text}`);
    previous = "bullet";
  }
  return lines.join("\n");
}

/**
 * Where a new entry goes: immediately AFTER the first `---` separator, i.e. below
 * the `# Updates log` heading + back-link + intro and above the newest entry.
 * Falls back to just before the first `## ` entry heading, then to end-of-file —
 * every branch is a single offset, so the caller only ever splices.
 */
export function updatesInsertOffset(markdown: string): number {
  const rule = /(?:^|\n)---[ \t]*\r?\n/.exec(markdown);
  if (rule) return rule.index + rule[0].length;
  const firstEntry = /(?:^|\n)##[ \t]/.exec(markdown);
  if (firstEntry) return firstEntry.index === 0 ? 0 : firstEntry.index + 1;
  return markdown.length;
}

/**
 * Splice `block` into `markdown` at the insert offset. PURE string surgery:
 * everything before the offset and everything after it is copied through
 * verbatim, so no existing entry is ever re-parsed, re-rendered or reformatted —
 * only blank-line padding is added around the new block, and only when the
 * neighbouring bytes don't already provide it.
 */
export function insertUpdateBlock(markdown: string, block: string): string {
  const offset = updatesInsertOffset(markdown);
  const head = markdown.slice(0, offset);
  const tail = markdown.slice(offset);
  const lead = head === "" || head.endsWith("\n") ? "" : "\n";
  const gap = tail === "" || tail.startsWith("\n") ? "" : "\n";
  return `${head}${lead}\n${block}\n${gap}${tail}`;
}

export interface NewUpdateInput {
  title: string;
  /** One bullet per entry line; blanks are dropped. */
  bullets?: string[];
}

/** Validate + normalise authoring input into a dated entry. Throws `UpdateInputError`. */
export function buildUpdateEntry(input: NewUpdateInput, nowMs: number = Date.now()): DevUpdateEntry {
  const title = oneLine(String(input?.title ?? "")).replace(/^#+\s*/, "");
  if (!title) throw new UpdateInputError("Give the entry a title.");
  if (title.length > MAX_TITLE_CHARS) {
    throw new UpdateInputError(`Keep the title under ${MAX_TITLE_CHARS} characters.`);
  }

  const rawBullets = Array.isArray(input?.bullets) ? input.bullets : [];
  if (rawBullets.length > MAX_BULLETS) {
    throw new UpdateInputError(`That's more than ${MAX_BULLETS} bullets — split it into two entries.`);
  }
  const bullets: string[] = [];
  for (const raw of rawBullets) {
    // Strip a leading list marker so a pasted "- foo" doesn't become "- - foo".
    const text = oneLine(String(raw ?? "")).replace(/^[-*+]\s+/, "");
    if (!text) continue;
    if (text.length > MAX_BULLET_CHARS) {
      throw new UpdateInputError(`Keep each bullet under ${MAX_BULLET_CHARS} characters.`);
    }
    bullets.push(text);
  }

  return {
    date: todayIsoDay(nowMs),
    title,
    blocks: bullets.map(text => ({ kind: "bullet" as const, text })),
    bullets,
  };
}

// ---- write serialisation ---------------------------------------------------

/**
 * One promise chain for every append this process makes.
 *
 * The read-modify-write below is not atomic: two callers that read the same
 * bytes both splice their own entry into that same snapshot, and the second
 * write erases the first — while BOTH callers are told they succeeded (the
 * route answers 201 twice and one entry reaches the file). Ed running the
 * Updates view in two tabs, or a double-submit that outruns the composer's busy
 * flag, is enough. Queueing every append means the second caller re-reads the
 * file only after the first has finished writing it.
 *
 * A rejected run must not poison the chain, so failures are swallowed here —
 * the caller still sees its own rejection through `run`.
 */
let updatesWriteChain: Promise<unknown> = Promise.resolve();

function withUpdatesWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = updatesWriteChain.then(fn, fn);
  updatesWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Same bytes, untouched since we last looked? (mtime + size, the cheap pair.) */
function sameFile(a: { mtimeMs: number; size: number }, b: { mtimeMs: number; size: number }): boolean {
  return a.mtimeMs === b.mtimeMs && a.size === b.size;
}

/**
 * Prepend a new entry to the top of the updates log (below the header/intro).
 *
 * Never rewrites an existing entry: the file is read as one string, the new
 * block is spliced in at a single offset, and the result is written back — the
 * existing bytes are copied, not re-generated. Because sibling workers write
 * this doc too, the file is stat'd before and after the read and the write is
 * retried on a fresh read if it changed underneath us.
 */
export async function appendUpdateEntry(
  input: NewUpdateInput,
  nowMs: number = Date.now(),
): Promise<DevUpdateEntry> {
  // Validate BEFORE queueing, so bad input fails fast and never holds the lock.
  const entry = buildUpdateEntry(input, nowMs);
  const abs = updatesDocPath();
  const block = renderUpdateEntry(entry);

  return withUpdatesWriteLock(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await stat(abs);
      const raw = await readFile(abs, "utf8");
      const afterRead = await stat(abs);
      // Someone else wrote between our stat and our read — drop this copy and
      // re-read, so we never write back a stale snapshot of their entry.
      if (!sameFile(before, afterRead)) continue;

      const next = insertUpdateBlock(raw, block);

      // Last look before committing. The splice above is pure string work, but
      // it is still time in which a sibling worker's editor can land — and
      // writing `next` would erase it. Re-stat, and bail to a fresh read if the
      // file moved at all since we read it.
      const justBefore = await stat(abs);
      if (!sameFile(before, justBefore)) continue;

      await writeFile(abs, next, "utf8");
      return entry;
    }
    throw new Error("The updates log is being written by another process — try again in a moment.");
  });
}
