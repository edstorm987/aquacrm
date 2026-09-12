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
  tagline: "Health Check + tool completions → safe pending capture.",
  description:
    "The public funnel link. Static `public/health-check/` POSTs the " +
    "completed slot through `/api/public/health-check/complete`; after managed challenge verification this plugin " +
    "creates only a non-authenticatable pending capture in install storage. It creates no User, session, membership " +
    "or provider identity. Existing identities, canonical-address repeats and repeated completion ids fail closed " +
    "without returning capture authority. Anonymous events contain only the capture id, source and score bucket. " +
    "The server-only promotion command revalidates its foundation capability inside one durable promotion ledger, " +
    "binds a hashed subject/operation claim to one exact install and capture, then stores the exact " +
    "Lead/Person/Prospect/card lineage; no bearer credential is stored and no public promotion endpoint exists. " +
    "Exact promoted-capture and client erasure route through that lineage to the CRM in the same retryable transaction, " +
    "while derivatives that pre-date the capture and identities shared by another client are preserved. " +
    "This host currently validates signed, fresh agency sessions with an authorised live member and fails mailbox-proof " +
    "credentials closed until a durable proof-receipt store is mounted. " +
    "Anonymous capture has one canonical mounted admission; the former query-scoped plugin completion routes are retired.",

  core: true,
  scopePolicy: "agency",

  // No nav items — public funnel is invisible UI; activity-inbox and
  // verified/legacy identities may surface through the me-context endpoint.
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
    const c = _containerFromCtx({ agencyId: ctx.agencyId, installId: ctx.install.id, storage: ctx.storage });
    if (!c) throw new Error("Public-funnel erasure foundation is unavailable.");
    const evidence = subject?.identityEvidence;
    const result = await c.funnel.eraseForClient({
      clientId,
      personId: subject?.exactOwnership?.personId,
      personShared: subject?.exactOwnership?.personShared ?? true,
      emails: evidence?.emails ?? subject?.emails ?? [],
      sharedEmails: evidence?.sharedEmails ?? [],
    });
    // Installed-plugin hooks execute in durable install order. When this hook
    // consumes an exact promoted Lead before the leads-pipeline hook runs,
    // retire the already-proven edge from the shared coordinator subject so
    // the downstream hook treats it as an idempotent absence, not corruption.
    for (const leadId of result.erasedPromotionLeadIds) {
      if (subject?.leadId === leadId) subject.leadId = undefined;
      if (subject?.exactOwnership.leadId === leadId) subject.exactOwnership.leadId = undefined;
    }
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
    const c = _containerFromCtx({ agencyId: ctx.agencyId, installId: ctx.install.id, storage: ctx.storage });
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
