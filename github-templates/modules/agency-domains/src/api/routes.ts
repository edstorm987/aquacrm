import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  createAttachHandler,
  deleteAttachHandler,
  listAttachesHandler,
  statusHandler,
  transitionAttachHandler,
  verifyAttachHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager", "client-owner"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  { path: "list",       methods: ["GET"],    handler: listAttachesHandler,      visibleToRoles: [...VIEWERS] },
  { path: "create",     methods: ["POST"],   handler: createAttachHandler,      visibleToRoles: [...ADMINS] },
  { path: "delete",     methods: ["DELETE"], handler: deleteAttachHandler,      visibleToRoles: [...ADMINS] },
  { path: "transition", methods: ["POST"],   handler: transitionAttachHandler,  visibleToRoles: [...ADMINS] },
  { path: "status",     methods: ["GET"],    handler: statusHandler,            visibleToRoles: [...VIEWERS] },
  { path: "verify",     methods: ["POST"],   handler: verifyAttachHandler,      visibleToRoles: [...ADMINS] },
];
