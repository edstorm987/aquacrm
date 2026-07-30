import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateProspectInput,
  Prospect,
  UpdateProspectPatch,
} from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "./ports";

const PROSPECT_INDEX_KEY = "prospects/index";
const prospectKey = (id: string): string => `prospect:${id}`;

function clean(value?: string): string | undefined {
  return value?.trim() || undefined;
}

function prospectLabel(prospect: Pick<Prospect, "company" | "name" | "website">): string {
  return prospect.company || prospect.name || prospect.website || "Unnamed prospect";
}

export class ProspectService {
  constructor(
    private agencyId: AgencyId,
    private storage: PluginStorage,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(): Promise<Prospect[]> {
    const index = (await this.storage.get<string[]>(PROSPECT_INDEX_KEY)) ?? [];
    const rows: Prospect[] = [];
    for (const id of index) {
      const row = await this.storage.get<Prospect>(prospectKey(id));
      if (row && row.agencyId === this.agencyId) rows.push(row);
    }
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Prospect | null> {
    const row = await this.storage.get<Prospect>(prospectKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async create(input: CreateProspectInput, actor: UserId): Promise<Prospect> {
    const company = clean(input.company);
    const name = clean(input.name);
    const website = clean(input.website);
    if (!company && !name && !website) {
      throw new Error("Add a business name, person, or website.");
    }
    const stamp = now();
    const prospect: Prospect = {
      id: makeId("prospect"),
      agencyId: this.agencyId,
      name,
      company,
      email: clean(input.email)?.toLowerCase(),
      phone: clean(input.phone),
      website,
      niche: clean(input.niche),
      source: clean(input.source) ?? "other",
      foundAt: clean(input.foundAt),
      opportunity: clean(input.opportunity),
      researchNotes: clean(input.researchNotes),
      nextStep: clean(input.nextStep),
      status: "scouting",
      capturedAt: stamp,
      updatedAt: stamp,
    };
    await this.storage.set(prospectKey(prospect.id), prospect);
    const index = (await this.storage.get<string[]>(PROSPECT_INDEX_KEY)) ?? [];
    await this.storage.set(PROSPECT_INDEX_KEY, [...index, prospect.id]);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.prospect.created",
      message: `Scouted ${prospectLabel(prospect)} from ${prospect.source}.`,
      metadata: { prospectId: prospect.id, niche: prospect.niche, source: prospect.source },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.prospect.created", { prospectId: prospect.id });
    return prospect;
  }

  async update(id: string, patch: UpdateProspectPatch, actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const updated: Prospect = {
      ...existing,
      ...patch,
      name: patch.name === undefined ? existing.name : clean(patch.name),
      company: patch.company === undefined ? existing.company : clean(patch.company),
      email: patch.email === undefined ? existing.email : clean(patch.email)?.toLowerCase(),
      phone: patch.phone === undefined ? existing.phone : clean(patch.phone),
      website: patch.website === undefined ? existing.website : clean(patch.website),
      niche: patch.niche === undefined ? existing.niche : clean(patch.niche),
      source: patch.source === undefined ? existing.source : clean(patch.source) ?? "other",
      foundAt: patch.foundAt === undefined ? existing.foundAt : clean(patch.foundAt),
      opportunity: patch.opportunity === undefined ? existing.opportunity : clean(patch.opportunity),
      researchNotes: patch.researchNotes === undefined ? existing.researchNotes : clean(patch.researchNotes),
      nextStep: patch.nextStep === undefined ? existing.nextStep : clean(patch.nextStep),
      updatedAt: now(),
    };
    await this.storage.set(prospectKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.prospect.updated",
      message: `Updated scouting record for ${prospectLabel(updated)}.`,
      metadata: { prospectId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.prospect.updated", {
      prospectId: id,
      status: updated.status,
    });
    return updated;
  }

  async dismiss(id: string, actor: UserId): Promise<Prospect | null> {
    return this.update(id, { status: "dismissed" }, actor);
  }
}
