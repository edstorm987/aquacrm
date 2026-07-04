// Activity-category chip styling (T1 R033 — chapter
// `04-activity-category-batch-extension.md`).
//
// Pure pin map: every `ActivityCategory` member resolves to a chip
// `{color, icon, label}` so the agency activity feed can light up
// new plugin categories without a code change at each render site.
//
// Severity is a separate axis — derived from the entry's action
// prefix (e.g. `feedback.detractor.*` → "warn"). The chip is the
// category visual; severity adds an outline / bell.

import type { ActivityCategory } from "@/server/types";

export type Severity = "info" | "warn" | "error";

export interface CategoryStyle {
  // Tailwind-friendly hex palette. Renderer composes:
  //   background: `${color}1a` (10% alpha), border: `${color}55`, text: color.
  color: string;
  // Single-character glyph (emoji or symbol). Keeps dependency-free
  // — Tailwind icons would force a heavier client bundle.
  icon: string;
  label: string;
}

const STYLES: Record<ActivityCategory, CategoryStyle> = {
  auth:             { color: "#0ea5e9", icon: "🔐", label: "Auth" },
  tenant:           { color: "#6366f1", icon: "🏢", label: "Tenant" },
  plugin:           { color: "#a855f7", icon: "🧩", label: "Plugin" },
  phase:            { color: "#14b8a6", icon: "📈", label: "Phase" },
  fulfillment:      { color: "#f59e0b", icon: "📦", label: "Fulfillment" },
  ecommerce:        { color: "#16a34a", icon: "🛒", label: "Ecommerce" },
  hr:               { color: "#0891b2", icon: "👥", label: "HR" },
  memberships:      { color: "#db2777", icon: "🪪", label: "Memberships" },
  affiliates:       { color: "#7c3aed", icon: "🔗", label: "Affiliates" },
  finance:          { color: "#ca8a04", icon: "💰", label: "Finance" },
  marketing:        { color: "#e11d48", icon: "📣", label: "Marketing" },
  crm:              { color: "#2563eb", icon: "📇", label: "CRM" },
  "public-funnel":  { color: "#06b6d4", icon: "🎯", label: "Funnel" },
  "bos-auth-gate":  { color: "#475569", icon: "🛡", label: "BOS gate" },
  payroll:          { color: "#059669", icon: "💵", label: "Payroll" },
  integrations:     { color: "#8b5cf6", icon: "🔌", label: "Integrations" },
  support:          { color: "#f97316", icon: "🛟", label: "Support" },
  onboarding:       { color: "#22c55e", icon: "✅", label: "Onboarding" },
  reports:          { color: "#1d4ed8", icon: "📊", label: "Reports" },
  feedback:         { color: "#ef4444", icon: "💬", label: "Feedback" },
  "team-resources": { color: "#0284c7", icon: "📚", label: "Team docs" },
  resources:        { color: "#0d9488", icon: "🌊", label: "Aqua docs" },
  files:            { color: "#737373", icon: "📁", label: "Files" },
  leads:            { color: "#10b981", icon: "🌱", label: "Leads" },
  settings:         { color: "#64748b", icon: "⚙️", label: "Settings" },
  system:           { color: "#334155", icon: "⚡", label: "System" },
};

const FALLBACK: CategoryStyle = { color: "#64748b", icon: "•", label: "Other" };

export function categoryStyle(category: ActivityCategory | string): CategoryStyle {
  return (STYLES as Record<string, CategoryStyle>)[category] ?? FALLBACK;
}

// Severity derivation. Detractor feedback is the canonical "warn"
// case (chapter #131 explicitly flags red border + bell); other
// patterns extend here without changing call-sites.
const WARN_PREFIXES = [
  "feedback.detractor.",
  "support.ticket.urgent.",
  "stripe.payment.failed",
  "stripe.subscription.canceled",
  "auth.lockout.",
];

const ERROR_PREFIXES = [
  "system.error.",
  "plugin.crash.",
];

export function deriveActivitySeverity(entry: { action: string }): Severity {
  const action = entry.action ?? "";
  for (const p of ERROR_PREFIXES) {
    if (action.startsWith(p)) return "error";
  }
  for (const p of WARN_PREFIXES) {
    if (action.startsWith(p)) return "warn";
  }
  return "info";
}

// Renderer-friendly composite: chip styling + severity in one call.
// UI components import this rather than the two helpers separately.
export function describeActivityChip(entry: { category: ActivityCategory | string; action?: string }): {
  category: CategoryStyle;
  severity: Severity;
} {
  return {
    category: categoryStyle(entry.category),
    severity: deriveActivitySeverity({ action: entry.action ?? "" }),
  };
}

// Filter dropdown source — emit the categories operators usually
// care about first; system/settings drop to the bottom.
export const CATEGORY_FILTER_ORDER: readonly ActivityCategory[] = [
  "auth",
  "tenant",
  "phase",
  "ecommerce",
  "fulfillment",
  "memberships",
  "affiliates",
  "marketing",
  "crm",
  "hr",
  "finance",
  "public-funnel",
  "bos-auth-gate",
  "payroll",
  "integrations",
  "support",
  "onboarding",
  "reports",
  "feedback",
  "team-resources",
  "resources",
  "files",
  "leads",
  "plugin",
  "settings",
  "system",
];
