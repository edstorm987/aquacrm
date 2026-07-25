import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  createHandler,
  deleteHandler,
  getHandler,
  listHandler,
  logHandler,
  pingHandler,
  updateHandler,
  verifyHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  { path: "list",    methods: ["GET"],    handler: listHandler,   visibleToRoles: [...VIEWERS] },
  { path: "get",     methods: ["GET"],    handler: getHandler,    visibleToRoles: [...VIEWERS] },
  { path: "create",  methods: ["POST"],   handler: createHandler, visibleToRoles: [...ADMINS] },
  { path: "update",  methods: ["PATCH"],  handler: updateHandler, visibleToRoles: [...ADMINS] },
  { path: "delete",  methods: ["DELETE"], handler: deleteHandler, visibleToRoles: [...ADMINS] },
  { path: "verify",  methods: ["POST"],   handler: verifyHandler, visibleToRoles: [...ADMINS] },
  { path: "ping",    methods: ["POST"],   handler: pingHandler,   visibleToRoles: [...ADMINS] },
  { path: "log",     methods: ["GET"],    handler: logHandler,    visibleToRoles: [...VIEWERS] },
];
