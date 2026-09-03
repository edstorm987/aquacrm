// Receipt validators for the Agency Phase Admin surface (/portal/agency/phases).
//
// Every mutation the phase-admin components send is checked against the exact
// shape the route promises AND bound to the identity the browser submitted:
//   - create  → `{ ok: true, phase }`, an authoritative saved phase carrying the
//               submitted name/description/code and a real id;
//   - update  → the same, with `phase.id` equal to the edited phase's id;
//   - delete  → `{ ok: true, phaseId }` naming the deleted phase;
//   - preview → `{ ok: true, phaseId, redirect }` where `redirect` is a safe
//               relative demo-client path that names the requested phase.
// A 200 that does not satisfy these is treated as a refusal by
// `checkedJsonMutation`, so a reload, a navigation or a "Saved." can only
// follow a receipt that provably describes what the operator asked for.
//
// Client-safe: no server imports.

export interface PhaseAdminPhase {
  id: string;
  agencyId: string;
  stage: string;
  label: string;
  description?: string;
  order: number;
  pluginPreset: string[];
  checklist: unknown[];
  isDefault?: boolean;
  customCss?: string;
  customJs?: string;
  welcomeHeading?: string;
  welcomeBody?: string;
  isPublicPreset?: boolean;
}

export interface PhaseUpsertReceipt {
  ok: true;
  phase: PhaseAdminPhase;
}

export interface PhaseDeleteReceipt {
  ok: true;
  phaseId: string;
}

export interface PhasePreviewReceipt {
  ok: true;
  phaseId: string;
  redirect: string;
}

export interface ExpectedPhaseCreate {
  name: string;
  description: string;
  ordering: number;
  customCss: string;
  customJs: string;
}

export interface ExpectedPhaseUpdate extends ExpectedPhaseCreate {
  phaseId: string;
  welcomeHeading: string;
  welcomeBody: string;
  isPublicPreset: boolean;
}

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

/** A phase record complete enough to render and to address again. */
export function isPhaseAdminPhase(value: unknown): value is PhaseAdminPhase {
  if (!isJsonRecord(value)) return false;
  return isNonBlankString(value.id)
    && isNonBlankString(value.agencyId)
    && isNonBlankString(value.stage)
    && isNonBlankString(value.label)
    && isOptionalString(value.description)
    && typeof value.order === "number" && Number.isFinite(value.order)
    && Array.isArray(value.pluginPreset)
    && Array.isArray(value.checklist)
    && isOptionalBoolean(value.isDefault)
    && isOptionalString(value.customCss)
    && isOptionalString(value.customJs)
    && isOptionalString(value.welcomeHeading)
    && isOptionalString(value.welcomeBody)
    && isOptionalBoolean(value.isPublicPreset);
}

/** The server stores optional text as given, or as `undefined` when omitted; "" and undefined mean the same absence. */
function sameText(stored: string | undefined, submitted: string): boolean {
  return (stored ?? "") === submitted;
}

function upsertReceipt(value: unknown): PhaseAdminPhase | null {
  if (!isJsonRecord(value) || value.ok !== true || !isPhaseAdminPhase(value.phase)) return null;
  return value.phase;
}

/**
 * A create receipt must be a real saved phase carrying the submitted name,
 * description and code. The server derives `order` when the submitted
 * ordering is 0 (a fresh phase goes to the end), so only a non-zero
 * submitted ordering is checked exactly.
 */
export function isPhaseCreateReceipt(value: unknown, expected: ExpectedPhaseCreate): value is PhaseUpsertReceipt {
  const phase = upsertReceipt(value);
  if (!phase) return false;
  return phase.label === expected.name.trim()
    && sameText(phase.description, expected.description)
    && (expected.ordering === 0 || phase.order === expected.ordering)
    && sameText(phase.customCss, expected.customCss)
    && sameText(phase.customJs, expected.customJs)
    && phase.isDefault !== true;
}

/** An update receipt must name the edited phase and carry every submitted field. */
export function isPhaseUpdateReceipt(value: unknown, expected: ExpectedPhaseUpdate): value is PhaseUpsertReceipt {
  const phase = upsertReceipt(value);
  if (!phase) return false;
  return phase.id === expected.phaseId
    && phase.label === expected.name.trim()
    && sameText(phase.description, expected.description)
    && phase.order === expected.ordering
    && sameText(phase.customCss, expected.customCss)
    && sameText(phase.customJs, expected.customJs)
    && sameText(phase.welcomeHeading, expected.welcomeHeading)
    && sameText(phase.welcomeBody, expected.welcomeBody)
    && (phase.isPublicPreset ?? false) === expected.isPublicPreset;
}

export function isPhaseDeleteReceipt(value: unknown, phaseId: string): value is PhaseDeleteReceipt {
  return isJsonRecord(value)
    && value.ok === true
    && isNonBlankString(phaseId)
    && value.phaseId === phaseId;
}

// Control characters and backslashes never belong in a path the browser will follow.
const UNSAFE_REDIRECT_CHARACTERS = /[\u0000-\u001f\u007f\\]/;
const DEMO_CLIENT_PATH = /^\/portal\/clients\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_\-/]*)?$/;

/**
 * The only redirect the preview button will follow: a same-origin relative
 * path under `/portal/clients/` whose `previewPhase` query names the phase the
 * operator clicked. Absolute URLs, protocol-relative paths, backslashes,
 * control characters and any other path are refused.
 */
export function isSafePhasePreviewRedirect(value: unknown, phaseId: string): value is string {
  if (typeof value !== "string" || !isNonBlankString(phaseId)) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (UNSAFE_REDIRECT_CHARACTERS.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value, "http://phase-preview.invalid");
  } catch {
    return false;
  }
  if (url.origin !== "http://phase-preview.invalid") return false;
  if (!DEMO_CLIENT_PATH.test(url.pathname)) return false;
  return url.searchParams.get("previewPhase") === phaseId;
}

export function isPhasePreviewReceipt(value: unknown, phaseId: string): value is PhasePreviewReceipt {
  return isJsonRecord(value)
    && value.ok === true
    && isNonBlankString(phaseId)
    && value.phaseId === phaseId
    && isSafePhasePreviewRedirect(value.redirect, phaseId);
}
