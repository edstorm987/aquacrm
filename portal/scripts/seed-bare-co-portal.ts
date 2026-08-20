// Seeds the `Bare Co` dev tenant with a client and a built portal, so the
// Portal Studio has something real to open.
//
// The Studio refuses to render without a client record — it needs one to
// supply preview data — so on a fresh dev tenant the whole editor is invisible
// and looks broken rather than empty.
//
// Idempotent — re-run freely, including after restoring the sandbox. Refuses
// to run against a durable backend, the same guard dev mode itself uses.
//
//   PORTAL_BACKEND=file npx tsx scripts/seed-bare-co-portal.ts

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath, filename: serverOnlyPath, loaded: true,
  exports: {}, paths: [], children: [],
} as never;

async function main() {
  const { ensureHydrated, getState, mutate, flushPendingWrites, getBackendInfo } = await import("@/server/storage");
  const { createAgency } = await import("@/server/tenants");
  const { ensureClientPortalInstance, ensureStunningPortalTemplate } = await import("@/server/clientPortalDesigns");
  const { DEV_AGENCY_NAME, DEV_AGENCY_SLUG } = await import("@/lib/server/devMode");

  await ensureHydrated();

  const backend = getBackendInfo().kind;
  if (backend !== "file" && backend !== "memory") {
    throw new Error(
      `Refusing to seed the dev tenant against the "${backend}" backend — that is real data. `
      + `Run with PORTAL_BACKEND=file.`,
    );
  }

  const agency = Object.values(getState().agencies)
    .find(entry => entry.slug === DEV_AGENCY_SLUG || entry.id === DEV_AGENCY_SLUG)
    ?? createAgency({ name: DEV_AGENCY_NAME, slug: DEV_AGENCY_SLUG });
  const agencyId = agency.id;

  // A stable id so re-running updates this client rather than adding another.
  const clientId = "cli_bare_co_cedar";
  const now = Date.now();

  const existing = getState().clients[clientId];
  mutate(state => {
    state.clients[clientId] = {
      ...(existing ?? {}),
      id: clientId,
      agencyId,
      name: "Cedar Dental",
      stage: "active",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      metadata: {
        ...(existing?.metadata ?? {}),
        // The Studio and the portal-control screens both check this before
        // they will save anything, so a seeded client without it looks built
        // but refuses every action.
        portalBuiltAt: existing?.metadata?.portalBuiltAt ?? now,
        portalMode: "onboarding",
        portalContactName: "Ruth Adeyemi",
        portalServicePlan: "Practice growth retainer",
        portalPlanSummary: "Website, local search and monthly reporting.",
        portalExperienceHeadline: "Everything for Cedar Dental in one place.",
        portalBillingCadence: "Monthly",
        portalWelcomeNote: "Welcome aboard — your project, files and billing all live here.",
        portalSupportEmail: "hello@bare.co",
        portalSupportPhone: "0161 496 0000",
      },
    } as never;
  });

  // The master template first: an instance is cloned from it, so seeding an
  // instance without one produces a portal with no design behind it.
  const template = ensureStunningPortalTemplate(agencyId, "dev-seed");
  const instance = ensureClientPortalInstance({ agencyId, clientId, actorUserId: "dev-seed" });

  await flushPendingWrites();

  console.log(`agency        : ${agency.name} (${agencyId})`);
  console.log(`client        : Cedar Dental (${clientId})`);
  console.log(`template      : ${template.name} (${template.id})`);
  console.log(`portal        : ${instance.id}`);
  console.log(`versions      : ${instance.versions.length}`);
  console.log(`\nOpen: /dev?to=/portal/agency/portals/editor`);
}

void main();
