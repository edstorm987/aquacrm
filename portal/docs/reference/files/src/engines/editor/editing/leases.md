# `src/engines/editor/editing/leases.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** Telling people somebody is already in here. The conflict check catches a collision after the fact: it refuses the second edit and keeps the first. That protects the data but wastes the work — the second person typed a paragraph before finding out. A lease is the other half, and the more useful one day to day: it says who is editing before anybody starts, so the collision mostly does not happen. It is advisory on purpose. A banner cannot stop a write — somebody with the page already open never saw it, a second tab does not know about the first, and browsers close without telling anyone. So the lease prevents collisions and the fingerprint check catches the ones that happen anyway. Removing either brings back silent overwriting for the cases the other covers.

## Exports (10)

- `interface EditLease (5 members)`
- `LEASE_DURATION_MS`
- `isLeaseActive(lease: EditLease | undefined, now: number): boolean`
- `type EditorAudience`
- `type LeaseStatus`
- `leaseStatus(input: { lease?: EditLease; viewerId: string; now: number; /** Defaults to the agency: the stricter behaviour is never the default. */ viewer?: EditorAudience; /** Who holds the lease, when that is known. */ holder?: EditorAudi…`
- `leaseNotice(status: LeaseStatus): string | null`
- `TAKEOVER_AFTER_MS`
- `canTakeOver(status: LeaseStatus, now: number): boolean`
- `claimLease(input: { documentId: string; holderId: string; holderName: string; existing?: EditLease; now: number; }): { lease: EditLease; claimed: boolean }`

## Used by (3)

- [`scripts/smoke-editing-leases.test.ts`](../../../../scripts/smoke-editing-leases.test.md)
- [`src/components/editing/EditingNotice.tsx`](../../../components/editing/EditingNotice.md)
- [`src/components/editing/EditingOverlay.tsx`](../../../components/editing/EditingOverlay.md)

