import "server-only";
// Demo seed — shared between `/api/dev/seed-demo` (gated dev endpoint) and
// `/demo/page.tsx` (public entry from milesymedia.com). Both call
// `seedDemoAgency()` to ensure the demo tenant exists. The route adds a
// gate; the public page does not — the demo IS the entry point and a
// session is always issued before the visitor sees any portal data.
//
// `resetDemo()` wipes the demo agency + all children (clients, users,
// plugin installs + per-install plugin data, phases, activity entries)
// and is safe to call before re-seeding. Used by `?reset=1` on the
// route handler and (eventually) a nightly cron.

import { ensureHydrated, getState, mutate } from "@/server/storage";
import { bootstrapAgency } from "@/server/agencyBootstrap";
import { createClient, getAgencyBySlug, listClients } from "@/server/tenants";
import { createUser, getUser } from "@/server/users";
import { listPhasesForAgency } from "@/server/phases";
import { logActivity } from "@/server/activity";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall, listInstalledFor } from "@/server/pluginInstalls";
import { installPlugin as runtimeInstallPlugin } from "@/plugins/_runtime";
import type { Agency, Client, PhaseDefinition, ServerUser } from "@/server/types";

// ─── Demo tenant constants ────────────────────────────────────────────────
//
// Exported so `/demo/page.tsx` and `/demo/toggle/route.ts` can look up
// the demo users by email when issuing the POV-specific cookie.

export const DEMO_AGENCY_SLUG = "demo-agency";
export const DEMO_AGENCY_NAME = "Demo · Aqua";
export const DEMO_OWNER_EMAIL = "demo@aqua.dev";
export const DEMO_OWNER_PASSWORD = "demo-aqua-2026";
// Sprint 2.5 — agency-staff persona for /dev/pov so Ed can see what
// a non-owner team member sees (no admin levers, fewer plugin admins).
export const DEMO_STAFF_EMAIL = "staff@aqua.dev";
export const DEMO_STAFF_PASSWORD = "staff-demo-2026";
export const DEMO_STAFF_NAME = "Demo Employee";
export const DEMO_CLIENT_SLUG = "luv-and-ker-demo";
export const DEMO_CLIENT_NAME = "Luv & Ker · Demo";
export const DEMO_CLIENT_EMAIL = "felicia@luvandker.demo";
export const DEMO_CLIENT_PASSWORD = "felicia-demo-2026";
export const DEMO_CUSTOMER_EMAIL = "demo-shopper@aqua.test";
export const DEMO_CUSTOMER_PASSWORD = "shopper-demo-2026";
export const DEMO_CUSTOMER_NAME = "Demo shopper";

// ─── Types ────────────────────────────────────────────────────────────────

interface ChecklistItemState { done: boolean; doneAt?: number; doneBy?: string; notes?: string }
interface ChecklistProgress {
  clientId: string;
  phaseId: string;
  items: Record<string, ChecklistItemState>;
  updatedAt: number;
}

function checklistKey(clientId: string, phaseId: string) { return `progress:${clientId}:${phaseId}`; }

export interface SeedDemoResult {
  agency: Agency;
  client: Client;
  ownerUser: ServerUser;
  clientUser: ServerUser;
  customerUser: ServerUser;
  bootstrapped: { agency: boolean; client: boolean; customer: boolean };
  installedClientPlugins: string[];
  installedAgencyPlugins: string[];
  seededChecklist: { phaseId: string; ticked: number; total: number } | null;
  // T1 R13 — slugs of any extra demo clients seeded this call (empty
  // on subsequent idempotent calls).
  seededExtraClients: string[];
}

// ─── Seed ─────────────────────────────────────────────────────────────────
//
// Idempotent: existing demo agency + client + users are reused. New
// installs and phase progress are seeded only if missing.

