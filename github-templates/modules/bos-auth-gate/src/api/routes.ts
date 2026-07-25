import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import { meHandler } from "./handlers";

const SIGNED_IN = [
  "lead", "agency-owner", "agency-manager", "agency-staff",
] as const;

export const ROUTES: PluginApiRoute[] = [
  // BOS calls this on load. Foundation requires a session; the
  // visibleToRoles list narrows the allowed roles to the BOS audience
  // (lead + agency-staff).
  { path: "me", methods: ["GET"], handler: meHandler, visibleToRoles: [...SIGNED_IN] },
];
