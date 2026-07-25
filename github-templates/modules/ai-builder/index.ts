// `@aqua/plugin-ai-builder` — AI page builder. Operator types a
// description, Claude returns a `BlockTree[]` using the
// website-editor's 58-block library + 18 cross-plugin block ids.
// Round-7. `requires: ["website-editor"]`, `scopePolicy: "either"`.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";

const ADMIN_ROLES = ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"] as const;
const ADMIN_VIEWERS = [...ADMIN_ROLES] as const;

const manifest: AquaPlugin = {
  id: "ai-builder",
  name: "AI page builder",
  version: "0.1.0",
  status: "alpha",
  category: "content",
  tagline: "Describe a page; Claude builds it from your block library.",
  description:
    "Add a ✨ Generate button to the website editor. Operator types a " +
    "one-line description (\"a hero with our brand colours, a 3-column " +
    "feature grid, a CTA\"); the plugin sends the prompt + the website-" +
    "editor's full block schema to Claude (Haiku 4.5 default, Sonnet 4.6 " +
    "fallback for complex generations). Returned BlockTree validates " +
    "against the schema, persists as a Generation record, and inserts " +
    "into the active page. Per-install Anthropic API key (mirrors T2's " +
    "per-install Stripe pattern); prompt caching on the static block-" +
    "library system block keeps cost down across iterations.",

  core: false,
  scopePolicy: "either",
  requires: ["website-editor"],

  navItems: [
    {
      id: "ai-builder.generate",
      label: "Generate",
      href: "/portal/agency/ai-builder",
      panelId: "content",
      order: 10,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "ai-builder.history",
      label: "History",
      href: "/portal/agency/ai-builder/history",
      panelId: "content",
      order: 20,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "ai-builder.settings",
      label: "Settings",
      href: "/portal/agency/ai-builder/settings",
      panelId: "content",
      order: 30,
      visibleToRoles: [...ADMIN_ROLES],
    },
  ],

  pages: [
    { path: "",         component: () => import("./src/pages/GeneratePage") },
    { path: "generate", component: () => import("./src/pages/GeneratePage") },
    { path: "history",  component: () => import("./src/pages/HistoryPage") },
    { path: "settings", component: () => import("./src/pages/SettingsPage") },
  ],

  api: ROUTES,

  // No storefront blocks — this plugin reads the website-editor's
  // catalogue, doesn't contribute its own.

  settings: {
    groups: [
      {
        id: "model",
        label: "Models",
        description: "Default + fallback Claude models. Haiku 4.5 for cost; Sonnet 4.6 for harder generations.",
        fields: [
          {
            id: "defaultModel",
            label: "Default model",
            type: "select",
            default: "claude-haiku-4-5-20251001",
            options: [
              { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (recommended)" },
              { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
              { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
            ],
          },
          {
            id: "fallbackModel",
            label: "Fallback model (used after schema-validation failure)",
            type: "select",
            default: "claude-sonnet-4-6",
            options: [
              { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
              { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
            ],
          },
          {
            id: "cacheSystemPrompt",
            label: "Enable prompt caching",
            type: "boolean",
            default: true,
            helpText: "Caches the static block-library system prompt — major cost saver.",
          },
          {
            id: "maxTokens",
            label: "Max output tokens per generation",
            type: "number",
            default: 4096,
          },
        ],
      },
      {
        id: "auth",
        label: "Anthropic API",
        description: "Per-install key. Never set in env.",
        fields: [
          {
            id: "anthropicApiKey",
            label: "Anthropic API key",
            type: "password",
            placeholder: "sk-ant-...",
            helpText: "Server-side. Stored in install.config; masked in API responses.",
          },
        ],
      },
    ],
  },

  features: [
    {
      id: "ai-builder.generate",
      label: "Page generator",
      description: "Generate block trees from natural-language prompts.",
      default: true,
    },
    {
      id: "ai-builder.history",
      label: "Generation history",
      description: "Persist + browse past generations + their costs.",
      default: true,
    },
  ],

  async onInstall(_ctx: PluginCtx) {
    // No seed data. Operator opens Settings to drop in their API key.
  },

  async healthcheck(ctx: PluginCtx): Promise<HealthStatus> {
    const config = (ctx.install.config ?? {}) as { anthropicApiKey?: string };
    const ok = Boolean(config.anthropicApiKey);
    return {
      ok,
      message: ok ? "API key configured." : "Anthropic API key missing — operator must set it in Settings.",
      components: {
        apiKey: { ok, message: ok ? "configured" : "missing" },
      },
    };
  },
};

export default manifest;
