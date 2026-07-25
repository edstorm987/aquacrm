import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  hcCompleteHandler,
  meContextHandler,
  toolCompleteHandler,
} from "./handlers";

// `lead` is a foundation role added in T1 R023. Listed here so the
// route gate honours it. Other roles are kept off these routes.
const LEAD_AND_AGENCY = [
  "lead", "agency-owner", "agency-manager", "agency-staff",
] as const;

export const ROUTES: PluginApiRoute[] = [
  // PUBLIC — HC completion handler hits this without auth. The
  // foundation route dispatcher honours `public: true` to skip the
  // session check.
  { path: "hc-complete",   methods: ["POST"], handler: hcCompleteHandler,   public: true },
  { path: "tool-complete", methods: ["POST"], handler: toolCompleteHandler, public: true },

  // me-context is for BOS personalisation — must be signed in (lead
  // or agency staff). Foundation enforces session presence; route
  // visibleToRoles narrows the allowed roles.
  { path: "me-context",    methods: ["GET"],  handler: meContextHandler,
    visibleToRoles: [...LEAD_AND_AGENCY] },
];
