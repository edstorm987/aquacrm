// API route table for @aqua/plugin-ai-builder. Round-7.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  generateHandler,
  generateStreamHandler,
  imageHandler,
  imageVariationsHandler,
  imageInpaintHandler,
  usageHandler,
  listGenerationsHandler,
  getGenerationHandler,
  metricsHandler,
  getSettingsHandler,
  saveSettingsHandler,
  statusHandler,
} from "./handlers";

const ADMIN_ROLES = ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  { path: "status",         methods: ["GET"],  handler: statusHandler,          visibleToRoles: [...ADMIN_ROLES] },
  { path: "generate",       methods: ["POST"], handler: generateHandler,        visibleToRoles: [...ADMIN_ROLES] },
  { path: "generate/stream", methods: ["POST"], handler: generateStreamHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "generations",    methods: ["GET"],  handler: listGenerationsHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "generations/get", methods: ["GET"], handler: getGenerationHandler,   visibleToRoles: [...ADMIN_ROLES] },
  { path: "metrics",        methods: ["GET"],  handler: metricsHandler,         visibleToRoles: [...ADMIN_ROLES] },
  { path: "image",            methods: ["POST"], handler: imageHandler,           visibleToRoles: [...ADMIN_ROLES] },
  { path: "image/variations", methods: ["POST"], handler: imageVariationsHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "image/inpaint",    methods: ["POST"], handler: imageInpaintHandler,    visibleToRoles: [...ADMIN_ROLES] },
  { path: "usage",          methods: ["GET"],  handler: usageHandler,           visibleToRoles: [...ADMIN_ROLES] },
  { path: "settings",       methods: ["GET"],  handler: getSettingsHandler,     visibleToRoles: [...ADMIN_ROLES] },
  { path: "settings",       methods: ["POST"], handler: saveSettingsHandler,    visibleToRoles: [...ADMIN_ROLES] },
];
