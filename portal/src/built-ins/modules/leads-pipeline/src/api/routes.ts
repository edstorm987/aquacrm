// API route table — mounted at `/api/portal/leads-pipeline/...` by T1.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  addContactToBoardHandler,
  archiveLeadHandler,
  restoreLeadHandler,
  purgeLeadHandler,
  createCommercialStripeCheckoutHandler,
  commercialStripeWebhookHandler,
  convertContactToClientHandler,
  convertLeadToClientHandler,
  createCampaignHandler,
  createContactHandler,
  createLeadHandler,
  contactConfigurationHandler,
  importCsvHandler,
  importProspectsHandler,
  listCampaignsHandler,
  listContactsHandler,
  getCommercialPackHandler,
  listLeadsHandler,
  markContactContactedHandler,
  markLeadContactedHandler,
  recordCommercialPaymentHandler,
  previewAudienceHandler,
  previewCsvHandler,
  prospectsHandler,
  prospectFollowUpsHandler,
  prospectInspectionHandler,
  prospectNotesHandler,
  prospectOutreachHandler,
  qualifyProspectHandler,
  dismissProspectHandler,
  sendCampaignHandler,
  sendCommercialPackHandler,
  updateCampaignHandler,
  updateContactHandler,
  updateContactMeetingHandler,
  updateLeadMeetingHandler,
  updateLeadHandler,
  updateLeadStatusHandler,
  saveCommercialPackHandler,
} from "./handlers";

const AGENCY_ADMIN = ["agency-owner", "agency-manager"] as const;
const AGENCY_ALL = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Scouting
  { path: "prospects", methods: ["GET", "POST", "PATCH"], handler: prospectsHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "prospects/import", methods: ["POST"], handler: importProspectsHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "prospects/outreach", methods: ["POST"], handler: prospectOutreachHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "prospects/follow-ups", methods: ["POST", "PATCH"], handler: prospectFollowUpsHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "prospects/inspection", methods: ["POST"], handler: prospectInspectionHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "prospects/notes", methods: ["POST"], handler: prospectNotesHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "prospects/qualify", methods: ["POST"], handler: qualifyProspectHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "prospects/dismiss", methods: ["POST"], handler: dismissProspectHandler, visibleToRoles: [...AGENCY_ADMIN] },

  // Leads
  { path: "leads", methods: ["GET"], handler: listLeadsHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "leads", methods: ["POST"], handler: createLeadHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "leads", methods: ["PATCH"], handler: updateLeadHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/status", methods: ["POST"], handler: updateLeadStatusHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/meeting", methods: ["POST"], handler: updateLeadMeetingHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/contacted", methods: ["POST"], handler: markLeadContactedHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/convert-to-client", methods: ["POST"], handler: convertLeadToClientHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/archive", methods: ["POST"], handler: archiveLeadHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/restore", methods: ["POST"], handler: restoreLeadHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "leads/purge", methods: ["POST"], handler: purgeLeadHandler, visibleToRoles: [...AGENCY_ADMIN] },

  // CSV import (round goal D)
  { path: "import-csv", methods: ["POST"], handler: importCsvHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "import-csv/preview", methods: ["POST"], handler: previewCsvHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "contact-configuration", methods: ["GET", "POST"], handler: contactConfigurationHandler, visibleToRoles: [...AGENCY_ADMIN] },

  // Contacts
  { path: "contacts", methods: ["GET"], handler: listContactsHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "contacts", methods: ["POST"], handler: createContactHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "contacts", methods: ["PATCH"], handler: updateContactHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "contacts/meeting", methods: ["POST"], handler: updateContactMeetingHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "contacts/contacted", methods: ["POST"], handler: markContactContactedHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "contacts/add-to-board", methods: ["POST"], handler: addContactToBoardHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "contacts/convert-to-client", methods: ["POST"], handler: convertContactToClientHandler, visibleToRoles: [...AGENCY_ADMIN] },

  // Meeting commercial packs
  { path: "commercial", methods: ["GET"], handler: getCommercialPackHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "commercial", methods: ["PUT"], handler: saveCommercialPackHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "commercial/send", methods: ["POST"], handler: sendCommercialPackHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "commercial/payment", methods: ["POST"], handler: recordCommercialPaymentHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "commercial/stripe-checkout", methods: ["POST"], handler: createCommercialStripeCheckoutHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "commercial/stripe-webhook", methods: ["POST"], handler: commercialStripeWebhookHandler, public: true },

  // Campaigns
  { path: "campaigns", methods: ["GET"], handler: listCampaignsHandler, visibleToRoles: [...AGENCY_ALL] },
  { path: "campaigns", methods: ["POST"], handler: createCampaignHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "campaigns", methods: ["PATCH"], handler: updateCampaignHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "campaigns/send", methods: ["POST"], handler: sendCampaignHandler, visibleToRoles: [...AGENCY_ADMIN] },
  { path: "campaigns/preview-audience", methods: ["POST"], handler: previewAudienceHandler, visibleToRoles: [...AGENCY_ADMIN] },
];
