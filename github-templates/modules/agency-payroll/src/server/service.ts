// Agency-payroll services. Three small services share one container:
//   - PayPeriodService   → open/close monthly periods (idempotent open)
//   - PayslipService     → CRUD + idempotent markPaid emitting once
//   - ContractorService  → CRUD for the contractor list
//
// Storage layout:
//   payroll/periods/index               → string[] (period ids)
//   payroll/periods/by-id/<id>          → PayPeriod
//   payroll/periods/by-key/<YYYY-MM>    → string (id) — uniqueness rev-index
//   payroll/payslips/index              → string[]
//   payroll/payslips/by-id/<id>         → Payslip
//   payroll/contractors/index           → string[]
//   payroll/contractors/by-id/<id>      → Contractor
//
// Honesty: PayrollReports.totalsForPeriod returns hasData = paidCount>0
// so the Reports page renders a real empty-state instead of fabricated
// zeroes.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  Contractor,
  CreateContractorInput,
  CreatePayPeriodInput,
  CreatePayslipInput,
  PayPeriod,
  PayeeKind,
  Payslip,
  PayslipFilter,
  PeriodTotals,
  UpdateContractorPatch,
  UpdatePayslipPatch,
} from "../lib/domain";
import { emptyTotals, isValidMonth, isValidYear, periodKey } from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const PERIODS_INDEX = "payroll/periods/index";
const PAYSLIPS_INDEX = "payroll/payslips/index";
const CONTRACTORS_INDEX = "payroll/contractors/index";
const periodKeyById = (id: string): string => `payroll/periods/by-id/${id}`;
const periodKeyByYM = (k: string): string => `payroll/periods/by-key/${k}`;
const payslipKeyById = (id: string): string => `payroll/payslips/by-id/${id}`;
const contractorKeyById = (id: string): string => `payroll/contractors/by-id/${id}`;

export class PayrollNotFoundError extends Error {
  constructor(message = "agency-payroll: not found") { super(message); this.name = "PayrollNotFoundError"; }
}
export class PayrollClosedError extends Error {
  constructor(message = "agency-payroll: period closed") { super(message); this.name = "PayrollClosedError"; }
}

abstract class BaseService {
  constructor(
    protected agencyId: AgencyId,
    protected storage: StoragePort,
    protected activity: ActivityLogPort,
    protected events: EventBusPort,
  ) {}

  protected inScope(row: { agencyId: AgencyId } | undefined | null): boolean {
    return !!row && row.agencyId === this.agencyId;
  }

  protected async appendIndex(key: string, id: string): Promise<void> {
    const ids = (await this.storage.get<string[]>(key)) ?? [];
    if (!ids.includes(id)) await this.storage.set(key, [...ids, id]);
  }
  protected async removeIndex(key: string, id: string): Promise<void> {
    const ids = (await this.storage.get<string[]>(key)) ?? [];
    const next = ids.filter(x => x !== id);
    if (next.length !== ids.length) await this.storage.set(key, next);
  }
}

