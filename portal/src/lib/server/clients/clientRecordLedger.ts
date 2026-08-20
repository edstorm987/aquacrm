import "server-only";

import crypto from "node:crypto";

import { getState, mutate } from "@/server/storage";
import type {
  ActivityEntry,
  ClientRecordLedgerEvent,
  ClientRecordLedgerGroup,
  ClientRecordLedgerPage,
  ClientRecordLedgerSource,
  ClientRecordLedgerVisibility,
} from "@/server/types";

const RELIABLE_DATE_FLOOR = Date.UTC(2000, 0, 1);
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type ClientRecordLedgerScope = "all" | "client" | "canonical" | "attention";
export type ClientRecordLedgerFilter = "all" | ClientRecordLedgerGroup;
export type ClientRecordLedgerWindow = "all" | "30d" | "90d" | "year";
export type ClientRecordLedgerSort = "newest" | "oldest";

export type ClientRecordLedgerEventInput = Omit<
  ClientRecordLedgerEvent,
  "id" | "agencyId" | "clientId" | "createdAt" | "updatedAt"
>;

export interface SynchroniseClientRecordLedgerInput {
  agencyId: string;
  clientId: string;
  events: ClientRecordLedgerEventInput[];
  completeSources?: ClientRecordLedgerSource[];
}

export interface QueryClientRecordLedgerInput {
  agencyId: string;
  clientId: string;
  clientIds?: string[];
  cursor?: string;
  limit?: number;
  filter?: ClientRecordLedgerFilter;
  scope?: ClientRecordLedgerScope;
  timeWindow?: ClientRecordLedgerWindow;
  sort?: ClientRecordLedgerSort;
  query?: string;
  parentSourceId?: string;
  now?: number;
}

type LedgerCursor = { occurredAt: number; id: string; sort: ClientRecordLedgerSort };

interface LedgerContract {
  id: string;
  title: string;
  summary?: string;
  version?: number;
  status: string;
  createdAt: number;
  updatedAt?: number;
  issuedAt?: number;
  acceptedAt?: number;
  declinedAt?: number;
}

interface LedgerInvoice {
  id: string;
  number: string;
  totalCents: number;
  currency: string;
  status: string;
  issuedAt: number;
  dueAt: number;
  paidAt?: number;
  lineItems?: Array<{ description?: string }>;
}

interface LedgerPaymentPlan {
  id: string;
  title: string;
  currency: string;
  status: string;
  createdAt: number;
  updatedAt?: number;
  activatedAt?: number;
  completedAt?: number;
  milestones: Array<{
    amountCents: number;
    dueAt: number;
    status: string;
  }>;
}

