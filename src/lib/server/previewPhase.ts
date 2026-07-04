import "server-only";
// Preview-phase cookie helper.
//
// When the founder uses /portal/agency/phases to "Sign in as demo
// client at this phase", we issue a demo-client session AND stamp a
// short-lived cookie `lk_preview_phase=<phaseId>` so the client portal
// can render as if the demo client were at that phase. Read-only on
// the client portal side.
//
// Code-injection trade-off: the preview phase's `customCss` / `customJs`
// is rendered into the client portal head when the cookie matches.
// NOT sanitised in v1 — author scope is gated to founder + agency-manager
// (same trust level as deploying a brand-kit override). Documented in
// chapter `04-phases-preview-ui.md`.

import { cookies } from "next/headers";
import { getPhase } from "@/server/phases";
import type { PhaseDefinition } from "@/server/types";

export const PREVIEW_PHASE_COOKIE = "lk_preview_phase";
export const PREVIEW_PHASE_MAX_AGE = 60 * 60 * 4; // 4h sandbox

export async function getPreviewPhase(): Promise<PhaseDefinition | null> {
  const jar = await cookies();
  const phaseId = jar.get(PREVIEW_PHASE_COOKIE)?.value;
  if (!phaseId) return null;
  return getPhase(phaseId);
}

export interface PreviewCookie {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: "lax";
    path: "/";
    maxAge: number;
    secure: boolean;
  };
}

export function previewPhaseCookie(phaseId: string | null): PreviewCookie {
  return {
    name: PREVIEW_PHASE_COOKIE,
    value: phaseId ?? "",
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: phaseId ? PREVIEW_PHASE_MAX_AGE : 0,
      secure: process.env.NODE_ENV === "production",
    },
  };
}

// Escape `</script>` and `</style>` so an operator's snippet can't
// terminate the wrapping tag (the only XSS surface even for trusted
// authors — a fat-finger paste with stray HTML still mustn't break out).
export function escapeStyleContent(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}
export function escapeScriptContent(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script");
}
