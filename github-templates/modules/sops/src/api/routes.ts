// Manifest API routes — mounted at `/api/portal/sops/...`.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  archiveSopHandler,
  createSopHandler,
  getSopHandler,
  listSopsHandler,
  restoreSopHandler,
  seedSopsHandler,
  tagCountsHandler,
  updateSopHandler,
} from "./handlers";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Read
  { path: "list", methods: ["GET"], handler: listSopsHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "get", methods: ["GET"], handler: getSopHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "tags", methods: ["GET"], handler: tagCountsHandler, visibleToRoles: [...AGENCY_VIEWERS] },

  // Mutate (admin)
  { path: "create", methods: ["POST"], handler: createSopHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "update", methods: ["PATCH"], handler: updateSopHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "archive", methods: ["DELETE"], handler: archiveSopHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "restore", methods: ["POST"], handler: restoreSopHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "seed", methods: ["POST"], handler: seedSopsHandler, visibleToRoles: [...AGENCY_ADMINS] },
];
