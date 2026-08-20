# `src/lib/publicOrigin.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Is an origin reachable from a stranger's browser? Anything we hand out to be pasted into someone else's website — the Aqua Tag snippet above all — is worthless if it points somewhere only this machine can reach. The trap this exists to close: `NEXT_PUBLIC_PORTAL_BASE_URL` is *set* in local dev (to `http://localhost:3032`), so "is the env var configured?" is not the same question and answers it wrongly, staying silent exactly when the snippet is a dud. Deliberately conservative: an origin we cannot parse counts as unreachable.

## Exports (1)

- `isPubliclyReachableOrigin(origin: string): boolean`

## Used by (1)

- [`src/app/portal/dev-team/api/page.tsx`](../app/portal/dev-team/api/page.md)

