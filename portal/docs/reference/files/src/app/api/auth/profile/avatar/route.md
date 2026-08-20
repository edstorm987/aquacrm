# `src/app/api/auth/profile/avatar/route.ts`

← [File index](../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** T1 R036 — Profile picture upload + clear endpoint.  POST   /api/auth/profile/avatar  { dataUrl }  → saves on the user record. DELETE /api/auth/profile/avatar              → clears it (falls back to initials).  The client (account page upload zone) resizes to 256×256 via <canvas> before posting; this route only validates mime allow-list + cap size. Cap matches `AVATAR_MAX_DATA_URL_BYTES` (~50KB encoded) so the inline store on the user record stays cheap.

## Exports (2)

- `async POST(req: Request)`
- `async DELETE()`

## Depends on (4)

- [`src/lib/server/auth/auth.ts`](../../../../../lib/server/auth/auth.md)
- [`src/lib/shared/avatarDataUrl.ts`](../../../../../lib/shared/avatarDataUrl.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)
- [`src/server/users.ts`](../../../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

