// `@aqua/plugin-public-funnel` — wires the Health Check (and future
// Resources tools) completion to pending-only lead capture. Anonymous
// completion creates no User, session, membership or provider identity; a
// future mailbox-verified continuation owns promotion and sign-in.
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
  ErasureSubject,
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
  tagline: "Health Check + tool completions → safe lead capture for BOS.",
  description:
    "The public funnel link. Static `public/health-check/` POSTs the " +
    "completed slot through `/api/public/health-check/complete`; after managed challenge verification this plugin " +
    "creates only a non-authenticatable pending capture in install storage. It creates no User, session, membership " +
    "or provider identity. Existing identities, canonical-address repeats and repeated completion ids fail closed " +
    "without returning capture authority. A future mailbox-verified, single-use flow owns promotion and sign-in. " +
    "Anonymous capture has one canonical mounted admission; the former query-scoped plugin completion routes are retired.",

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
        ],
      },
    ],
  },

  features: [
    { id: "hc-capture",   label: "Capture HC completions",     default: true },
    { id: "tool-capture", label: "Capture Resources tools",    default: true },
  ],

  // Right-to-be-forgotten. Address-only captures are preserved and surfaced
  // for review; only exact client/exclusive-Person stamps may delete.
  onEraseClient: async (ctx: PluginCtx, clientId: string, subject?: ErasureSubject) => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) throw new Error("Public-funnel erasure foundation is unavailable.");
    const evidence = subject?.identityEvidence;
    const result = await c.funnel.eraseForClient({
      clientId,
      personId: subject?.exactOwnership?.personId,
      personShared: subject?.exactOwnership?.personShared ?? true,
      emails: evidence?.emails ?? subject?.emails ?? [],
      sharedEmails: evidence?.sharedEmails ?? [],
    });
    if (result.reviewRequired.legacyUnscoped > 0) {
      subject?.reviewRequired?.push({
        system: "public-funnel",
        reason: "legacy-unscoped",
        records: result.reviewRequired.legacyUnscoped,
      });
    }
    if (result.reviewRequired.sharedIdentity > 0) {
      subject?.reviewRequired?.push({
        system: "public-funnel",
        reason: "shared-identity",
        records: result.reviewRequired.sharedIdentity,
      });
    }
  },

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
