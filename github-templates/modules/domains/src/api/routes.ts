// Route table mounted at `/api/portal/domains/...` by T1's catch-all
// dispatcher. Paths use the relative convention (no leading slash) —
// same as fulfillment + ecommerce + agency-hr.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  attachHandler,
  listHandler,
  removeHandler,
  statusHandler,
  verifyHandler,
} from "./handlers";

const ADMIN_ROLES = ["agency-owner", "agency-manager", "client-owner"] as const;
const VIEWER_ROLES = [
  "agency-owner",
  "agency-manager",
  "agency-staff",
  "client-owner",
  "client-staff",
] as const;

export const ROUTES: PluginApiRoute[] = [
  // Read surface — visible to staff so they can audit attached domains.
  { path: "status", methods: ["GET"], handler: statusHandler, visibleToRoles: [...VIEWER_ROLES] },
  { path: "list", methods: ["GET"], handler: listHandler, visibleToRoles: [...VIEWER_ROLES] },

  // Mutations — admin only. Domain attach is a paid resource (Vercel
  // can attach extra-cost domains depending on team plan), so gate to
  // owners + managers.
  { path: "attach", methods: ["POST"], handler: attachHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "verify", methods: ["POST"], handler: verifyHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "", methods: ["DELETE"], handler: removeHandler, visibleToRoles: [...ADMIN_ROLES] },
];
