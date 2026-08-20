# Plan — Compliance & Legal (GDPR, HIPAA track, evidence, breach defence)

← [todo.md](../todo.md) · [operations-command-surface.md](operations-command-surface.md) · [development.md](../../development.md)

**Status: PHASE 1 BUILT (posture + HIPAA track toggle), phases 2–5 open.**
**KNOW-first** (Ed's steer): the goal is
that Ed can *see* his exposure — "am I open to being sued over a data breach?
where am I exposed? what's missing?" — verified from real evidence, then adapt.
Not a compliance stamp; the **know side**. Covers GDPR now, a HIPAA track if he
wants medical data, across the app, the tags, and the work he delivers.

> **🔴 The honesty rule (non-negotiable):** the app **cannot make you compliant**
> — it gives you controls + evidence + a truthful "here's your posture and what's
> missing". **Never assume/claim compliance; verify from real evidence.** True
> GDPR/HIPAA also needs BAAs, policies, and legal sign-off the code can only
> *track*, not confer.

## Built (2026-08-20) — the posture surface

**`/portal/agency/company?view=legal` now opens on a compliance posture**, above
the legal register. It is built from real evidence only — the legal register,
the consent the Aqua Tag captures, the erasure machinery, the activity log — and
it says out loud what it cannot see.

| Piece | Where |
|---|---|
| The control model + the honesty rules, enforced as code | `src/lib/compliance/compliancePosture.ts` |
| Evidence gathering from real state | `src/lib/server/compliancePostureSource.ts` |
| Read the posture | `GET /api/portal/compliance/posture?companyId=` |
| Flip the HIPAA track | `POST /api/portal/compliance/frameworks` |
| The surface | `src/app/portal/agency/company/_CompliancePosturePanel.tsx` |
| The declaration store + toggle | `src/server/legalDocuments.ts` |
| Tests (19, each checked to fail against broken code) | `scripts/smoke-compliance-posture.test.ts` |

**How the honesty rule is enforced rather than promised** — `assertPostureHonesty()`
re-checks a built posture and the API returns any violations to the page, which
renders them as a red banner over the posture:

1. No boolean "compliant" and no aggregate score anywhere in the model.
2. A control that is not `met` MUST carry a non-empty `gap` — and the gap is
   shown on the collapsed row, so the page cannot be skimmed as "fine".
3. A control that IS `met` MUST say what that does not prove. "Evidenced" means
   a document is on file and in date, never that its contents are adequate.
4. A control whose `conferredBy` is `human` can never read as `met` — it is
   capped at `partial` in code, however good the paperwork looks.
5. Absence of a signal is `blind`, never a pass (same discipline as Radar).

**GDPR is always on. HIPAA is an optional per-company track** — decided by Ed,
2026-08-20. Switching it on writes a dated **PHI scope declaration** against that
company; switching it off **archives** it, so the period it was on stays on
record. The confirmation, the API response and the panel all state that the
toggle switches on a *checklist* and confers nothing. Its first controls are the
missing BAAs, because that is the gating reality.

Interim implementation note: the declaration is persisted as a reserved-reference
record in the legal register, because the typed per-company store (`types.ts` /
`storage.ts`) is owned by another plan. Declarations are filtered out of
`listLegalDocuments`, so the register UI, search, Radar's compliance counts and
the operational alerts see exactly what they saw before — a toggle must not
inflate a document count. The reserved prefix is stripped from user input, so a
hand-written reference cannot switch a framework on. When a typed
`complianceSettings` slice lands, move the flag there and keep the declaration
as the evidence record.

**Still open after Phase 1** (the posture names each of these itself, from real
data, rather than hiding them): ROPA, DSAR intake + the statutory clock, subject
access & portability export, retention with automatic expiry, the breach
register with the 72-hour clock, PHI-aware access control and read auditing,
minimum-necessary, and every BAA/DPA.

## Where we are (verified)
- **Legal register exists** — `legalDocuments.ts` (title / category / status / counterparty / effectiveAt / **expiresAt / reminderAt** / companyIds). Radar's **compliance** domain monitors it (12 families: legal-register, expired-records, insurance, contracts, contract-acceptance, tax-records, policy-coverage, audit-readiness…).
- **Consent** — the Aqua Tag tracks cookie consent + writes `website_consent_events`; enquiries carry `consent`/`consentPurpose`/`consentVersion`/`consentCapturedAt`.
- **Erasure** — `clientErasure` (right-to-erasure). Plugin data, person records and identity-resolution reviews are now all covered under a disposition policy; see [plugin-data-erasure](plugin-data-erasure.md). **A reviewer-ready pack exists: [DPO review pack](../../compliance/erasure-dpo-pack.md)** — the data map, what is proven vs. unverified, and 8 open questions for a DPO. It is the first real slice of the ROPA below.
- **Missing:** a GDPR framework, DSAR handling, a data-processing map (ROPA), retention policies, a breach register, the document/evidence *vault*, an **IP/trademark register**, a **unified contracts + NDAs** surface, and anything HIPAA.

## GDPR toolkit (achievable — build first)
- **Records of Processing (ROPA)** — a map of what personal data the app holds, where (the [database dossier](../../workspace/database.md) already documents the tables), the lawful basis, and retention.
- **Consent ledger** — surface the consent the tag already captures (per person/site) as auditable records; lawful-basis tracking.
- **DSAR handling** — subject access / erasure / portability requests: a workflow to receive, fulfil (export a person's data), and **log the fulfilment as evidence**. Reuse `clientErasure` + a data-export.
- **Retention** — per-data-type retention policies + auto-expiry (enquiries, telemetry, messages, recordings).
- **Breach register** — record an incident, what data, who was notified, when (the 72-hour clock), with evidence.
- **Privacy policy / terms / cookie policy** — managed documents, versioned, with the consent version they map to.

## The document & evidence vault (verify, not assume)
Extend the legal register into a **compliance evidence vault**: store the *actual*
documents (DPAs, BAAs, policies, contracts, consents, SOPs) + **verify** they
exist, are current (not expired), and are signed. The posture reads from real
evidence — a control shows **green only when its evidence is present and valid**,
`blind`/`missing` otherwise (same honesty as Radar). This is what lets Ed prove
"I was covered" at a point in time.

## Contracts, NDAs & agreements — all in one place
**Every agreement, findable in one register:** client contracts, **staff /
employment contracts** (from the [staff plan](staff-team-system.md)),
**supplier / partner** agreements, and **NDAs** — plus reusable **templates**.
Each with status, **signatures**, effective/expiry dates, **renewal reminders →
Radar alerts**. Reuse `contractTemplates` + `clientContracts` + the send/accept/
sign flow, unified into **one contracts surface** — the "find everything" Ed
wants, whoever the counterparty (client, staff, supplier).
- **Contracts → deliverables → proof of work** — tie a contract to the work delivered + timestamps, so there's a **defensible record that what was agreed was delivered, when** (reuse the client record ledger + files/deliverables).

## Intellectual Property (IP) register
**Know what you own and its status** — a lapsed trademark or unclear IP ownership
is real, avoidable exposure.
- **Trademarks** — registered marks: registration number, **classes**, **jurisdictions**, **renewal dates**, status (pending / registered / lapsed / opposed), owner.
- **Other IP assets** — copyrights, patents / registered designs, trade secrets, **domains** (with expiry — ties to the Aqua Tag site register), **brand assets** (logos / brand kits — reuse `brandKit`), **licences** (software + content, inbound *and* outbound).
- **IP ownership of delivered work** — for every client engagement, *who owns the IP* of what you delivered (assignment vs. licence), tied to the **contract + deliverables** (section above). So you can **know and prove** the IP position on any job.
- **Renewals + alerts** — expiry/renewal tracked (reuse the legal register's `expiresAt`/`reminderAt`) → **Radar compliance alerts before a mark or domain lapses.**
- Reuse the **legal register** (extend with IP fields) + the **evidence vault** (the actual certificates/registrations, verified — never assumed).

## HIPAA track (⚠ big — only if Ed needs medical data)
**This is not a toggle.** Handling PHI (therapist/insurance clients) requires:
- **BAAs with every subprocessor** that touches PHI — Supabase, Vercel, OpenAI, Resend, Twilio, Meta, Vercel Blob. **None have one by default.** This is the gating reality.
- A **risk assessment**, written **policies/procedures**, workforce training.
- Technical safeguards: encryption at rest + in transit (partial today), **strict access control + audit** of PHI access, minimum-necessary, automatic logoff.
- The app's role: a **HIPAA readiness checklist** that tracks each requirement + its evidence (BAA signed? risk assessment done? access audit on?), and **hard technical controls** for PHI (tighter access, full audit) — and is **honest that it's not "HIPAA compliant" until the legal/BAA layer is real.**

## Phases
1. ~~**The evidence vault + posture**~~ — **posture BUILT** (see above): green only on evidence, gaps named, HIPAA track toggle. The *vault* half (verifying documents are signed, not merely present) is **not** built — the posture is explicit that it has not read any document.
2. **GDPR toolkit** — ROPA, consent ledger, DSAR workflow, retention, breach register, policy documents.
3. **Contracts→deliverables proof.**
4. **HIPAA readiness track** — the checklist + subprocessor/BAA register are **BUILT** (per-company toggle, all controls currently unmet, which is the truthful answer). The **PHI technical controls are NOT** — no PHI marking, no read auditing, no minimum-necessary, no automatic logoff; the track says so.
5. **Client-side** — each client's compliance posture.

## Reuse
`legalDocuments` (extend to the vault) · Radar compliance domain · the consent the tag captures · `clientErasure` + a data-export · `clientContracts` + record ledger · the activity log (audit) · the [database dossier](../../workspace/database.md) (the ROPA data-map is largely written).

## Decisions (Ed)
- **DECIDED 2026-08-20 — GDPR is always on; HIPAA is an optional per-company toggle.** Flip it on for a company serving medical professionals. Built as above.
- ~~Do you actually intend to handle medical records, or is that "someday"?~~ Answered: yes, for at least one company.
- Get a lawyer/DPO to sign off the framework the app tracks — the app surfaces it, a human owns it.

## Non-goals
- **Not claiming compliance** — surfacing posture + evidence + gaps, truthfully.
- Not legal advice — the app organises + evidences; sign-off is human/legal.

## Not done — needs a file this plan does not own

- **The nav entry.** `src/lib/chrome/sidebarLayout.ts` is held by the commander
  (claimed by nine plans). The posture is reachable today only via
  `/portal/agency/company?view=legal`. The entry that would have been added:
  `{ id: "compliance", label: "Compliance", href: "/portal/agency/company?view=legal", icon: "ShieldCheck" }`
  under the Command Centre group, next to the existing company entry.
- **A Radar `data-protection` family.** `radarRuleCatalog.ts` and
  `radarObservations.ts` are owned by this plan, but the catalogue **count
  invariants** live in `scripts/smoke-business-radar.test.ts` and
  `scripts/smoke-radar-classification.test.ts`, which are not — and a new family
  costs +16 checks (12 lenses + 4 evidence). Deliberately not added rather than
  break tests this plan cannot fix. The family would be:
  `["data-protection", "Data protection posture", "GDPR controls with current evidence, and the ones that cannot be seen."]`
  fed from `buildCompliancePostureForAgency` — `met` count as the metric, `blind`
  count as the blind-spot, never a healthy pass.
- **Docs map rows** (`docs/workspace/feature-index.md`, `docs/workspace/api-reference.md`)
  are outside the file map. Rows to add:
  `Compliance posture | src/lib/compliance/compliancePosture.ts + lib/server/compliancePostureSource.ts | /portal/agency/company?view=legal`
  `GET /api/portal/compliance/posture` · `POST /api/portal/compliance/frameworks`.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/server/legalDocuments.ts`
- `src/app/api/portal/company/legal/route.ts`
- `src/app/api/portal/company/legal/content/route.ts`
- `src/app/api/portal/company/legal/upload/route.ts`
- `src/server/clientErasure.ts`
- `src/app/api/portal/clients/[clientId]/erase/route.ts`
- `src/server/contractTemplates.ts`
- `src/lib/clients/clientContracts.ts`
- `src/app/api/portal/contracts/templates/route.ts`
- `docs/compliance/erasure-dpo-pack.md`
- `docs/development/plans/compliance-legal.md`
- `src/app/portal/agency/company/_CompanyWorkspace.tsx`
- `src/engines/data/radar/radarRuleCatalog.ts`
- `src/engines/data/server/radar/radarObservations.ts`
