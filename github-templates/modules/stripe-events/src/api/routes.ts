import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  listEventsHandler,
  listSubscriptionsHandler,
  webhookHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Webhook is PUBLIC (Stripe signs it; we verify HMAC). Foundation
  // route dispatcher MUST skip session check on `public: true` AND
  // hand the handler the raw request body — pre-parsing JSON would
  // break HMAC.
  { path: "webhook", methods: ["POST"], handler: webhookHandler, public: true },

  { path: "events",        methods: ["GET"], handler: listEventsHandler,        visibleToRoles: [...ADMINS] },
  { path: "subscriptions", methods: ["GET"], handler: listSubscriptionsHandler, visibleToRoles: [...ADMINS] },
];
