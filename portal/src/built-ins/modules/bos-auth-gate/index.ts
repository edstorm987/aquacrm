// `@aqua/plugin-bos-auth-gate` — gates `/business-os/*` on a real
// session and surfaces lead user state (HC slot, captures) for BOS
// personalisation. The plugin ships as a pure decision engine
// (`evaluate(ctx, opts)`) plus a `/api/portal/business-os/me`
// endpoint; foundation calls `evaluate` from `middleware.ts` to
// translate the decision into a 302 or pass-through response.
// HARD BOUNDARY: this plugin does NOT edit `public/business-os/`
// (T4 territory) and does NOT edit `milesymedia-website/` source
// (T1 territory) — wire-up is documented as foundation-pending.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const manifest: AquaPlugin = {
  id: "bos-auth-gate",
  name: "BOS auth gate",
  version: "0.1.0",
  status: "alpha",
  category: "core",
  tagline: "Gate /business-os/* on a real session; surface lead state for personalisation.",
  description:
    "Pairs with @aqua/plugin-public-funnel: the funnel captures the " +
    "lead, this plugin makes sure only signed-in users hit BOS and " +
    "feeds the lead's HC slot to BOS via `me`. Pure decision engine " +
    "(`evaluate`) so the foundation middleware can route without " +
    "importing the runtime container; soft-gate via " +
    "`NEXT_PUBLIC_DEV_BYPASS=1` keeps dev access easy. Production " +
    "should land with the gate active.",

  core: true,
  scopePolicy: "agency",

  navItems: [],
  pages: [],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "loginPath",
            label: "Login redirect path",
            type: "text",
            default: "/login",
            helpText: "Where unauthenticated BOS visitors are sent. Mirrors T1 R022's `?return=` semantics — the gate appends `?from=bos&next=<path>`.",
          },
          {
            id: "devBypass",
            label: "Dev-bypass mode (UI hint)",
            type: "boolean",
            default: false,
            helpText: "Display-only — actual bypass is read from `NEXT_PUBLIC_DEV_BYPASS` at request time so the toggle survives an env flip without redeploying.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "middleware-gate", label: "Gate /business-os/* in middleware", default: true },
    { id: "me-endpoint",     label: "Surface BOS me-context payload",    default: true },
    { id: "dev-bypass",      label: "Honour NEXT_PUBLIC_DEV_BYPASS",     default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId });
    if (!c) return { ok: false, message: "bos-auth-gate foundation not registered" };
    return {
      ok: true,
      message: "gate ready",
      components: { gate: { ok: true, message: "evaluate() available" } },
    };
  },
};

export default manifest;
