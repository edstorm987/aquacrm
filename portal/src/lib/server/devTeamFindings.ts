import "server-only";

import { readdir, readFile, writeFile, mkdir, stat, unlink } from "node:fs/promises";
import { join, resolve, sep, basename } from "node:path";

import { PROJECT_ROOT } from "@/lib/server/devDocs";
import { localDay, localStamp } from "@/lib/server/devLocalTime";
import { createPlan, type NewPlanResult } from "@/lib/server/devTeamPlans";

// Findings — the INPUT side of the system.
//
// Everything else here flows outward: plans → workers → board → docs. Nothing
// captured what's actually WRONG while using the app. A finding is that capture:
// a screenshot, a note, where you were, and how bad it is. Findings are reviewed,
// then one or more of them become a plan, which becomes a worker's job.
//
// They're stored as markdown in `docs/development/findings/` (durable, greppable,
// and they surface in the Library like every other doc) with screenshots in a
// sibling `images/` folder. Images are served through a gated route, never
// straight off the filesystem.

const FINDINGS_DIR = join(PROJECT_ROOT, "docs", "development", "findings");
const IMAGES_DIR = join(FINDINGS_DIR, "images");

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 6_000_000;

export type FindingStatus = "open" | "planned" | "fixed";
export type FindingSeverity = "blocker" | "bug" | "polish" | "idea";

export const FINDING_SEVERITIES: { value: FindingSeverity; label: string; hint: string }[] = [
  { value: "blocker", label: "Blocker", hint: "Can't ship with this" },
  { value: "bug", label: "Bug", hint: "Broken or wrong" },
  { value: "polish", label: "Polish", hint: "Works, looks/feels off" },
  { value: "idea", label: "Idea", hint: "Something to consider" },
];

export interface Finding {
  slug: string;
  relPath: string;
  title: string;
  note: string;
  /** Where in the app it was seen — a URL path or a screen name. */
  where?: string;
  severity: FindingSeverity;
  status: FindingStatus;
  images: string[];
  createdAt: number;
  /** Set when a plan is generated from it. */
  planRelPath?: string;
}

function slugify(title: string, now: number): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  // Date-prefixed so findings sort chronologically in the folder + Library.
  const stamp = localDay(now);
  return `${stamp}-${base || "finding"}`;
}

