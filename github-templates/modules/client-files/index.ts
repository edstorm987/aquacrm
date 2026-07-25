// `@aqua/plugin-client-files` — per-client file vault. Bridges T1 R010
// Files tab. Inline base64 storage <2MB; larger files store as
// `external` references for T6 to wire S3.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const VIEWERS = ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff", "freelancer"] as const;

const manifest: AquaPlugin = {
  id: "client-files",
  name: "Client Files",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Per-client file vault — brand assets, briefs, deliverables, invoices.",
  description:
    "Per-client file vault with 5 categories (brand-assets · brief-strategy · " +
    "deliverables · invoices · misc). Inline base64 storage for blobs ≤2MB; " +
    "larger uploads store as `external` references with a runbook hook for T6 " +
    "to wire S3 / cloud storage. Per-actor visibility: client-shell users only " +
    "see files where `visibleToClient: true`; agency sees all. Share-link " +
    "tokens rotate on each issue.",

  core: false,
  scopePolicy: "client",

  navItems: [
    {
      id: "client-files.vault", label: "Files",
      href: "/portal/clients/[clientId]/client-files",
      panelId: "ops", order: 25, visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/FilesPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultVisibleToClient",
            label: "Default visibleToClient on new uploads",
            type: "boolean",
            default: false,
          },
        ],
      },
    ],
  },

  features: [
    { id: "share-links", label: "Share-link tokens", default: true },
    { id: "inline-storage", label: "Inline base64 storage <2MB", default: true },
    { id: "external-storage", label: "External-reference uploads (S3/FS)", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "client-files foundation not registered" };
    const counts = await c.files.categoryCounts({ userId: ctx.actor, isAgency: true });
    const total = counts.reduce((s, c) => s + c.count, 0);
    const totalBytes = counts.reduce((s, c) => s + c.totalBytes, 0);
    return {
      ok: true,
      message: `${total} files · ${(totalBytes / 1024 / 1024).toFixed(2)} MB total`,
      components: {
        files: { ok: true, message: `${total} rows in scope` },
      },
    };
  },
};

export default manifest;
