// Client-reports service.
//
// Storage layout (per-install — install is per-client):
//   reports/index             → string[] of report ids
//   reports/by-id/<id>        → Report
//   reports/by-phase/<phaseId> → string[] of report ids

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CreateDraftFromPhaseOpts,
  CreateReportInput,
  PhaseAdvancedEvent,
  Report,
  ReportSection,
  ReportStatus,
  SectionKind,
  UpdateReportPatch,
} from "../lib/domain";
import {
  METRICS_PLACEHOLDER_BODY,
  REPORT_TRANSITIONS,
  SECTION_KINDS,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const REPORT_INDEX = "reports/index";
const reportKey = (id: string): string => `reports/by-id/${id}`;
const reportPhaseKey = (pid: string): string => `reports/by-phase/${pid}`;

export class ReportNotFoundError extends Error {
  constructor(message = "client-reports: not found") { super(message); this.name = "ReportNotFoundError"; }
}
export class InvalidReportTransitionError extends Error {
  constructor(public from: ReportStatus, public to: ReportStatus) {
    super(`client-reports: cannot transition report ${from} → ${to}`);
    this.name = "InvalidReportTransitionError";
  }
}

async function pushIndex(storage: StoragePort, key: string, id: string): Promise<void> {
  const ids = (await storage.get<string[]>(key)) ?? [];
  if (!ids.includes(id)) await storage.set(key, [...ids, id]);
}
async function removeFromIndex(storage: StoragePort, key: string, id: string): Promise<void> {
  const ids = (await storage.get<string[]>(key)) ?? [];
  const next = ids.filter(x => x !== id);
  if (next.length !== ids.length) await storage.set(key, next);
}

export interface ReportDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export class ReportService {
  private readonly agencyId: AgencyId;
  private readonly clientId: ClientId;
  private readonly storage: StoragePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;

  constructor(deps: ReportDeps) {
    this.agencyId = deps.agencyId;
    this.clientId = deps.clientId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
  }

  private inScope(r: Report): boolean {
    return r.agencyId === this.agencyId && r.clientId === this.clientId;
  }

  // ── Read ─────────────────────────────────────────────────────────

  async list(filter: { status?: ReportStatus; phaseId?: string; sharedOnly?: boolean } = {}): Promise<Report[]> {
    const ids = (await this.storage.get<string[]>(REPORT_INDEX)) ?? [];
    const out: Report[] = [];
    for (const id of ids) {
      const r = await this.storage.get<Report>(reportKey(id));
      if (!r || !this.inScope(r)) continue;
      if (filter.status && r.status !== filter.status) continue;
      if (filter.phaseId && r.phaseId !== filter.phaseId) continue;
      if (filter.sharedOnly && (!r.sharedWithCustomer || r.status === "draft")) continue;
      out.push(r);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<Report | null> {
    const r = await this.storage.get<Report>(reportKey(id));
    return r && this.inScope(r) ? r : null;
  }

  // ── Mutate ──────────────────────────────────────────────────────

  async create(actor: UserId, input: CreateReportInput): Promise<Report> {
    if (!input.phaseId) throw new Error("client-reports: phaseId required");
    if (!input.title.trim()) throw new Error("client-reports: title required");
    const t = now();
    const sections = (input.sections ?? []).map((s, idx) => ({
      ...s,
      id: makeId("rsec"),
      ordering: idx,
    } satisfies ReportSection));
    const r: Report = {
      id: makeId("rpt"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      phaseId: input.phaseId,
      status: "draft",
      title: input.title.trim(),
      sections,
      sharedWithCustomer: false,
      createdBy: actor,
      createdAt: t, updatedAt: t,
    };
    await this.storage.set(reportKey(r.id), r);
    await pushIndex(this.storage, REPORT_INDEX, r.id);
    await pushIndex(this.storage, reportPhaseKey(input.phaseId), r.id);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "reports", action: "reports.report.created",
      message: `Report draft created: ${r.title}`,
      metadata: { reportId: r.id, phaseId: r.phaseId },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "reports.report.created", { id: r.id, phaseId: r.phaseId, title: r.title });
    return r;
  }

  async update(actor: UserId, id: string, patch: UpdateReportPatch): Promise<Report> {
    const cur = await this.get(id);
    if (!cur) throw new ReportNotFoundError();
    const t = now();
    const sections = patch.sections
      ? patch.sections.map((s, idx) => ({ ...s, ordering: idx }))
      : cur.sections;
    const next: Report = {
      ...cur,
      title: patch.title?.trim() || cur.title,
      sharedWithCustomer: patch.sharedWithCustomer ?? cur.sharedWithCustomer,
      sections,
      updatedAt: t,
    };
    await this.storage.set(reportKey(id), next);
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "reports.report.updated", { id, title: next.title });
    return next;
  }

  async transition(actor: UserId, id: string, to: ReportStatus): Promise<Report> {
    const cur = await this.get(id);
    if (!cur) throw new ReportNotFoundError();
    const allowed = REPORT_TRANSITIONS[cur.status];
    if (!allowed.includes(to)) throw new InvalidReportTransitionError(cur.status, to);
    const t = now();
    const next: Report = {
      ...cur,
      status: to,
      publishedAt: to === "published" ? (cur.publishedAt ?? t) : cur.publishedAt,
      sentAt: to === "sent" ? t : cur.sentAt,
      updatedAt: t,
    };
    await this.storage.set(reportKey(id), next);
    if (cur.status !== to) {
      const action = `reports.report.${to}`;
      this.activity.logActivity({
        agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
        category: "reports", action,
        message: `Report ${cur.title}: ${cur.status} → ${to}`,
        metadata: { reportId: id, from: cur.status, to },
      });
      this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
        action, { id, title: next.title, from: cur.status, to });
    }
    return next;
  }

  async publish(actor: UserId, id: string): Promise<Report> {
    return this.transition(actor, id, "published");
  }

  async markSent(actor: UserId, id: string): Promise<Report> {
    return this.transition(actor, id, "sent");
  }

  async delete(actor: UserId, id: string): Promise<void> {
    const cur = await this.get(id);
    if (!cur) throw new ReportNotFoundError();
    await this.storage.del(reportKey(id));
    await removeFromIndex(this.storage, REPORT_INDEX, id);
    await removeFromIndex(this.storage, reportPhaseKey(cur.phaseId), id);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "reports", action: "reports.report.deleted",
      message: `Report deleted: ${cur.title}`,
      metadata: { reportId: id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "reports.report.deleted", { id, title: cur.title });
  }

  // ── Auto-draft from phase advance ──────────────────────────────

  // Idempotent per phase: if a draft report already exists for this
  // phase, returns the existing one without creating a duplicate.
  // Foundation calls this from its phase-advance event router.
  async createDraftFromPhase(actor: UserId, opts: CreateDraftFromPhaseOpts): Promise<Report> {
    const existing = await this.list({ phaseId: opts.phaseId, status: "draft" });
    if (existing.length > 0) {
      const first = existing[0];
      if (first) return first;
    }
    const phaseLabel = opts.phaseLabel ?? opts.phaseId;
    const sections = buildDefaultSections({
      phaseLabel,
      deliverables: opts.deliverables ?? [],
      metricsConnectors: opts.metricsConnectors ?? [],
    });
    const r = await this.create(actor, {
      phaseId: opts.phaseId,
      title: `${phaseLabel} — phase report`,
      sections,
    });
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "reports", action: "reports.draft.from_phase",
      message: `Auto-drafted phase report for ${phaseLabel}`,
      metadata: { reportId: r.id, phaseId: opts.phaseId },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "reports.draft.from_phase", { id: r.id, phaseId: opts.phaseId });
    return r;
  }

  // Subscriber-style helper for the foundation phase-advance event.
  // Drafts a report for the phase that just COMPLETED (fromPhaseId).
  async onPhaseAdvanced(args: PhaseAdvancedEvent, actor: UserId = "system"): Promise<Report> {
    return this.createDraftFromPhase(actor, {
      phaseId: args.fromPhaseId,
      ...(args.fromPhaseLabel !== undefined ? { phaseLabel: args.fromPhaseLabel } : {}),
      ...(args.deliverables !== undefined ? { deliverables: args.deliverables } : {}),
      ...(args.metricsConnectors !== undefined ? { metricsConnectors: args.metricsConnectors } : {}),
    });
  }
}

