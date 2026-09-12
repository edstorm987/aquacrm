import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import { meContextHandler } from "./handlers";

// `lead` is a foundation role added in T1 R023. Listed here so the
// route gate honours it. Other roles are kept off these routes.
const LEAD_AND_AGENCY = [
  "lead", "agency-owner", "agency-manager", "agency-staff",
] as const;

export const ROUTES: PluginApiRoute[] = [
  // me-context is for BOS personalisation — must be signed in (lead
  // or agency staff). Foundation enforces session presence; route
  // visibleToRoles narrows the allowed roles.
  { path: "me-context",    methods: ["GET"],  handler: meContextHandler,
    visibleToRoles: [...LEAD_AND_AGENCY] },
];
