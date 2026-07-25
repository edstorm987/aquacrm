// Manifest API routes — mounted at `/api/portal/portal-export/...`.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  getHistoryHandler,
  getPresetHandler,
  getStateHandler,
  listHistoryHandler,
  listPresetsHandler,
  openPrStubHandler,
  planExportHandler,
  runExportHandler,
} from "./handlers";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Presets — read-only
  { path: "presets", methods: ["GET"], handler: listPresetsHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "presets/get", methods: ["GET"], handler: getPresetHandler, visibleToRoles: [...AGENCY_VIEWERS] },

  // State preview (collect-only, no write)
  { path: "state", methods: ["GET"], handler: getStateHandler, visibleToRoles: [...AGENCY_VIEWERS] },

  // Plan vs run
  { path: "clients/plan", methods: ["POST"], handler: planExportHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "clients/export", methods: ["POST"], handler: runExportHandler, visibleToRoles: [...AGENCY_ADMINS] },

  // History
  { path: "history", methods: ["GET"], handler: listHistoryHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "history/get", methods: ["GET"], handler: getHistoryHandler, visibleToRoles: [...AGENCY_VIEWERS] },

  // PR-open stub (foundation-pending real integration)
  { path: "pr/open", methods: ["POST"], handler: openPrStubHandler, visibleToRoles: [...AGENCY_ADMINS] },
];
