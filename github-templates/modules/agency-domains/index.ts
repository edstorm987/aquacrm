// `@aqua/plugin-agency-domains` — skeleton custom-domain attach.
// Operator records intent + status; T6 wires real DNS/TLS verification
// (see `@aqua/plugin-domains` chapter #50 for the production-wired
// sibling).

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const ADMINS = ["agency-owner", "agency-manager", "client-owner"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"] as const;

const manifest: AquaPlugin = {
  id: "agency-domains",
  name: "Custom domains",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Record per-client custom-domain attaches with NS-record instructions.",
  description:
    "Skeleton plugin that captures the *intent* of a custom-domain " +
    "attach + the NS records the client needs to set on their " +
    "registrar. Status state machine: pending → verifying → active " +
    "(or failed). Real DNS verification + TLS issuance is deferred " +
    "to T6 and lives in the production-wired sibling " +
    "`@aqua/plugin-domains` (chapter #50).",

  core: false,
  scopePolicy: "client",

  navItems: [
    {
      id: "agency-domains.attaches", label: "Custom domain",
      href: "/portal/clients/[clientId]/agency-domains",
      panelId: "ops", order: 50, visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/DomainsPage") },
  ],

  api: ROUTES,

  settings: { groups: [] },

  features: [
    { id: "manual-status", label: "Operator-flipped status transitions", default: true },
    { id: "ns-instructions", label: "NS record viewer", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage });
    if (!c) return { ok: false, message: "agency-domains foundation not registered" };
    const list = await c.domains.list();
    const active = list.filter(d => d.status === "active").length;
    const failed = list.filter(d => d.status === "failed").length;
    return {
      ok: failed === 0,
      message: `${active}/${list.length} active${failed ? ` · ${failed} failed` : ""}`,
      components: {
        attaches: { ok: failed === 0, message: `${list.length} rows` },
      },
    };
  },
};

export default manifest;