function buildDefaultSections(args: {
  phaseLabel: string;
  deliverables: string[];
  metricsConnectors: string[];
}): Array<Omit<ReportSection, "id" | "ordering">> {
  const out: Array<Omit<ReportSection, "id" | "ordering">> = [];
  out.push({
    kind: "summary",
    title: "Summary",
    body: `Phase **${args.phaseLabel}** is complete. This report captures what we shipped, what changed, and what comes next.`,
  });

  // One metrics block per connector when wired; otherwise a single
  // placeholder metrics block (chapter #68 honesty contract).
  if (args.metricsConnectors.length === 0) {
    out.push({
      kind: "metrics",
      title: "Metrics",
      body: METRICS_PLACEHOLDER_BODY,
      data: { rows: [], placeholder: "Connect a metrics source to populate this section." },
    });
  } else {
    for (const connector of args.metricsConnectors) {
      out.push({
        kind: "metrics",
        title: `${connector.toUpperCase()} metrics`,
        body: METRICS_PLACEHOLDER_BODY,
        data: { rows: [], connector, placeholder: `Connect ${connector} to populate this section.` },
      });
    }
  }

  out.push({
    kind: "wins",
    title: "Wins",
    body: "- Highlight a meaningful win here.",
  });

  if (args.deliverables.length > 0) {
    out.push({
      kind: "deliverables",
      title: "Deliverables",
      body: args.deliverables.map(d => `- ${d}`).join("\n"),
    });
  } else {
    out.push({
      kind: "deliverables",
      title: "Deliverables",
      body: "- (No tracked deliverables for this phase yet.)",
    });
  }

  out.push({
    kind: "next-steps",
    title: "What's next",
    body: "- Outline the next phase's focus and any client actions required.",
  });
  return out;
}

// Re-export for handlers / smoke convenience.
export { SECTION_KINDS, REPORT_TRANSITIONS };
export type { SectionKind, ReportSection };