function clean(value: string, max: number): string {
  return value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

/**
 * The note is the one DELIBERATELY multi-line field — the placeholder asks for
 * "what you expected, what happened, how to reproduce" and allows 4000 chars.
 * Running it through clean() turned all of that into one paragraph, and the
 * original was never written anywhere, so the loss was permanent. Keep \n, kill
 * every other control character, collapse runs of blank lines.
 */
function cleanNote(value: string, max: number): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/**
 * `where` is rendered inside backticks, so a backtick in the value would close
 * the span early and (worse) confuse anything re-reading the file.
 */
function cleanWhere(value: string, max: number): string {
  return clean(value.replace(/`/g, ""), max);
}

// A note line that would terminate the "## What I saw" block on the way back in
// (parseFinding stops at "\n## " or "\n---"). Escaped on write, unescaped on
// read, so a note containing a heading or a rule round-trips instead of being
// silently cut in half.
const NOTE_BREAKER = /^([ \t]*)(#{1,6}[ \t]|-{3,})/;

function escapeNote(note: string): string {
  return note.split("\n").map(line => (NOTE_BREAKER.test(line) ? line.replace(NOTE_BREAKER, "$1\\$2") : line)).join("\n");
}

function unescapeNote(note: string): string {
  return note.split("\n").map(line => line.replace(/^([ \t]*)\\(#{1,6}[ \t]|-{3,})/, "$1$2")).join("\n");
}

/** Every write goes through here — confined to the findings directory. */
function confine(abs: string): string {
  if (abs !== FINDINGS_DIR && !abs.startsWith(FINDINGS_DIR + sep)) {
    throw new Error("Refusing to write outside the findings directory.");
  }
  return abs;
}

export function renderFindingMarkdown(finding: Omit<Finding, "relPath">): string {
  // One field per LINE, not one "·"-joined line. `where` is free text a human
  // pastes from a breadcrumb, so it can legitimately contain "·" or a backtick —
  // and with a shared delimiter the re-parse silently truncated it, then the next
  // write persisted the truncation.
  const meta = [
    `- **Status:** ${finding.status}`,
    `- **Severity:** ${finding.severity}`,
    finding.where ? `- **Where:** \`${finding.where}\`` : "",
    `- **Found:** ${localStamp(finding.createdAt)}`,
    finding.planRelPath ? `- **Plan:** [${basename(finding.planRelPath)}](../plans/${basename(finding.planRelPath)})` : "",
  ].filter(Boolean).join("\n");

  const shots = finding.images.length
    ? `\n## Screenshots\n${finding.images.map(name => `![${name}](images/${name})`).join("\n\n")}\n`
    : "";

  return `# Finding — ${finding.title}

${meta}

## What I saw
${finding.note ? escapeNote(finding.note) : "_(no note)_"}
${shots}
---
_Captured from the Dev Team portal. Findings are the input side: review them, turn them into a plan, hand the plan to a worker._
`;
}

interface DecodedImage {
  ext: string;
  buffer: Buffer;
}

/** Decode one data-URL screenshot. No disk touched — validation happens first. */
function decodeImage(dataUrl: string): DecodedImage | null {
  const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  return { ext, buffer: Buffer.from(match[2], "base64") };
}

export async function createFinding(input: {
  title: string;
  note: string;
  where?: string;
  severity?: FindingSeverity;
  images?: string[];
  now?: number;
}): Promise<Finding> {
  const now = input.now ?? Date.now();
  const title = clean(input.title, 120);
  if (!title) throw new Error("A finding needs a title — what did you see?");

  const slug = slugify(title, now);
  await mkdir(FINDINGS_DIR, { recursive: true });

  const absMd = confine(resolve(FINDINGS_DIR, `${slug}.md`));
  // Same-day duplicates get a counter rather than clobbering.
  let finalSlug = slug;
  let finalAbs = absMd;
  let n = 2;
  while (await stat(finalAbs).then(() => true).catch(() => false)) {
    finalSlug = `${slug}-${n}`;
    finalAbs = confine(resolve(FINDINGS_DIR, `${finalSlug}.md`));
    n += 1;
    if (n > 50) throw new Error("Too many findings with that title today.");
  }

  // Decode and size-check EVERY image before a single byte hits the disk. The
  // old loop wrote image 1, then threw on image 2, leaving an orphaned file in
  // images/ that no finding's markdown ever referenced — silent litter in a
  // directory nobody can browse. Anything that still fails after that point
  // takes its own files with it.
  const decoded: DecodedImage[] = [];
  for (const dataUrl of (input.images ?? []).slice(0, MAX_IMAGES)) {
    const image = decodeImage(dataUrl);
    if (!image) continue;
    if (image.buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("One of those images is too large (max 6MB).");
    decoded.push(image);
  }

  const images: string[] = [];
  try {
    if (decoded.length) await mkdir(IMAGES_DIR, { recursive: true });
    for (const [i, image] of decoded.entries()) {
      const name = `${finalSlug}-${i + 1}.${image.ext}`;
      await writeFile(confine(resolve(IMAGES_DIR, name)), image.buffer);
      images.push(name);
    }

    const finding: Finding = {
      slug: finalSlug,
      relPath: `docs/development/findings/${finalSlug}.md`,
      title,
      note: cleanNote(input.note ?? "", 4000),
      where: input.where ? cleanWhere(input.where, 200) || undefined : undefined,
      severity: input.severity ?? "bug",
      status: "open",
      images,
      createdAt: now,
    };

    await writeFile(finalAbs, renderFindingMarkdown(finding), "utf8");
    return finding;
  } catch (error) {
    await Promise.all(images.map(name => unlink(resolve(IMAGES_DIR, name)).catch(() => {})));
    throw error;
  }
}

function parseFinding(slug: string, md: string): Finding {
  const pick = (label: string): string | undefined => {
    // Read to the END OF THE LINE, not up to the first "·" or backtick — those
    // are ordinary characters in a free-text `where` ("/portal/agency · Radar
    // tab", "the `Save` button"), and stopping at them threw the rest away.
    // The lookahead still understands the legacy "·"-joined meta line.
    const m = new RegExp(`\\*\\*${label}:\\*\\*[ \\t]*(.+?)[ \\t]*(?=$|\\s·\\s\\*\\*)`, "im").exec(md);
    if (!m) return undefined;
    const value = m[1].trim().replace(/^`/, "").replace(/`$/, "").trim();
    return value || undefined;
  };
  const titleMatch = /^#\s*Finding\s*—\s*(.+)$/m.exec(md);
  const noteMatch = /## What I saw\n([\s\S]*?)(?:\n## |\n---)/.exec(md);
  const status = (pick("Status") ?? "open").toLowerCase() as FindingStatus;
  const severity = (pick("Severity") ?? "bug").toLowerCase() as FindingSeverity;
  const images = [...md.matchAll(/!\[[^\]]*\]\(images\/([^)]+)\)/g)].map(m => m[1]);
  const planMatch = /\*\*Plan:\*\*\s*\[[^\]]+\]\(\.\.\/plans\/([^)]+)\)/.exec(md);
  const foundMatch = /\*\*Found:\*\*\s*([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2})/.exec(md);

  return {
    slug,
    relPath: `docs/development/findings/${slug}.md`,
    title: titleMatch ? titleMatch[1].trim() : slug,
    note: noteMatch ? unescapeNote(noteMatch[1]).trim() : "",
    where: pick("Where"),
    severity: ["blocker", "bug", "polish", "idea"].includes(severity) ? severity : "bug",
    status: ["open", "planned", "fixed"].includes(status) ? status : "open",
    images,
    createdAt: foundMatch ? Date.parse(foundMatch[1].replace(" ", "T") + "Z") || 0 : 0,
    planRelPath: planMatch ? `docs/development/plans/${planMatch[1]}` : undefined,
  };
}

