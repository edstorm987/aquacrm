import "server-only";
// Email-sender plugin foundation registration. Closes Gap #3 from
// the chapter #161 HC → leads-pipeline integration verification —
// without this side-effect import, leads-pipeline's `emailEnqueuePort`
// (chapter #159) and the forgotten-password route (chapter #160)
// both throw "foundation pending" because email-sender's
// `isFoundationRegistered()` returns false.
//
// Mirrors `publicFunnelFoundation.ts` + `leadsPipelineFoundation.ts`
// shape: shared ports from `_foundationPorts.ts`, idempotent
// `registered` flag, boot side-effect call at module bottom.
//
// Email-sender's TenantPort shape is `{ getAgency }` (not the broader
// `{ getClient, getClientForAgency }` of the shared tenantPort);
// foundation runtime types do the validation, the structural cast
// bridges TypeScript — same pattern every other plugin uses.
//
// Drivers are intentionally NOT injected here — email-sender's
// `defaultDriverRegistry()` ships Postmark + no-op + sendgrid/resend/
// smtp stubs, which is the right default. Production providers are
// configured per-agency via the plugin's Settings page (Q-ASSUMED).

import { registerEmailSenderFoundation } from "@aqua/plugin-email-sender/server";
import { getAgency } from "@/server/tenants";
import {
  activityPort,
  eventBusPort,
  pluginInstallStorePort,
} from "./_foundationPorts";

// Email-sender uses `getAgency` rather than the shared tenantPort's
// client-scoped methods. Wrap so the structural shape lines up.
const emailSenderTenantPort = {
  getAgency(id: string) {
    return getAgency(id);
  },
};

let registered = false;

export function ensureEmailSenderFoundationRegistered(): void {
  if (registered) return;
  registerEmailSenderFoundation({
    tenant: emailSenderTenantPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
    // marketingTemplates intentionally omitted — agency-marketing
    // exposes its own template store via its plugin foundation; when
    // both are installed in the same agency, the cross-plugin wiring
    // lands in a future round (foundation R6 router work).
  } as unknown as Parameters<typeof registerEmailSenderFoundation>[0]);
  registered = true;
}

ensureEmailSenderFoundationRegistered();
