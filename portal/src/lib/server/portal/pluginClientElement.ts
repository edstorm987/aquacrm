import "server-only";

// Which client element owns a built-in module's client-scoped API.
//
// The dynamic catch-all at `/api/portal/<moduleId>/<...>` already decides the
// TENANT (`resolveApiTenantScope`), the ROLE (`apiRouteAllowsRole`) and the
// FEATURE flag. What it never decided is the one thing the direct tenant routes
// do decide: **which `client.*` element a client-scoped call belongs to**, and
// therefore whether this person's grant actually covers it.
//
// The checklist has carried that gap for a while — "the dynamic plugin API
// catch-all still needs mappings for Fulfilment, Client CRM, Ecommerce,
// Memberships and Affiliates" — because the mapping is a judgement about what
// each module IS, not something derivable from the manifest.
//
// ── Nothing defaults to open ────────────────────────────────────────────────
//
// A module absent from this map contributes NO element requirement, which is
// the behaviour that exists today — so adding this file changes nothing for
// unmapped modules and tightens exactly the five that are mapped. That is
// deliberate: silently inventing an element for a module nobody classified
// would either block a working surface or, worse, pick the wrong owner and
// look enforced while guarding the wrong thing. `UNMAPPED_MODULES` names the
// rest explicitly so "not yet classified" cannot be confused with "no client
// data", and the test asserts every built-in module appears in one list or the
// other.

import type { AccessElementKey } from "@/server/types";

/**
 * Built-in modules whose client-scoped API is owned by a client element.
 *
 * The reasoning, module by module — this is the part worth arguing with:
 *
 *  • `fulfillment`  → delivery of the work sold. The client workspace calls
 *                     this tab Delivery and maps it to `client.fulfilment`.
 *  • `client-crm`   → the client's own contacts and relationships, which is
 *                     what `client.relationship` covers.
 *  • `ecommerce`    → selling and orders: money, so `client.commercial`.
 *  • `memberships`  → recurring subscriptions and payments: also commercial.
 *  • `affiliates`   → referral and promotion programmes, which sit with
 *                     `client.marketing` rather than with money, because the
 *                     payouts belong to the agency's Finance rather than to the
 *                     client's own commercial surface.
 */
export const MODULE_CLIENT_ELEMENT: Readonly<Record<string, AccessElementKey>> = {
  fulfillment: "client.fulfilment",
  "client-crm": "client.relationship",
  ecommerce: "client.commercial",
  memberships: "client.commercial",
  affiliates: "client.marketing",
};

/**
 * Built-in modules deliberately NOT mapped, and why. Kept explicit so the next
 * person can tell "decided: no element" from "nobody looked".
 */
export const UNMAPPED_MODULES: Readonly<Record<string, string>> = {
  "agency-finance": "agency-side money; its client-scoped reads already gate on client.commercial at their own routes",
  "agency-hr": "the agency's own people — never client-scoped",
  "agency-marketing": "the agency's own marketing, not a client's",
  "bos-auth-gate": "an auth gate for the public funnel; carries no client workspace data",
  "email-sender": "a shared delivery mechanism used by other modules, not a client surface",
  "leads-pipeline": "agency-side sales movement before a client exists",
  "public-funnel": "public and pre-client by definition",
  "website-editor": "governed by the development/editor elements, not a client workspace tab",
};

/**
 * The element that governs a module's data at the AGENCY scope.
 *
 * Added 2026-08-27 for the in-app AI surfaces, and put HERE rather than in a
 * new file because "which element owns this module" already lives in this one
 * and must have a single answer. The client map above says which element owns a
 * module's CLIENT-scoped API; this says which element owns its data when
 * something reads the whole tenant — which is exactly what an assistant context
 * does.
 *
 * The judgements match `externalAssistantDelegation.ts` deliberately: an
 * assistant that runs inside the app and one that talks to it over the API must
 * not disagree about who may see finance.
 *
 * A module with NO entry contributes nothing to an assistant context. That is
 * the safe default and the opposite of the previous behaviour, where every
 * installed module's raw data went to the model regardless of who was asking.
 */
export const MODULE_AGENCY_ELEMENT: Readonly<Record<string, AccessElementKey>> = {
  "agency-finance": "client.commercial",
  "agency-hr": "staff.people",

  "agency-marketing": "client.marketing",
  "leads-pipeline": "client.relationship",
  "email-sender": "client.communications",
  "client-crm": "client.relationship",
  fulfillment: "client.fulfilment",
  ecommerce: "client.commercial",
  memberships: "client.commercial",
  affiliates: "client.marketing",
  "website-editor": "development.overview",
  "public-funnel": "workspace.overview",
  "bos-auth-gate": "workspace.overview",
};

/** The element that owns this module's data agency-wide, or null. */
export function agencyElementForModule(moduleId: string): AccessElementKey | null {
  return MODULE_AGENCY_ELEMENT[moduleId] ?? null;
}

/**
 * The element required for a client-scoped call to this module, if any.
 *
 * Returns null for an unmapped module — the caller must then apply no element
 * requirement rather than guessing one.
 */
export function clientElementForModule(moduleId: string): AccessElementKey | null {
  return MODULE_CLIENT_ELEMENT[moduleId] ?? null;
}

/**
 * The level a method needs.
 *
 * A catch-all cannot tell an ordinary write from a destructive one, so it does
 * not pretend to: reads need `view`, everything else needs `use`. Individual
 * routes that ARE destructive keep their own `manage` checks at the handler,
 * which this floor sits underneath rather than replacing.
 */
export function clientElementLevelForMethod(method: string): "view" | "use" {
  return method === "GET" || method === "HEAD" ? "view" : "use";
}
