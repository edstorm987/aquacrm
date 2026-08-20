import "server-only";

import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { PROJECT_ROOT } from "@/lib/server/devDocs";
import { scanWorkerSignals, type WorkerCheckIn } from "@/lib/server/devTeamWorkers";

// Individual TASKS, not just plans.
//
// The board answers "which plans are moving"; this answers "what specifically
// is being done, and where has it got to". A task is one phase of a plan, and
// its state comes from three honest signals:
//
//   • the plan text itself — a phase already marked ✅/SHIPPED/DONE is done
//   • the worker's check-in `phase` — what someone says they're on right now
//   • everything else is still to do
//
// Read-only, confined to the plans directory. Two phase formats are supported
// because the plans genuinely use both (24 use a numbered list under
// `## Phases`, 2 use `## Phase N — Title` headings).

const PLANS_DIR_REL = "docs/development/plans";

export type TaskState = "done" | "doing" | "todo";

export interface DevTask {
  /** Stable id: <plan-slug>#<n>. */
  id: string;
  planName: string;
  planRelPath: string;
  planTitle: string;
  /** 1-based phase number as written. */
  number: string;
  title: string;
  detail?: string;
  state: TaskState;
  /** Worker currently on it, when a check-in points here. */
  worker?: string;
}

export interface PlanTasks {
  planName: string;
  planRelPath: string;
  planTitle: string;
  tasks: DevTask[];
  done: number;
  total: number;
  /** Any worker whose check-in names this plan. */
  workers: WorkerCheckIn[];
}

