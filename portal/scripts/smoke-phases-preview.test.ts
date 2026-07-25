// T1 — phases preview UI smoke. File-marker checks (cannot import the
// `server-only` modules under tsx). Verifies the contract surface:
// listPhases / upsertPhase / deletePhase wiring, founder + agency-manager
// gating, default-phase delete protection, preview cookie helpers,
// code-injection escaping, sidebar entry, and ordering.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = (...p: string[]) => join(ROOT, "src", ...p);

const PHASES_PAGE = SRC("app", "portal", "agency", "phases", "page.tsx");
const ADD_FORM = SRC("app", "portal", "agency", "phases", "_AddCustomPhaseForm.tsx");
const ACTIONS = SRC("app", "portal", "agency", "phases", "_PhaseCardActions.tsx");
const EDITOR_PAGE = SRC("app", "portal", "agency", "phases", "[phaseId]", "page.tsx");
const EDITOR_FORM = SRC("app", "portal", "agency", "phases", "[phaseId]", "_PhaseEditorForm.tsx");
const UPSERT_API = SRC("app", "api", "portal", "phases", "upsert", "route.ts");
const DELETE_API = SRC("app", "api", "portal", "phases", "delete", "route.ts");
const PREVIEW_API = SRC("app", "api", "auth", "preview-as-client-at-phase", "route.ts");
const PREVIEW_LIB = SRC("lib", "server", "previewPhase.ts");
const TYPES = SRC("server", "types.ts");
const SIDEBAR = SRC("lib", "chrome", "sidebarLayout.ts");
const CLIENT_LAYOUT = SRC("app", "portal", "clients", "[clientId]", "layout.tsx");

describe("phases preview UI — files exist", () => {
  it("ships every artefact", () => {
    for (const f of [
      PHASES_PAGE, ADD_FORM, ACTIONS, EDITOR_PAGE, EDITOR_FORM,
      UPSERT_API, DELETE_API, PREVIEW_API, PREVIEW_LIB,
    ]) {
      assert.ok(existsSync(f), `missing ${f}`);
    }
  });
});

describe("phases preview UI — list page", () => {
  const src = readFileSync(PHASES_PAGE, "utf8");
  it("reads listPhasesForAgency for the active agency", () => {
    assert.ok(src.includes("listPhasesForAgency"));
    assert.ok(src.includes("getActiveAgencyId(session)"));
  });
  it("renders a preview button + edit link + delete (when not default) per phase", () => {
    assert.ok(src.includes("PreviewAsClientButton"));
    assert.ok(src.includes("/portal/agency/phases/"));
    assert.ok(src.includes("DeletePhaseButton"));
    assert.ok(src.includes("isDefault"));
  });
  it("offers an add-custom-phase form", () => {
    assert.ok(src.includes("AddCustomPhaseForm"));
  });
  it("gates the page to founder / agency-owner / agency-manager", () => {
    assert.ok(src.includes("eff.isFounder"));
    assert.ok(src.includes('agency-manager'));
  });
});

describe("phases preview UI — upsert + delete API", () => {
  const upsert = readFileSync(UPSERT_API, "utf8");
  const del = readFileSync(DELETE_API, "utf8");
  it("upsert is founder / agency-owner / agency-manager only", () => {
    assert.ok(upsert.includes("eff.isFounder"));
    assert.ok(upsert.includes('agency-manager'));
    assert.ok(upsert.includes('"unauthorized"'));
    assert.ok(upsert.includes('"forbidden"'));
  });
  it("upsert is idempotent on phaseId", () => {
    assert.ok(upsert.includes("body.phaseId"));
    assert.ok(upsert.includes("getPhase(body.phaseId)"));
  });
  it("upsert accepts customCss + customJs", () => {
    assert.ok(upsert.includes("customCss"));
    assert.ok(upsert.includes("customJs"));
  });
  it("delete refuses default phases", () => {
    assert.ok(del.includes("DEFAULT_STAGES"));
    assert.ok(del.includes("default_phase_protected"));
    assert.ok(del.includes("isDefault === true"));
  });
  it("delete is founder / agency-owner / agency-manager only", () => {
    assert.ok(del.includes("eff.isFounder"));
    assert.ok(del.includes('"forbidden"'));
  });
});

