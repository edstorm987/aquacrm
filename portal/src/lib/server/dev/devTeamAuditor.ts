import "server-only";
// Dev Team Auditor — a read-only "what's not launch-ready + what the audit flagged"
// model for the founder Dev Team portal. Same shape as devTeamBoard.ts: pure
// parsers over markdown, each with a thin `scan*` wrapper that reads the real
// file off disk, plus a compose step. Read-only by contract — this module never
// writes, and (like devDocs.ts / devTeamBoard.ts) every read is confined to the
// repo `docs/` tree under `PROJECT_ROOT`. The gate lives on the page, not here.
//
// Three signals, composed by `scanDevTeamAudit`:
//   • launch readiness  → reuse `inspectProductionReadiness` (the checklist)
//   • launch blockers   → reuse `scanBlockers` (state.md's `## Blockers`)
//   • open audit findings → `parseAuditFindings` over docs/development/audits.md
//
// The audit log is written newest-first by the independent auditor. Two things
// there mean "still broken behind a green suite":
//   • the LOUD banner ledger at the very top (blockquotes) — the auditor's
//     curated, de-duplicated list of what is currently open (a REWORK gets a
//     loud line; it flips to a ✅ RESOLVED line when closed); and
//   • any dated verdict entry (`## YYYY-MM-DD — <verdict> — <title>`) whose
//     verdict is 🔴 REWORK / 🔴 HELD / any open 🔴 — the record of every rework
//     ruling, oldest kept for history.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  PROJECT_ROOT,
  scanBlockers,
  type DevDocBlocker,
} from "@/lib/server/dev/devDocs";
import {
  inspectProductionReadiness,
  type ProductionReadiness,
  type ReadinessContext,
} from "@/lib/server/productionReadiness";
import { listManagedIntegrationProviders } from "@/lib/server/integrations/integrationConnections";
import { listExternalAssistantApiKeys } from "@/lib/server/assistants/externalAssistantKeys";
import { listClients } from "@/server/tenants";

// audits.md lives here (relative to the portal root, like state.md in devDocs).
const AUDITS_DOC_REL = "docs/development/audits.md";

// The verdict glyphs the auditor leads a banner with. Only these start a banner.
const BANNER_MARKERS = ["✅", "🔴", "🟠", "🟡", "📋", "⚠", "🎉"] as const;

// ---- shapes ----------------------------------------------------------------

export interface AuditFinding {
  /** Where it came from: the loud top-of-file banner ledger, or a dated verdict entry. */
  source: "banner" | "entry";
  /** The subject the finding is about, e.g. `client erasure: PII hole NOT closed`. */
  title: string;
  /** The verdict marker phrase, e.g. `🔴 REWORK`, `🔴 REWORK (re-audit)`, `🔴 HELD`, `✅ RESOLVED`. */
  verdict: string;
  /** One-line context: the entry's `**Verdict:**` summary, or the banner's continuation text. */
  detail?: string;
  /** True only when the item's OWN text marks it closed (a ✅ RESOLVED / CLOSED banner). */
  resolved: boolean;
  /**
   * The verdict date (YYYY-MM-DD): the heading date for dated entries, or the
   * date the auditor stamped into a banner's label (`RESOLVED (2026-08-19, …)`).
   * Absent when the banner carries no date — which means it can never be read
   * as closing anything (see the recency guard in `parseAuditFindings`).
   */
  date?: string;
  /**
   * The later ruling that closed this one, when there is EXPLICIT evidence for
   * it: a newer ✅ entry about the same subject, or a ✅ RESOLVED banner naming
   * it. Absent means "no evidence it was closed" — which is not the same as
   * "still broken", so the UI must label it as unresolved, never drop it.
   */
  supersededBy?: { verdict: string; title: string; date?: string };
}

export interface DevTeamAudit {
  /** The launch-readiness checklist (reused, read-only). */
  readiness: ProductionReadiness;
  /** Open launch blockers parsed from state.md (reused, read-only). */
  blockers: DevDocBlocker[];
  /** Open audit findings + the resolved banner ledger, newest-first. */
  findings: AuditFinding[];
  scannedAtMs: number;
}

// ---- text helpers ----------------------------------------------------------

/**
 * Strip markdown chrome from a line; keep emoji + words. Mirrors
 * `devTeamBoard.cleanInline` — notably it does NOT strip `_`, so technical
 * identifiers in audit titles (e.g. `brand_enquiries`) survive intact.
 */
