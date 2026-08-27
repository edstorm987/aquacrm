import "server-only";

import { join, resolve, sep } from "node:path";

import { invalidateDevDocsIndex, PROJECT_ROOT } from "@/lib/server/dev/devDocs";
import { createDevFileExclusive } from "@/lib/server/dev/devFileTransaction";
import { invalidatePath } from "@/lib/server/dev/devMarkdownCache";
import { localDay } from "@/lib/server/dev/devLocalTime";

// Authoring a plan from the Dev Team portal.
//
// The whole dev process runs off `docs/development/plans/*.md` — the Library
// lists them, the "What we're working on" board parses their `**Status:` line
// into lanes, and the orchestrator reads them to brief workers. So letting Ed
// write one from the UI closes the loop: he types a plan, it lands as a real
// file, and it shows up on the board and in the Library immediately, ready to
// hand to a worker.
//
// Writes are confined to `docs/development/plans/` and to `.md` only.

const PLANS_DIR = join(PROJECT_ROOT, "docs", "development", "plans");

export interface NewPlanInput {
  title: string;
  goal: string;
  /** Optional free-text lines → the plan's first phase checklist. */
  phases?: string[];
  priority?: "high" | "med" | "low";
  notes?: string;
}

export interface NewPlanResult {
  slug: string;
  relPath: string;
  absPath: string;
}

export interface PreparedPlan extends NewPlanResult {
  title: string;
  markdown: string;
}

/** Filesystem-safe slug from a human title. */
export function planSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Control characters — everything except tab and newline, which are real text
// in a multi-line block and are normalised per-shape below. (A blanket
// \u0000-\u001f class swallows \n, which is exactly the flattening being fixed.)
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * One-line text: the title (a filename AND an H1) and each phase (`parsePhases`
 * reads one phase per numbered line, so a newline here would split one phase
 * into two).
 */
