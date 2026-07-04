// Segment service. CRUD + idempotent seedDefaults + rule evaluation
// + per-segment listMembers walk.
//
// Storage:
//   segments/by-id/<id>           → Segment
//   segments/index                → string[] of segment ids
//
// Rule evaluation is AND-of-conditions on the Contact + an optional
// MembershipSnapshot (from the cross-plugin port). Every rule must
// pass for the contact to belong to the segment.

import { makeId } from "../lib/ids";
import { NINETY_DAYS_MS, SEVEN_DAYS_MS, now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Contact,
  CreateSegmentInput,
  Segment,
  SegmentRule,
  UpdateSegmentPatch,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  MembershipBenefitsPort,
  MembershipSnapshot,
  StoragePort,
} from "./ports";
import type { ContactService } from "./contacts";

const SEG_INDEX_KEY = "segments/index";
const segKey = (id: string): string => `segments/by-id/${id}`;

// Seeded on plugin install. Hardcoded rule sets — agencies copy and
// customise via the rule editor in SegmentsPage.
//
// "All" carries no rules (matches every active contact via the
// `evaluate` short-circuit at the bottom). "New" matches contacts
// firstSeen in the last 7 days. "Engaged" matches contacts seen in
// the last 30 days. "Dormant" matches contacts not seen in 90+ days.
//
// `firstSeenAt: { op: "after", value: nowMinus(7d) }` — value is
// re-resolved to an epoch ms at evaluation time relative to the
// stored seed. To keep the rule snapshot stable across days we
// store the rule with a special `value` of "{{now-7d}}" string and
// resolve at evaluate time. Keeps the seed definition stable.

export const DEFAULT_SEGMENT_SEEDS: readonly { name: string; description: string; rules: SegmentRule[] }[] = [
  {
    name: "All",
    description: "All active contacts.",
    rules: [],
  },
  {
    name: "New",
    description: "Contacts that first appeared in the last 7 days.",
    rules: [{ field: "firstSeenAt", op: "after", value: "{{now-7d}}" }],
  },
  {
    name: "Engaged",
    description: "Contacts active in the last 30 days.",
    rules: [{ field: "lastSeenAt", op: "after", value: "{{now-30d}}" }],
  },
  {
    name: "Dormant",
    description: "Contacts not seen in 90+ days.",
    rules: [{ field: "lastSeenAt", op: "before", value: "{{now-90d}}" }],
  },
] as const;

