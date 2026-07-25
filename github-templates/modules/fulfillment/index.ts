// `@aqua/plugin-fulfillment` — manifest entry.
//
// Default-exports the AquaPlugin manifest. The foundation imports this
// once at boot, registers it into the plugin registry, and (because
// `core: true`) auto-installs it for every agency.

import type { AquaPlugin, PluginCtx } from "./src/lib/aquaPluginTypes";
import { apiRoutes } from "./src/api/routes";
import { PhaseService } from "./src/server";

const fulfillmentPlugin: AquaPlugin = {
  id: "fulfillment",
  name: "Fulfillment",
  version: "0.1.0",
  status: "beta",
  category: "core",
  tagline: "Phase lifecycle + collaborative checklist for every client.",
  description:
    "The agency-side workspace for onboarding and managing clients through their lifecycle. " +
    "Drives client CRUD, phase definitions, the collaborative checklist (internal + client tasks), " +
    "and the per-client plugin marketplace. Auto-installed for every agency.",

  core: true,

  // No required deps — fulfillment is foundational. It indirectly relies
  // on the plugin runtime (T1) and on the website-editor plugin (T3) for
  // applying starter portal variants, but those are foundation services
  // injected via PluginCtx, not other plugins.
  requires: [],

  navItems: [
    {
      id: "fulfillment",
      label: "Fulfillment",
      href: "/portal/agency/fulfillment",
      panelId: "main",
      order: 10,
      visibleToRoles: ["agency-owner", "agency-manager", "agency-staff"],
    },
    {
      id: "fulfillment-clients",
      label: "Clients",
      href: "/portal/agency/fulfillment/clients",
      panelId: "main",
      parent: "fulfillment",
      order: 11,
      visibleToRoles: ["agency-owner", "agency-manager", "agency-staff"],
    },
    {
      id: "fulfillment-phases",
      label: "Phases",
      href: "/portal/agency/fulfillment/phases",
      panelId: "settings",
      order: 80,
      visibleToRoles: ["agency-owner", "agency-manager"],
    },
    {
      id: "fulfillment-marketplace",
      label: "Plugin Marketplace",
      href: "/portal/agency/fulfillment/marketplace",
      panelId: "settings",
      order: 81,
      visibleToRoles: ["agency-owner", "agency-manager", "agency-staff"],
    },
    // Client-side surface — visible to client-* roles when fulfillment is
    // installed for that client (which is always, since fulfillment is core).
    {
      id: "fulfillment-checklist",
      label: "Your checklist",
      href: "/portal/clients/[clientId]/checklist",
      panelId: "main",
      order: 5,
      visibleToRoles: ["client-owner", "client-staff"],
    },
  ],

  pages: [
    {
      // Index — agency-side fulfillment landing.
      path: "",
      title: "Fulfillment",
      component: () => import("./src/pages/ClientsPage"),
    },
    {
      path: "clients",
      title: "Clients",
      component: () => import("./src/pages/ClientsPage"),
    },
    {
      // Per-client phase board: `[clientId]` becomes `segments[0]`.
      path: ":clientId",
      title: "Phase board",
      component: () => import("./src/pages/PhaseBoardPage"),
    },
    {
      path: "phases",
      title: "Phases",
      component: () => import("./src/pages/PhasesPage"),
    },
    {
      path: "marketplace",
      title: "Plugin marketplace",
      component: () => import("./src/pages/MarketplacePage"),
    },
    {
      // Client-side: rendered at `/portal/clients/[clientId]/checklist`.
      // Foundation routes namespace by plugin id, so this lands as the
      // fulfillment plugin's contribution to the per-client surface.
      path: "checklist",
      title: "Your checklist",
      component: () => import("./src/pages/ChecklistPage"),
    },
  ],

  api: [...apiRoutes],

  settings: {
    groups: [
      {
        id: "fulfillment",
        label: "Fulfillment defaults",
        description: "Defaults applied when new clients are created.",
        fields: [
          {
            id: "defaultStage",
            label: "Default starting phase",
            type: "select",
            default: "discovery",
            options: [
              { value: "lead", label: "Lead" },
              { value: "discovery", label: "Discovery" },
              { value: "design", label: "Design" },
              { value: "development", label: "Development" },
              { value: "onboarding", label: "Onboarding" },
              { value: "live", label: "Live" },
            ],
            helpText: "Pre-selected on the new-client wizard.",
          },
          {
            id: "advanceRequiresAllTasks",
            label: "Require all checklist items before advancing",
            type: "boolean",
            default: true,
            helpText: "When off, agency owners can advance with open tasks (logged to activity).",
          },
        ],
      },
      {
        id: "notifications",
        label: "Notifications",
        description: "Channels notified on phase events.",
        fields: [
          {
            id: "notifyOnAdvance",
            label: "Notify team on phase advance",
            type: "boolean",
            default: true,
          },
          {
            id: "notifyClientOnAdvance",
            label: "Email client when their phase advances",
            type: "boolean",
            default: true,
          },
        ],
      },
    ],
  },

  features: [
    {
      id: "marketplace",
      label: "Plugin marketplace",
      description: "Per-client plugin install / configure / disable / uninstall UI.",
      default: true,
    },
    {
      id: "phaseEditor",
      label: "Phase editor",
      description: "Edit phase definitions (label, plugin preset, variant id, checklist).",
      default: true,
    },
    {
      id: "clientChecklist",
      label: "Client-side checklist",
      description: "Surface a tickable checklist on the client portal.",
      default: true,
    },
  ],

  // Lifecycle: on first install (which happens at agency creation, since
  // we're core), seed the six default phase definitions for that agency.
  async onInstall(ctx: PluginCtx): Promise<void> {
    const phaseService = new PhaseService(ctx.services.phases);
    await phaseService.seedDefaultPhases(ctx.agencyId);
    await Promise.resolve(ctx.services.activity.logActivity({
      agencyId: ctx.agencyId,
      actorUserId: ctx.actor,
      category: "fulfillment",
      action: "fulfillment.installed",
      message: "Fulfillment plugin installed; phase defaults seeded.",
    }));
  },

  async onConfigure(ctx: PluginCtx): Promise<void> {
    await Promise.resolve(ctx.services.activity.logActivity({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      actorUserId: ctx.actor,
      category: "settings",
      action: "fulfillment.configured",
      message: "Fulfillment settings updated.",
    }));
  },

  async healthcheck() {
    return { ok: true, message: "Fulfillment plugin operational." };
  },
};

export default fulfillmentPlugin;
