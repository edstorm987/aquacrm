import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  configHandler,
  setSaJsonHandler,
  testConnectionHandler,
  touchpointsHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Founder dashboard tile reads this — agency staff scope is fine
  // because GA4 data is per-agency-tenant.
  { path: "touchpoints",     methods: ["GET"],          handler: touchpointsHandler,     visibleToRoles: [...ADMINS] },
  { path: "config",          methods: ["GET", "PATCH"], handler: configHandler,          visibleToRoles: [...ADMINS] },
  { path: "service-account", methods: ["POST"],         handler: setSaJsonHandler,       visibleToRoles: [...ADMINS] },
  { path: "test-connection", methods: ["POST"],         handler: testConnectionHandler,  visibleToRoles: [...ADMINS] },
];
