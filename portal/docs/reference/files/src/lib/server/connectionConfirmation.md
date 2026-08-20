# `src/lib/server/connectionConfirmation.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (10)

- `CONFIRMATION_CODE_LENGTH`
- `CONFIRMATION_CODE_TTL_MS`
- `DEV_CONFIRMATION_CODE`
- `MAX_CODE_ATTEMPTS`
- `interface PendingConfirmationCode (3 members)`
- `type ConfirmationOutcome`
- `generateConfirmationCode(): string`
- `hashConfirmationCode(input: { connectionId: string; userId: string; code: string; }): string`
- `checkConfirmationCode(input: { code: string | undefined; bypassEnabled: boolean; connectionId: string; userId: string; /** The code stored for this connection, if one has been issued. */ stored: PendingConfirmationCode | undefined; /** Wro…`
- `connectionCodeEmail(input: { /** The plaintext code — this email is the only place it appears. */ code: string; /** The software being connected, for context: "Cedar booking app". */ label: string; }): { subject: string; bodyText: string; …`

## Used by (5)

- [`src/app/api/portal/connections/accept/route.ts`](../../app/api/portal/connections/accept/route.md)
- [`src/app/api/portal/connections/request-code/route.ts`](../../app/api/portal/connections/request-code/route.md)
- [`src/app/connect/[connectionId]/page.tsx`](../../app/connect/[connectionId]/page.md)
- [`src/lib/server/portal/portalConnections.ts`](./portal/portalConnections.md)
- [`src/server/portalConnectionStore.ts`](../../server/portalConnectionStore.md)

