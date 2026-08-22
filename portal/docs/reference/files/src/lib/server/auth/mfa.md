# `src/lib/server/auth/mfa.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Two-factor authentication, via Supabase. Aqua does not implement 2FA — Supabase Auth already has it, and a hand-rolled TOTP implementation is a liability with no upside. What lives here is the part Aqua owns: deciding when a second factor is *required*, and saying so in language somebody can act on. Supabase expresses this as an assurance level on the session: aal1 — one factor. A password, or a social sign-in. aal2 — two. A password plus a verified TOTP code. The distinction that matters and is easy to get wrong: a user who has enrolled a factor but has not been challenged on this session is still aal1. Enrolment is not authentication. Reading "has 2FA switched on" as "is strongly authenticated right now" would let a stolen session skip the very check it appears to have.

## Exports (31)

- `type AssuranceLevel`
- `interface AssuranceState (2 members)`
- `type MfaRequirement`
- `requireTwoFactor(state: AssuranceState): MfaRequirement`
- `readAssurance(value: unknown): AssuranceState`
- `hasVerifiedFactor(factors: Array<{ status?: string }> | null | undefined): boolean`
- `interface SignedInUser (1 members)`
- `interface ChallengeableFactor (2 members)`
- `MFA_LOGIN_CHALLENGE_MESSAGE`
- `MFA_LOGIN_REJECTED_MESSAGE`
- `MFA_LOGIN_UNAVAILABLE_MESSAGE`
- `verifiedFactors(user: SignedInUser | null | undefined): ChallengeableFactor[]`
- `type LoginMfaStep`
- `loginMfaStep(input: { user: SignedInUser | null | undefined; code: unknown }): LoginMfaStep`
- `readTokenAssurance(accessToken: unknown): AssuranceLevel | "unstated" | null`
- `raisedToSecondFactor(accessToken: unknown): boolean`
- `sessionAssurance(session: { aal?: unknown } | null | undefined): AssuranceLevel | null`
- `sessionHasSecondFactor(session: { aal?: unknown } | null | undefined): boolean`
- `MFA_SIDE_DOOR_ENROLLED_ERROR`
- `MFA_SIDE_DOOR_UNCHECKED_ERROR`
- `type SideDoorLookup`
- `type SideDoorMfaDecision`
- `gateSideDoorSession(lookup: SideDoorLookup): SideDoorMfaDecision`
- `async checkSideDoorMfa(email: string): Promise<SideDoorMfaDecision>`
- `RECOVERY_CODE_COUNT`
- `generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[]`
- `normalizeRecoveryCode(input: unknown): string`
- `hashRecoveryCode(code: string): string`
- `recoveryCodeMatches(code: unknown, hashes: string[]): number`
- `async issueRecoveryCodesIfMissing(userId: string): Promise<string[] | undefined>`
- `async consumeRecoveryCode(userId: string, rawCode: unknown): Promise<{ ok: true; remaining: number } | { ok: false }>`

## Used by (6)

- [`scripts/smoke-mfa-doors.test.ts`](../../../../scripts/smoke-mfa-doors.test.md)
- [`scripts/smoke-mfa.test.ts`](../../../../scripts/smoke-mfa.test.md)
- [`src/app/api/auth/login/route.ts`](../../../app/api/auth/login/route.md)
- [`src/app/api/auth/magic/verify/route.ts`](../../../app/api/auth/magic/verify/route.md)
- [`src/app/api/auth/oauth/google/callback/route.ts`](../../../app/api/auth/oauth/google/callback/route.md)
- [`src/app/api/portal/mfa/enrol/route.ts`](../../../app/api/portal/mfa/enrol/route.md)

