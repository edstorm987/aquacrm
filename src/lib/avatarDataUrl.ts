// T1 R036 — pure data-URL validator for profile picture uploads.
//
// Lives outside `server-only` so the route handler AND the smoke runner
// can import it. The shape is `data:image/<mime>;base64,<payload>` —
// anything else is rejected. Cap is enforced on the *encoded* string
// length so we don't have to allocate a Buffer just to weigh the
// payload.
//
// Allow-list = png / jpeg / webp. SVG is rejected on purpose (XSS via
// inline scripts inside an `<svg>`). GIF is rejected because v1 only
// renders a static circular avatar — animation here is noise.

export const AVATAR_MAX_DATA_URL_BYTES = 50_000;

const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AllowedAvatarMime = (typeof ALLOWED_MIMES)[number];

export type AvatarValidationError =
  | "missing"
  | "too_large"
  | "bad_shape"
  | "bad_mime"
  | "bad_base64";

export interface AvatarValidationOk { ok: true; mime: AllowedAvatarMime; dataUrl: string }
export interface AvatarValidationFail { ok: false; error: AvatarValidationError }
export type AvatarValidation = AvatarValidationOk | AvatarValidationFail;

const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;

export function validateAvatarDataUrl(input: unknown): AvatarValidation {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, error: "missing" };
  }
  if (input.length > AVATAR_MAX_DATA_URL_BYTES) {
    return { ok: false, error: "too_large" };
  }
  const m = DATA_URL_RE.exec(input);
  if (!m) return { ok: false, error: "bad_shape" };
  const mime = m[1].toLowerCase();
  if (!ALLOWED_MIMES.includes(mime as AllowedAvatarMime)) {
    return { ok: false, error: "bad_mime" };
  }
  // Cheap base64 sanity — length must be a multiple of 4.
  const payload = m[2];
  if (payload.length === 0 || payload.length % 4 !== 0) {
    return { ok: false, error: "bad_base64" };
  }
  return { ok: true, mime: mime as AllowedAvatarMime, dataUrl: input };
}
