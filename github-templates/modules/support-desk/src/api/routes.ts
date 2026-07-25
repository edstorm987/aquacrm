import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  getHandler,
  honeypotHandler,
  listHandler,
  publicCreateHandler,
  replyHandler,
  updateHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Storefront-facing: public + honeypot-protected.
  { path: "submit",   methods: ["POST"],  handler: publicCreateHandler, public: true },
  { path: "honeypot", methods: ["GET"],   handler: honeypotHandler,     public: true },
  // Agency-side admin.
  { path: "list",     methods: ["GET"],   handler: listHandler,  visibleToRoles: [...VIEWERS] },
  { path: "get",      methods: ["GET"],   handler: getHandler,   visibleToRoles: [...VIEWERS] },
  { path: "update",   methods: ["PATCH"], handler: updateHandler, visibleToRoles: [...ADMINS] },
  { path: "reply",    methods: ["POST"],  handler: replyHandler,  visibleToRoles: [...VIEWERS] },
];