export async function listFindings(): Promise<Finding[]> {
  let names: string[];
  try {
    names = await readdir(FINDINGS_DIR);
  } catch {
    return [];
  }
  const out: Finding[] = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".md")) continue;
    try {
      const md = await readFile(join(FINDINGS_DIR, name), "utf8");
      out.push(parseFinding(name.replace(/\.md$/i, ""), md));
    } catch { /* skip unreadable */ }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt || b.slug.localeCompare(a.slug));
}

export async function getFinding(slug: string): Promise<Finding | null> {
  const safe = slug.replace(/[^a-z0-9-]/gi, "");
  if (!safe) return null;
  try {
    const md = await readFile(confine(resolve(FINDINGS_DIR, `${safe}.md`)), "utf8");
    return parseFinding(safe, md);
  } catch {
    return null;
  }
}

/** Re-render a finding with a new status and/or the plan it fed. */
export async function updateFinding(
  slug: string,
  patch: { status?: FindingStatus; planRelPath?: string },
): Promise<Finding | null> {
  const existing = await getFinding(slug);
  if (!existing) return null;
  const next: Finding = {
    ...existing,
    status: patch.status ?? existing.status,
    planRelPath: patch.planRelPath ?? existing.planRelPath,
  };
  await writeFile(confine(resolve(FINDINGS_DIR, `${next.slug}.md`)), renderFindingMarkdown(next), "utf8");
  return next;
}

/** Read one screenshot for the gated image route. */
export async function readFindingImage(name: string): Promise<Buffer | null> {
  const safe = basename(name).replace(/[^a-z0-9._-]/gi, "");
  if (!safe || safe.includes("..")) return null;
  try {
    return await readFile(confine(resolve(IMAGES_DIR, safe)));
  } catch {
    return null;
  }
}

/**
 * The evidence block a generated plan embeds, so the worker sees what was seen.
 *
 * `maxChars` matters: createPlan() puts `notes` through its own single-line
 * sanitiser and hard-cuts at 2000 characters. Cutting there deleted whole
 * findings from the plan while the findings themselves were still marked
 * "planned" — the worker never learned they existed. Budgeting here means every
 * finding keeps its title, severity, where, screenshots and source link, and
 * only the free-text note gives ground.
 */
export function findingsAsPlanContext(findings: Finding[], maxChars?: number): string {
  const notes = findings.map(f => f.note.replace(/\s+/g, " ").trim() || "_(no note)_");
  const full = findings.map((f, i) => planEntry(f, notes[i])).join("\n");
  if (!maxChars || full.length <= maxChars || findings.length === 0) return full;

  const skeleton = findings.map(f => planEntry(f, "…")).join("\n").length;
  const perNote = Math.floor((maxChars - skeleton) / findings.length);
  const trimmed = findings
    .map((f, i) => planEntry(f, perNote >= 12 ? ellipsis(notes[i], perNote) : "…"))
    .join("\n");
  return trimmed.slice(0, maxChars);
}