function clean(value: string, max: number): string {
  // Strip control characters; collapse whitespace runs; bound the length.
  return value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Multi-line text: the goal and the notes, which the form collects in resizable
 * textareas and invites prose in ("constraints, things to reuse, what not to
 * touch"). Collapsing `\s+` here flattened Ed's bullet list into one run-on
 * line — and the plan file is what a worker gets briefed from, so the structure
 * he typed has to survive the trip to disk.
 *
 * Horizontal whitespace collapses; line breaks do not. Paragraph gaps stay, but
 * a run of blank lines caps at one.
 *
 * One thing does get neutralised: a line that would open a markdown heading. The
 * readers key off headings — `## Phases…` for the task list, the opening
 * `**Status:` for the board — so a goal containing a literal `## Phases` line
 * would sit ABOVE the real section and be parsed as the plan's phases. Escaping
 * the hashes keeps the text visible and readable while leaving exactly one
 * Phases section in the document.
 */
function cleanBlock(value: string, max: number): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map(line => line.trim().replace(/^(#{1,6})(?=\s|$)/, "\\$1"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** A marker the author put there on purpose — their claim, not ours to overwrite. */
const AUTHORED_MARKER = /^(?:[✅✔☑⛔⚠❌🚧🛑]|\[[xX]\])/u;

/**
 * A phase the readers can trust as NOT done.
 *
 * `parsePhases` decides a phase is finished from a marker LEADING its text — and
 * "Complete the settings form" / "Done when the checklist saves" are the most
 * natural English for a phase nobody has started. A plan written that way was
 * born done: the roadmap showed the outcome 100% the moment it was created and,
 * when every phase read that way, the Tasks view dropped the plan entirely
 * (`onlyActive` keeps only `done < total`) — so the plan Ed had just written was
 * invisible on the board he was sent to look at.
 *
 * So every authored phase leads with an explicit unchecked box. It is a GFM task
 * item (the Library renders a real checkbox), it occupies the lead the reader
 * inspects, and it states the true thing: not done yet — unless the author put a
 * marker there themselves, which is a claim of their own and is left alone.
 */
function phaseLine(index: number, text: string): string {
  // Drop a list marker the author typed themselves, so pasting "1. Do the thing"
  // doesn't land as "1. [ ] 1. Do the thing"; likewise a bare unchecked box.
  const body = text
    .replace(/^(?:\d+[a-z]?[.)]|[-*+•])\s+/i, "")
    .replace(/^\[ \]\s*/, "")
    .trim();
  if (!body) return "";
  // Ed writing "✅ the settings form" is stating that phase IS done — a plan can
  // be written around work already finished. Only an unmarked phase gets the box.
  return AUTHORED_MARKER.test(body) ? `${index}. ${body}` : `${index}. [ ] ${body}`;
}

function todayIso(now: number): string {
  // Local, not UTC — a plan written at 00:30 BST is written TODAY.
  return localDay(now);
}

/**
 * Render the plan in the shape the rest of the system already understands:
 * a title, the `**Status:` line the board parses, the goal, staged phases,
 * and the "Done when" the worker contract expects.
 */
export function renderPlanMarkdown(input: NewPlanInput, now = Date.now()): string {
  const title = clean(input.title, 120);
  // Goal and notes keep their shape (bullets, paragraph breaks); the title and
  // the phases must each stay on one line.
  const goal = cleanBlock(input.goal, 2000);
  const notes = input.notes ? cleanBlock(input.notes, 2000) : "";
  const phases = (input.phases ?? [])
    .map(p => clean(p, 300))
    .filter(Boolean)
    .slice(0, 20);
  const priority = input.priority ?? "med";

  const phaseLines = phases.length
    ? phases.map((p, i) => phaseLine(i + 1, p)).filter(Boolean).join("\n")
    : "1. [ ] _(First slice — smallest thing that proves the idea works.)_";

  return `# Plan — ${title}

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: PLAN (not built).** Written by Ed from the Dev Team portal on ${todayIso(now)}. Priority: **${priority}**.

## Goal
${goal}

## Phases (simple-first)
${phaseLines}
${notes ? `\n## Notes\n${notes}\n` : ""}
## Reuse first
Before building: check \`docs/reference/\` (every exported function + signature) and
\`docs/workspace/feature-index.md\` for what already exists. Default to
**reuse → repurpose → simplify** over adding a new surface, and check
\`docs/workspace/hazards-and-duplication.md\` so the canonical copy gets edited.

## Files owned / collision (for the commander)
_To fill in when this is assigned — list the files this plan owns so two workers
never hold the same ones._

## Done when (runtime-verified)
_The observable result on a dev server, plus a behavioural test. A green suite is
not "done" — browser-verify the UI (see [worker-brief.md](../../context/worker-brief.md))._
`;
}

/** Validate, confine and render a plan without writing it. */
export function preparePlan(input: NewPlanInput, now = Date.now()): PreparedPlan {
  const title = clean(input.title, 120);
  if (!title) throw new Error("A plan needs a title.");
  if (!cleanBlock(input.goal, 2000)) throw new Error("A plan needs a goal — what should be true when it's done?");

  const slug = planSlug(title);
  if (!slug) throw new Error("That title has no usable letters or numbers for a filename.");
  const absPath = resolve(PLANS_DIR, `${slug}.md`);
  if (absPath !== PLANS_DIR && !absPath.startsWith(PLANS_DIR + sep)) {
    throw new Error("Refusing to write outside the plans directory.");
  }
  if (!absPath.toLowerCase().endsWith(".md")) {
    throw new Error("Plans must be markdown files.");
  }
  return {
    title,
    slug,
    relPath: `docs/development/plans/${slug}.md`,
    absPath,
    markdown: renderPlanMarkdown({ ...input, title }, now),
  };
}

/**
 * Create a new plan file. Refuses to overwrite an existing plan, refuses any
 * path that would escape the plans directory.
 */
export async function createPlan(input: NewPlanInput, now = Date.now()): Promise<NewPlanResult> {
  const prepared = preparePlan(input, now);
  const { slug, absPath } = prepared;

  // Never clobber an existing plan — a worker may already be building it.
  //
  // The exclusivity is the WRITE, not a check before it: an `access()` probe and
  // a `writeFile()` are two awaits, and two in-flight creates with the same title
  // both saw "no such file" and both wrote. The loser's plan vanished with no
  // error anywhere — the API said ok to both callers. `flag: "wx"` makes the
  // create-or-fail one atomic kernel operation, so exactly one caller can win.
  try {
    await createDevFileExclusive(absPath, prepared.markdown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") {
      throw new Error(`A plan called "${slug}.md" already exists. Pick a different title.`);
    }
    throw error;
  }

  // Drop any entry a prior same-slug file left cached (tasks/planStatus), so the
  // new plan is parsed fresh on the next board/tasks read.
  invalidatePath(absPath);
  invalidateDevDocsIndex();

  return { slug, relPath: prepared.relPath, absPath };
}
