// Manifest API routes — mounted at `/api/portal/activity-inbox/...`.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  getFiltersHandler,
  getReadStateHandler,
  listInboxHandler,
  markReadHandler,
  saveFiltersHandler,
  unreadCountHandler,
} from "./handlers";

const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  { path: "list",   methods: ["GET"],  handler: listInboxHandler,    visibleToRoles: [...VIEWERS] },
  { path: "unread", methods: ["GET"],  handler: unreadCountHandler,  visibleToRoles: [...VIEWERS] },
  { path: "read",   methods: ["GET"],  handler: getReadStateHandler, visibleToRoles: [...VIEWERS] },
  { path: "mark-read", methods: ["POST"], handler: markReadHandler,  visibleToRoles: [...VIEWERS] },
  { path: "filters",   methods: ["GET"],  handler: getFiltersHandler,  visibleToRoles: [...VIEWERS] },
  { path: "filters/save", methods: ["POST"], handler: saveFiltersHandler, visibleToRoles: [...VIEWERS] },
];
