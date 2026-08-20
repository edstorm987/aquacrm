# `src/lib/shared/avatarDataUrl.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** T1 R036 — pure data-URL validator for profile picture uploads.  Lives outside `server-only` so the route handler AND the smoke runner can import it. The shape is `data:image/<mime>;base64,<payload>` — anything else is rejected. Cap is enforced on the *encoded* string length so we don't have to allocate a Buffer just to weigh the payload.  Allow-list = png / jpeg / webp. SVG is rejected on purpose (XSS via inline scripts inside an `<svg>`). GIF is rejected because v1 only renders a static circular avatar — animation here is noise.

## Exports (7)

- `AVATAR_MAX_DATA_URL_BYTES`
- `type AllowedAvatarMime`
- `type AvatarValidationError`
- `interface AvatarValidationOk (3 members)`
- `interface AvatarValidationFail (2 members)`
- `type AvatarValidation`
- `validateAvatarDataUrl(input: unknown): AvatarValidation`

## Used by (2)

- [`scripts/smoke-profile-picture-upload.test.ts`](../../../scripts/smoke-profile-picture-upload.test.md)
- [`src/app/api/auth/profile/avatar/route.ts`](../../app/api/auth/profile/avatar/route.md)

