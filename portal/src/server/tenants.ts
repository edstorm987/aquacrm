import "server-only";
// Three-level tenancy store: Agency → Client → End-customer.
//
// Every list/get function MUST accept `agencyId` and filter on it. There
// is no global "list every client" helper — that violates the pool-model
// scoping contract in `04-architecture.md §6`.

import crypto from "crypto";
import { getState, mutate } from "./storage";
import { drainOutbox, recordOutboxEvent } from "./outbox";
import type {
  Agency, AgencyStatus, BrandKit, Client, ClientStage, EndCustomer,
} from "./types";
import { validatePortalEntityFields } from "./portalEditor";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    || `slug-${Date.now()}`;
}

const DEFAULT_BRAND: BrandKit = {
  primaryColor: "#0B6F6D",
  secondaryColor: "#1F2937",
  accentColor: "#F97316",
  fontHeading: "ui-sans-serif, system-ui",
  fontBody: "ui-sans-serif, system-ui",
  borderRadius: "12px",
};

const CLIENT_STAGES = new Set<ClientStage>([
  "lead", "discovery", "design", "development", "onboarding", "live", "churned",
  "aqua-epic-intro", "aqua-blueprint", "aqua-diagnostics", "aqua-brand-builder",
  "aqua-traffic", "aqua-mastery",
]);

/**
 * Old fixtures and partially imported PortalState rows predate the required
 * client slug/brand fields. Treat those presentation fields as recoverable
 * defaults at the store boundary so one legacy client cannot crash every
 * client list or workspace that reads `brand.primaryColor` or `slug`.
 */
function normaliseClient(client: Client): Client {
  const inheritedBrand = getState().agencies[client.agencyId]?.brand ?? DEFAULT_BRAND;
  const brand = client.brand && client.brand.primaryColor
    ? client.brand
    : { ...DEFAULT_BRAND, ...inheritedBrand, ...(client.brand ?? {}) };
  const slug = typeof client.slug === "string" && client.slug.trim()
    ? client.slug
    : slugify(client.name || client.id);
  const rawStage = client.stage as string | undefined;
  const stage: ClientStage = rawStage === "active"
    ? "live"
    : CLIENT_STAGES.has(rawStage as ClientStage) ? rawStage as ClientStage : "discovery";
  const status: AgencyStatus = client.status === "suspended" || client.status === "archived"
    ? client.status
    : "active";
  const relationshipId = client.relationshipId?.trim() || client.id;
  return brand === client.brand
    && slug === client.slug
    && stage === client.stage
    && status === client.status
    && relationshipId === client.relationshipId
    ? client
    : { ...client, brand, slug, stage, status, relationshipId };
}

// ─── Agency CRUD ──────────────────────────────────────────────────────────

export interface CreateAgencyInput {
  name: string;
  slug?: string;
  ownerEmail?: string;
  brand?: Partial<BrandKit>;
}