function cleanInline(s: string): string {
  return s
    .replace(/~~/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](href) → text
    .replace(/[`*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The leading verdict glyph, or null when the text doesn't start with one. */
function leadingMarker(text: string): string | null {
  for (const m of BANNER_MARKERS) {
    if (text.startsWith(m)) return m;
  }
  return null;
}

// ---- subject matching (which later PASS closed which earlier REWORK) -------

// Audit vocabulary + ordinary English. These words appear in almost every
// title, so they carry no subject information and must not count towards a
// match — "Phase" especially, or Phase 1 and Phase 2 of the same plan would
// read as the same subject.
const SUBJECT_STOPWORDS = new Set([
  "the", "and", "for", "with", "not", "its", "was", "are", "into", "from", "that", "this", "still",
  "audit", "auditor", "re", "audited", "verdict", "pass", "passes", "passed", "rework", "held", "hold",
  "open", "closed", "close", "resolved", "resolve", "fix", "fixed", "phase", "phases", "plan", "complete",
  "only", "but", "all", "new", "now", "per", "via", "one", "two", "test", "tests", "tested", "suite",
]);

/** Distinctive words in a title — what the finding is actually ABOUT. */
function subjectTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !/^\d+$/.test(w) && !SUBJECT_STOPWORDS.has(w));
  return new Set(words);
}

/**
 * True when `later` is unmistakably about the same subject as `earlier`.
 * Deliberately strict — a false "closed" label would hide a live problem, which
 * is the one failure mode that matters here. Requires BOTH a decent absolute
 * overlap and that the later ruling covers most of what the earlier one named.
 */
function sameSubject(earlier: string, later: string): boolean {
  const a = subjectTokens(earlier);
  const b = subjectTokens(later);
  if (a.size < 3) return false;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared >= 4 && shared / a.size >= 0.55;
}

// ---- banner ledger ---------------------------------------------------------

/**
 * Split `**LABEL** — the headline…` into its two halves.
 *
 * NOT on the first em-dash: the auditor's own house style puts em-dashes INSIDE
 * the bold label (`**RESOLVED (2026-08-19, auditor — tick 16)**`), so a first-dash
 * split lands inside the label, leaks it into the headline ("tick 16) — client
 * erasure…") and never finds the real separator. Take the text after the CLOSING
 * `**` instead, and only fall back to a bare ` — ` split when there is no bold
 * label at all.
 */
function splitBannerLabel(afterMarker: string): { label: string; body: string } {
  const text = afterMarker.trim();
  const bold = /^\*\*([\s\S]*?)\*\*\s*(?:[—–-]\s*)?([\s\S]*)$/.exec(text);
  if (bold) return { label: bold[1].trim(), body: bold[2].trim() };
  const sep = text.search(/\s—\s/);
  if (sep >= 0) return { label: text.slice(0, sep).trim(), body: text.slice(sep).replace(/^\s—\s/, "").trim() };
  return { label: "", body: text };
}

/**
 * First sentence of `text` (the headline), plus everything after it. Banners are
 * written as a headline followed by a paragraph of evidence; only the headline
 * is the subject, and only the headline belongs in a one-line list item.
 */
function splitHeadline(text: string): { headline: string; rest: string } {
  const m = /^([\s\S]{24,}?[.!?])\s+(?=\S)/.exec(text);
  if (!m) return { headline: text.trim(), rest: "" };
  return { headline: m[1].trim(), rest: text.slice(m[0].length).trim() };
}

/**
 * Turn one blockquote group (its `>`-stripped lines) into a finding. The first
 * line is `<marker> **<LABEL>** — <headline>` (loud banners prefix a `## `); the
 * rest of that line plus any following lines are detail. Null when the group
 * isn't a verdict banner.
 */
function bannerFromGroup(rawLines: string[]): AuditFinding | null {
  const first = rawLines[0].replace(/^#{1,6}\s+/, "").trim();
  const marker = leadingMarker(first);
  if (!marker) return null;

  const afterMarker = first.slice(marker.length).trim();
  const { label, body } = splitBannerLabel(afterMarker);
  // KEYWORD = the first word of the label (it may sit inside a `**bold**` one).
  const kw = /([A-Za-z]+)/.exec((label || body).replace(/\*/g, ""));
  const keyword = kw ? kw[1] : "";
  const verdict = cleanInline(`${marker} ${keyword}`);
  // Resolved only when the banner's OWN lead says so — a trailing "was a 🔴"
  // reference must not flip a genuinely-closed line back to open.
  const resolved = marker === "✅" || /\b(RESOLVED|CLOSED|DONE|PASS)\b/i.test(keyword);
  // The auditor stamps the ruling's date into the label. It is what makes a
  // banner comparable with a dated entry.
  const dateM = /(\d{4}-\d{2}-\d{2})/.exec(label);

  const { headline, rest } = splitHeadline(cleanInline(body || afterMarker));
  const detail = cleanInline([rest, ...rawLines.slice(1)].join(" "));

  return {
    source: "banner",
    title: headline,
    verdict,
    detail: detail || undefined,
    resolved,
    date: dateM ? dateM[1] : undefined,
  };
}

// ---- dated verdict entries -------------------------------------------------

interface EntryDraft {
  date: string;
  verdict: string;
  title: string;
  open: boolean;
  detail?: string;
}

/** A ✅ ruling, kept only to work out which earlier 🔴 it closed. */
interface ClosingEntry {
  verdict: string;
  title: string;
  date: string;
  /** Position in the file — lower is NEWER (the log is written newest-first). */
  index: number;
}

/** True when a heading verdict segment is an OPEN 🔴 rework/held ruling. */
function isOpenVerdict(verdictSeg: string): boolean {
  return /🔴/.test(verdictSeg) || /\bREWORK\b/i.test(verdictSeg) || /\bHELD\b/i.test(verdictSeg);
}

// ---- the pure parser -------------------------------------------------------

/**
 * Parse audits.md into findings, newest-first. Two sources:
 *   • the loud banner ledger — blockquote groups ABOVE the first dated verdict
 *     entry (that region alone holds the curated open/resolved banners); and
 *   • every dated `## YYYY-MM-DD — <verdict> — <title>` whose verdict is an open
 *     🔴 REWORK / HELD (kept as `resolved: false`; its `**Verdict:**` line becomes
 *     the detail). ✅/🟡/🟠/📋 verdicts are not findings and are skipped — the
 *     open test reads the heading verdict segment, never the body prose (a ✅ PASS
 *     entry can reference a 🔴 in its summary without being open).
 * Fenced code blocks (the format example) are ignored throughout.
 */
export function parseAuditFindings(md: string): AuditFinding[] {
  const lines = md.split(/\r?\n/);
  const findings: AuditFinding[] = [];

  // Where the dated entries begin — the banner ledger is everything above it.
  let inFence = false;
  let firstEntryIdx = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) { inFence = !inFence; continue; }
    if (!inFence && /^##\s+\d{4}-\d{2}-\d{2}\s/.test(lines[i])) { firstEntryIdx = i; break; }
  }

  // 1) Banner ledger — consecutive `>` lines form one banner; a blank/non-`>`
  //    line ends it. Bounded to [0, firstEntryIdx) so mid-file quotes are never
  //    mistaken for banners.
  inFence = false;
  let group: string[] = [];
  const flushGroup = () => {
    if (group.length) {
      const banner = bannerFromGroup(group);
      if (banner) findings.push(banner);
      group = [];
    }
  };
  for (let i = 0; i < firstEntryIdx; i++) {
    const raw = lines[i];
    if (/^```/.test(raw)) { inFence = !inFence; flushGroup(); continue; }
    if (inFence) continue;
    const bq = /^>\s?(.*)$/.exec(raw);
    if (bq) group.push(bq[1]);
    else flushGroup();
  }
  flushGroup();

  // 2) Dated verdict entries — keep the open 🔴 ones as findings, and keep the
  //    ✅ ones (only their headings) so each 🔴 can be matched to the later
  //    ruling that closed it.
  inFence = false;
  let cur: EntryDraft | null = null;
  let curIndex = 0;
  const openEntries: Array<{ finding: AuditFinding; index: number }> = [];
  const closers: ClosingEntry[] = [];
  const flushEntry = () => {
    if (!cur) return;
    if (cur.open) {
      const finding: AuditFinding = {
        source: "entry",
        title: cur.title,
        verdict: cur.verdict,
        detail: cur.detail,
        resolved: false,
        date: cur.date,
      };
      openEntries.push({ finding, index: curIndex });
      findings.push(finding);
    } else if (cur.verdict.includes("✅")) {
      closers.push({ verdict: cur.verdict, title: cur.title, date: cur.date, index: curIndex });
    }
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^```/.test(raw)) { inFence = !inFence; continue; }
    if (inFence) continue;

    const h = /^##\s+(\d{4}-\d{2}-\d{2})\s+—\s+(.+)$/.exec(raw);
    if (h) {
      flushEntry();
      const rest = h[2]; // "<verdict> — <title>"
      const emIdx = rest.indexOf("—");
      const verdictSeg = (emIdx >= 0 ? rest.slice(0, emIdx) : rest).trim();
      const title = cleanInline(emIdx >= 0 ? rest.slice(emIdx + 1) : "");
      cur = { date: h[1], verdict: cleanInline(verdictSeg), title, open: isOpenVerdict(verdictSeg) };
      curIndex = i;
      continue;
    }
    // First `**Verdict:**` line in the entry body becomes its one-line detail.
    if (cur && cur.detail === undefined) {
      const v = /^\*\*Verdict:\*\*\s*(.+)$/.exec(raw);
      if (v) cur.detail = cleanInline(v[1]);
    }
  }
  flushEntry();

  // 3) Attach the closing ruling to each open 🔴, where there is evidence.
  //    Evidence is one of two AUTHORED things — never a guess:
  //      • a ✅ entry that is NEWER (nearer the top) and about the same subject;
  //      • a ✅ RESOLVED banner in the ledger that is DATED, is not older than
  //        the ruling, and names the same subject.
  //    Nothing is removed from `findings`: an entry that a later PASS closed is
  //    still returned, just labelled with what closed it.
  //
  //    Both paths are recency-guarded, and they must be. The ledger at the top
  //    of audits.md is permanent ("recently cleared" never expires), so an
  //    unguarded banner would keep closing every FUTURE 🔴 about the same
  //    subject forever — a regression re-opened next month would render as
  //    historical, which is the one failure mode this module exists to avoid.
  //    An undated banner therefore closes nothing at all, and the match is made
  //    against the banner's headline only (its evidence paragraph is prose, and
  //    matching on it hands the subject matcher a vocabulary wide enough to
  //    swallow any related rework).
  const resolvedBanners = findings.filter(f => f.source === "banner" && f.resolved);
  for (const { finding, index } of openEntries) {
    const closer = closers
      .filter(c => c.index < index) // newer than the finding
      .sort((left, right) => right.index - left.index) // nearest first
      .find(c => sameSubject(finding.title, c.title));
    if (closer) {
      finding.supersededBy = { verdict: closer.verdict, title: closer.title, date: closer.date };
      continue;
    }
    const banner = resolvedBanners.find(b =>
      b.date !== undefined
      && finding.date !== undefined
      && b.date >= finding.date // never let an older clearance close a newer ruling
      && sameSubject(finding.title, b.title));
    if (banner) finding.supersededBy = { verdict: banner.verdict, title: banner.title, date: banner.date };
  }

  return findings;
}

/**
 * Everything the auditor view treats as STILL OPEN: the auditor's own open
 * banners PLUS every 🔴 ruling with no recorded resolution. One rule, exported,
 * so the glanceable header count cannot drift from the lists underneath it —
 * counting banners alone renders a green "All clear" above a red list of
 * unresolved rulings, which is the opposite of the truth.
 */
export function countStillOpenFindings(findings: AuditFinding[]): number {
  const openBanners = findings.filter(f => f.source === "banner" && !f.resolved).length;
  const unresolvedEntries = findings.filter(f => f.source === "entry" && !f.supersededBy).length;
  return openBanners + unresolvedEntries;
}

/** Read audits.md and parse it. Gate-free (the page gates before calling). */
export async function scanAuditFindings(): Promise<AuditFinding[]> {
  try {
    const raw = await readFile(join(PROJECT_ROOT, AUDITS_DOC_REL), "utf8");
    return parseAuditFindings(raw);
  } catch {
    return [];
  }
}

// ---- compose ---------------------------------------------------------------

/**
 * The workspace half of the readiness inputs, for one agency — the SAME context
 * `/portal/agency/settings` builds (settings/page.tsx). Readiness is not a pure
 * function of `process.env`: a provider connected through the credential vault
 * (`managedIntegrationProviders`) is as real as an env key, and the assistant /
 * email / billing rows read these counts. Without it the auditor reports a
 * provider as offline while Settings reports it ready — two screens disagreeing
 * about one fact, with the auditor taking the wrong side.
 *
 * Reads live state, so the caller must have hydrated storage first.
 */
export function readinessContextForAgency(agencyId: string): ReadinessContext {
  const clients = listClients(agencyId);
  const activeClients = clients.filter(client => client.status === "active");
  return {
    activeClientCount: activeClients.length,
    billingConfiguredClientCount: activeClients.filter(client => {
      const paymentLink = client.metadata?.stripeLink;
      return typeof paymentLink === "string" && paymentLink.trim().length > 0;
    }).length,
    activeExternalAssistantKeyCount: listExternalAssistantApiKeys(agencyId)
      .filter(key => key.status === "active").length,
    managedIntegrationProviders: listManagedIntegrationProviders(agencyId),
  };
}

/**
 * Compose all three signals. Readiness is synchronous; the two disk scans run
 * in parallel. Gate-free — the page asserts founder + Dev Mode before calling.
 *
 * `context` carries the vault-connected providers and workspace counts (build it
 * with `readinessContextForAgency`). Omit it only where there is no agency in
 * scope — the readiness rows then see env vars alone and will under-report every
 * provider connected in-app.
 */
export async function scanDevTeamAudit(context: ReadinessContext = {}): Promise<DevTeamAudit> {
  const [blockers, findings] = await Promise.all([scanBlockers(), scanAuditFindings()]);
  const readiness = inspectProductionReadiness(process.env, context);
  return { readiness, blockers, findings, scannedAtMs: Date.now() };
}
