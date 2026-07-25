import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  archiveTaskHandler,
  completeTaskHandler,
  createStatusHandler,
  createTaskHandler,
  healthOverviewHandler,
  listIncidentsHandler,
  listStatusHandler,
  listTasksHandler,
  markStatusHandler,
  openIncidentHandler,
  resolveIncidentHandler,
  seedTasksHandler,
  updateIncidentHandler,
  updateTaskHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Recurring tasks
  { path: "tasks",          methods: ["GET"],    handler: listTasksHandler,    visibleToRoles: [...VIEWERS] },
  { path: "tasks/create",   methods: ["POST"],   handler: createTaskHandler,   visibleToRoles: [...ADMINS] },
  { path: "tasks/update",   methods: ["PATCH"],  handler: updateTaskHandler,   visibleToRoles: [...ADMINS] },
  { path: "tasks/complete", methods: ["POST"],   handler: completeTaskHandler, visibleToRoles: [...VIEWERS] },
  { path: "tasks/archive",  methods: ["DELETE"], handler: archiveTaskHandler,  visibleToRoles: [...ADMINS] },
  { path: "tasks/seed",     methods: ["POST"],   handler: seedTasksHandler,    visibleToRoles: [...ADMINS] },

  // Status items
  { path: "status",         methods: ["GET"],  handler: listStatusHandler,   visibleToRoles: [...VIEWERS] },
  { path: "status/create",  methods: ["POST"], handler: createStatusHandler, visibleToRoles: [...ADMINS] },
  { path: "status/check",   methods: ["POST"], handler: markStatusHandler,   visibleToRoles: [...VIEWERS] },

  // Incidents
  { path: "incidents",          methods: ["GET"],   handler: listIncidentsHandler,   visibleToRoles: [...VIEWERS] },
  { path: "incidents/open",     methods: ["POST"],  handler: openIncidentHandler,    visibleToRoles: [...ADMINS] },
  { path: "incidents/update",   methods: ["PATCH"], handler: updateIncidentHandler,  visibleToRoles: [...ADMINS] },
  { path: "incidents/resolve",  methods: ["POST"],  handler: resolveIncidentHandler, visibleToRoles: [...ADMINS] },

  // Health
  { path: "health", methods: ["GET"], handler: healthOverviewHandler, visibleToRoles: [...VIEWERS] },
];