interface LedgerMilestone {
  id: string;
  title: string;
  description?: string;
  status: string;
  progress: number;
  targetAt?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

interface LedgerClientRequest {
  id: string;
  type: string;
  topic?: string;
  message: string;
  status: string;
  submittedBy: string;
  submittedAt: number;
  replies?: Array<{
    id: string;
    message: string;
    from: "customer" | "milesymedia";
    createdAt: number;
  }>;
}

function makeEventId(agencyId: string, clientId: string, sourceType: ClientRecordLedgerSource, sourceId: string): string {
  const digest = crypto.createHash("sha256")
    .update(`${agencyId}\u0000${clientId}\u0000${sourceType}\u0000${sourceId}`)
    .digest("hex")
    .slice(0, 24);
  return `cre_${digest}`;
}

function cleanText(value: string | undefined, limit: number): string | undefined {
  const cleaned = value?.trim().slice(0, limit);
  return cleaned || undefined;
}

function normaliseEvent(agencyId: string, clientId: string, input: ClientRecordLedgerEventInput, existing?: ClientRecordLedgerEvent): ClientRecordLedgerEvent {
  const now = Date.now();
  return {
    id: makeEventId(agencyId, clientId, input.sourceType, input.sourceId),
    agencyId,
    clientId,
    sourceType: input.sourceType,
    sourceId: input.sourceId.trim().slice(0, 240),
    group: input.group,
    title: cleanText(input.title, 500) ?? "Untitled record",
    body: cleanText(input.body, 30_000),
    occurredAt: Number.isFinite(input.occurredAt) && input.occurredAt > 0 ? input.occurredAt : 0,
    eyebrow: cleanText(input.eyebrow, 240) ?? input.group.replaceAll("-", " "),
    visibility: input.visibility,
    href: cleanText(input.href, 2_000),
    attention: input.attention,
    parentSourceId: cleanText(input.parentSourceId, 240),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function sameEvent(left: ClientRecordLedgerEvent, right: ClientRecordLedgerEvent): boolean {
  return left.sourceType === right.sourceType
    && left.sourceId === right.sourceId
    && left.group === right.group
    && left.title === right.title
    && left.body === right.body
    && left.occurredAt === right.occurredAt
    && left.eyebrow === right.eyebrow
    && left.visibility === right.visibility
    && left.href === right.href
    && left.attention === right.attention
    && left.parentSourceId === right.parentSourceId;
}

export function synchroniseClientRecordLedger(input: SynchroniseClientRecordLedgerInput): ClientRecordLedgerEvent[] {
  const current = getState().clientRecordLedger ?? {};
  const eventMap = new Map<string, ClientRecordLedgerEvent>();
  let changed = false;

  for (const source of input.events) {
    if (!source.sourceId.trim()) continue;
    const id = makeEventId(input.agencyId, input.clientId, source.sourceType, source.sourceId);
    const existing = current[id];
    const next = normaliseEvent(input.agencyId, input.clientId, source, existing);
    eventMap.set(id, sameEvent(existing ?? next, next) && existing ? existing : next);
    if (!existing || !sameEvent(existing, next)) changed = true;
  }

  const completeSources = new Set(input.completeSources ?? []);
  const removals = completeSources.size
    ? Object.values(current).filter(event => event.agencyId === input.agencyId
      && event.clientId === input.clientId
      && completeSources.has(event.sourceType)
      && !eventMap.has(event.id))
    : [];
  if (removals.length) changed = true;

  if (changed) {
    mutate(state => {
      state.clientRecordLedger ??= {};
      for (const event of eventMap.values()) state.clientRecordLedger[event.id] = event;
      for (const event of removals) delete state.clientRecordLedger[event.id];
    });
  }

  return [...eventMap.values()];
}

export function removeClientRecordLedgerEvent(agencyId: string, clientId: string, sourceType: ClientRecordLedgerSource, sourceId: string): boolean {
  const id = makeEventId(agencyId, clientId, sourceType, sourceId);
  if (!getState().clientRecordLedger?.[id]) return false;
  mutate(state => {
    state.clientRecordLedger ??= {};
    delete state.clientRecordLedger[id];
  });
  return true;
}

export function upsertClientRecordLedgerEvent(agencyId: string, clientId: string, event: ClientRecordLedgerEventInput): ClientRecordLedgerEvent {
  return synchroniseClientRecordLedger({ agencyId, clientId, events: [event] })[0]!;
}

export function upsertClientFileLedgerEvent(agencyId: string, clientId: string, file: {
  id: string;
  name: string;
  url: string;
  category: string;
  uploadedBy?: string;
  uploadedAt: number;
  recordEntryId?: string;
  customerVisible?: boolean;
}): ClientRecordLedgerEvent {
  return upsertClientRecordLedgerEvent(agencyId, clientId, {
    sourceType: "file",
    sourceId: file.id,
    group: "files",
    title: file.name,
    body: `${file.category.replaceAll("-", " ")}${file.uploadedBy ? ` · ${file.uploadedBy}` : ""}`,
    occurredAt: file.uploadedAt,
    eyebrow: file.category === "recording" ? "Call recording" : "File",
    visibility: file.customerVisible === true ? "client" : "internal",
    href: file.url,
    parentSourceId: file.recordEntryId,
  });
}

function formatLedgerMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
}

function formatLedgerDate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "Date not recorded";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(value);
}

export function clientContractLedgerEvent(clientId: string, contract: LedgerContract): ClientRecordLedgerEventInput {
  return {
    sourceType: "contract",
    sourceId: `contract:${contract.id}`,
    group: "commercial",
    title: contract.title,
    body: [contract.summary, `Agreement version ${contract.version ?? 1}`].filter(Boolean).join(" · "),
    occurredAt: contract.acceptedAt ?? contract.declinedAt ?? contract.issuedAt ?? contract.updatedAt ?? contract.createdAt,
    eyebrow: `commercial · ${contract.status.replaceAll("-", " ")}`,
    visibility: "system",
    href: `/portal/clients/${encodeURIComponent(clientId)}?tab=finance#client-contracts`,
    attention: contract.status === "sent" ? "warning" : undefined,
  };
}

export function upsertClientContractLedgerEvent(agencyId: string, clientId: string, contract: LedgerContract): ClientRecordLedgerEvent {
  return upsertClientRecordLedgerEvent(agencyId, clientId, clientContractLedgerEvent(clientId, contract));
}

export function clientInvoiceLedgerEvent(clientId: string, invoice: LedgerInvoice): ClientRecordLedgerEventInput {
  return {
    sourceType: "invoice",
    sourceId: `invoice:${invoice.id}`,
    group: "commercial",
    title: `${invoice.number} · ${formatLedgerMoney(invoice.totalCents, invoice.currency)}`,
    body: [`Due ${formatLedgerDate(invoice.dueAt)}`, invoice.lineItems?.[0]?.description].filter(Boolean).join(" · "),
    occurredAt: invoice.status === "overdue" ? invoice.dueAt : invoice.paidAt ?? invoice.issuedAt,
    eyebrow: `commercial · ${invoice.status.replaceAll("-", " ")}`,
    visibility: "system",
    href: `/portal/clients/${encodeURIComponent(clientId)}?tab=finance#client-invoices`,
    attention: invoice.status === "overdue" ? "critical" : invoice.status === "sent" ? "warning" : undefined,
  };
}

export function upsertClientInvoiceLedgerEvent(agencyId: string, clientId: string, invoice: LedgerInvoice): ClientRecordLedgerEvent {
  return upsertClientRecordLedgerEvent(agencyId, clientId, clientInvoiceLedgerEvent(clientId, invoice));
}

function paymentPlanTotal(plan: LedgerPaymentPlan): number {
  return plan.milestones.reduce((total, milestone) => total + milestone.amountCents, 0);
}

function paymentPlanPaid(plan: LedgerPaymentPlan): number {
  return plan.milestones.filter(milestone => milestone.status === "paid").reduce((total, milestone) => total + milestone.amountCents, 0);
}

export function clientPaymentPlanLedgerEvent(clientId: string, plan: LedgerPaymentPlan, now = Date.now()): ClientRecordLedgerEventInput {
  const overdue = plan.milestones.some(milestone => milestone.status === "planned" && milestone.dueAt < now);
  return {
    sourceType: "payment-plan",
    sourceId: `payment-plan:${plan.id}`,
    group: "commercial",
    title: plan.title,
    body: `${plan.milestones.length} milestone${plan.milestones.length === 1 ? "" : "s"} · ${formatLedgerMoney(paymentPlanPaid(plan), plan.currency)} paid of ${formatLedgerMoney(paymentPlanTotal(plan), plan.currency)}`,
    occurredAt: plan.completedAt ?? plan.activatedAt ?? plan.updatedAt ?? plan.createdAt,
    eyebrow: `commercial · ${plan.status.replaceAll("-", " ")}`,
    visibility: "system",
    href: `/portal/clients/${encodeURIComponent(clientId)}?tab=finance#client-payment-plans`,
    attention: overdue ? "critical" : plan.status === "draft" ? "warning" : undefined,
  };
}

export function upsertClientPaymentPlanLedgerEvent(agencyId: string, clientId: string, plan: LedgerPaymentPlan): ClientRecordLedgerEvent {
  return upsertClientRecordLedgerEvent(agencyId, clientId, clientPaymentPlanLedgerEvent(clientId, plan));
}

export function clientMilestoneLedgerEvent(clientId: string, milestone: LedgerMilestone, now = Date.now()): ClientRecordLedgerEventInput {
  return {
    sourceType: "delivery",
    sourceId: `delivery:${milestone.id}`,
    group: "delivery",
    title: milestone.title,
    body: [`${milestone.progress}% complete`, milestone.targetAt ? `Target ${formatLedgerDate(milestone.targetAt)}` : undefined, milestone.description].filter(Boolean).join(" · "),
    occurredAt: milestone.completedAt ?? milestone.updatedAt ?? milestone.createdAt,
    eyebrow: `delivery · ${milestone.status.replaceAll("-", " ")}`,
    visibility: "system",
    href: `/portal/clients/${encodeURIComponent(clientId)}?tab=delivery#client-delivery-work`,
    attention: milestone.status === "blocked" ? "critical" : milestone.status !== "complete" && Boolean(milestone.targetAt && milestone.targetAt < now) ? "warning" : undefined,
  };
}

export function upsertClientMilestoneLedgerEvent(agencyId: string, clientId: string, milestone: LedgerMilestone): ClientRecordLedgerEvent {
  return upsertClientRecordLedgerEvent(agencyId, clientId, clientMilestoneLedgerEvent(clientId, milestone));
}

export function clientRequestLedgerEvents(clientId: string, request: LedgerClientRequest, customerEmails: ReadonlySet<string> = new Set()): ClientRecordLedgerEventInput[] {
  const href = `/portal/agency/inbox?view=all&thread=${encodeURIComponent(`client:${request.id}`)}`;
  const customerSubmitted = customerEmails.has(request.submittedBy.trim().toLowerCase());
  return [
    {
      sourceType: "message",
      sourceId: `${href}:${request.id}`,
      group: "messages",
      title: request.topic || request.type.replaceAll("-", " "),
      body: request.message,
      occurredAt: request.submittedAt,
      eyebrow: `Client portal · ${customerSubmitted ? "inbound" : "outbound"} · ${request.status}`,
      visibility: "inherent",
      href,
    },
    ...(request.replies ?? []).map(reply => ({
      sourceType: "message" as const,
      sourceId: `${href}:${reply.id}`,
      group: "messages" as const,
      title: `Reply · ${request.topic || request.type.replaceAll("-", " ")}`,
      body: reply.message,
      occurredAt: reply.createdAt,
      eyebrow: `Client portal · ${reply.from === "customer" ? "inbound" : "outbound"} · ${request.status}`,
      visibility: "inherent" as const,
      href,
    })),
  ];
}

export function synchroniseClientRequestLedgerEvents(agencyId: string, clientId: string, request: LedgerClientRequest, customerEmails?: ReadonlySet<string>): ClientRecordLedgerEvent[] {
  return synchroniseClientRecordLedger({
    agencyId,
    clientId,
    events: clientRequestLedgerEvents(clientId, request, customerEmails),
  });
}

export function upsertClientSocialMessageLedgerEvent(agencyId: string, clientId: string, input: {
  conversationId: string;
  messageId: string;
  channel: "instagram" | "facebook" | string;
  accountName: string;
  participantName?: string;
  text?: string;
  attachmentCount?: number;
  sentAt: number;
  direction: "inbound" | "outbound";
  status?: string;
}): ClientRecordLedgerEvent {
  const href = `/portal/agency/inbox?view=all&thread=${encodeURIComponent(`social:${input.conversationId}`)}`;
  const body = input.text?.trim()
    || (input.attachmentCount ? `${input.attachmentCount} attachment${input.attachmentCount === 1 ? "" : "s"}` : "Message");
  return upsertClientRecordLedgerEvent(agencyId, clientId, {
    sourceType: "message",
    sourceId: `${href}:${input.messageId}`,
    group: "messages",
    title: `${input.channel === "instagram" ? "Instagram" : input.channel === "facebook" ? "Facebook" : "Social"} message`,
    body,
    occurredAt: input.sentAt,
    eyebrow: `${input.accountName} · ${input.direction === "inbound" ? input.participantName || "Client" : input.accountName}${input.status ? ` · ${input.status}` : ""}`,
    visibility: "inherent",
    href,
  });
}

export function appendActivityToClientRecordLedger(entry: ActivityEntry): void {
  if (!entry.clientId) return;
  if (entry.action.startsWith("invoice.")) {
    const metadata = entry.metadata ?? {};
    const invoiceId = typeof metadata.invoiceId === "string" ? metadata.invoiceId : "";
    if (!invoiceId) return;
    if (entry.action === "invoice.deleted") {
      removeClientRecordLedgerEvent(entry.agencyId, entry.clientId, "invoice", `invoice:${invoiceId}`);
      return;
    }
    const status = typeof metadata.status === "string"
      ? metadata.status
      : entry.action.slice("invoice.".length).replace("created", "draft").replace("updated", "draft").replace("voided", "void");
    upsertClientInvoiceLedgerEvent(entry.agencyId, entry.clientId, {
      id: invoiceId,
      number: typeof metadata.number === "string" ? metadata.number : invoiceId,
      totalCents: typeof metadata.totalCents === "number" ? metadata.totalCents : 0,
      currency: typeof metadata.currency === "string" ? metadata.currency : "gbp",
      status,
      issuedAt: typeof metadata.issuedAt === "number" ? metadata.issuedAt : entry.ts,
      dueAt: typeof metadata.dueAt === "number" ? metadata.dueAt : entry.ts,
      paidAt: typeof metadata.paidAt === "number" ? metadata.paidAt : undefined,
      lineItems: typeof metadata.lineItemDescription === "string" ? [{ description: metadata.lineItemDescription }] : undefined,
    });
    return;
  }
  const canonicalPrefixes = ["client_file.", "client_request.", "client_record.", "contract.", "invoice.", "client_payment_plan.", "milestone."];
  if (canonicalPrefixes.some(prefix => entry.action.startsWith(prefix))) return;
  upsertClientRecordLedgerEvent(entry.agencyId, entry.clientId, {
    sourceType: "activity",
    sourceId: entry.id,
    group: "activity",
    title: entry.message,
    occurredAt: entry.ts,
    eyebrow: entry.category.replaceAll("-", " "),
    visibility: "internal",
  });
}

function encodeCursor(event: ClientRecordLedgerEvent, sort: ClientRecordLedgerSort): string {
  return Buffer.from(JSON.stringify({ occurredAt: event.occurredAt, id: event.id, sort } satisfies LedgerCursor)).toString("base64url");
}

function decodeCursor(value: string | undefined, sort: ClientRecordLedgerSort): LedgerCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<LedgerCursor>;
    if (!Number.isFinite(parsed.occurredAt) || typeof parsed.id !== "string" || parsed.sort !== sort) return null;
    return { occurredAt: parsed.occurredAt!, id: parsed.id, sort };
  } catch {
    return null;
  }
}

