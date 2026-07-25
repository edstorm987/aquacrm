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
  { stage: "aqua-epic-intro",    label: "Onboarding",                   pluginPreset: [] },
  { stage: "aqua-blueprint",     label: "Planning",                     pluginPreset: ["website-editor", "client-crm"] },
  { stage: "aqua-diagnostics",   label: "Content & foundations",        pluginPreset: ["website-editor", "client-crm"] },
  { stage: "aqua-brand-builder", label: "Design",                       pluginPreset: ["website-editor", "client-crm"] },
  { stage: "aqua-traffic",       label: "Build & launch",               pluginPreset: ["website-editor", "client-crm", "ecommerce", "agency-marketing", "email-sender"] },
  { stage: "aqua-mastery",       label: "Live care",                    pluginPreset: ["website-editor", "client-crm", "ecommerce", "agency-marketing", "email-sender", "memberships", "affiliates"] },
];

export async function GET() {
  return NextResponse.json({ ok: true, presets: PRESETS });
}
