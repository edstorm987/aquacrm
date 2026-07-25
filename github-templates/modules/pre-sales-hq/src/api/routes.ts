import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  createProposalHandler,
  listCallsHandler,
  listNurtureHandler,
  listProposalsHandler,
  overdueNurtureHandler,
  recordNurtureHandler,
  scheduleCallHandler,
  transitionProposalHandler,
  updateCallHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Calls
  { path: "calls",          methods: ["GET"],   handler: listCallsHandler,    visibleToRoles: [...VIEWERS] },
  { path: "calls/schedule", methods: ["POST"],  handler: scheduleCallHandler, visibleToRoles: [...ADMINS] },
  { path: "calls/update",   methods: ["PATCH"], handler: updateCallHandler,   visibleToRoles: [...ADMINS] },

  // Proposals
  { path: "proposals",            methods: ["GET"],  handler: listProposalsHandler,      visibleToRoles: [...VIEWERS] },
  { path: "proposals/create",     methods: ["POST"], handler: createProposalHandler,     visibleToRoles: [...ADMINS] },
  { path: "proposals/transition", methods: ["POST"], handler: transitionProposalHandler, visibleToRoles: [...ADMINS] },

  // Nurture
  { path: "nurture",          methods: ["GET"],  handler: listNurtureHandler,    visibleToRoles: [...VIEWERS] },
  { path: "nurture/record",   methods: ["POST"], handler: recordNurtureHandler,  visibleToRoles: [...VIEWERS] },
  { path: "nurture/overdue",  methods: ["GET"],  handler: overdueNurtureHandler, visibleToRoles: [...VIEWERS] },
];
