import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { ShieldCheck, CheckCircle2, AlertTriangle, CircleDot } from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { ensureHydrated } from "@/server/storage";
import {
  scanDevTeamAudit,
  readinessContextForAgency,
  countStillOpenFindings,
  type AuditFinding,
} from "@/lib/server/dev/devTeamAuditor";
import type { ReadinessGroup, ReadinessItem } from "@/lib/server/productionReadiness";
import { PageHeader, Panel, Pill, EmptyState } from "../_ui";

// Dev Team → Auditor — the dev-side health view: what isn't launch-ready, and
// what the independent audit flagged as still-broken behind a green suite.
// Reuses (read-only) `inspectProductionReadiness` (the checklist), `scanBlockers`
// (state.md launch blockers) and `scanAuditFindings` (audits.md 🔴 verdicts),
// composed in `scanDevTeamAudit`. Founder + Dev Mode only — the same layered
// gate as the layout/home/other sections.

// ---- readiness presentation ------------------------------------------------

const GROUP_ORDER: ReadinessGroup[] = ["core", "communication", "money", "development", "intelligence"];
const GROUP_LABEL: Record<ReadinessGroup, string> = {
  core: "Core",
  communication: "Communication",
  money: "Money",
  development: "Development",
  intelligence: "Intelligence",
};

type ToneKind = "ok" | "critical" | "warn" | "muted";
interface Tone {
  kind: ToneKind;
  label: string;
  dot: string;
}

// required + needs-setup = red/critical · optional = muted · ready = green.
function toneFor(item: ReadinessItem): Tone {
  if (item.status === "ready") return { kind: "ok", label: "Ready", dot: "var(--dev-success)" };
  if (item.status === "needs-setup") {
    return item.required
      ? { kind: "critical", label: "Needs setup", dot: "var(--dev-danger)" }
      : { kind: "warn", label: "Needs setup", dot: "var(--dev-warning)" };
  }
  return { kind: "muted", label: "Optional", dot: "var(--dev-faint)" };
}

// Sort order within a group (worst first) and the matching kit Pill tone.
const SEVERITY: Record<ToneKind, number> = { critical: 0, warn: 1, muted: 2, ok: 3 };
const PILL_TONE: Record<ToneKind, "ok" | "danger" | "warn" | "muted"> = {
  ok: "ok",
  critical: "danger",
  warn: "warn",
  muted: "muted",
};

function ReadinessRow({ item }: { item: ReadinessItem }) {
  const tone = toneFor(item);
  const Icon = tone.kind === "ok" ? CheckCircle2 : tone.kind === "muted" ? CircleDot : AlertTriangle;
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Icon size={16} aria-hidden className="mt-0.5 shrink-0" style={{ color: tone.dot }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-[color:var(--dt-ink)]">{item.label}</span>
          <Pill tone={PILL_TONE[tone.kind]}>
            {tone.label}
            {tone.kind === "critical" ? " · required" : ""}
          </Pill>
        </div>
        <p className="mt-0.5 text-xs leading-snug text-[color:var(--dt-muted)]">{item.summary}</p>
        {tone.kind !== "ok" ? <p className="mt-1 text-xs leading-snug text-[color:var(--dt-faint)]">{item.action}</p> : null}
      </div>
    </li>
  );
}

// ---- findings presentation -------------------------------------------------

function verdictColour(verdict: string): string {
  if (verdict.includes("🔴")) return "var(--dev-danger)";
  if (verdict.includes("✅")) return "var(--dev-success)";
  return "var(--dev-warning)";
}

// Soft tinted pill carrying the auditor's exact verdict phrase (e.g. `🔴 REWORK`).
function VerdictChip({ verdict }: { verdict: string }) {
  const colour = verdictColour(verdict);
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: colour, background: `${colour}14` }}
    >
      {verdict}
    </span>
  );
}

function truncate(s: string, n = 240): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