// Per-process memoize. Once the demo tenant is fully seeded, repeat
// calls hit the cached promise — which the dev-bypass POV picker
// fires every click. Without this, each click re-walks every plugin
// install + phase + permissions row even though every check is a
// no-op. With it, repeat clicks are ~10× faster (just the session
// issue + redirect).
let _demoSeedPromise: Promise<SeedDemoResult> | null = null;

export async function seedDemoAgency(actor?: string): Promise<SeedDemoResult> {
  if (_demoSeedPromise) return _demoSeedPromise;
  // Fast-path probe: if a snapshot exists, return a synthetic result
  // immediately. Skips the 300-line idempotent walk.
  await ensureHydrated();
  const snap = getDemoSnapshot();
  if (snap) {
    const cached: SeedDemoResult = {
      agency: snap.agency,
      client: snap.client,
      ownerUser: snap.ownerUser,
      clientUser: snap.clientUser,
      customerUser: snap.customerUser,
      bootstrapped: { agency: false, client: false, customer: false },
      installedClientPlugins: [],
      installedAgencyPlugins: [],
      seededChecklist: null,
      seededExtraClients: [],
    };
    _demoSeedPromise = Promise.resolve(cached);
    return _demoSeedPromise;
  }
  _demoSeedPromise = seedDemoAgencyImpl(actor);
  return _demoSeedPromise;
}

