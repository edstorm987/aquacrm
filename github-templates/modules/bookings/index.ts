// `@aqua/plugin-bookings` — calendar-backed appointments for therapist
// clients. Per-client services, weekly availability + exceptions,
// slot generation respecting buffers + capacity, ICS confirmation
// emails. Pairs with `@aqua/plugin-client-crm` (auto-create contact
// on completed booking) and `@aqua/plugin-email-sender` (send
// confirmation) when present — graceful when absent.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const VIEWERS = ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"] as const;

const manifest: AquaPlugin = {
  id: "bookings",
  name: "Bookings",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Calendar-backed appointments — services, availability, slots, ICS confirmation.",
  description:
    "Per-client booking surface. Define `Service` rows (label / " +
    "duration / price / capacity / buffer); set weekly `Availability` " +
    "+ exceptions; the storefront `booking-form` block pulls slots, " +
    "submits bookings, and (when email-sender is installed) emails an " +
    "ICS attachment to the customer. On `completed` transition, " +
    "auto-creates a CRM contact via the optional `@aqua/plugin-client-crm` " +
    "port.",

  core: false,
  scopePolicy: "client",

  navItems: [
    {
      id: "bookings.calendar",
      label: "Calendar",
      href: "/portal/clients/[clientId]/bookings",
      panelId: "ops",
      order: 30,
      visibleToRoles: [...VIEWERS],
    },
    {
      id: "bookings.services",
      label: "Services",
      href: "/portal/clients/[clientId]/bookings/services",
      panelId: "ops",
      order: 31,
      visibleToRoles: [...VIEWERS],
    },
    {
      id: "bookings.availability",
      label: "Availability",
      href: "/portal/clients/[clientId]/bookings/availability",
      panelId: "ops",
      order: 32,
      visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/BookingsCalendarPage") },
    { path: "services", component: () => import("./src/pages/ServicesPage") },
    { path: "availability", component: () => import("./src/pages/AvailabilityPage") },
  ],

  api: ROUTES,

  storefront: {
    blocks: [
      {
        id: "booking-form",
        label: "Booking form",
        description: "End-customer-facing service picker → date picker → slot picker → submit form.",
        category: "form",
        defaultProps: { serviceId: undefined, daysAhead: 14 },
      },
    ],
  },

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          { id: "defaultDurationMin", label: "Default service duration (min)", type: "number", default: 60 },
          { id: "defaultBufferMin",   label: "Default buffer (min)",            type: "number", default: 15 },
          { id: "daysAhead",          label: "How many days ahead to surface slots",  type: "number", default: 14 },
          { id: "sendConfirmation",   label: "Send ICS confirmation email", type: "boolean", default: true },
        ],
      },
    ],
  },

  features: [
    { id: "ics-confirmation", label: "ICS calendar attachment in confirmation email", default: true },
    { id: "crm-merge", label: "Auto-create CRM contact on completed booking", default: true },
    { id: "group-sessions", label: "Allow service.capacity > 1", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "bookings foundation not registered" };
    const services = await c.bookings.listServices(true);
    const upcoming = await c.bookings.listBookings({ windowStart: Date.now() });
    return {
      ok: true,
      message: `${services.length} services · ${upcoming.length} upcoming bookings`,
      components: {
        services: { ok: true, message: `${services.filter(s => s.active).length} active` },
      },
    };
  },
};

export default manifest;
