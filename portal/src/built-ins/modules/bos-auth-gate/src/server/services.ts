// BOS auth-gate service.
//
// Pure decision engine — no storage. Foundation middleware imports
// `evaluate` and routes accordingly. The `me` route reads via the
// optional FunnelMePort + the standard UserPort.

import type { AgencyId, UserId, UserProfile } from "../lib/tenancy";
import type {
  AuthGateContext,
  AuthGateDecision,
  AuthGateOptions,
  BosMePayload,
} from "../lib/domain";
import {
  DEV_BYPASS_BANNER,
  buildLoginRedirect,
  isBosAsset,
  matchesBosPath,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  FunnelMePort,
  UserPort,
} from "./ports";

const DEFAULT_ALLOWED = ["lead", "agency-owner", "agency-manager", "agency-staff"];

export function evaluate(ctx: AuthGateContext, opts: AuthGateOptions = {}): AuthGateDecision {
  // Out-of-scope path → trivially allow. Foundation should also gate
  // matchers but defending here keeps the smoke clean if someone
  // calls evaluate without pre-matching.
  if (!matchesBosPath(ctx.pathname)) {
    return { outcome: "allow", reason: "out_of_scope" };
  }

  // Static asset under /business-os/ — never redirect (browser
  // can't follow 302 mid-asset-load) regardless of auth state.
  if (isBosAsset(ctx.pathname)) {
    return { outcome: "allow", reason: "static_asset" };
  }

  if (opts.devBypass) {
    return {
      outcome: "dev-bypass",
      banner: DEV_BYPASS_BANNER,
      reason: "dev_bypass",
    };
  }

  if (!ctx.signedIn) {
    return {
      outcome: "redirect",
      redirect: buildLoginRedirect({
        ...(opts.loginPath !== undefined ? { loginPath: opts.loginPath } : {}),
        nextPath: ctx.pathname,
      }),
      reason: "not_signed_in",
    };
  }

  const allowed = ctx.allowedRoles ?? DEFAULT_ALLOWED;
  if (!ctx.role || !allowed.includes(ctx.role)) {
    return {
      outcome: "redirect",
      redirect: buildLoginRedirect({
        ...(opts.loginPath !== undefined ? { loginPath: opts.loginPath } : {}),
        nextPath: ctx.pathname,
      }),
      reason: "role_not_allowed",
    };
  }

  return { outcome: "allow", reason: "ok" };
}

// ── Me endpoint resolver ─────────────────────────────────────

export interface MeResolverDeps {
  agencyId: AgencyId;
  user: UserPort;
  funnel?: FunnelMePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export class GateService {
  private readonly agencyId: AgencyId;
  private readonly user: UserPort;
  private readonly funnel?: FunnelMePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;

  constructor(deps: MeResolverDeps) {
    this.agencyId = deps.agencyId;
    this.user = deps.user;
    if (deps.funnel) this.funnel = deps.funnel;
    this.activity = deps.activity;
    this.events = deps.events;
  }

  async me(actor: UserId, role?: string): Promise<BosMePayload | null> {
    const profile: UserProfile | null = await Promise.resolve(this.user.getUser(actor));
    if (!profile) return null;

    const me: BosMePayload = {
      user: {
        id: profile.id,
        email: profile.email,
        ...(profile.name !== undefined ? { name: profile.name } : {}),
        ...(role !== undefined ? { role } : {}),
      },
      // `lead` users are agency-less by definition; agency-* operators
      // get `agencyless: false` so BOS can offer the operator's
      // agency view without leaking the wrong tenant boundaries.
      agencyless: role === "lead",
    };

    if (this.funnel) {
      const ctx = await Promise.resolve(this.funnel.getMeContextByUserId(actor));
      if (ctx) {
        if (ctx.hcSlot !== undefined) me.hcSlot = ctx.hcSlot;
        if (ctx.capturedAt !== undefined) me.capturedAt = ctx.capturedAt;
      }
    }

    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "bos-auth-gate", action: "bos-auth-gate.me_read",
      message: `BOS me-context read for ${profile.email}`,
      metadata: { hasHcSlot: me.hcSlot !== undefined },
    });
    this.events.emit({ agencyId: this.agencyId },
      "bos-auth-gate.me_read",
      { userId: actor, hasHcSlot: me.hcSlot !== undefined });

    return me;
  }
}
