// `@aqua/plugin-feedback-loops` — lightweight customer-feedback loop.
// 1-10 NPS-style pulse + freeform testimonial requests. Customer-side
// prompts, agency-side voice-of-the-client feed, detractor triage.
// Honesty contract (chapter #68): scores are NOT mutated, no
// fabricated entries, detractor flag latched on first response only.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const ADMINS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CUSTOMERS = ["client-owner", "client-staff", "end-customer"] as const;

const manifest: AquaPlugin = {
  id: "feedback-loops",
  name: "Feedback loops",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "1-10 pulse + testimonial requests with detractor triage.",
  description:
    "Lightweight customer-feedback collection. Pulses are 1-10 with " +
    "an optional comment; testimonial requests are freeform prompts. " +
    "Score < 6 emits a high-severity `feedback.detractor` event for " +
    "activity-inbox triage. Detractor latch is one-shot — later edits " +
    "do NOT re-emit. Honesty contract: scores never altered, response " +
    "rate computed from raw counts, no fabricated rows.",

  core: false,
  scopePolicy: "client",

  navItems: [
    {
      id: "feedback-loops.pulse",
      label: "Pulse",
      href: "/portal/clients/:clientId/feedback-loops",
      panelId: "client-tools",
      order: 40,
      visibleToRoles: [...ADMINS],
    },
    {
      id: "feedback-loops.testimonials",
      label: "Testimonials",
      href: "/portal/clients/:clientId/feedback-loops/testimonials",
      panelId: "client-tools",
      order: 41,
      visibleToRoles: [...ADMINS],
    },
    {
      id: "feedback-loops.customer.pulse",
      label: "Pulse",
      href: "/embed/:clientId/customer/feedback-loops/pulse",
      panelId: "customer",
      order: 30,
      visibleToRoles: [...CUSTOMERS],
    },
    {
      id: "feedback-loops.customer.testimonial",
      label: "Testimonial",
      href: "/embed/:clientId/customer/feedback-loops/testimonial",
      panelId: "customer",
      order: 31,
      visibleToRoles: [...CUSTOMERS],
    },
  ],

  pages: [
    { path: "",                  component: () => import("./src/pages/PulseDashboardPage")            },
    { path: "testimonials",      component: () => import("./src/pages/TestimonialInboxPage")          },
    { path: "pulse",             component: () => import("./src/pages/PulsePromptCustomerPage")       },
    { path: "testimonial",       component: () => import("./src/pages/TestimonialPromptCustomerPage") },
  ],

  api: ROUTES,

  storefront: {
    blocks: [
      {
        id: "pulse-prompt",
        label: "Pulse prompt",
        description: "1-10 slider + comment textarea for end-customer feedback.",
        category: "client",
      },
      {
        id: "testimonial-prompt",
        label: "Testimonial prompt",
        description: "Freeform reply box for an outstanding testimonial request.",
        category: "client",
      },
    ],
  },

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultPulseCadenceDays",
            label: "Default pulse cadence (days)",
            type: "number",
            default: 30,
            helpText: "Suggested gap between pulses for the same respondent. The plugin does not auto-send in v1 — operator triggers manually or via cron later.",
          },
          {
            id: "detractorCutoff",
            label: "Detractor cutoff score",
            type: "number",
            default: 6,
            helpText: "Scores STRICTLY BELOW this trigger the high-severity `feedback.detractor` event. Default 6 → 1-5 are detractors.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "pulse",                  label: "1-10 pulse",                            default: true },
    { id: "testimonials",           label: "Freeform testimonial requests",         default: true },
    { id: "detractor-events",       label: "Emit feedback.detractor on score < 6",  default: true },
    { id: "customer-blocks",        label: "Surface pulse + testimonial prompts in customer portal", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      ...(ctx.clientId !== undefined ? { clientId: ctx.clientId } : {}),
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "feedback-loops foundation not registered (or no client scope)" };
    const summary = await c.pulses.summary();
    const tcount = (await c.testimonials.list()).length;
    const avg = summary.avgScore !== undefined ? summary.avgScore.toFixed(1) : "—";
    return {
      ok: true,
      message: `${summary.totalSent} pulses (avg ${avg}) · ${tcount} testimonials`,
      components: {
        pulses: { ok: true, message: `${summary.totalResponded}/${summary.totalSent} responded` },
        testimonials: { ok: true, message: `${tcount}` },
      },
    };
  },
};

export default manifest;
