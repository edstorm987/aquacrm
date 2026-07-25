// API route table — mounted at `/api/portal/leads-pipeline/...` by T1.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  addContactToBoardHandler,
  archiveLeadHandler,
  convertContactToClientHandler,
  convertLeadToClientHandler,
  createCampaignHandler,
  createContactHandler,
  createLeadHandler,
  importCsvHandler,
  listCampaignsHandler,
  listContactsHandler,
  listLeadsHandler,
  markContactContactedHandler,
  markLeadContactedHandler,
  previewAudienceHandler,
  sendCampaignHandler,
  updateCampaignHandler,
  updateContactHandler,
  updateContactMeetingHandler,
  updateLeadMeetingHandler,
  updateLeadHandler,
  updateLeadStatusHandler,
} from "./handlers";

const AGENCY_ADMIN = ["agency-owner", "agency-manager"] as const;
const AGENCY_ALL = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Leads
  { path: "leads", methods: ["GET"], handler: listLeadsHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "leads", methods: ["POST"], handler: createLeadHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "leads", methods: ["PATCH"], handler: updateLeadHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/status", methods: ["POST"], handler: updateLeadStatusHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/meeting", methods: ["POST"], handler: updateLeadMeetingHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/contacted", methods: ["POST"], handler: markLeadContactedHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/convert-to-client", methods: ["POST"], handler: convertLeadToClientHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/archive", methods: ["POST"], handler: archiveLeadHandler, visibleToRoles: [...AGENCY_ADMIN] },

  // CSV import (round goal D)
  { path: "import-csv", methods: ["POST"], handler: importCsvHandler, visibleToRoles: [...AGENCY_ADMIN] },

  // Contacts
  { path: "contacts", methods: ["GET"], handler: listContactsHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "contacts", methods: ["POST"], handler: createContactHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "contacts", methods: ["PATCH"], handler: updateContactHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "contacts/meeting", methods: ["POST"], handler: updateContactMeetingHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "contacts/contacted", methods: ["POST"], handler: markContactContactedHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "contacts/add-to-board", methods: ["POST"], handler: addContactToBoardHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "contacts/convert-to-client", methods: ["POST"], handler: convertContactToClientHandler, visibleToRoles: [...AGENCY_ADMIN] },

  // Campaigns
  { path: "campaigns", methods: ["GET"], handler: listCampaignsHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "campaigns", methods: ["POST"], handler: createCampaignHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "campaigns", methods: ["PATCH"], handler: updateCampaignHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "campaigns/send", methods: ["POST"], handler: sendCampaignHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "campaigns/preview-audience", methods: ["POST"], handler: previewAudienceHandler, visibleToRoles: [...AGENCY_ADMIN] },
];
