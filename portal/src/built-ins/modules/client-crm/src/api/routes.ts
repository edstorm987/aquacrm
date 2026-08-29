// Manifest API routes — mounted at `/api/portal/client-crm/...`.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  addNoteHandler,
  addStageHandler,
  boardHandler,
  createAutomationHandler,
  createCardHandler,
  createContactHandler,
  createPipelineHandler,
  createSegmentHandler,
  deleteAutomationHandler,
  deleteCardHandler,
  deleteContactHandler,
  deletePipelineHandler,
  deleteSegmentHandler,
  deleteStageHandler,
  importContactsHandler,
  ingestEventHandler,
  listAutomationsHandler,
  listContactActivityHandler,
  listContactsHandler,
  listPipelinesHandler,
  listSegmentMembersHandler,
  listSegmentsHandler,
  meProfileHandler,
  meUpdateProfileHandler,
  moveCardHandler,
  reorderStagesHandler,
  updateAutomationHandler,
  updateCardHandler,
  updateContactHandler,
  updatePipelineHandler,
  updateSegmentHandler,
  updateStageHandler,
} from "./handlers";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CLIENT_ADMINS = ["client-owner", "client-staff"] as const;
const ADMIN_VIEWERS = [...AGENCY_VIEWERS, ...CLIENT_ADMINS] as const;
const ADMIN_ROLES = [...AGENCY_ADMINS, ...CLIENT_ADMINS] as const;
const END_CUSTOMER = ["end-customer"] as const;

const CONTACT_AND_SEGMENT_ROUTES: PluginApiRoute[] = [
  // Contacts
  { path: "contacts", methods: ["GET"], handler: listContactsHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "contacts", methods: ["POST"], handler: createContactHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "contacts", methods: ["PATCH"], handler: updateContactHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "contacts", methods: ["DELETE"], handler: deleteContactHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "contacts/import", methods: ["POST"], handler: importContactsHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "contacts/notes", methods: ["POST"], handler: addNoteHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "contacts/activity", methods: ["GET"], handler: listContactActivityHandler, visibleToRoles: [...ADMIN_VIEWERS] },

  // Segments
  { path: "segments", methods: ["GET"], handler: listSegmentsHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "segments", methods: ["POST"], handler: createSegmentHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "segments", methods: ["PATCH"], handler: updateSegmentHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "segments", methods: ["DELETE"], handler: deleteSegmentHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "segments/members", methods: ["GET"], handler: listSegmentMembersHandler, visibleToRoles: [...ADMIN_VIEWERS] },

  // Cross-plugin event ingest (called by foundation's event router).
  { path: "events/ingest", methods: ["POST"], handler: ingestEventHandler, visibleToRoles: [...ADMIN_ROLES] },

  // Customer-facing
  { path: "me/profile", methods: ["GET"], handler: meProfileHandler, visibleToRoles: [...END_CUSTOMER] },
  { path: "me/profile", methods: ["PATCH"], handler: meUpdateProfileHandler, visibleToRoles: [...END_CUSTOMER] },
];

// ─── Journey pipelines ───────────────────────────────────────────────────
//
// Added 28 August 2026 with the kanban board. Roles mirror the rest of the
// module: the client's own people and their agency can look, and the same set
// minus agency-staff can change things. `ADMIN_ROLES` includes client-owner and
// client-staff — this is the client's board, so they must be able to build it,
// not just watch it.
//
// The FEATURE gate is separate and lives in the handlers: roles answer "may
// you", the `journey-pipelines` flag answers "does this client have it at all".

export const JOURNEY_ROUTES: PluginApiRoute[] = [
  { path: "pipelines", methods: ["GET"], handler: listPipelinesHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "pipelines", methods: ["POST"], handler: createPipelineHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
  { path: "pipelines", methods: ["PATCH"], handler: updatePipelineHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
  { path: "pipelines", methods: ["DELETE"], handler: deletePipelineHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
  { path: "pipelines/board", methods: ["GET"], handler: boardHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_VIEWERS] },

  { path: "pipelines/stages", methods: ["POST"], handler: addStageHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
  { path: "pipelines/stages", methods: ["PATCH"], handler: updateStageHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
  { path: "pipelines/stages", methods: ["DELETE"], handler: deleteStageHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
  { path: "pipelines/stages/reorder", methods: ["POST"], handler: reorderStagesHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },

  { path: "pipelines/cards", methods: ["POST"], handler: createCardHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
  { path: "pipelines/cards", methods: ["PATCH"], handler: updateCardHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
  { path: "pipelines/cards", methods: ["DELETE"], handler: deleteCardHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
  { path: "pipelines/cards/move", methods: ["POST"], handler: moveCardHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },

  { path: "automations", methods: ["GET"], handler: listAutomationsHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "automations", methods: ["POST"], handler: createAutomationHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
  { path: "automations", methods: ["PATCH"], handler: updateAutomationHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
  { path: "automations", methods: ["DELETE"], handler: deleteAutomationHandler, requiresFeature: "journey-pipelines", visibleToRoles: [...ADMIN_ROLES] },
];

// The manifest's `api`. Composed explicitly rather than by mutating an
// already-exported array, so what a reader sees declared is what mounts.
export const ROUTES: PluginApiRoute[] = [...CONTACT_AND_SEGMENT_ROUTES, ...JOURNEY_ROUTES];
