// `@aqua/plugin-support-desk` — per-client support tickets.
//
// End-customers raise tickets via the storefront `support-form` block;
// agency-side staff triage from the Inbox. Lightweight helpdesk shape:
// Ticket + TicketMessage thread + status state machine + auto-assign
// by tag. Subscribes to `ecommerce.order.shipped` to post a low-noise
// follow-up message on every open ticket from the same customer
// (gracefully no-ops when ecommerce isn't installed or the foundation
// event bus doesn't expose `on`).

import type {
  AquaPlugin,
  BlockDescriptor,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

const blocks: BlockDescriptor[] = [
  {
    id: "support-form",
    label: "Support form",
    description: "End-customer support submission — subject + body + email + honeypot.",
    category: "support",
    defaultProps: {
      heading: "Get in touch",
      submitLabel: "Send",
      successMessage: "Thanks — we'll be in touch.",
    },
  },
];

const manifest: AquaPlugin = {
  id: "support-desk",
  name: "Support desk",
  version: "0.1.0",
  status: "alpha",
  category: "support",
  tagline: "Per-client support tickets — inbox, threads, auto-assign.",
  description:
    "Per-client (`scopePolicy:'client'`) helpdesk. Tickets are raised " +
    "by end-customers via a public, honeypot-protected `support-form` " +
    "storefront block (silent-200 on bot submissions so scrapers can't " +
    "tell). Status state machine: new → in-progress → " +
    "waiting-customer → resolved → closed (with re-open paths from " +
    "resolved/closed back to in-progress). Auto-assign rules map a tag " +
    "to a userId; first matching tag at create-time wires `assignedTo`. " +
    "Replies on `waiting-customer` auto-flip back to `in-progress`; " +
    "agent reply on `new` auto-flips to `in-progress`. Subscribes to " +
    "`ecommerce.order.shipped` for follow-up nudges (graceful no-op).",

  core: false,
  scopePolicy: "client",

  navItems: [
    {
      id: "support-desk.inbox", label: "Support inbox",
      href: "/portal/client/support-desk",
      panelId: "client-tools", order: 50, visibleToRoles: [...VIEWERS],
    },
    {
      id: "support-desk.filters", label: "Filters",
      href: "/portal/client/support-desk/filters",
      panelId: "client-tools", order: 51, visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "",        component: () => import("./src/pages/InboxPage") },
    { path: "detail",  component: () => import("./src/pages/TicketDetailPage") },
    { path: "filters", component: () => import("./src/pages/FiltersPage") },
    { path: "settings", component: () => import("./src/pages/SettingsPage") },
  ],

  api: ROUTES,

  storefront: { blocks },

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "replyTemplate",
            label: "Auto-reply template",
            type: "textarea",
            placeholder: "Hi — we got your message and will respond within 1 business day.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "auto-assign", label: "Auto-assign by tag", default: true },
    { id: "ecommerce-followup", label: "Follow up on ecommerce.order.shipped", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage });
    if (!c) return { ok: false, message: "support-desk foundation not registered or clientId missing" };
    const list = await c.tickets.list();
    const open = list.filter(t => t.status !== "resolved" && t.status !== "closed").length;
    return {
      ok: true,
      message: `${list.length} ticket${list.length === 1 ? "" : "s"} · ${open} open`,
      components: { tickets: { ok: true, message: `${list.length} rows · ${open} open` } },
    };
  },
};

void ADMINS;
export default manifest;
