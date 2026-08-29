import "server-only";

// A stand-in client, so a TEMPLATE can be drafted before any client exists.
//
// Ed, 2026-08-27: *"The editor needs a client record to supply preview data for
// this project … all the products ones should just use a demo … this way I can
// make draft things."*
//
// ── Why the editor asked for a client at all ───────────────────────────────
//
// Template preview is not a separate renderer. The studio previews a template by
// loading `/client-preview/<clientId>?scope=template&templateId=…` — it renders
// the template THROUGH a client so you see it with real shapes in it rather than
// as an abstract layout. That is the right design, and it has one consequence:
// with no clients on the agency, `DevEditor` hit `!clients.length && portalTarget`
// and refused to open at all. A product-portal template — which by definition
// belongs to a product and not to any client — could not be drafted until a real
// client existed.
//
// ── Why this is SYNTHESISED rather than created ────────────────────────────
//
// The obvious fix is to create a client record and preview against it. That
// would work and it would also be wrong: a real row appears in the client list,
// in counts, in KPIs, in Radar, in finance surfaces — a fake client quietly
// becoming part of the business's own numbers. Every one of those would then
// need to learn to exclude it.
//
// So nothing is stored. `sampleClientId(agencyId)` is a reserved id that no
// generator produces, and the preview route resolves it to the object below
// instead of a store lookup. It exists for the length of one render.
//
// It is deliberately obvious rather than plausible. A draft preview that looks
// like a real client invites someone to read the numbers in it as real; "Sample
// Client (preview only)" cannot be misread.

import type { Client } from "@/server/types";

/**
 * The reserved id, scoped per agency so it can never collide across tenants and
 * can never be confused for a generated `cli_…` id.
 */
const PREFIX = "sample-preview__";

export function sampleClientId(agencyId: string): string {
  return `${PREFIX}${agencyId}`;
}

/**
 * Accepts the percent-encoded form too.
 *
 * The separator was a colon on the first attempt, and the preview 404'd: Next
 * hands a dynamic route segment through WITHOUT decoding it, so
 * `/client-preview/sample-preview:milesymedia` arrived as
 * `sample-preview%3Amilesymedia` and matched nothing. `__` needs no encoding at
 * all, which removes the cause — and the decode below stays anyway, because the
 * next id to travel through a path should not have to rediscover this.
 */
export function isSampleClientId(value: unknown): boolean {
  return typeof value === "string" && decodeSegment(value).startsWith(PREFIX);
}

/** The agency a sample id belongs to, or "" when it is not one. */
export function sampleClientAgencyId(value: string): string {
  const decoded = decodeSegment(value);
  return decoded.startsWith(PREFIX) ? decoded.slice(PREFIX.length) : "";
}

function decodeSegment(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export const SAMPLE_CLIENT_NAME = "Sample Client (preview only)";

/**
 * The stand-in itself.
 *
 * Its metadata is populated because the portal reads its shape from there —
 * an empty object renders a portal with every section blank, which tells a
 * template author nothing about whether their layout works. These are the
 * fields `loadCustomerPortalData` reads, filled with obviously-sample values.
 */
export function sampleClientFor(agencyId: string, now = 0): Client {
  return {
    id: sampleClientId(agencyId),
    agencyId,
    // Fixed rather than `Date.now()`: the stand-in must render identically on
    // every preview, or a template author sees relative dates drift between
    // reloads and reads it as their layout changing.
    createdAt: now,
    updatedAt: now,
    name: SAMPLE_CLIENT_NAME,
    slug: "sample-preview",
    brand: { primaryColor: "#2f6f8f" },
    stage: "live",
    status: "active",
    metadata: {
      // Marks the record for anything that ends up holding one by accident.
      samplePreviewClient: true,
      portalMode: "designing",
      portalContactName: "Sam Taylor",
      portalServicePlan: "Sample plan",
      portalPlanSummary: "A stand-in plan so the template renders with content in it.",
      portalPlanIncludes: [
        "Everything your template lays out",
        "Shown with sample text, not a real client's",
      ],
      portalBillingCadence: "Monthly",
      practiceName: SAMPLE_CLIENT_NAME,
      therapistName: "Sam Taylor",
    },
  };
}