// ---------- PayPeriodService ----------
export class PayPeriodService extends BaseService {
  async open(actor: UserId, input: CreatePayPeriodInput): Promise<PayPeriod> {
    if (!isValidYear(input.year)) throw new Error("agency-payroll: invalid year");
    if (!isValidMonth(input.month)) throw new Error("agency-payroll: invalid month");
    const key = periodKey(input.year, input.month);
    // Idempotent — re-opening the same year/month returns the existing row.
    const existingId = await this.storage.get<string>(periodKeyByYM(key));
    if (existingId) {
      const cur = await this.storage.get<PayPeriod>(periodKeyById(existingId));
      if (cur && this.inScope(cur)) return cur;
    }
    const t = now();
    const p: PayPeriod = {
      id: makeId("pp"),
      agencyId: this.agencyId,
      year: input.year, month: input.month,
      startedAt: t, status: "open",
      notes: input.notes,
    };
    await this.storage.set(periodKeyById(p.id), p);
    await this.storage.set(periodKeyByYM(key), p.id);
    await this.appendIndex(PERIODS_INDEX, p.id);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "hr", action: "payroll.period.opened",
      message: `Pay period ${key} opened`,
      metadata: { periodId: p.id, year: p.year, month: p.month },
    });
    this.events.emit({ agencyId: this.agencyId },
      "payroll.period.opened", { id: p.id, year: p.year, month: p.month });
    return p;
  }

  async close(actor: UserId, id: string): Promise<PayPeriod> {
    const cur = await this.storage.get<PayPeriod>(periodKeyById(id));
    if (!cur || !this.inScope(cur)) throw new PayrollNotFoundError();
    if (cur.status === "closed") return cur; // idempotent close
    const t = now();
    const next: PayPeriod = { ...cur, status: "closed", closedAt: t };
    await this.storage.set(periodKeyById(id), next);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "hr", action: "payroll.period.closed",
      message: `Pay period ${cur.year}-${String(cur.month).padStart(2, "0")} closed`,
      metadata: { periodId: id },
    });
    this.events.emit({ agencyId: this.agencyId },
      "payroll.period.closed", { id });
    return next;
  }

  async get(id: string): Promise<PayPeriod | null> {
    const cur = await this.storage.get<PayPeriod>(periodKeyById(id));
    return cur && this.inScope(cur) ? cur : null;
  }

  async getByMonth(year: number, month: number): Promise<PayPeriod | null> {
    const id = await this.storage.get<string>(periodKeyByYM(periodKey(year, month)));
    if (!id) return null;
    return this.get(id);
  }

  async list(): Promise<PayPeriod[]> {
    const ids = (await this.storage.get<string[]>(PERIODS_INDEX)) ?? [];
    const out: PayPeriod[] = [];
    for (const id of ids) {
      const r = await this.storage.get<PayPeriod>(periodKeyById(id));
      if (r && this.inScope(r)) out.push(r);
    }
    return out.sort((a, b) =>
      a.year === b.year ? b.month - a.month : b.year - a.year);
  }
}

