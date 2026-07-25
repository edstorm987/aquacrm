// Starter portal variant — T3 integration shim.
//
// **TODO** — once T3 ships `@aqua/plugin-website-editor`, the foundation
// will register T3's concrete `PortalVariantPort` and the call below will
// drive a real block-tree apply. Until then this falls back to logging
// the intent so phase-engine commits don't break.
//
// The contract (per `04-architecture.md §7` + the chief commander's
// brokering): each phase carries a `portalVariantId` (string). The
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

// Foundation-side fallback: when T3 hasn't shipped, the foundation can
// register this no-op port so the phase engine still runs end-to-end.
// Logged to console at info level — never throws.
export const NOOP_PORTAL_VARIANT_PORT: PortalVariantPort = {
  async applyStarterVariant(args) {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.info(
        `[fulfillment] applyStarterVariant: T3 not yet wired. Would apply ${args.variantId} to client ${args.clientId} as role ${args.role}.`,
      );
    }
    return { ok: true, variantId: args.variantId };
  },
};