export class SegmentService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private contacts: ContactService,
    private membershipBenefits?: MembershipBenefitsPort,
  ) {}

  async list(): Promise<Segment[]> {
    const ids = (await this.storage.get<string[]>(SEG_INDEX_KEY)) ?? [];
    const out: Segment[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Segment>(segKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => {
      // Default segments first, then by creation order.
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }

  async get(id: string): Promise<Segment | null> {
    const row = await this.storage.get<Segment>(segKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async create(input: CreateSegmentInput, actor: UserId): Promise<Segment> {
    if (!input.name.trim()) throw new Error("Segment name required.");
    const all = await this.list();
    if (all.some(s => s.name.toLowerCase() === input.name.toLowerCase())) {
      throw new Error(`Segment "${input.name}" already exists.`);
    }
    const id = makeId("seg");
    const ts = now();
    const row: Segment = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      name: input.name.trim(),
      description: input.description,
      rules: input.rules ?? [],
      isDefault: false,
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(segKey(id), row);
    const ix = (await this.storage.get<string[]>(SEG_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(SEG_INDEX_KEY, [...ix, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "crm",
      action: "crm.segment.created",
      message: `Created segment "${row.name}".`,
      metadata: { segmentId: id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "crm.segment.created", { segmentId: id });
    return row;
  }

  async update(id: string, patch: UpdateSegmentPatch, actor: UserId): Promise<Segment | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (patch.name && patch.name.toLowerCase() !== existing.name.toLowerCase()) {
      const all = await this.list();
      if (all.some(s => s.id !== id && s.name.toLowerCase() === patch.name!.toLowerCase())) {
        throw new Error(`Segment "${patch.name}" already exists.`);
      }
    }
    const next: Segment = {
      ...existing,
      ...patch,
      name: patch.name?.trim() ?? existing.name,
      rules: patch.rules ?? existing.rules,
      updatedAt: now(),
    };
    await this.storage.set(segKey(id), next);
    if (patch.status === "archived" && existing.status === "active") {
      this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "crm.segment.archived", { segmentId: id });
    }
    return next;
  }

  // Default segments are non-deletable. Use update({status:"archived"}).
  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    if (existing.isDefault) {
      throw new Error(`Cannot delete default segment "${existing.name}". Archive it instead.`);
    }
    await this.storage.del(segKey(id));
    const ix = (await this.storage.get<string[]>(SEG_INDEX_KEY)) ?? [];
    await this.storage.set(SEG_INDEX_KEY, ix.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "crm",
      action: "crm.segment.deleted",
      message: `Deleted segment "${existing.name}".`,
      metadata: { segmentId: id },
    });
    return true;
  }

  // Idempotent. Seeds the four default segments on first install.
  async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }> {
    const existing = await this.list();
    if (existing.length > 0) return { seeded: 0, existed: existing.length };
    let seeded = 0;
    for (const def of DEFAULT_SEGMENT_SEEDS) {
      try {
        const seg = await this.create({
          name: def.name,
          description: def.description,
          rules: [...def.rules],
        }, actor);
        // Mark seeded entries as default.
        await this.storage.set(segKey(seg.id), { ...seg, isDefault: true });
        seeded += 1;
      } catch {
        // Concurrent seed — ignore.
      }
    }
    return { seeded, existed: 0 };
  }

  // Evaluate a segment against a Contact + optional membership snapshot.
  // AND-of-conditions: every rule must pass.
  async evaluate(segment: Segment, contact: Contact): Promise<boolean> {
    if (segment.rules.length === 0) {
      // No rules → segment matches every active contact.
      return contact.status === "active";
    }
    let snapshot: MembershipSnapshot | null = null;
    const needsMembership = segment.rules.some(r => r.field === "membershipPlanId");
    if (needsMembership && this.membershipBenefits && contact.endCustomerUserId) {
      snapshot = await this.membershipBenefits.getMembershipForUser({
        agencyId: this.agencyId,
        clientId: this.clientId,
        userId: contact.endCustomerUserId,
      });
    }
    for (const rule of segment.rules) {
      if (!matchesRule(rule, contact, snapshot)) return false;
    }
    return true;
  }

  async listMembers(segmentId: string): Promise<Contact[]> {
    const segment = await this.get(segmentId);
    if (!segment) return [];
    const all = await this.contacts.list();
    const out: Contact[] = [];
    for (const contact of all) {
      if (await this.evaluate(segment, contact)) out.push(contact);
    }
    return out;
  }
}

// ─── Rule matching ──────────────────────────────────────────────────────

function matchesRule(rule: SegmentRule, contact: Contact, membership: MembershipSnapshot | null): boolean {
  switch (rule.field) {
    case "tag":
      return matchesValue(rule, contact.tags);
    case "source":
      return matchesValue(rule, contact.source);
    case "status":
      return matchesValue(rule, contact.status);
    case "membershipPlanId":
      return matchesValue(rule, membership?.planId ?? null);
    case "lastSeenAt":
      return matchesTime(rule, contact.lastSeenAt);
    case "firstSeenAt":
      return matchesTime(rule, contact.firstSeenAt);
    case "customAttr": {
      if (!rule.attrKey) return false;
      const v = contact.attributes[rule.attrKey];
      return matchesValue(rule, v ?? null);
    }
  }
}

function matchesValue(rule: SegmentRule, actual: string | string[] | null): boolean {
  const expected = rule.value;
  switch (rule.op) {
    case "eq":
      return Array.isArray(actual)
        ? actual.includes(String(expected))
        : actual === expected;
    case "neq":
      return Array.isArray(actual)
        ? !actual.includes(String(expected))
        : actual !== expected;
    case "in": {
      const list = (Array.isArray(expected) ? expected : [String(expected)]).map(String);
      return Array.isArray(actual)
        ? actual.some(a => list.includes(a))
        : actual !== null && list.includes(actual);
    }
    case "nin": {
      const list = (Array.isArray(expected) ? expected : [String(expected)]).map(String);
      return Array.isArray(actual)
        ? !actual.some(a => list.includes(a))
        : actual === null || !list.includes(actual);
    }
    case "contains":
      return typeof actual === "string" && actual.includes(String(expected));
    default:
      return false;
  }
}

function matchesTime(rule: SegmentRule, ts: number | undefined): boolean {
  if (ts === undefined) {
    // For `before` rules on lastSeenAt, missing-value means "never seen" =
    // always before any threshold (Dormant should match never-seen).
    return rule.op === "before";
  }
  const threshold = resolveTimeValue(rule.value);
  if (threshold === null) return false;
  switch (rule.op) {
    case "after": return ts > threshold;
    case "before": return ts < threshold;
    default: return false;
  }
}

// Resolve a rule.value into an epoch ms. Supports:
//   - number       (literal epoch ms)
//   - "{{now-Nd}}" (sliding window — N days back)
//   - ISO date     (parsed)
function resolveTimeValue(value: SegmentRule["value"]): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const placeholder = value.match(/^\{\{\s*now\s*-\s*(\d+)\s*d\s*\}\}$/);
    if (placeholder) {
      const days = Number(placeholder[1]);
      if (Number.isFinite(days)) {
        // Lift `now()` from the time helper to keep the test clock honoured.
        return now() - days * 86_400_000;
      }
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  // Re-export the seed helpers for unused-warning suppression in tsc.
  void SEVEN_DAYS_MS; void NINETY_DAYS_MS;
  return null;
}