function planEntry(f: Finding, note: string): string {
  const shots = f.images.length
    ? ` · Screenshots: ${f.images.map(i => `\`docs/development/findings/images/${i}\``).join(", ")}`
    : "";
  const where = f.where ? ` · \`${f.where}\`` : "";
  return `- **${f.title}** (${f.severity}${where}) — ${note}${shots} · Source: [${f.slug}](../findings/${f.slug}.md)`;
}

function ellipsis(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** createPlan() bounds `notes` at 2000 chars — build the block to fit inside it. */
const PLAN_NOTES_BUDGET = 2000;
const PLAN_NOTES_HEADING = "**Findings this plan came from**";

export function findingsAsPlanNotes(findings: Finding[]): string {
  // NOT a "## " heading: createPlan() collapses every newline in `notes`, so an
  // ATX heading here swallows the whole list into its own title.
  const room = PLAN_NOTES_BUDGET - PLAN_NOTES_HEADING.length - 1;
  return `${PLAN_NOTES_HEADING}\n${findingsAsPlanContext(findings, room)}`;
}

/**
 * The default title for a plan generated from a batch of findings.
 *
 * It has to be UNIQUE per batch. `Fix 2 findings` was not: createPlan() refuses
 * to clobber an existing plan, so the second two-finding batch ever selected
 * died on "a plan called fix-2-findings.md already exists. Pick a different
 * title." — advice the workspace cannot take, because it has no title field.
 */
export function defaultPlanTitle(findings: Finding[], now: number = Date.now()): string {
  return findings.length === 1
    ? findings[0].title
    : `Fix ${findings.length} findings — ${localDay(now)}`;
}

const DEFAULT_PLAN_GOAL =
  "Resolve the findings captured below. Each was seen in the running app; screenshots and notes are linked. "
  + "Treat the evidence as the spec — when every finding is genuinely gone, this is done.";

export interface PlanFromFindings {
  plan: NewPlanResult;
  /** The title actually used — may carry a counter if the first choice was taken. */
  title: string;
  findings: Finding[];
}

/**
 * Findings → plan, the headline action of this surface.
 *
 * Three things it guarantees, each of which used to fail:
 *   1. it never dies on a name collision — it counts up until it finds a free one;
 *   2. it CHECKS the written plan actually mentions every finding before it lets
 *      those findings leave the open list;
 *   3. if it can't, the findings stay open and the caller is told, rather than
 *      findings disappearing into a plan that never names them.
 */
export async function planFromFindings(
  findings: Finding[],
  options: { title?: string; goal?: string; now?: number } = {},
): Promise<PlanFromFindings> {
  if (findings.length === 0) throw new Error("Pick at least one finding.");
  const now = options.now ?? Date.now();
  const base = (options.title ?? "").trim() || defaultPlanTitle(findings, now);
  const goal = (options.goal ?? "").trim() || DEFAULT_PLAN_GOAL;

  const input = {
    goal,
    phases: findings.map(f => `${f.title}${f.where ? ` (${f.where})` : ""}`),
    notes: findingsAsPlanNotes(findings),
    priority: findings.some(f => f.severity === "blocker") ? ("high" as const) : ("med" as const),
  };

  let plan: NewPlanResult | null = null;
  let title = base;
  let collision: Error | null = null;
  for (let attempt = 1; attempt <= 25 && !plan; attempt += 1) {
    title = attempt === 1 ? base : `${base} (${attempt})`;
    try {
      plan = await createPlan({ ...input, title }, now);
    } catch (error) {
      if (!(error instanceof Error) || !/already exists/i.test(error.message)) throw error;
      collision = error;
    }
  }
  if (!plan) throw collision ?? new Error("Could not find a free filename for that plan.");

  // Verify BEFORE anything leaves the open list. A finding that isn't in the
  // plan must not be marked "planned".
  const written = await readFile(plan.absPath, "utf8");
  const missing = findings.filter(f => !written.includes(`(../findings/${f.slug}.md)`));
  if (missing.length > 0) {
    throw new Error(
      `The plan was written, but ${missing.length} of those findings did not fit inside it `
      + `(${missing.map(f => f.title).join(", ")}). They are still open — plan them in a smaller batch.`,
    );
  }

  const updated = await Promise.all(
    findings.map(async f => (await updateFinding(f.slug, { status: "planned", planRelPath: plan!.relPath })) ?? f),
  );
  return { plan, title, findings: updated };
}
