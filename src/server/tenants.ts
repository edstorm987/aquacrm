import "server-only";
// Three-level tenancy store: Agency → Client → End-customer.
//
// Every list/get function MUST accept `agencyId` and filter on it. There
// is no global "list every client" helper — that violates the pool-model
// scoping contract in `04-architecture.md §6`.

import crypto from "crypto";
import { getState, mutate } from "./storage";
import { emit } from "./eventBus";
import type {
  Agency, AgencyStatus, BrandKit, Client, ClientStage, EndCustomer,
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    || `slug-${Date.now()}`;
}

const DEFAULT_BRAND: BrandKit = {
  primaryColor: "#0EA5A4",       // teal — Aqua's eponymous accent
  secondaryColor: "#1F2937",
  accentColor: "#F97316",
  fontHeading: "ui-sans-serif, system-ui",
  fontBody: "ui-sans-serif, system-ui",
  borderRadius: "12px",
};

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
  });
  emit({ agencyId: saved.id }, "agency.created", { agencyId: saved.id, name: saved.name });
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
  ownerEmail?: string;
  websiteUrl?: string;
  stage?: ClientStage;
  brand?: Partial<BrandKit>;
  endCustomers?: import("./types").ClientEndCustomerConfig;
  metadata?: Record<string, unknown>;
}

export function createClient(agencyId: string, input: CreateClientInput): Client {
  const agency = getAgency(agencyId);
  if (!agency) throw new Error(`Agency "${agencyId}" not found.`);

  let saved!: Client;
  mutate(state => {
    const id = makeId("cli");
    const slug = slugify(input.slug ?? input.name);
    const now = Date.now();
    saved = {
      id,
      agencyId,
      name: input.name,
      slug,
      brand: { ...DEFAULT_BRAND, ...(input.brand ?? {}) },
      stage: input.stage ?? "discovery",
      ownerEmail: input.ownerEmail,
      websiteUrl: input.websiteUrl,
      status: "active",
      endCustomers: input.endCustomers,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };
    state.clients[id] = saved;
  });
  emit({ agencyId, clientId: saved.id }, "client.created", { clientId: saved.id, name: saved.name });
  return saved;
}

export function getClient(id: string): Client | null {
  return getState().clients[id] ?? null;
}

// Strict scope-check variant. Returns null if the client doesn't belong
// to the supplied agency — used by route handlers that must refuse
// cross-tenant reads even when the client id is technically valid.
export function getClientForAgency(agencyId: string, clientId: string): Client | null {
  const c = getState().clients[clientId];
  if (!c) return null;
  if (c.agencyId !== agencyId) return null;
  return c;
}

export function listClients(agencyId: string): Client[] {
  return Object.values(getState().clients)
    .filter(c => c.agencyId === agencyId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface UpdateClientPatch {
  name?: string;
  ownerEmail?: string;
  websiteUrl?: string;
  brand?: Partial<BrandKit>;
  status?: AgencyStatus;
  stage?: ClientStage;
  endCustomers?: import("./types").ClientEndCustomerConfig;
  metadata?: Record<string, unknown>;
}

export function updateClient(agencyId: string, clientId: string, patch: UpdateClientPatch): Client | null {
  let saved: Client | null = null;
  let stageChanged = false;
  let oldStage: ClientStage | undefined;
  mutate(state => {
    const existing = state.clients[clientId];
    if (!existing) return;
    if (existing.agencyId !== agencyId) return;
    oldStage = existing.stage;
    stageChanged = patch.stage !== undefined && patch.stage !== existing.stage;
    saved = {
      ...existing,
      name: patch.name ?? existing.name,
      ownerEmail: patch.ownerEmail ?? existing.ownerEmail,
      websiteUrl: patch.websiteUrl ?? existing.websiteUrl,
      brand: patch.brand ? { ...existing.brand, ...patch.brand } : existing.brand,
      status: patch.status ?? existing.status,
      stage: patch.stage ?? existing.stage,
      endCustomers: patch.endCustomers !== undefined
        ? { ...(existing.endCustomers ?? {}), ...patch.endCustomers }
        : existing.endCustomers,
      metadata: patch.metadata !== undefined
        ? { ...(existing.metadata ?? {}), ...patch.metadata }
        : existing.metadata,
      updatedAt: Date.now(),
    };
    state.clients[clientId] = saved;
  });
  if (saved) {
    emit({ agencyId, clientId }, "client.updated", { clientId });
    if (stageChanged) {
      const after = saved as Client;
      emit({ agencyId, clientId }, "client.stage_changed", {
        clientId,
        from: oldStage,
        to: after.stage,
      });
    }
  }
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
