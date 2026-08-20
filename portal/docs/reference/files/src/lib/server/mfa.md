# `src/lib/server/auth/mfa.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Two-factor authentication, via Supabase. Aqua does not implement 2FA — Supabase Auth already has it, and a hand-rolled TOTP implementation is a liability with no upside. What lives here is the part Aqua owns: deciding when a second factor is *required*, and saying so in language somebody can act on. Supabase expresses this as an assurance level on the session: aal1 — one factor. A password, or a social sign-in. aal2 — two. A password plus a verified TOTP code. The distinction that matters and is easy to get wrong: a user who has enrolled a factor but has not been challenged on this session is still aal1. Enrolment is not authentication. Reading "has 2FA switched on" as "is strongly authenticated right now" would let a stolen session skip the very check it appears to have.

## Exports (6)

- `type AssuranceLevel`
- `interface AssuranceState (2 members)`
- `type MfaRequirement`
- `requireTwoFactor(state: AssuranceState): MfaRequirement`
- `readAssurance(value: unknown): AssuranceState`
- `hasVerifiedFactor(factors: Array<{ status?: string }> | null | undefined): boolean`

## Used by (1)

- [`scripts/smoke-mfa.test.ts`](../../../scripts/smoke-mfa.test.md)