// One historical 🔴 ruling. `muted` is the "a later PASS closed this" treatment:
// still fully readable, visibly not a live alarm, and it names its closer.
function EntryRow({ finding, muted = false }: { finding: AuditFinding; muted?: boolean }) {
  return (
    <li className={`flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 ${muted ? "opacity-75" : ""}`}>
      {muted ? (
        <CheckCircle2 size={14} aria-hidden className="mt-1 shrink-0 text-[color:var(--dev-success)]" />
      ) : (
        <CircleDot size={14} aria-hidden className="mt-1 shrink-0 text-[color:var(--dev-danger)]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <VerdictChip verdict={finding.verdict} />
          <span className="min-w-0 font-medium text-[color:var(--dt-ink)]">{finding.title}</span>
          {finding.date ? (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[color:var(--dt-faint)]">{finding.date}</span>
          ) : null}
        </div>
        {finding.detail ? (
          <p className="mt-1 text-xs leading-snug text-[color:var(--dt-muted)]">{truncate(finding.detail)}</p>
        ) : null}
        {finding.supersededBy ? (
          <p className="mt-1 text-[11px] leading-snug text-[color:var(--dev-success)]">
            Closed by {finding.supersededBy.verdict}
            {finding.supersededBy.date ? ` (${finding.supersededBy.date})` : ""} — {finding.supersededBy.title}
          </p>
        ) : null}
      </div>
    </li>
  );
}

// ---- page ------------------------------------------------------------------

export async function AuditorSection({ tabs }: { tabs?: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  // Readiness must be judged on the same inputs Settings uses — env vars PLUS
  // the providers connected through the credential vault. Scanning with no
  // context makes the auditor blind to every in-app connection and puts the two
  // screens in disagreement about the same provider.
  const audit = await scanDevTeamAudit(readinessContextForAgency(session.agencyId));
  const { readiness, blockers, findings } = audit;

  const requiredItems = readiness.items.filter(i => i.required);
  const requiredNotReady = requiredItems.filter(i => i.status !== "ready");
  const readyCount = readiness.items.filter(i => i.status === "ready").length;
  const totalCount = readiness.items.length;
  const grouped = GROUP_ORDER
    .map(group => ({
      group,
      items: readiness.items
        .filter(i => i.group === group)
        .sort((a, b) => SEVERITY[toneFor(a).kind] - SEVERITY[toneFor(b).kind]),
    }))
    .filter(g => g.items.length > 0);

  const openBanners = findings.filter(f => f.source === "banner" && !f.resolved);
  const reworkEntries = findings.filter(f => f.source === "entry");
  const clearedBanners = findings.filter(f => f.source === "banner" && f.resolved);
  const noFindings = openBanners.length === 0 && reworkEntries.length === 0;
  // `openCount` is the BANNER ledger only — the auditor's curated "open right
  // now" list, which is what the "N open now" sub-label means.
  const openCount = openBanners.length;
  // The log keeps every 🔴 ruling ever made, so the list of rulings is NOT the
  // list of live problems. Split it on authored evidence: an entry is "closed"
  // only when a later ✅ ruling (or a ✅ RESOLVED banner) about the same subject
  // exists. Everything else stays in the unresolved group — over-surfacing is
  // safe, mislabelling something closed is not. Nothing is dropped either way.
  const unresolvedEntries = reworkEntries.filter(f => !f.supersededBy);
  const closedEntries = reworkEntries.filter(f => f.supersededBy);
  // The header pill is the glanceable summary of the WHOLE section, so it has to
  // count everything this page treats as still open — the banners AND the
  // unresolved rulings listed below. Counting banners alone renders a green
  // "All clear" directly above a red "4 rulings with no recorded resolution".
  // Shared rule, so the pill cannot drift from the lists.
  const stillOpenCount = countStillOpenFindings(findings);

  const openBlockers = blockers.filter(b => !b.resolved);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        icon={<ShieldCheck size={20} />}
        accent="auditor"
        title="Auditor"
        subtitle="Dev-side health — what's launch-ready, and what audits have flagged."
        meta={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tabs}
            <Pill tone={openCount > 0 ? "danger" : stillOpenCount > 0 ? "warn" : "ok"}>
              {stillOpenCount > 0 ? `${stillOpenCount} open` : "All clear"}
            </Pill>
          </div>
        }
      />

      {/* 1 — Launch readiness */}
      <Panel
        title="Launch readiness"
        hint={`${readiness.environment} environment`}
        right={<span className="text-xs tabular-nums text-[color:var(--dt-faint)]">{readyCount} / {totalCount} ready</span>}
      >
        <div
          className="mb-4 flex items-start gap-3 rounded-xl border p-3.5"
          style={
            readiness.ready
              ? { background: "var(--dev-accent-soft)", borderColor: "var(--dev-success-line)" }
              : { background: "var(--dev-danger-soft)", borderColor: "var(--dev-danger-line)" }
          }
        >
          {readiness.ready ? (
            <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--dev-success)" }} />
          ) : (
            <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--dev-danger)" }} />
          )}
          <div className="min-w-0 text-sm">
            <span className="font-semibold text-[color:var(--dt-ink)]">
              {readiness.ready ? "Launch-ready" : "Not launch-ready"}
            </span>
            <span className="text-[color:var(--dt-muted)]">
              {" — "}
              {readiness.ready
                ? `all ${requiredItems.length} required checks pass`
                : `${requiredNotReady.length} of ${requiredItems.length} required checks need setup`}
              .
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {grouped.map(({ group, items }) => (
            <div key={group}>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">
                {GROUP_LABEL[group]}
              </h3>
              <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
                {items.map(item => (
                  <ReadinessRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      {/* 2 — Open audit findings */}
      <Panel
        title="Audit findings"
        hint="🔴 verdicts — where a passing suite still hides broken behaviour or an overclaim."
        right={
          <span className="flex items-center gap-1.5">
            {/* A green zero here would contradict the warn pill beside it, so
                "0 open now" only reads as good news when nothing is unresolved. */}
            <Pill tone={openCount > 0 ? "danger" : unresolvedEntries.length > 0 ? "muted" : "ok"}>
              {openCount} open now
            </Pill>
            {unresolvedEntries.length > 0 ? (
              <Pill tone="warn">{unresolvedEntries.length} unresolved in the log</Pill>
            ) : null}
          </span>
        }
      >
        {noFindings ? (
          <EmptyState>No open findings. The audit log is clean.</EmptyState>
        ) : (
          <div className="flex flex-col gap-5">
            {openBanners.length > 0 ? (
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--dev-danger)]">Open now</h3>
                <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
                  {openBanners.map((f, i) => (
                    <li key={`banner-${i}`} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--dev-danger)]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="min-w-0 font-medium text-[color:var(--dt-ink)]">{truncate(f.title, 160)}</span>
                          <VerdictChip verdict={f.verdict} />
                        </div>
                        {f.detail ? (
                          <p className="mt-0.5 text-xs leading-snug text-[color:var(--dt-muted)]">{truncate(f.detail)}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {reworkEntries.length > 0 ? (
              <div className="flex flex-col gap-5">
                {unresolvedEntries.length > 0 ? (
                  <div>
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--dev-danger)]">
                      🔴 rulings with no recorded resolution ({unresolvedEntries.length})
                    </h3>
                    <p className="mb-2 text-[11px] leading-snug text-[color:var(--dt-faint)]">
                      No later ✅ PASS or cleared banner mentions these, so treat them as still open.
                    </p>
                    <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
                      {unresolvedEntries.map((f, i) => (
                        <EntryRow key={`unresolved-${i}`} finding={f} />
                      ))}
                    </ul>
                  </div>
                ) : null}

                {closedEntries.length > 0 ? (
                  <div>
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">
                      Historical — closed by a later ✅ PASS ({closedEntries.length})
                    </h3>
                    <p className="mb-2 text-[11px] leading-snug text-[color:var(--dt-faint)]">
                      Kept for the record. Each one names the ruling that closed it, so the claim can be checked.
                    </p>
                    <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
                      {closedEntries.map((f, i) => (
                        <EntryRow key={`closed-${i}`} finding={f} muted />
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="text-[11px] text-[color:var(--dt-faint)]">
                  Resolutions are recorded as later ✅ PASS entries and cleared banners, not by editing these rulings —
                  so a ruling with nothing pointing at it is unresolved, not necessarily still broken. Nothing here is
                  hidden; the split is the evidence, not a judgement.
                </p>
              </div>
            ) : null}

            {clearedBanners.length > 0 ? (
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--dt-faint)]">Recently cleared</h3>
                <ul className="flex flex-col gap-1.5">
                  {clearedBanners.map((f, i) => (
                    <li key={`cleared-${i}`} className="flex items-start gap-2 text-xs text-[color:var(--dt-muted)]">
                      <CheckCircle2 size={14} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--dev-success)]" />
                      <span className="min-w-0">{truncate(f.title, 160)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Panel>

      {/* 3 — Launch blockers (compact) */}
      <Panel title="Launch blockers" hint="Live from state.md">
        {openBlockers.length === 0 ? (
          <EmptyState>No open blockers.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--dt-hairline)]">
            {openBlockers.map((b, i) => (
              <li key={i} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--dev-danger)]" />
                <span className="text-sm">
                  <span className="font-medium text-[color:var(--dt-ink)]">{b.label}</span>
                  {b.detail ? <span className="text-[color:var(--dt-muted)]"> — {b.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-[11px] text-[color:var(--dt-faint)]">
        Live from the launch-readiness checks, <code className="text-[color:var(--dt-faint)]">docs/context/state.md</code> and{" "}
        <code className="text-[color:var(--dt-faint)]">docs/development/audits.md</code>.
      </p>
    </div>
  );
}
