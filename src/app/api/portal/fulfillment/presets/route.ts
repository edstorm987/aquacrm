// GET /api/portal/fulfillment/presets
//
// Returns the Aqua phase preset list consumed by the "+ New client"
// modal (src/app/portal/agency/_NewClientButton.tsx). The modal also
// has a FALLBACK_PRESETS copy hard-coded for offline/dev — this route
// is the canonical source.

import { NextResponse } from "next/server";

interface PhasePreset {
  stage: string;
  label: string;
  pluginPreset: readonly string[];
}

const PRESETS: PhasePreset[] = [
  { stage: "aqua-epic-intro",    label: "Epic Intro",                   pluginPreset: [] },
  { stage: "aqua-blueprint",     label: "Blueprint Setup",              pluginPreset: ["website-editor", "client-crm", "forms"] },
  { stage: "aqua-diagnostics",   label: "Diagnostics / Foundations",    pluginPreset: ["website-editor", "client-crm", "forms", "ai-builder"] },
  { stage: "aqua-brand-builder", label: "Brand Builder + Verification", pluginPreset: ["website-editor", "client-crm", "forms", "ai-builder"] },
  { stage: "aqua-traffic",       label: "Traffic (Expansion Plan)",     pluginPreset: ["website-editor", "client-crm", "forms", "ai-builder", "ecommerce", "agency-marketing", "email-sender"] },
  { stage: "aqua-mastery",       label: "Mastery & Ascension",          pluginPreset: ["website-editor", "client-crm", "forms", "ai-builder", "ecommerce", "agency-marketing", "email-sender", "memberships", "affiliates"] },
];

export async function GET() {
  return NextResponse.json({ ok: true, presets: PRESETS });
}
