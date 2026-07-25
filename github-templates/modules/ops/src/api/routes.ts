import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import { healthcheckHandler, metricsHandler } from "./handlers";

const ADMIN_ROLES = ["agency-owner", "agency-manager"] as const;
const VIEWER_ROLES = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  { path: "metrics", methods: ["GET"], handler: metricsHandler, visibleToRoles: [...VIEWER_ROLES] },
  { path: "healthcheck", methods: ["POST"], handler: healthcheckHandler, visibleToRoles: [...ADMIN_ROLES] },
];
