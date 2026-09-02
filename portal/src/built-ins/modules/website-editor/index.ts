// `@aqua/plugin-website-editor` — entry point.
//
// Default-exports the `AquaPlugin` manifest. The foundation reads this
// at boot, registers nav items / pages / API routes, merges the 70
// blocks into the editor's storefront block registry, and wires plugin
// storage.

import type { AquaPlugin } from "./src/lib/aquaPluginTypes";
import { apiRoutes } from "./src/api/routes";
import { BLOCK_DESCRIPTORS } from "./src/components/blockRegistry";

const websiteEditorPlugin: AquaPlugin = {
  id: "website-editor",
  name: "Dev Editor Engine",
  version: "0.1.0",
  status: "stable",
  category: "content",
  tagline: "Visual page builder · 70 blocks · portal variants",
  description:
    "Full WYSIWYG editor with Preview, Design, and Code modes. Edit any client site or portal as block trees. Includes a 70-block library covering layout, content, media, commerce, auth, and advanced surfaces, plus the Login/Affiliates/Orders/Account portal-variant admin.",

  requires: [],

  navItems: [
    { id: "editor", label: "Editor", href: "/portal/clients/[clientId]/editor", panelId: "content" },
    { id: "pages", label: "Pages", href: "/portal/clients/[clientId]/pages", panelId: "content" },
    { id: "portals", label: "Portals", href: "/portal/clients/[clientId]/portals", panelId: "content" },
    { id: "customise", label: "Editor settings", href: "/portal/clients/[clientId]/customise", panelId: "settings" },
    { id: "themes", label: "Themes", href: "/portal/clients/[clientId]/themes", panelId: "settings" },
    { id: "assets", label: "Assets", href: "/portal/clients/[clientId]/assets", panelId: "content" },
    { id: "git-status", label: "Git status", href: "/portal/clients/[clientId]/git-status", panelId: "growth" },
  ],

  pages: [
    {
      path: "/portal/clients/[clientId]/editor",
      title: "Editor",
      component: () => import("./src/pages/EditorRoutePage"),
    },
    {
      // Deep-link surface used by T1's agency-shell "Edit website" CTA.
      // Same EditorPage mounts here; reads ?page= and ?variant=.
      path: "/portal/clients/[clientId]/edit-website",
      title: "Editor",
      component: () => import("./src/pages/EditorRoutePage"),
    },
    {
      path: "/portal/clients/[clientId]/pages",
      title: "Pages",
      clientComponent: true,
      component: () => import("./src/pages/PagesPage"),
    },
    {
      path: "/portal/clients/[clientId]/portals",
      title: "Portals",
      clientComponent: true,
      component: () => import("./src/pages/PortalsPage"),
    },
    {
      path: "/portal/clients/[clientId]/customise",
      title: "Editor settings",
      component: () => import("./src/pages/CustomiseRoutePage"),
    },
    {
      path: "/portal/clients/[clientId]/themes",
      title: "Themes",
      clientComponent: true,
      component: () => import("./src/pages/ThemesPage"),
    },
    {
      path: "/portal/clients/[clientId]/themes/[themeId]",
      title: "Theme detail",
      clientComponent: true,
      component: () => import("./src/pages/ThemeDetailPage"),
    },
    {
      path: "/portal/clients/[clientId]/assets",
      title: "Assets",
      clientComponent: true,
      component: () => import("./src/pages/AssetsPage"),
    },
    {
      path: "/portal/clients/[clientId]/git-status",
      title: "Git status",
      clientComponent: true,
      component: () => import("./src/pages/GitStatusPage"),
    },
  ],

  api: apiRoutes,

  storefront: {
    blocks: BLOCK_DESCRIPTORS,
  },

  settings: {
    groups: [
      {
        id: "defaults",
        label: "Defaults",
        fields: [
          {
            id: "defaultThemeVariant",
            label: "Default appearance for new themes",
            type: "select",
            default: "light",
            helpText: "Used when a new theme keeps the workspace default instead of choosing an appearance explicitly.",
            options: [
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ],
          },
          {
            id: "defaultStarterId",
            label: "Default login portal starter",
            type: "select",
            default: "login-default",
            helpText: "Used when a new Login portal variant is created without choosing a starter explicitly.",
            options: [
              { value: "login-default", label: "Login (default)" },
              { value: "login-onboarding", label: "Login (onboarding)" },
              { value: "login-design", label: "Login (design-forward)" },
            ],
          },
        ],
      },
    ],
  },

  features: [
    { id: "simpleEditor", label: "Simple editor", default: true },
    { id: "advancedEditor", label: "Block + code modes", default: true },
    { id: "codeView", label: "Raw JSON code mode", default: false, plans: ["enterprise"] },
    { id: "templates", label: "Page templates", default: true },
    { id: "versionHistory", label: "Version history", default: true },
    { id: "customCSS", label: "Custom CSS", default: false, plans: ["pro", "enterprise"] },
    { id: "headInjection", label: "Custom <head> tags", default: false, plans: ["pro", "enterprise"] },
    { id: "customDomain", label: "Custom domain", default: false, plans: ["pro", "enterprise"] },
  ],
};

export default websiteEditorPlugin;