async function seedDemoAgencyImpl(actor?: string): Promise<SeedDemoResult> {
  let agency: Agency | null = getAgencyBySlug(DEMO_AGENCY_SLUG);
  let createdAgency = false;
  if (!agency) {
    const result = await bootstrapAgency(
      {
        name: DEMO_AGENCY_NAME,
        slug: DEMO_AGENCY_SLUG,
        ownerEmail: DEMO_OWNER_EMAIL,
        brand: {
          primaryColor: "#06B6D4",          // cyan-500
          secondaryColor: "#0E7490",         // cyan-700
          accentColor: "#F472B6",            // pink-400
          fontHeading: "ui-sans-serif, system-ui",
          fontBody: "ui-sans-serif, system-ui",
          borderRadius: "14px",
        },
      },
      actor,
    );
    agency = result.agency;
    createdAgency = true;
  }

  let ownerUser = getUser(DEMO_OWNER_EMAIL);
  if (!ownerUser) {
    ownerUser = createUser({
      email: DEMO_OWNER_EMAIL,
      password: DEMO_OWNER_PASSWORD,
      name: "Demo Owner",
      role: "agency-owner",
      agencyId: agency.id,
    });
  }
  // Sprint 2.5 — demo employee (agency-staff scope). Idempotent.
  if (!getUser(DEMO_STAFF_EMAIL)) {
    createUser({
      email: DEMO_STAFF_EMAIL,
      password: DEMO_STAFF_PASSWORD,
      name: DEMO_STAFF_NAME,
      role: "agency-staff",
      agencyId: agency.id,
    });
  }

  const existingClients = listClients(agency.id);
  let client: Client | undefined = existingClients.find(c => c.slug === DEMO_CLIENT_SLUG);
  let createdClient = false;
  if (!client) {
    client = createClient(agency.id, {
      name: DEMO_CLIENT_NAME,
      slug: DEMO_CLIENT_SLUG,
      ownerEmail: DEMO_CLIENT_EMAIL,
      websiteUrl: "https://luvandker.com",
      stage: "onboarding",
      brand: {
        primaryColor: "#F97316",            // orange-500
        secondaryColor: "#FFF7ED",           // cream
        accentColor: "#7C3AED",
        fontHeading: "Playfair Display, ui-serif, Georgia",
        fontBody: "ui-sans-serif, system-ui",
        borderRadius: "8px",
      },
    });
    createdClient = true;
  }

  let clientUser = getUser(DEMO_CLIENT_EMAIL);
  if (!clientUser) {
    clientUser = createUser({
      email: DEMO_CLIENT_EMAIL,
      password: DEMO_CLIENT_PASSWORD,
      name: "Felicia (demo)",
      role: "client-owner",
      agencyId: agency.id,
      clientId: client.id,
    });
  }

  // End-customer (Felicia mirror's demo shopper). Seeds the third POV
  // for the demo cycle. Scoped per-client — uniqueness key is
  // `email|c:<clientId>` so this address can coexist with a hypothetical
  // agency-owner of the same name in a future demo.
  let customerUser = getUser(DEMO_CUSTOMER_EMAIL, { clientId: client.id, role: "end-customer" });
  let createdCustomer = false;
  if (!customerUser) {
    customerUser = createUser({
      email: DEMO_CUSTOMER_EMAIL,
      password: DEMO_CUSTOMER_PASSWORD,
      name: DEMO_CUSTOMER_NAME,
      role: "end-customer",
      agencyId: agency.id,
      clientId: client.id,
    });
    createdCustomer = true;
  }

  // Install client-scoped plugins on the Felicia mirror so the per-client
  // surfaces (editor, products, orders, memberships, affiliates, CRM)
  // are reachable in the smoke flow. Order is significant — dep-bearing
  // plugins must install after their deps:
  //   website-editor → ecommerce (ecommerce.requires=[website-editor])
  //   ecommerce → memberships    (memberships.requires=[ecommerce])
  //   ecommerce → affiliates     (affiliates.requires=[ecommerce])
  //   client-crm last (no hard deps but reads optional cross-plugin ports)
  const installedClientPlugins: string[] = [];
  for (const pluginId of ["website-editor", "ecommerce", "memberships", "affiliates", "client-crm"]) {
    if (!getInstall({ agencyId: agency.id, clientId: client.id }, pluginId)) {
      const result = await runtimeInstallPlugin(pluginId, {
        scope: { agencyId: agency.id, clientId: client.id },
        installedBy: actor ?? "demo-seed",
      });
      if (result.ok) {
        installedClientPlugins.push(pluginId);
      } else {
        // Don't crash the seed — log and continue. The Demo banner still
        // works without each plugin; missing plugin pages 404.
        logActivity({
          agencyId: agency.id,
          clientId: client.id,
          actorUserId: actor,
          category: "plugin",
          action: "demo.install.failed",
          message: `Demo seed: failed to install '${pluginId}' for client: ${result.error}`,
          metadata: { pluginId, error: result.error },
        });
      }
    }
  }

  // Install agency-scoped plugins (HR / finance / marketing). These are
  // `scopePolicy: "agency"` and `core: false` — the demo opts in
  // explicitly so the agency POV shows the full Milesy-internal surface.
  const installedAgencyPlugins: string[] = [];
  for (const pluginId of ["agency-hr", "agency-finance", "agency-marketing"]) {
    if (!getInstall({ agencyId: agency.id }, pluginId)) {
      const result = await runtimeInstallPlugin(pluginId, {
        scope: { agencyId: agency.id },
        installedBy: actor ?? "demo-seed",
      });
      if (result.ok) {
        installedAgencyPlugins.push(pluginId);
      } else {
        logActivity({
          agencyId: agency.id,
          actorUserId: actor,
          category: "plugin",
          action: "demo.install.failed",
          message: `Demo seed: failed to install '${pluginId}' agency-wide: ${result.error}`,
          metadata: { pluginId, error: result.error },
        });
      }
    }
  }

  // Seed half-ticked checklist progress for the current phase so the
  // phase board has visible state when the demo visitor lands.
  const fulfillmentInstall = getInstall({ agencyId: agency.id }, "fulfillment");
  let seededChecklist: SeedDemoResult["seededChecklist"] = null;
  if (fulfillmentInstall) {
    const phases: PhaseDefinition[] = listPhasesForAgency(agency.id);
    const phase = phases.find(p => p.stage === client.stage);
    if (phase && phase.checklist.length > 0) {
      const storage = makePluginStorage(fulfillmentInstall.id);
      const existingProgress = await storage.get<ChecklistProgress>(checklistKey(client.id, phase.id));
      if (!existingProgress) {
        const items: Record<string, ChecklistItemState> = {};
        const total = phase.checklist.length;
        const halfCount = Math.max(1, Math.floor(total / 2));
        for (let i = 0; i < total; i++) {
          const item = phase.checklist[i]!;
          items[item.id] = i < halfCount
            ? { done: true, doneAt: Date.now() - (total - i) * 60_000, doneBy: actor ?? "demo-seed" }
            : { done: false };
        }
        const progress: ChecklistProgress = {
          clientId: client.id,
          phaseId: phase.id,
          items,
          updatedAt: Date.now(),
        };
        await storage.set(checklistKey(client.id, phase.id), progress);
        seededChecklist = { phaseId: phase.id, ticked: halfCount, total };
      } else {
        const ticked = Object.values(existingProgress.items).filter(i => i.done).length;
        seededChecklist = { phaseId: phase.id, ticked, total: phase.checklist.length };
      }
    }
  }

  // T1 R13 — extra demo clients across two more Aqua phases so the
  // demo cycle showcases multiple lifecycle states. Idempotent: looks
  // up by slug + skips when already present. Each carries practice +
  // therapist metadata + plan tier so the per-client overview header
  // populates the Aqua reskin chips without operator input.
  const EXTRA_DEMO_CLIENTS: Array<{
    slug: string;
    name: string;
    stage: import("@/server/types").ClientStage;
    brand: { primaryColor: string; secondaryColor?: string; accentColor?: string };
    metadata: Record<string, unknown>;
  }> = [
    {
      slug: "demo-brand-builder",
      name: "Demo · Brand Builder phase",
      stage: "aqua-brand-builder",
      brand: { primaryColor: "#0EA5E9", secondaryColor: "#F0F9FF", accentColor: "#7C3AED" },
      metadata: {
        therapistName: "Demo Therapist",
        practiceName: "Aqua Brand Practice",
        planTier: "expansion",
        whatsappLink: "https://chat.whatsapp.com/demo-brand",
        lockInPaid: true,
      },
    },
    {
      slug: "demo-mastery",
      name: "Demo · Mastery phase",
      stage: "aqua-mastery",
      brand: { primaryColor: "#16A34A", secondaryColor: "#F0FDF4", accentColor: "#FACC15" },
      metadata: {
        therapistName: "Demo Mastery Therapist",
        practiceName: "Aqua Mastery Practice",
        planTier: "mastery",
        whatsappLink: "https://chat.whatsapp.com/demo-mastery",
        lockInPaid: true,
      },
    },
  ];
  const seededExtraClients: string[] = [];
  for (const def of EXTRA_DEMO_CLIENTS) {
    if (existingClients.some(c => c.slug === def.slug)) continue;
    createClient(agency.id, {
      name: def.name,
      slug: def.slug,
      stage: def.stage,
      brand: { ...def.brand },
      metadata: def.metadata,
    });
    seededExtraClients.push(def.slug);
  }

  logActivity({
    agencyId: agency.id,
    clientId: client.id,
    actorUserId: actor,
    category: "system",
    action: "demo.seeded",
    message: `Demo agency + Felicia mirror ready (${createdAgency ? "new" : "existing"} agency, ${createdClient ? "new" : "existing"} client, +${seededExtraClients.length} extra demo clients).`,
    metadata: { seededChecklist, idempotent: !createdAgency && !createdClient, installedClientPlugins, seededExtraClients },
  });

  return {
    agency,
    client,
    ownerUser,
    clientUser,
    customerUser,
    bootstrapped: { agency: createdAgency, client: createdClient, customer: createdCustomer },
    installedClientPlugins,
    installedAgencyPlugins,
    seededChecklist,
    seededExtraClients,
  };
}

