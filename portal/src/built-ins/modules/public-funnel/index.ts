// `@aqua/plugin-public-funnel` — wires the Health Check (and future
// Resources tools) completion to a `lead` user creation + auto-signin
// + drop into Business OS. The critical link in the public funnel.
// `core: true` so it auto-installs on bootstrap.
//
// Scope policy note: the round 021 prompt suggests `"global"` (leads
// are agency-less), but until that scope-policy value lands we ship
// as `"agency"` and gate via the master "Milesy Media" agency. The
// plugin does the right thing under either scope — captures live in
// the install's storage and emit `agencyId` in events for whichever
// agency hosts the install.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const ADMINS = ["agency-owner", "agency-manager"] as const;

const manifest: AquaPlugin = {
  id: "public-funnel",
  name: "Public funnel",
  version: "0.1.0",
  status: "alpha",
  category: "growth",
  tagline: "Health Check + tool completions → lead user → auto-signin into BOS.",
  description:
    "The public funnel link. Static `public/health-check/` POSTs the " +
    "completed slot here; this plugin upserts a `lead` user via the " +
    "foundation `LeadUserPort`, captures the slot for BOS " +
    "personalisation, issues a session via `SessionPort`, and " +
    "responds with `{ redirect: '/business-os' }` so the browser " +
    "lands signed-in. Idempotent on canonical email — re-completing " +
    "the HC reuses the existing lead user without creating a " +
    "duplicate. Future Resources tools (rank-my-website, …) hit " +
    "`tool-complete` with the same shape.",

  core: true,
  scopePolicy: "agency",

  // No nav items — public funnel is invisible UI; activity-inbox and
  // BOS surface the captures via events + the me-context endpoint.
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
            id: "redirectAfterCapture",
            label: "Redirect after capture",
            type: "url",
            default: "/business-os",
            helpText: "Where to send the just-captured lead. Default `/business-os`.",
          },
          {
            id: "issueSessionCookie",
            label: "Issue Set-Cookie on capture",
            type: "boolean",
            default: true,
            helpText: "When on, the capture handlers set the `aqua_session` cookie so the lead is signed in. Turn off for testing or if BOS handles its own auth bridge.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "hc-capture",   label: "Capture HC completions",     default: true },
    { id: "tool-capture", label: "Capture Resources tools",    default: true },
    { id: "auto-signin",  label: "Issue session cookie",       default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "public-funnel foundation not registered" };
    const all = await c.funnel.list();
    const hc = all.filter(x => x.source === "hc").length;
    const tool = all.filter(x => x.source === "tool").length;
    return {
      ok: true,
      message: `${all.length} captures (${hc} HC · ${tool} tool)`,
      components: {
        captures: { ok: true, message: `${all.length}` },
      },
    };
  },
};

export default manifest;
void ADMINS; // ADMINS reserved for future admin-only routes (R+1 lead-board).
