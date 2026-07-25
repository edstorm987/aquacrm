// Manifest API routes — mounted at `/api/portal/forms/...`.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  createFormHandler,
  createTemplateHandler,
  deleteFormHandler,
  deleteSubmissionHandler,
  formFromTemplateHandler,
  listFormsHandler,
  listSubmissionsHandler,
  listTemplatesHandler,
  publicFormHandler,
  publicSubmitHandler,
  publishFormHandler,
  updateFormHandler,
  updateSubmissionHandler,
} from "./handlers";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CLIENT_ADMINS = ["client-owner", "client-staff"] as const;
const ADMIN_VIEWERS = [...AGENCY_VIEWERS, ...CLIENT_ADMINS] as const;
const ADMIN_ROLES = [...AGENCY_ADMINS, ...CLIENT_ADMINS] as const;

export const ROUTES: PluginApiRoute[] = [
  // Forms (admin)
  { path: "forms", methods: ["GET"], handler: listFormsHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "forms", methods: ["POST"], handler: createFormHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "forms", methods: ["PATCH"], handler: updateFormHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "forms", methods: ["DELETE"], handler: deleteFormHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "forms/publish", methods: ["POST"], handler: publishFormHandler, visibleToRoles: [...ADMIN_ROLES] },

  // Submissions (admin)
  { path: "submissions", methods: ["GET"], handler: listSubmissionsHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "submissions", methods: ["PATCH"], handler: updateSubmissionHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "submissions", methods: ["DELETE"], handler: deleteSubmissionHandler, visibleToRoles: [...ADMIN_ROLES] },

  // Templates (admin)
  { path: "templates", methods: ["GET"], handler: listTemplatesHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "templates", methods: ["POST"], handler: createTemplateHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "forms/from-template", methods: ["POST"], handler: formFromTemplateHandler, visibleToRoles: [...ADMIN_ROLES] },

  // Public — no auth. `:formId` matched via the URL parser inside
  // each handler since path matching at the manifest-route level is
  // single-segment.
  { path: "public/submit/:formId", methods: ["POST"], handler: publicSubmitHandler, public: true },
  { path: "public/form/:formId", methods: ["GET"], handler: publicFormHandler, public: true },
];