function cleanInline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Underscore emphasis too — a placeholder phase written `_(First slice…)_`
    // was rendering with its underscores intact in the Tasks view. Only
    // delimiter underscores go; snake_case identifiers keep theirs.
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/[`*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstHeading(md: string): string | null {
  const m = /^#\s+(.+?)\s*#*$/m.exec(md);
  return m ? cleanInline(m[1]).replace(/^plan\s*[—:-]\s*/i, "").trim() || null : null;
}

/**
 * The status marker a phase writes about ITSELF — and only where a plan
 * actually writes one: at the very start of the phase's own text.
 *
 * This used to match `SHIPPED|COMPLETE|DONE|BUILT` anywhere in the 400-char
 * detail blob, so incidental prose struck live work through: a file path
 * (`built-ins/runtime/_types.ts`), a comparison ("built the same way those
 * toggles are"), a mention of "the built Dev Docs browser". Worst of all, a
 * phase reading "⛔ Cohere — BLOCKED on Ed" rendered as DONE because the same
 * paragraph said "Also built". The one task waiting on Ed looked finished.
 *
 * So: a marker counts only as a lead, and a blocked/at-risk lead can never
 * read as done, whatever the rest of the paragraph says. The word forms are
 * case-SENSITIVE: the plans shout "SHIPPED", while ordinary prose opening
 * "Built on the existing engine…" is describing the work, not closing it.
 */
const DONE_LEAD = /^\s*(?:\*\*|__)?\s*(?:[✅✔☑]|(?:SHIPPED|COMPLETED?|DONE|BUILT)\b)/u;
const BLOCKED_LEAD = /^\s*(?:\*\*|__)?\s*(?:[⛔⚠❌🚧🛑]|(?:BLOCKED|WIP|TODO)\b)/u;

export type PhaseMarker = "done" | "blocked";

/** The marker leading `text`, if any. Blocked wins — never guess "finished". */
function leadMarker(text: string): PhaseMarker | undefined {
  if (BLOCKED_LEAD.test(text)) return "blocked";
  if (DONE_LEAD.test(text)) return "done";
  return undefined;
}

/** A status emoji leading a phase, stripped before the title is read out of it. */
const LEADING_MARKER = /^\s*(?:[✅✔☑⛔⚠❌🚧🛑]️?\s*)+/u;

/**
 * Cut a title to `max` without ever landing mid-word. A phase written
 * `1. ✅ **Title — SHIPPED (date).** Detail…` used to fail the bold probe (the
 * ✅ broke the anchor) and the sentence fallback (the '.' sits inside the `**`),
 * so the whole paragraph became the title and was sliced through an identifier.
 */
function shortTitle(s: string, max = 140): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max + 1);
  // Prefer an honest break: the last sentence end, then an em-dash clause.
  for (const re of [/^.*[.!?](?=\s)/, /^[^—–]+(?=\s*[—–])/]) {
    const m = re.exec(head);
    const candidate = m?.[0].trim() ?? "";
    if (candidate.length >= 24) return candidate;
  }
  const space = head.lastIndexOf(" ");
  return `${(space >= 24 ? head.slice(0, space) : s.slice(0, max)).trim()}…`;
}

/**
 * Does this check-in's free-text phase refer to task `n`?
 * Workers write things like "P2", "Phase 3", "P1-P4", "person-disposition".
 * Only a confident numeric match counts — a vague phase must not light up an
 * arbitrary task.
 */
function checkInMatches(phase: string | undefined, number: string): boolean {
  if (!phase) return false;
  const p = phase.toLowerCase();
  const n = number.replace(/[^0-9]/g, "");
  if (!n) return false;
  if (new RegExp(`\\bp${n}\\b`).test(p)) return true;
  if (new RegExp(`\\bphase\\s*${n}\\b`).test(p)) return true;
  // Ranges like "P1-P4" cover everything between.
  const range = /\bp(\d+)\s*[-–]\s*p?(\d+)\b/.exec(p);
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])];
    const num = Number(n);
    if (num >= Math.min(from, to) && num <= Math.max(from, to)) return true;
  }
  return false;
}

export interface ParsedPhase {
  number: string;
  title: string;
  detail?: string;
  /** What the phase says about its OWN state — a lead marker, nothing else. */
  marker?: PhaseMarker;
}

/** Read the task out of one phase's raw text: title, detail, status marker. */
function phaseFromRaw(number: string, raw: string): ParsedPhase | null {
  const marker = leadMarker(raw);
  // Strip the status emoji BEFORE probing for the bold lead — `✅ **Title.**`
  // fails an anchored `^\*\*` probe, and then the whole paragraph became the
  // title. The detail keeps the emoji: it is information, not noise.
  const body = raw.replace(LEADING_MARKER, "");
  const bold = /^\*\*(.+?)\*\*/.exec(body);
  const firstSentence = body.split(/(?<=\.)\s/)[0] ?? body;
  const title = shortTitle(cleanInline(bold ? bold[1] : firstSentence));
  if (!title) return null;
  const detail = cleanInline(raw).slice(0, 400);
  return { number, title, detail: detail !== title ? detail : undefined, marker };
}

/** Pull phases out of one plan's markdown. Handles all three formats in use. */
export function parsePhases(md: string): ParsedPhase[] {
  const out: ParsedPhase[] = [];

  // Format A — `## Phase 1 — Title` headings (with the body until the next ##).
  const headingRe = /^##\s+Phase\s+([0-9]+[a-z]?)\s*[—–-]\s*(.+?)\s*$/gim;
  let m: RegExpExecArray | null;
  const headings: { number: string; title: string; from: number }[] = [];
  while ((m = headingRe.exec(md))) {
    headings.push({ number: m[1], title: m[2], from: m.index + m[0].length });
  }
  if (headings.length) {
    headings.forEach((h, i) => {
      const body = md.slice(h.from, i + 1 < headings.length ? headings[i + 1].from : undefined);
      const lead = body.replace(/^\s+/, "");
      const detail = cleanInline(body.split(/\n\s*\n/)[0] ?? "").slice(0, 400);
      out.push({
        number: h.number,
        title: shortTitle(cleanInline(h.title.replace(LEADING_MARKER, ""))),
        detail: detail || undefined,
        marker: leadMarker(h.title) ?? leadMarker(lead),
      });
    });
    return out;
  }

  // Format B — a `## Phases…` section holding a numbered list. `Phasing` counts
  // too: radar-upgrade.md writes `## Phasing (incremental, non-breaking)` over
  // 7 shipped phases, and anchoring on `Phases?` alone parsed it as zero — so
  // the plan vanished from the Tasks view and the roadmap called 7/7 shipped
  // work 0% complete, on a page that promises it never drifts.
  //
  // The section ends at the NEXT HEADING OF ANY LEVEL. Stopping only at `##`
  // let the section run past `###` sub-sections to the end of the plan, so
  // every later numbered list (matcher rules, policy steps) was counted as a
  // phase — inflating the totals and colliding task ids (`plan#1` three times).
  const section = /^##\s+Phas(?:es?|ing)\b[^\n]*\n([\s\S]*?)(?=\n#{1,6}\s|(?![\s\S]))/im.exec(md);
  if (!section) return out;
  // Top-level numbered items only; indented sub-bullets belong to their parent.
  const itemRe = /^[ \t]*(\d+[a-z]?)\.\s+([\s\S]*?)(?=\n[ \t]*\d+[a-z]?\.\s|(?![\s\S]))/gm;
  let item: RegExpExecArray | null;
  while ((item = itemRe.exec(section[1]))) {
    const phase = phaseFromRaw(item[1], item[2].trim());
    if (phase) out.push(phase);
  }
  if (out.length) return out;

  // Format C — the same section written as `**Phase N — Title:**` bold
  // paragraphs instead of a numbered list (dev-team-portal.md, the flagship
  // plan for this very workspace, which otherwise parsed to zero phases).
  const boldRe = /^[ \t]*\*\*Phase\s+(\d+[a-z]?)\s*[—–-]\s*(.+?)\*\*([\s\S]*?)(?=\n[ \t]*\*\*Phase\s+\d|(?![\s\S]))/gm;
  let bold: RegExpExecArray | null;
  while ((bold = boldRe.exec(section[1]))) {
    const lead = bold[2].trim();
    const rest = bold[3].trim();
    const title = shortTitle(cleanInline(lead.replace(LEADING_MARKER, "")).replace(/\s*:$/, ""));
    if (!title) continue;
    const detail = cleanInline(`${lead} ${rest}`).slice(0, 400);
    out.push({
      number: bold[1],
      title,
      detail: detail !== title ? detail : undefined,
      marker: leadMarker(lead) ?? leadMarker(rest),
    });
  }
  return out;
}

