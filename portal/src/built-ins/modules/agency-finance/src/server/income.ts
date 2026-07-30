import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type { CreateIncomeEntryInput, Currency, IncomeEntry, IncomeEntryFilter } from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const INDEX_KEY = "income/index";
const entryKey = (id: string) => `income/by-id/${id}`;

export class IncomeService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter: IncomeEntryFilter = {}): Promise<IncomeEntry[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const rows: IncomeEntry[] = [];
    for (const id of ids) {
      const row = await this.storage.get<IncomeEntry>(entryKey(id));
      if (!row || row.agencyId !== this.agencyId) continue;
      if (filter.clientId && row.clientId !== filter.clientId) continue;
      if (filter.method && row.method !== filter.method) continue;
      if (filter.fromReceivedAt !== undefined && row.receivedAt < filter.fromReceivedAt) continue;
      if (filter.toReceivedAt !== undefined && row.receivedAt >= filter.toReceivedAt) continue;
      rows.push(row);
    }
    return rows.sort((a, b) => b.receivedAt - a.receivedAt);
  }

  async create(actor: UserId, input: CreateIncomeEntryInput, defaultCurrency: Currency = "gbp"): Promise<IncomeEntry> {
    const title = input.title.trim().slice(0, 180);
    if (!title) throw new Error("Income description is required.");
    if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) throw new Error("Income amount must be greater than zero.");
    const timestamp = now();
    const entry: IncomeEntry = {
      id: makeId("inc"),
      agencyId: this.agencyId,
      clientId: input.clientId?.trim() || undefined,
      title,
      category: input.category?.trim().slice(0, 80) || undefined,
      description: input.description?.trim().slice(0, 2_000) || undefined,
      amountCents: Math.round(input.amountCents),
      currency: input.currency ?? defaultCurrency,
      method: input.method,
      receivedAt: input.receivedAt ?? timestamp,
      reference: input.reference?.trim().slice(0, 180) || undefined,
      notes: input.notes?.trim().slice(0, 4_000) || undefined,
      createdBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.storage.set(entryKey(entry.id), entry);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(entry.id)) await this.storage.set(INDEX_KEY, [...ids, entry.id]);
    this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: entry.clientId,
      actorUserId: actor,
      category: "finance",
      action: "income.recorded",
      message: `Recorded non-invoice income “${entry.title}”.`,
      metadata: { incomeId: entry.id, amountCents: entry.amountCents, method: entry.method },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: entry.clientId }, "agency-finance.income.recorded", { incomeId: entry.id });
    return entry;
  }
}
