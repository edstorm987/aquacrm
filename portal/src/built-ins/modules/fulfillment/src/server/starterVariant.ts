// Starter portal variant — the T2 (fulfillment) side of the phase→portal apply.
//
// T3 (`@aqua/plugin-website-editor`) is shipped and wired: the foundation
// registers `portalVariantAdapter` (foundation-adapters/portalVariantAdapter.ts)
// as `FOUNDATION_SERVICES.variants`, and it calls T3's concrete
// `applyStarterVariant` to drive the real block-tree apply. `StarterVariantService`
// below is the T2 wrapper the phase engine calls; that adapter is its port.
//
// The contract (per `04-architecture.md §7`): each phase carries a
// `portalVariantId` (string). The
// variant content (block tree) lives in T3's editor store. Applying a
// starter variant copies the named template into the active client variant
// for the given role (typically `client-owner`).

import type { ClientId, AgencyId, PortalRole, UserId } from "../lib/tenancy";
import type { PortalVariantPort } from "./ports";

export interface ApplyVariantArgs {
  agencyId: AgencyId;
  clientId: ClientId;
  variantId: string;
  // Portal surface to apply the starter variant to. Defaults to "login"
  // since that's the first surface a client sees on phase entry. Phase
  // editor lets agency owners customise per-phase.
  role?: PortalRole;
  actor?: UserId;
}

export interface ApplyVariantResult {
  ok: true;
  variantId: string;
  pageId?: string;
  siteId?: string;
}

export class StarterVariantService {
  constructor(private port: PortalVariantPort) {}

  async apply(args: ApplyVariantArgs): Promise<ApplyVariantResult | { ok: false; error: string }> {
    const role: PortalRole = args.role ?? "login";
    return this.port.applyStarterVariant({
      agencyId: args.agencyId,
      clientId: args.clientId,
      variantId: args.variantId,
      role,
      actor: args.actor,
    });
  }
}

// `NOOP_PORTAL_VARIANT_PORT` (the T3-not-shipped fallback) was quarantined 2026-09-05
// — 0 consumers now that portalVariantAdapter drives the real T3 apply →
// dead-code/portal/src/built-ins/modules/fulfillment/src/server/starterVariant.ts.NOOP_PORTAL_VARIANT_PORT.snippet
