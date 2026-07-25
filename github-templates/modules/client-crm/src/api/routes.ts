// Manifest API routes — mounted at `/api/portal/client-crm/...`.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  addNoteHandler,
  createContactHandler,
  createSegmentHandler,
  deleteContactHandler,
  deleteSegmentHandler,
  importContactsHandler,
  ingestEventHandler,
  listContactActivityHandler,
  listContactsHandler,
  listSegmentMembersHandler,
  listSegmentsHandler,
  meProfileHandler,
  meUpdateProfileHandler,
  updateContactHandler,
  updateSegmentHandler,
} from "./handlers";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CLIENT_ADMINS = ["client-owner", "client-staff"] as const;
const ADMIN_VIEWERS = [...AGENCY_VIEWERS, ...CLIENT_ADMINS] as const;
const ADMIN_ROLES = [...AGENCY_ADMINS, ...CLIENT_ADMINS] as const;
const END_CUSTOMER = ["end-customer"] as const;

export const ROUTES: PluginApiRoute[] = [
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
