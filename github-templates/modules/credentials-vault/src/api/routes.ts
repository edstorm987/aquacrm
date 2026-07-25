// Manifest API routes — mounted at `/api/portal/credentials-vault/...`.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  archiveCredentialHandler,
  createCredentialHandler,
  getCredentialHandler,
  listCredentialsHandler,
  updateCredentialHandler,
  viewPasswordHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  { path: "list",   methods: ["GET"],    handler: listCredentialsHandler,  visibleToRoles: [...VIEWERS] },
  { path: "get",    methods: ["GET"],    handler: getCredentialHandler,    visibleToRoles: [...VIEWERS] },
  { path: "view",   methods: ["POST"],   handler: viewPasswordHandler,     visibleToRoles: [...VIEWERS] },
  { path: "create", methods: ["POST"],   handler: createCredentialHandler, visibleToRoles: [...ADMINS] },
  { path: "update", methods: ["PATCH"],  handler: updateCredentialHandler, visibleToRoles: [...ADMINS] },
  { path: "archive", methods: ["DELETE"], handler: archiveCredentialHandler, visibleToRoles: [...ADMINS] },
];