export function createAgency(input: CreateAgencyInput): Agency {
  let saved!: Agency;
  mutate(state => {
    let id = slugify(input.slug ?? input.name);
    if (state.agencies[id]) {
      let i = 2;
      while (state.agencies[`${id}-${i}`]) i++;
      id = `${id}-${i}`;
    }
    const now = Date.now();
    saved = {
      id,
      name: input.name,
      slug: id,
      brand: { ...DEFAULT_BRAND, ...(input.brand ?? {}) },
      ownerEmail: input.ownerEmail,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    state.agencies[id] = saved;
    recordOutboxEvent(state, {
      name: "agency.created",
      agencyId: saved.id,
      source: "server/tenants",
      payload: { agencyId: saved.id, name: saved.name },
    });
  });
  drainOutbox();
  return saved;
}

export function getAgency(id: string): Agency | null {
  return getState().agencies[id] ?? null;
}

export function getAgencyBySlug(slug: string): Agency | null {
  const slugN = slug.toLowerCase();
  for (const a of Object.values(getState().agencies)) {
    if (a.slug === slugN) return a;
  }
  return null;
}

export function listAgencies(): Agency[] {
  return Object.values(getState().agencies)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface UpdateAgencyPatch {
  name?: string;
  ownerEmail?: string;
  brand?: Partial<BrandKit>;
  status?: AgencyStatus;
}

export function updateAgency(id: string, patch: UpdateAgencyPatch): Agency | null {
  let saved: Agency | null = null;
  mutate(state => {
    const existing = state.agencies[id];
    if (!existing) return;
    saved = {
      ...existing,
      name: patch.name ?? existing.name,
      ownerEmail: patch.ownerEmail ?? existing.ownerEmail,
      brand: patch.brand ? { ...existing.brand, ...patch.brand } : existing.brand,
      status: patch.status ?? existing.status,
      updatedAt: Date.now(),
    };
    state.agencies[id] = saved;
  });
  return saved;
}

// ─── Client CRUD (always scoped to an agency) ─────────────────────────────

export interface CreateClientInput {
  name: string;
  slug?: string;
  relationshipId?: string;
  workspaceLabel?: string;
  ownerEmail?: string;
  websiteUrl?: string;
  stage?: ClientStage;
  brand?: Partial<BrandKit>;
  endCustomers?: import("./types").ClientEndCustomerConfig;
  metadata?: Record<string, unknown>;
  companyId?: string;
}

export function createClient(agencyId: string, input: CreateClientInput): Client {
  const agency = getAgency(agencyId);
  if (!agency) throw new Error(`Agency "${agencyId}" not found.`);

  let saved!: Client;
  const suppliedMetadata = input.metadata ?? {};
  const hasCustomFieldSubmission = Object.prototype.hasOwnProperty.call(suppliedMetadata, "customFields");
  const customFields = hasCustomFieldSubmission
    ? validatePortalEntityFields(agencyId, "clients", suppliedMetadata.customFields)
    : {};
  mutate(state => {
    const id = makeId("cli");
    const slug = slugify(input.slug ?? input.name);
    const now = Date.now();
    saved = {
      id,
      agencyId,
      relationshipId: input.relationshipId?.trim() || id,
      workspaceLabel: input.workspaceLabel?.trim() || undefined,
      companyId: input.companyId,
      name: input.name,
      slug,
      brand: { ...DEFAULT_BRAND, ...(input.brand ?? {}) },
      stage: input.stage ?? "discovery",
      ownerEmail: input.ownerEmail,
      websiteUrl: input.websiteUrl,
      status: "active",
      endCustomers: input.endCustomers,
      metadata: { ...suppliedMetadata, customFields },
      createdAt: now,
      updatedAt: now,
    };
    state.clients[id] = saved;
    // Recorded INSIDE the same mutate as the client row — the state change
    // and its announcement are one write, so a crash cannot separate them.
    // The drain below hands it to the bus exactly as the old emit() did.
    recordOutboxEvent(state, {
      name: "client.created",
      agencyId,
      clientId: saved.id,
      source: "server/tenants",
      payload: { clientId: saved.id, name: saved.name },
    });
  });
  drainOutbox();
  return saved;
}

export function getClient(id: string): Client | null {
  const client = getState().clients[id];
  return client ? normaliseClient(client) : null;
}

// Strict scope-check variant. Returns null if the client doesn't belong
// to the supplied agency — used by route handlers that must refuse
// cross-tenant reads even when the client id is technically valid.
export function getClientForAgency(agencyId: string, clientId: string): Client | null {
  const c = getState().clients[clientId];
  if (!c) return null;
  if (c.agencyId !== agencyId) return null;
  return normaliseClient(c);
}

export function listClients(agencyId: string, options: { includeArchived?: boolean } = {}): Client[] {
  return Object.values(getState().clients)
    .filter(c => c.agencyId === agencyId && (options.includeArchived || c.status !== "archived"))
    .map(normaliseClient)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface UpdateClientPatch {
  name?: string;
  relationshipId?: string | null;
  workspaceLabel?: string | null;
  ownerEmail?: string;
  websiteUrl?: string | null;
  brand?: Partial<BrandKit>;
  status?: AgencyStatus;
  stage?: ClientStage;
  endCustomers?: import("./types").ClientEndCustomerConfig;
  metadata?: Record<string, unknown>;
  companyId?: string | null;
}

export function updateClient(agencyId: string, clientId: string, patch: UpdateClientPatch): Client | null {
  let saved: Client | null = null;
  let stageChanged = false;
  let oldStage: ClientStage | undefined;
  mutate(state => {
    const existing = state.clients[clientId];
    if (!existing) return;
    if (existing.agencyId !== agencyId) return;
    const current = normaliseClient(existing);
    const now = Date.now();
    oldStage = current.stage;
    stageChanged = patch.stage !== undefined && patch.stage !== current.stage;
    const nextStage = patch.stage ?? current.stage;
    const nextStatus = patch.status ?? current.status;
    const existingCustomFields = current.metadata?.customFields && typeof current.metadata.customFields === "object" && !Array.isArray(current.metadata.customFields)
      ? current.metadata.customFields as Record<string, unknown>
      : undefined;
    const hasCustomFieldSubmission = patch.metadata !== undefined
      && Object.prototype.hasOwnProperty.call(patch.metadata, "customFields");
    const incomingCustomFields = patch.metadata?.customFields;
    const customFields = hasCustomFieldSubmission
      ? validatePortalEntityFields(agencyId, "clients", incomingCustomFields, existingCustomFields)
      : existingCustomFields ?? {};
    const metadata = patch.metadata !== undefined
      ? { ...(current.metadata ?? {}), ...patch.metadata }
      : { ...(current.metadata ?? {}) };
    metadata.customFields = customFields;
    if (stageChanged && nextStage === "churned") metadata.churnedAt = now;
    if (stageChanged && current.stage === "churned" && nextStage !== "churned") metadata.reactivatedAt = now;
    if (patch.status === "archived" && current.status !== "archived") metadata.archivedAt = now;
    if (patch.status === "suspended" && current.status !== "suspended") metadata.suspendedAt = now;
    if (patch.status === "active" && current.status !== "active") metadata.reactivatedAt = now;
    saved = {
      ...current,
      relationshipId: patch.relationshipId === null ? undefined : patch.relationshipId?.trim() || current.relationshipId,
      workspaceLabel: patch.workspaceLabel === null ? undefined : patch.workspaceLabel?.trim() || current.workspaceLabel,
      companyId: patch.companyId === null ? undefined : patch.companyId ?? current.companyId,
      name: patch.name ?? current.name,
      ownerEmail: patch.ownerEmail ?? current.ownerEmail,
      websiteUrl: patch.websiteUrl === null ? undefined : patch.websiteUrl ?? current.websiteUrl,
      brand: patch.brand ? { ...current.brand, ...patch.brand } : current.brand,
      status: nextStatus,
      stage: nextStage,
      endCustomers: patch.endCustomers !== undefined
        ? { ...(current.endCustomers ?? {}), ...patch.endCustomers }
        : current.endCustomers,
      metadata,
      updatedAt: now,
    };
    state.clients[clientId] = saved;
    recordOutboxEvent(state, {
      name: "client.updated",
      agencyId,
      clientId,
      source: "server/tenants",
      payload: { clientId },
    });
    if (stageChanged) {
      recordOutboxEvent(state, {
        name: "client.stage_changed",
        agencyId,
        clientId,
        source: "server/tenants",
        payload: { clientId, from: oldStage, to: saved.stage },
      });
    }
  });
  if (saved) drainOutbox();
  return saved;
}

// ─── End-customer (foundation stub — full CRUD is later) ──────────────────
//
// End-customers are Felicia's shoppers / members / affiliates, scoped
// under a single client. The shape is here so plugin code can reference
// it; full CRUD lands when the storefront / membership plugins port over.

export function getEndCustomer(id: string): EndCustomer | null {
  return getState().endCustomers[id] ?? null;
}

export function listEndCustomers(clientId: string): EndCustomer[] {
  return Object.values(getState().endCustomers)
    .filter(c => c.clientId === clientId);
}
