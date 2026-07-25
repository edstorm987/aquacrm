import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  createResourceHandler,
  exportHandler,
  getResourceHandler,
  listResourcesHandler,
  recentActivityHandler,
  tickViewHandler,
  updateResourceHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff", "freelancer"] as const;

export const ROUTES: PluginApiRoute[] = [
  { path: "list",      methods: ["GET"],    handler: listResourcesHandler,  visibleToRoles: [...VIEWERS] },
  { path: "get",       methods: ["GET"],    handler: getResourceHandler,    visibleToRoles: [...VIEWERS] },
  { path: "create",    methods: ["POST"],   handler: createResourceHandler, visibleToRoles: [...ADMINS] },
  { path: "update",    methods: ["PATCH"],  handler: updateResourceHandler, visibleToRoles: [...ADMINS] },
  { path: "view",      methods: ["POST"],   handler: tickViewHandler,       visibleToRoles: [...VIEWERS] },
  { path: "export",    methods: ["GET"],    handler: exportHandler,         visibleToRoles: [...ADMINS] },
  { path: "activity",  methods: ["GET"],    handler: recentActivityHandler, visibleToRoles: [...VIEWERS] },
];
