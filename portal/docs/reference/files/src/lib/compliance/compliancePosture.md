# `src/lib/compliance/compliancePosture.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Compliance posture — the KNOW side of the compliance & legal plan. ───────────────────────────────────────────────────────────────────────────── THE HONESTY RULE (non-negotiable, copied from the plan) The app CANNOT make anyone compliant. It provides controls, evidence, and a truthful posture with the gaps named. Never assume or claim compliance; verify from real evidence. True GDPR/HIPAA also needs BAAs, policies and legal sign-off that the code can only TRACK, never CONFER. That rule is enforced structurally in this file, not just written in a comment: 1. There is no boolean "compliant" anywhere in this model, and no score that could be mistaken for one. 2. Every control that is NOT `met` must carry a non-empty `gap` — the answer to "what is still missing here". 3. Every control that IS `met` must carry a non-empty `evidenceLimit` — the answer to "what does this green actually prove?". A document being in the register proves a record exists, not that its contents are adequate. 4. A control whose `conferredBy` is `"human"` can never be `met` on app data alone. The best it can reach is `partial` — "tracked, not conferred". 5. Absence of a signal is `blind`, never a pass. Same discipline as Radar. `assertPostureHonesty` below re-checks 2–4 over a built posture so the rules are testable rather than aspirational. ───────────────────────────────────────────────────────────────────────────── This module is deliberately pure (no `server-only`, no state access) so both the API route and the client panel can share exactly one definition of what a control is and when it counts as evidenced. Evidence gathering lives in `lib/server/compliancePostureSource.ts`.

## Exports (19)

- `type ComplianceFrameworkId`
- `type ControlConferrer`
- `type ControlStatus`
- `interface ComplianceControl (11 members)`
- `interface ComplianceControlGroup (2 members)`
- `interface CompliancePostureSummary (7 members)`
- `interface CompliancePosture (7 members)`
- `interface FrameworkState (5 members)`
- `interface SubprocessorExpectation (6 members)`
- `SUBPROCESSOR_EXPECTATIONS: readonly SubprocessorExpectation[]`
- `interface ComplianceEvidenceInput (8 members)`
- `interface LegalRecordEvidence (8 members)`
- `interface ConsentEvidence (7 members)`
- `interface ErasureEvidence (5 members)`
- `COMPLIANCE_DISCLAIMER`
- `HIPAA_HONESTY`
- `GDPR_HONESTY`
- `buildCompliancePosture(input: ComplianceEvidenceInput): CompliancePosture`
- `assertPostureHonesty(posture: CompliancePosture): string[]`

## Used by (4)

- [`scripts/smoke-compliance-posture.test.ts`](../../../scripts/smoke-compliance-posture.test.md)
- [`src/app/api/portal/compliance/posture/route.ts`](../../app/api/portal/compliance/posture/route.md)
- [`src/app/portal/agency/company/_CompliancePosturePanel.tsx`](../../app/portal/agency/company/_CompliancePosturePanel.md)
- [`src/lib/server/compliancePostureSource.ts`](../server/compliancePostureSource.md)

