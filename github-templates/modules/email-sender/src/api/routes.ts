// Manifest API routes — mounted at `/api/portal/email-sender/...`.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  createIdentityHandler,
  getMessageHandler,
  getProviderHandler,
  internalEnqueueHandler,
  listIdentitiesHandler,
  listMessagesHandler,
  postmarkWebhookHandler,
  retryMessageHandler,
  testSendHandler,
  updateIdentityHandler,
  updateProviderHandler,
  verifyIdentityHandler,
} from "./handlers";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Messages (admin)
  { path: "messages", methods: ["GET"], handler: listMessagesHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "messages/get", methods: ["GET"], handler: getMessageHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "messages/retry", methods: ["POST"], handler: retryMessageHandler, visibleToRoles: [...AGENCY_ADMINS] },

  // Identities (admin)
  { path: "identities", methods: ["GET"], handler: listIdentitiesHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "identities", methods: ["POST"], handler: createIdentityHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "identities", methods: ["PATCH"], handler: updateIdentityHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "identities/verify", methods: ["POST"], handler: verifyIdentityHandler, visibleToRoles: [...AGENCY_ADMINS] },

  // Provider config
  { path: "provider", methods: ["GET"], handler: getProviderHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "provider", methods: ["PATCH"], handler: updateProviderHandler, visibleToRoles: [...AGENCY_ADMINS] },

  // Test
  { path: "test", methods: ["POST"], handler: testSendHandler, visibleToRoles: [...AGENCY_ADMINS] },

  // Public webhook (provider-signed; foundation must honour `public:true`)
  { path: "public/webhook/postmark", methods: ["POST"], handler: postmarkWebhookHandler, public: true },

  // Internal (foundation event-router target — plugin-to-plugin)
  { path: "internal/enqueue", methods: ["POST"], handler: internalEnqueueHandler, visibleToRoles: [...AGENCY_ADMINS] },
];