// ─── Reset ────────────────────────────────────────────────────────────────
//
// Wipe the demo agency + every descendant. Safe to call when the demo
// agency doesn't exist (no-op). Used by `?reset=1` and (eventually) a
// nightly cron.

export interface ResetDemoResult {
  ok: true;
  existed: boolean;
  removed: {
    agency: number;          // 0 or 1
    clients: number;
    users: number;
    pluginInstalls: number;
    pluginDataKeys: number;
    phases: number;
    activityEntries: number;
    endCustomers: number;
  };
}

export async function resetDemo(): Promise<ResetDemoResult> {
  await ensureHydrated();

  const agency = getAgencyBySlug(DEMO_AGENCY_SLUG);
  if (!agency) {
    return {
      ok: true,
      existed: false,
      removed: {
        agency: 0, clients: 0, users: 0, pluginInstalls: 0,
        pluginDataKeys: 0, phases: 0, activityEntries: 0, endCustomers: 0,
      },
    };
  }

  const removed = {
    agency: 0, clients: 0, users: 0, pluginInstalls: 0,
    pluginDataKeys: 0, phases: 0, activityEntries: 0, endCustomers: 0,
  };

  mutate(state => {
    const aId = agency.id;

    for (const [id, c] of Object.entries(state.clients)) {
      if (c.agencyId === aId) { delete state.clients[id]; removed.clients++; }
    }
    for (const [id, ec] of Object.entries(state.endCustomers)) {
      if (ec.agencyId === aId) { delete state.endCustomers[id]; removed.endCustomers++; }
    }
    for (const [email, u] of Object.entries(state.users)) {
      if (u.agencyId === aId) { delete state.users[email]; removed.users++; }
    }
    for (const [installId, p] of Object.entries(state.pluginInstalls)) {
      if (p.agencyId === aId) {
        delete state.pluginInstalls[installId];
        removed.pluginInstalls++;
        if (state.pluginData[installId]) {
          removed.pluginDataKeys += Object.keys(state.pluginData[installId]).length;
          delete state.pluginData[installId];
        }
      }
    }
    for (const [id, ph] of Object.entries(state.phases)) {
      if (ph.agencyId === aId) { delete state.phases[id]; removed.phases++; }
    }
    const beforeAct = state.activity.length;
    state.activity = state.activity.filter(a => a.agencyId !== aId);
    removed.activityEntries = beforeAct - state.activity.length;

    if (state.agencies[aId]) { delete state.agencies[aId]; removed.agency = 1; }
  });

  return { ok: true, existed: true, removed };
}

// ─── Read-only helper for the demo route handlers ────────────────────────

export interface DemoTenantSnapshot {
  agency: Agency;
  client: Client;
  ownerUser: ServerUser;
  clientUser: ServerUser;
  customerUser: ServerUser;
}

// Returns the live demo agency/client/users if they exist. Used by
// `/demo` + `/demo/toggle` to skip re-seeding when nothing changed.
export function getDemoSnapshot(): DemoTenantSnapshot | null {
  const agency = getAgencyBySlug(DEMO_AGENCY_SLUG);
  if (!agency) return null;
  const ownerUser = getUser(DEMO_OWNER_EMAIL);
  const clientUser = getUser(DEMO_CLIENT_EMAIL);
  if (!ownerUser || !clientUser) return null;
  const clients = listClients(agency.id);
  const client = clients.find(c => c.slug === DEMO_CLIENT_SLUG);
  if (!client) return null;
  const customerUser = getUser(DEMO_CUSTOMER_EMAIL, { clientId: client.id, role: "end-customer" });
  if (!customerUser) return null;
  return { agency, client, ownerUser, clientUser, customerUser };
}

// Re-export so seed callers can introspect what's installed without
// reaching into pluginInstalls themselves.
export { listInstalledFor };