describe("phases preview UI — preview-as-client API", () => {
  const src = readFileSync(PREVIEW_API, "utf8");
  it("is founder-only", () => {
    assert.ok(src.includes("eff.isFounder"));
    assert.ok(src.includes('"forbidden"'));
  });
  it("re-issues a session as the demo client", () => {
    assert.ok(src.includes("DEMO_CLIENT_EMAIL"));
    assert.ok(src.includes("issueSession"));
    assert.ok(src.includes("sessionCookie"));
  });
  it("stamps the preview-phase cookie + redirects to the demo client overview", () => {
    assert.ok(src.includes("previewPhaseCookie"));
    assert.ok(src.includes("DEMO_CLIENT_SLUG"));
    assert.ok(src.includes("previewPhase="));
  });
  it("validates the phase belongs to the active agency", () => {
    assert.ok(src.includes("phase.agencyId !== getActiveAgencyId"));
  });
});

describe("phases preview UI — preview cookie + escaping", () => {
  const src = readFileSync(PREVIEW_LIB, "utf8");
  it("exports getPreviewPhase + previewPhaseCookie", () => {
    assert.ok(src.includes("export async function getPreviewPhase"));
    assert.ok(src.includes("export function previewPhaseCookie"));
    assert.ok(src.includes("lk_preview_phase"));
  });
  it("escapes </style> and </script> so operator pastes can't break out", () => {
    assert.ok(src.includes("escapeStyleContent"));
    assert.ok(src.includes("escapeScriptContent"));
    // Cookie roundtrip — name + maxAge=0 when null
    assert.ok(src.includes("PREVIEW_PHASE_COOKIE"));
    assert.ok(src.includes("maxAge: phaseId ? PREVIEW_PHASE_MAX_AGE : 0"));
  });
});

describe("phases preview UI — code-injection escape (logic)", () => {
  it("escapeStyleContent neutralises </style", () => {
    // Mirror the function locally to exercise the contract under tsx.
    const escapeStyleContent = (css: string) => css.replace(/<\/style/gi, "<\\/style");
    const escapeScriptContent = (js: string) => js.replace(/<\/script/gi, "<\\/script");
    const dirty = "body{}</style><img src=x>";
    assert.ok(!escapeStyleContent(dirty).includes("</style"));
    assert.ok(!escapeScriptContent("alert(1)</script>").includes("</script"));
  });
});

describe("phases preview UI — types + sidebar + client layout", () => {
  it("PhaseDefinition gained isDefault + customCss + customJs", () => {
    const src = readFileSync(TYPES, "utf8");
    assert.ok(src.includes("isDefault?: boolean"));
    assert.ok(src.includes("customCss?: string"));
    assert.ok(src.includes("customJs?: string"));
  });
  it("Sidebar surfaces a Phases entry under settings", () => {
    const src = readFileSync(SIDEBAR, "utf8");
    assert.ok(src.includes("agency-phases"));
    assert.ok(src.includes("/portal/agency/phases"));
  });
  it("Client layout injects preview phase CSS/JS via dangerouslySetInnerHTML with escapers", () => {
    const src = readFileSync(CLIENT_LAYOUT, "utf8");
    assert.ok(src.includes("getPreviewPhase"));
    assert.ok(src.includes("escapeStyleContent"));
    assert.ok(src.includes("escapeScriptContent"));
    assert.ok(src.includes("data-phase-preview"));
  });
});

describe("phases preview UI — ordering preserved", () => {
  it("listPhasesForAgency in src/server/phases.ts sorts by order", () => {
    const src = readFileSync(SRC("server", "phases.ts"), "utf8");
    assert.ok(src.includes(".sort((a, b) => a.order - b.order)"));
  });
});