// ---------- PayslipService ----------
export class PayslipService extends BaseService {
  async create(actor: UserId, input: CreatePayslipInput): Promise<Payslip> {
    if (!input.payeeName.trim()) throw new Error("agency-payroll: payeeName required");
    if (!Number.isFinite(input.gross) || input.gross < 0) throw new Error("agency-payroll: gross must be ≥ 0");
    if (!Number.isFinite(input.net)   || input.net   < 0) throw new Error("agency-payroll: net must be ≥ 0");
    const period = await this.storage.get<PayPeriod>(periodKeyById(input.periodId));
    if (!period || !this.inScope(period)) throw new PayrollNotFoundError("period not found");
    if (period.status === "closed") throw new PayrollClosedError();
    const t = now();
    const p: Payslip = {
      id: makeId("ps"),
      agencyId: this.agencyId,
      periodId: input.periodId,
      payeeId: input.payeeId,
      payeeKind: input.payeeKind,
      payeeName: input.payeeName.trim(),
      gross: input.gross, net: input.net,
      currency: (input.currency ?? "GBP").toUpperCase(),
      notes: input.notes,
      createdAt: t, updatedAt: t,
    };
    await this.storage.set(payslipKeyById(p.id), p);
    await this.appendIndex(PAYSLIPS_INDEX, p.id);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "hr", action: "payroll.payslip.created",
      message: `Payslip for ${p.payeeName} (${p.payeeKind}) — ${p.currency} ${(p.gross / 100).toFixed(2)} gross`,
      metadata: { payslipId: p.id, periodId: p.periodId, payeeId: p.payeeId },
    });
    this.events.emit({ agencyId: this.agencyId },
      "payroll.payslip.created", { id: p.id, periodId: p.periodId });
    return p;
  }

  async update(actor: UserId, id: string, patch: UpdatePayslipPatch): Promise<Payslip> {
    const cur = await this.storage.get<Payslip>(payslipKeyById(id));
    if (!cur || !this.inScope(cur)) throw new PayrollNotFoundError();
    if (patch.gross !== undefined && (!Number.isFinite(patch.gross) || patch.gross < 0)) {
      throw new Error("agency-payroll: gross must be ≥ 0");
    }
    if (patch.net !== undefined && (!Number.isFinite(patch.net) || patch.net < 0)) {
      throw new Error("agency-payroll: net must be ≥ 0");
    }
    const t = now();
    const next: Payslip = {
      ...cur,
      gross: patch.gross ?? cur.gross,
      net: patch.net ?? cur.net,
      notes: patch.notes ?? cur.notes,
      payeeName: patch.payeeName?.trim() || cur.payeeName,
      currency: patch.currency ? patch.currency.toUpperCase() : cur.currency,
      updatedAt: t,
    };
    await this.storage.set(payslipKeyById(id), next);
    this.events.emit({ agencyId: this.agencyId },
      "payroll.payslip.updated", { id });
    return next;
  }

  // Idempotent. Emits `payroll.payslip.paid` ONCE on the unpaid→paid
  // transition. Re-calling on an already-paid payslip is a no-op (no
  // mutation, no second emit) so agency-finance reconciliation hints
  // don't double-fire if the operator double-clicks.
  async markPaid(actor: UserId, id: string, paidAtOverride?: number): Promise<Payslip> {
    const cur = await this.storage.get<Payslip>(payslipKeyById(id));
    if (!cur || !this.inScope(cur)) throw new PayrollNotFoundError();
    if (cur.paidAt !== undefined) return cur;
    const t = paidAtOverride ?? now();
    const next: Payslip = { ...cur, paidAt: t, updatedAt: now() };
    await this.storage.set(payslipKeyById(id), next);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "hr", action: "payroll.payslip.paid",
      message: `Payslip paid: ${cur.payeeName} ${cur.currency} ${(cur.net / 100).toFixed(2)} net`,
      metadata: { payslipId: id, periodId: cur.periodId, payeeId: cur.payeeId },
    });
    this.events.emit({ agencyId: this.agencyId },
      "payroll.payslip.paid", { id, periodId: cur.periodId, net: cur.net, currency: cur.currency });
    return next;
  }

  async delete(actor: UserId, id: string): Promise<void> {
    const cur = await this.storage.get<Payslip>(payslipKeyById(id));
    if (!cur || !this.inScope(cur)) throw new PayrollNotFoundError();
    await this.storage.del(payslipKeyById(id));
    await this.removeIndex(PAYSLIPS_INDEX, id);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "hr", action: "payroll.payslip.deleted",
      message: `Payslip deleted: ${cur.payeeName}`,
      metadata: { payslipId: id, periodId: cur.periodId },
    });
    this.events.emit({ agencyId: this.agencyId },
      "payroll.payslip.deleted", { id });
  }

  async get(id: string): Promise<Payslip | null> {
    const cur = await this.storage.get<Payslip>(payslipKeyById(id));
    return cur && this.inScope(cur) ? cur : null;
  }

  async list(filter: PayslipFilter = {}): Promise<Payslip[]> {
    const ids = (await this.storage.get<string[]>(PAYSLIPS_INDEX)) ?? [];
    const out: Payslip[] = [];
    for (const id of ids) {
      const r = await this.storage.get<Payslip>(payslipKeyById(id));
      if (!r || !this.inScope(r)) continue;
      if (filter.periodId && r.periodId !== filter.periodId) continue;
      if (filter.payeeKind && r.payeeKind !== filter.payeeKind) continue;
      if (filter.payeeId && r.payeeId !== filter.payeeId) continue;
      if (filter.paidOnly && r.paidAt === undefined) continue;
      if (filter.unpaidOnly && r.paidAt !== undefined) continue;
      out.push(r);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }
}