function isReliableDate(value: number): boolean {
  return Number.isFinite(value) && value >= RELIABLE_DATE_FLOOR;
}

function sourceIsCanonical(sourceType: ClientRecordLedgerSource): boolean {
  return sourceType === "contract" || sourceType === "invoice" || sourceType === "payment-plan" || sourceType === "delivery";
}

function compareEvents(left: ClientRecordLedgerEvent, right: ClientRecordLedgerEvent, sort: ClientRecordLedgerSort): number {
  const time = left.occurredAt - right.occurredAt;
  if (time !== 0) return sort === "newest" ? -time : time;
  const id = left.id.localeCompare(right.id);
  return sort === "newest" ? -id : id;
}

function eventIsAfterCursor(event: ClientRecordLedgerEvent, cursor: LedgerCursor | null): boolean {
  if (!cursor) return true;
  if (cursor.sort === "newest") {
    return event.occurredAt < cursor.occurredAt || (event.occurredAt === cursor.occurredAt && event.id < cursor.id);
  }
  return event.occurredAt > cursor.occurredAt || (event.occurredAt === cursor.occurredAt && event.id > cursor.id);
}

export function queryClientRecordLedger(input: QueryClientRecordLedgerInput): ClientRecordLedgerPage {
  const sort = input.sort ?? "newest";
  const filter = input.filter ?? "all";
  const scope = input.scope ?? "all";
  const timeWindow = input.timeWindow ?? "all";
  const now = input.now ?? Date.now();
  const needle = input.query?.trim().toLowerCase() ?? "";
  const parentSourceId = input.parentSourceId?.trim() ?? "";
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
  const cursor = decodeCursor(input.cursor, sort);
  const clientIds = new Set((input.clientIds?.length ? input.clientIds : [input.clientId]).filter(Boolean));
  const retained = Object.values(getState().clientRecordLedger ?? {})
    .filter(event => event.agencyId === input.agencyId && clientIds.has(event.clientId));
  const cutoff = timeWindow === "30d"
    ? now - 30 * 24 * 60 * 60 * 1_000
    : timeWindow === "90d"
      ? now - 90 * 24 * 60 * 60 * 1_000
      : timeWindow === "year"
        ? now - 365 * 24 * 60 * 60 * 1_000
        : 0;
  const filtered = retained.filter(event => {
    const matchesScope = scope === "all"
      || (scope === "client" && (event.visibility === "client" || event.visibility === "inherent"))
      || (scope === "canonical" && sourceIsCanonical(event.sourceType))
      || (scope === "attention" && (Boolean(event.attention) || !isReliableDate(event.occurredAt)));
    const matchesTime = timeWindow === "all" || (isReliableDate(event.occurredAt) && event.occurredAt >= cutoff);
    const haystack = `${event.title} ${event.body ?? ""} ${event.eyebrow} ${event.sourceType}`.toLowerCase();
    return matchesScope
      && matchesTime
      && (filter === "all" || event.group === filter)
      && (!parentSourceId || event.parentSourceId === parentSourceId)
      && (!needle || haystack.includes(needle));
  }).sort((left, right) => compareEvents(left, right, sort));
  const eligible = filtered.filter(event => eventIsAfterCursor(event, cursor));
  const events = eligible.slice(0, limit);
  const hasMore = eligible.length > limit;
  const groups: ClientRecordLedgerGroup[] = ["messages", "notes", "calls", "commercial", "delivery", "files", "activity"];
  const counts = Object.fromEntries([
    ["all", retained.length],
    ...groups.map(group => [group, retained.filter(event => event.group === group).length]),
  ]) as ClientRecordLedgerPage["counts"];

  return {
    events,
    nextCursor: hasMore && events.length ? encodeCursor(events[events.length - 1]!, sort) : undefined,
    hasMore,
    total: filtered.length,
    retainedTotal: retained.length,
    counts,
    summary: {
      shared: retained.filter(event => event.visibility === "client" || event.visibility === "inherent").length,
      canonical: retained.filter(event => sourceIsCanonical(event.sourceType)).length,
      attention: retained.filter(event => Boolean(event.attention) || !isReliableDate(event.occurredAt)).length,
      dateReview: retained.filter(event => !isReliableDate(event.occurredAt)).length,
    },
  };
}
