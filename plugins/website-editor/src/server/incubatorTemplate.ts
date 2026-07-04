// R010 — Incubator template metadata resolver.
//
// The Aqua Incubator root template (§15e) carries placeholders inside
// its propertyStrip rows (`{{phase}}` / `{{planTier}}` /
// `{{onboardingStartedAt}}`). When an operator clicks "+ New client →
// Use Aqua Incubator template" the foundation/T1 modal calls this
// helper post-`applyStarterVariant` to substitute live client
// metadata into the BlockTree before persisting.
//
// Pure function — accepts `Block[]`, returns a deep-cloned `Block[]`
// with substituted strings. No storage, no foundation imports.

import type { Block } from "../types/block";

export interface IncubatorClientMetadata {
  phase?: string;             // e.g. "Epic Intro"
  planTier?: string;          // e.g. "Foundational Flow" | "Expansion Plan"
  onboardingStartedAt?: string; // ISO date or formatted string
  practiceName?: string;
  therapistName?: string;
  whatsappLink?: string;
  stripeLink?: string;
  // Additional free-form passthrough — operator can include any key
  // and reference it as `{{custom_key}}` in the template.
  [key: string]: string | undefined;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

function substitute(value: unknown, ctx: IncubatorClientMetadata): unknown {
  if (typeof value !== "string") return value;
  if (!value.includes("{{")) return value;
  return value.replace(PLACEHOLDER_RE, (full, key: string) => {
    const v = ctx[key];
    if (v == null || v === "") return "";
    return String(v);
  });
}

function substituteProps(props: Record<string, unknown>, ctx: IncubatorClientMetadata): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (Array.isArray(v)) {
      next[k] = v.map(item =>
        item && typeof item === "object" && !Array.isArray(item)
          ? substituteProps(item as Record<string, unknown>, ctx)
          : substitute(item, ctx),
      );
    } else if (v && typeof v === "object") {
      next[k] = substituteProps(v as Record<string, unknown>, ctx);
    } else {
      next[k] = substitute(v, ctx);
    }
  }
  return next;
}

export function applyIncubatorClientMetadata(
  blocks: Block[],
  metadata: IncubatorClientMetadata,
): Block[] {
  return blocks.map(b => ({
    ...b,
    props: substituteProps(b.props, metadata),
    ...(b.children ? { children: applyIncubatorClientMetadata(b.children, metadata) } : {}),
  }));
}

// Default metadata — used by preview / smoke when no client is
// associated yet (so placeholders don't surface as raw `{{phase}}`).
export const DEFAULT_INCUBATOR_METADATA: IncubatorClientMetadata = {
  phase: "Epic Intro",
  planTier: "Foundational Flow",
  onboardingStartedAt: "",
};