/**
 * Tasks for every plan that has phases, newest-touched first. `onlyActive`
 * keeps it to plans a worker is actually on or that still have work left.
 */
export async function scanTasks(opts: { onlyActive?: boolean } = {}): Promise<PlanTasks[]> {
  const dirAbs = join(PROJECT_ROOT, PLANS_DIR_REL);
  let names: string[];
  try {
    names = await readdir(dirAbs);
  } catch {
    return [];
  }

  const signals = await scanWorkerSignals().catch(() => null);
  const checkIns = signals?.checkIns ?? [];

  const built = await Promise.all(
    names.filter(n => n.toLowerCase().endsWith(".md")).sort().map(async (fileName): Promise<PlanTasks | null> => {
      let md: string;
      try {
        md = await readFile(join(dirAbs, fileName), "utf8");
      } catch {
        return null;
      }
      const phases = parsePhases(md);
      if (!phases.length) return null;

      const planName = basename(fileName).replace(/\.md$/i, "");
      const planRelPath = `${PLANS_DIR_REL}/${fileName}`;
      const planTitle = firstHeading(md) ?? planName.replace(/[-_]+/g, " ");
      const mine = checkIns.filter(c => c.plan && c.plan.toLowerCase() === planName.toLowerCase());

      const tasks: DevTask[] = phases.map(phase => {
        const worker = mine.find(c => checkInMatches(c.phase, phase.number));
        const done = phase.marker === "done";
        // A worker actively on it beats "looks done" — they'd know.
        const state: TaskState = worker && !/\bdone\b/i.test(worker.phase ?? "")
          ? "doing"
          : done ? "done" : "todo";
        return {
          id: `${planName}#${phase.number}`,
          planName,
          planRelPath,
          planTitle,
          number: phase.number,
          title: phase.title,
          detail: phase.detail,
          state,
          worker: state === "doing" ? worker?.name : undefined,
        };
      });

      const done = tasks.filter(t => t.state === "done").length;
      return { planName, planRelPath, planTitle, tasks, done, total: tasks.length, workers: mine };
    }),
  );

  let plans = built.filter((p): p is PlanTasks => p !== null);
  if (opts.onlyActive) {
    plans = plans.filter(p => p.workers.length > 0 || p.done < p.total);
  }
  // Plans someone is on first, then least-finished, then alphabetical.
  return plans.sort((a, b) =>
    (b.workers.length - a.workers.length) ||
    (a.done / a.total) - (b.done / b.total) ||
    a.planTitle.localeCompare(b.planTitle));
}
