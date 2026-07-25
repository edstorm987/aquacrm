// API route table — mounted at `/api/portal/leads-pipeline/...` by T1.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  archiveLeadHandler,
  createCampaignHandler,
  createContactHandler,
  createLeadHandler,
  importCsvHandler,
  listCampaignsHandler,
  listContactsHandler,
  listLeadsHandler,
  previewAudienceHandler,
  sendCampaignHandler,
  updateCampaignHandler,
  updateLeadHandler,
} from "./handlers";

const AGENCY_ADMIN = ["agency-owner", "agency-manager"] as const;
const AGENCY_ALL = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Leads
  { path: "leads", methods: ["GET"], handler: listLeadsHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "leads", methods: ["POST"], handler: createLeadHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "leads", methods: ["PATCH"], handler: updateLeadHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/archive", methods: ["POST"], handler: archiveLeadHandler, visibleToRoles: [...AGENCY_ADMIN] },

  // CSV import (round goal D)
  { path: "import-csv", methods: ["POST"], handler: importCsvHandler, visibleToRoles: [...AGENCY_ADMIN] },

  // Contacts
  { path: "contacts", methods: ["GET"], handler: listContactsHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "contacts", methods: ["POST"], handler: createContactHandler, visibleToRoles: [...AGENCY_ADMIN] },

  // Campaigns
  { path: "campaigns", methods: ["GET"], handler: listCampaignsHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "campaigns", methods: ["POST"], handler: createCampaignHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "campaigns", methods: ["PATCH"], handler: updateCampaignHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "campaigns/send", methods: ["POST"], handler: sendCampaignHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "campaigns/preview-audience", methods: ["POST"], handler: previewAudienceHandler, visibleToRoles: [...AGENCY_ADMIN] },
];
