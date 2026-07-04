// `@aqua/plugin-website-editor` — entry point.
//
// Default-exports the `AquaPlugin` manifest. The foundation reads this
// at boot, registers nav items / pages / API routes, merges the 58
// blocks into the editor's storefront block registry, and wires plugin
// storage.

import type { AquaPlugin } from "./src/lib/aquaPluginTypes";
import { apiRoutes } from "./src/api/routes";
import { BLOCK_DESCRIPTORS } from "./src/components/blockRegistry";

const websiteEditorPlugin: AquaPlugin = {
  id: "website-editor",
  name: "Website Editor",
  version: "0.1.0",
  status: "stable",
  category: "content",
  tagline: "Visual page builder · 58 blocks · portal variants",
  description:
    "Full WYSIWYG editor with Live, Block, and Code modes. Edit any client portal as block trees. Includes a 58-block library covering layout, content, media, commerce, auth, and advanced surfaces, plus the Login/Affiliates/Orders/Account portal-variant admin.",

  requires: [],

  navGroup: { id: "content", label: "Content", order: 10 },

  navItems: [
    { id: "editor", label: "Editor", href: "/portal/clients/[clientId]/editor", panelId: "content" },
    { id: "pages", label: "Pages", href: "/portal/clients/[clientId]/pages", panelId: "content" },
    { id: "portals", label: "Portals", href: "/portal/clients/[clientId]/portals", panelId: "content" },
    { id: "customise", label: "Customise", href: "/portal/clients/[clientId]/customise", panelId: "settings" },
    { id: "themes", label: "Themes", href: "/portal/clients/[clientId]/themes", panelId: "settings" },
    { id: "assets", label: "Assets", href: "/portal/clients/[clientId]/assets", panelId: "content" },
    { id: "sections", label: "Sections", href: "/portal/clients/[clientId]/sections", panelId: "content" },
    { id: "popups", label: "Popups", href: "/portal/clients/[clientId]/popups", panelId: "content" },
    { id: "git-status", label: "Git status", href: "/portal/clients/[clientId]/git-status", panelId: "growth" },
  ],

  pages: [
    {
      path: "/portal/clients/[clientId]/editor",
      title: "Editor",
      component: () => import("./src/pages/EditorPage"),
    },
    {
      // Deep-link surface used by T1's agency-shell "Edit website" CTA.
      // Same EditorPage mounts here; reads ?page= and ?variant=.
      path: "/portal/clients/[clientId]/edit-website",
      title: "Editor",
      component: () => import("./src/pages/EditorPage"),
    },
    {
      path: "/portal/clients/[clientId]/pages",
      title: "Pages",
      component: () => import("./src/pages/PagesPage"),
    },
    {
      path: "/portal/clients/[clientId]/pages/[pageId]",
      title: "Page detail",
      component: () => import("./src/pages/PageDetailPage"),
    },
    {
      path: "/portal/clients/[clientId]/portals",
      title: "Portals",
      component: () => import("./src/pages/PortalsPage"),
    },
    {
      path: "/portal/clients/[clientId]/customise",
      title: "Customise",
      component: () => import("./src/pages/CustomisePage"),
    },
    {
      path: "/portal/clients/[clientId]/sites",
      title: "Sites",
      component: () => import("./src/pages/SitesPage"),
    },
    {
      path: "/portal/clients/[clientId]/themes",
      title: "Themes",
      component: () => import("./src/pages/ThemesPage"),
    },
    {
      path: "/portal/clients/[clientId]/themes/[themeId]",
      title: "Theme detail",
      component: () => import("./src/pages/ThemeDetailPage"),
    },
    {
      path: "/portal/clients/[clientId]/sections",
      title: "Sections",
      component: () => import("./src/pages/SectionsPage"),
    },
    {
      path: "/portal/clients/[clientId]/assets",
      title: "Assets",
      component: () => import("./src/pages/AssetsPage"),
    },
    {
      path: "/portal/clients/[clientId]/popups",
      title: "Popups",
      component: () => import("./src/pages/PopupsPage"),
    },
    {
      path: "/portal/clients/[clientId]/git-status",
      title: "Git status",
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
        id: "publish",
        label: "Publishing",
        description: "Where edits land when an operator hits publish.",
        fields: [
          {
            id: "githubRepo",
            label: "GitHub repo",
            type: "text",
            placeholder: "owner/repo",
            helpText: "Optional. When set, publish opens a PR against this repo.",
          },
          {
            id: "githubBranch",
            label: "Default branch",
            type: "text",
            default: "main",
          },
        ],
      },
      {
        id: "defaults",
        label: "Defaults",
        fields: [
          {
            id: "defaultThemeVariant",
            label: "Default theme variant",
            type: "select",
            default: "light",
            options: [
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ],
          },
          {
            id: "defaultStarterId",
            label: "Default starter for new clients",
            type: "select",
            default: "login-default",
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