// ---------- ContractorService ----------
export class ContractorService extends BaseService {
  async create(actor: UserId, input: CreateContractorInput): Promise<Contractor> {
    if (!input.name.trim()) throw new Error("agency-payroll: contractor name required");
    const t = now();
    const c: Contractor = {
      id: makeId("ctr"),
      agencyId: this.agencyId,
      staffId: input.staffId,
      name: input.name.trim(),
      email: input.email,
      hourlyRate: input.hourlyRate,
      currency: input.currency?.toUpperCase(),
      archived: false,
      createdAt: t, updatedAt: t,
    };
    await this.storage.set(contractorKeyById(c.id), c);
    await this.appendIndex(CONTRACTORS_INDEX, c.id);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "hr", action: "payroll.contractor.created",
      message: `Contractor ${c.name} added`,
      metadata: { contractorId: c.id },
    });
    this.events.emit({ agencyId: this.agencyId },
      "payroll.contractor.created", { id: c.id });
    return c;
  }

  async update(actor: UserId, id: string, patch: UpdateContractorPatch): Promise<Contractor> {
    const cur = await this.storage.get<Contractor>(contractorKeyById(id));
    if (!cur || !this.inScope(cur)) throw new PayrollNotFoundError();
    const t = now();
    const next: Contractor = {
      ...cur,
      name: patch.name?.trim() || cur.name,
      email: patch.email ?? cur.email,
      hourlyRate: patch.hourlyRate ?? cur.hourlyRate,
      currency: patch.currency ? patch.currency.toUpperCase() : cur.currency,
      staffId: patch.staffId ?? cur.staffId,
      archived: patch.archived ?? cur.archived,
      updatedAt: t,
    };
    await this.storage.set(contractorKeyById(id), next);
    if (cur.archived !== next.archived && next.archived) {
      this.activity.logActivity({
        agencyId: this.agencyId, actorUserId: actor,
        category: "hr", action: "payroll.contractor.archived",
        message: `Contractor ${cur.name} archived`,
        metadata: { contractorId: id },
      });
      this.events.emit({ agencyId: this.agencyId },
        "payroll.contractor.archived", { id });
    } else {
      this.events.emit({ agencyId: this.agencyId },
        "payroll.contractor.updated", { id });
    }
    return next;
  }

  async list(opts: { includeArchived?: boolean } = {}): Promise<Contractor[]> {
    const ids = (await this.storage.get<string[]>(CONTRACTORS_INDEX)) ?? [];
    const out: Contractor[] = [];
    for (const id of ids) {
      const r = await this.storage.get<Contractor>(contractorKeyById(id));
      if (!r || !this.inScope(r)) continue;
      if (!opts.includeArchived && r.archived) continue;
      out.push(r);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Contractor | null> {
    const cur = await this.storage.get<Contractor>(contractorKeyById(id));
    return cur && this.inScope(cur) ? cur : null;
  }
}

// ---------- PayrollReports ----------
//
// Honesty contract — hasData=true only when ≥1 paid payslip exists for
// the period. Reports page reads this and renders an empty-state
// "No paid payslips yet" rather than fabricating zero totals.
export class PayrollReports extends BaseService {
  async totalsForPeriod(periodId: string): Promise<PeriodTotals> {
    const ids = (await this.storage.get<string[]>(PAYSLIPS_INDEX)) ?? [];
    const totals = emptyTotals(periodId);
    for (const id of ids) {
      const r = await this.storage.get<Payslip>(payslipKeyById(id));
      if (!r || !this.inScope(r) || r.periodId !== periodId) continue;
      totals.totalCount += 1;
      if (r.paidAt === undefined) continue;
      totals.paidCount += 1;
      totals.paidGross += r.gross;
      totals.paidNet   += r.net;
      const bucket = totals.byKind[r.payeeKind];
      bucket.paidCount += 1;
      bucket.paidGross += r.gross;
      bucket.paidNet   += r.net;
    }
    totals.hasData = totals.paidCount > 0;
    return totals;
  }
}
