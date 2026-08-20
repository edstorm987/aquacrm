# Plan — "Operations / System" surface (governance: compliance + security)

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: PLAN — UNBLOCKED 2026-08-20.** Both open decisions are made: the sidebar surface is called **Operations** (Ed: "call it operations simple"), and compliance is **GDPR always on with HIPAA as a per-instance toggle** — see [compliance-legal.md](compliance-legal.md).
A dedicated **Operations** surface housing the whole governance blindspot —
**compliance/legal + security** — so Ed can *know* his posture (verified, not
assumed), internally and client-side. Today there is **no dedicated surface**
for any of it.

## The goal — the KNOW side, then adapt (Ed's steer)
**The point isn't "am I compliant" — it's that Ed wouldn't *know* either way.**
The primary job of this surface is **awareness**: *know* where you stand, *know*
what you're exposed to, *know* what's missing — verified from real evidence, never
assumed. Once you can **see** your posture, you can **adapt** it. So this is built
**KNOW-first**: visibility and exposure-awareness are the deliverable; the
controls and frameworks are the *dimensions* of what you get to know, not a
certificate. (Compliance/HIPAA sign-off is a human/legal act the surface *tracks*
— it never claims it for you.)

> **The honest frame (carried into every sub-plan):** the app provides the
> **controls, tooling, and evidence** to *know* + demonstrate your posture. It
> does **not** make you "compliant" on its own. The surface's job is to show
> **truthfully where you stand and what's missing** — never a false green.

## Why a dedicated surface
Governance is currently invisible: the legal register is buried in Company, the
compliance checks live only in Radar, security controls exist but have no home,
and there's nothing for GDPR/HIPAA/breach-defence. Ed can't answer "am I covered
if someone sues me over a data breach?" — because nothing shows it. A dedicated
surface makes posture a first-class, at-a-glance thing.

## What it houses
- **Compliance & Legal** → [compliance-legal.md](compliance-legal.md) — GDPR, HIPAA track, the document/evidence vault, consent, erasure/DSAR, retention, breach register, contracts→deliverables proof.
- **Security** → [security-hardening.md](security-hardening.md) — posture dashboard, attack monitoring/prevention, access management, incident response, the RLS + MFA gaps.
- **Audit & evidence** — the verifiable trail (reuse `activity` log) + point-in-time posture snapshots, so you can prove your stance *as it was* on any date (breach defence).
- **Subprocessors** — the vendor register (Supabase/Vercel/OpenAI/Resend/Twilio/Meta) with their data-role + BAA/DPA status (critical for HIPAA).

## Scope: internal + client-side
- **Agency (internal)** — Ed's own governance posture.
- **Client-side** — each client's compliance/security posture too (their tags' consent, their data handling, their contracts/deliverables), so Ed can stand behind the work he delivers.

## Where it lives
A new top-level sidebar item — **name is Ed's call**: "Operations", "System", or
"Governance". Sits alongside Command Centre / Fulfilment / Finance. Reuses the
Radar **compliance** domain (already monitors legal/insurance/tax/contracts) as
its live signal, and the existing legal register + activity log.

## Phases
1. **The surface + posture home** — the new sidebar with a governance overview: compliance posture, security posture, "what's missing" — pulling the Radar compliance domain + legal register + security state into one at-a-glance view.
2. **Compliance & Legal** — build out [compliance-legal.md](compliance-legal.md).
3. **Security** — build out [security-hardening.md](security-hardening.md).
4. **Audit/evidence + subprocessors** — the verifiable trail + vendor/BAA register.
5. **Client-side posture** — extend to each client.

## Decisions (Ed)
- **Sidebar name** — Operations / System / Governance?
- **Priority** — GDPR-first (achievable), or is **HIPAA a real near-term need** (much bigger — BAAs + risk assessment + policies; see the honest note)?
- Internal-first, or internal + client-side together?

## Non-goals
- Not claiming compliance the app can't legally confer — it surfaces posture + evidence + gaps, honestly.

## Ties
Radar **compliance** domain (monitoring) · the legal register (`legalDocuments`) ·
the activity log (audit) · [security-hardening](security-hardening.md) +
[compliance-legal](compliance-legal.md) (the two big sub-plans).

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/lib/chrome/sidebarLayout.ts`
- `src/app/portal/agency/company/page.tsx`
- `src/app/portal/agency/company/_CompanyWorkspace.tsx`
- `src/app/api/portal/company/legal/route.ts`
- `src/app/api/portal/company/legal/content/route.ts`
- `src/app/api/portal/company/legal/upload/route.ts`
- `src/engines/data/radar/radarRuleCatalog.ts`
- `src/engines/data/server/radar/radarObservations.ts`
- `src/lib/server/productionReadiness.ts`
- `src/server/storage.ts`
- `src/server/types.ts`
- `docs/development/plans/operations-command-surface.md`

## Decisions — SETTLED 2026-08-20

- **Sidebar name: `Operations`.** Not Delivery, not Fulfilment Ops. Ed's words: "call it
  operations simple". Note `sidebarLayout.ts:36` already has an `ops` panel holding Finance
  and SOPs — this surface joins that panel rather than inventing a second one.
- **Compliance: GDPR is the standard; HIPAA is an optional toggle.** Flip it on for a
  company serving medical professionals. The honesty rule from compliance-legal.md applies
  verbatim — the app can show posture and evidence, it can never confer compliance.
- ⚠ **Serialise against `security-hardening`.** Both plans invent a surface in the same
  sidebar panel and both edit `productionReadiness.ts`. Never run them in parallel.
