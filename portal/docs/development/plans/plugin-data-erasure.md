# Plan — Plugin-data erasure hooks

← [todo.md](../TODO.md) · [development.md](../../development.md) · **[DPO review pack »](../../compliance/erasure-dpo-pack.md)**

**Status: P1 REWORK — local/plugin disposition coverage shipped; end-to-end completion is unsafe.** The local/fake-client suite covers the intended sweep, but live failures can still return success after the local client is deleted, the route then cannot normally retry, and the permanent activity message includes `clientName`. See [issues #24](../issues.md). A staged live run and DPO sign-off also remain.
*bigger* than reported: `leads-pipeline`'s `onEraseClient` filtered `contact.clientId`,
which **nothing in the codebase ever writes**, so the hook erased **nothing** — and
because `clientErasure` skips a hook-owned slice wholesale, nothing else swept it
either. A real converted client left **8 traces** of their email (contact row + email
pointer key, **lead row + email/phone pointer keys**, and **4** activity messages).
Both halves are now closed and proven by a test that drives the real
create→convert→promote→erase path and asserts zero trace of the email *or phone*
anywhere in state — a test verified to FAIL against the old code. See Phase 2b-rework
below. Client erasure sweeps *plugin-owned* data and live Supabase per a disposition
policy, but this does **not** make “delete a client + all its data” operationally
complete: hosted failure reporting/retry and audit de-identification remain open. The
finance/deliverable records held for legal defence. Live scrub proven against a
faithful fake Supabase client; a staged live run + DPO sign-off remain before real
clients (see [status.md](../status.md)).

## Where we are
- `server/clientErasure.ts` `eraseClientCompletely` sweeps top-level `PortalState` collections by `clientId`, deletes the client, keeps one audit entry.
- It does **not** touch **per-install plugin data** (`pluginData[installId][key]`) — so leads-pipeline contacts/prospects, ecommerce orders, client-crm records, affiliate/membership rows for that client can survive. (See [issues #7](../issues.md).)

## Erasure disposition policy (Ed's decision, 2026-08-19) ⚖️
Erasure is **not** "hard-delete everything." That over-deletes — it destroys records
you're **legally entitled or obliged to keep**, leaving you unable to defend a claim
(GDPR **Art. 17(3)(e)** — retention for the *establishment, exercise or defence of
legal claims*) or in breach of financial-record retention law. The rule is:

> **Remove the identifying PII the subject is entitled to have removed — but retain a
> minimised, de-identified/pseudonymised, access-restricted, time-boxed record for
> legal defence, and preserve anything held under a legal obligation. Audit the erasure.**

This mirrors the app's existing principle — *"changing what somebody IS must never
destroy what they DID"* — applied to erasure: drop the identity, keep the de-identified
fact that it happened.

**Three dispositions, assigned per data category:**
| Category | Disposition | Rationale |
|---|---|---|
| Raw comms content, marketing PII, contact handles | **DELETE** | Subject entitled to removal; weak/no independent retention basis |
| Enquiries, relationship/lifecycle facts | **ANONYMISE** | Strip PII, keep the de-identified business/funnel record |
| **Finance (invoices/payments), contracts, deliverable proof, dispute/complaint history, the erasure audit** | **RETAIN (legal hold)** | The actual legal-defence shield + statutory finance retention; access-restricted, time-boxed to the claims-limitation period |

**Applied to the live tables (Phase 3):**
- **`brand_enquiries` → ANONYMISE.** Strip the enquirer PII (name/email/message + `metadata.identityResolution.clientId`), keep the de-identified shell (source, timing, that an enquiry existed). Do **not** keep it re-identifiable unless under an explicit legal hold.
- **`inbox_conversations` / `inbox_messages` / `inbox_contact_identities` → DELETE**, leaving only a **no-PII audit stub** (that N conversations existed, dates, erased on whose request). `inbox_channel_connections` are agency-level with no client PII → untouched.
- **Finance / contracts / deliverable proof → MUST NOT be swept.** Confirm `eraseClientCompletely` does not reach these; they're governed by their own retention rules (compliance-legal plan), not by client erasure.

⚠ **Launch-gating + not legal advice.** This is the honest structure of GDPR, not a
DPO's sign-off. Before real clients: get the retention schedule (which categories, how
long) confirmed by a solicitor/DPO. Safe to build to now — all data is Ed's own test data.

## Phases
1. ✅ **Erasure hook contract.** `onEraseClient?(ctx, clientId)` on the plugin manifest (`built-ins/runtime/_types.ts`), resolved like other plugin ports. **DONE.**
2. ✅ **Runtime sweep.** `eraseClientCompletely` calls each installed plugin's hook + a generic `pluginData` clientId value-scan fallback. Client-scoped installs slice-dropped; agency-scoped value-scanned. leads-pipeline `onEraseClient` closes the email-in-key gap. **DONE + runtime-verified.**
2.5. ✅ **Disposition policy (added after Ed's decision).** Per-plugin **`dataDisposition: "delete" | "retain"`** + a top-level `RETAIN_COLLECTIONS`; sweep order **hook › retain › delete**. Guard confirmed the blanket sweep was over-deleting finance/orders/deliverables → now **RETAIN** (`agency-finance`, `fulfillment` wholesale; `ecommerce`/`affiliates`/`memberships` retain-for-now). Audit records disposition per area. **DONE + verified 20/20.** ✅ **2.5c DONE + verified 24/24:** bespoke `onEraseClient` on **ecommerce** (strip order customer PII, keep amounts + payment refs) and **affiliates** (strip `displayName`/`payoutEmail`, keep earnings + Stripe ref; Attribution/Payout already de-identified). **memberships needs no hook** — its `Subscription` embeds no name/email (only a pseudonymous token + Stripe refs), and the member identity lives in top-level `endCustomers` which the sweep deletes. Ed's rule applied: **keep all payment/txn refs** (reconciliation/legal-proof handle), strip only identity PII.
3. 🟡 **Live tables — disposition logic verified only with a fake client; completion contract open.** `brand_enquiries` → anonymise; inbox rows → delete; the injected-client path records per-table errors. The current route nevertheless returns success after errors and cannot normally retry once local deletion has happened.
4. 🔴 **Audit + report requires rework.** The metadata stub is counts/date-span only, but the surviving activity message interpolates `clientName`; the complete audit record therefore contains personal data.
5. ✅ **Original disposition test phase DONE.** The suite covers retained/deleted/hook categories and the successful fake live scrub. That phase remains complete for its stated disposition scope; it does not prove the new operational failure findings below.
6. 🔴 **P1 failure semantics + audit rework.** Require a partial/failed HTTP result when any hosted operation fails, preserve a durable route-level retry after local deletion, and assert absence of `clientName` from the surviving activity record. This phase is open under issues #24.

### 2b-rework ✅ **The hook that erased nothing (2026-08-19)** — the real GDPR fix
**Empirically proven first** (a throwaway probe driving real service calls, not a read):
erasing a client converted through the normal flow left 8 traces of their email.

**Half 1 — stop writing PII.** Activity messages in the leads plugin now name records by
**id**, never email/phone/name: `leadLabel()` (5 sites in `leads.ts`), 3 sites in
`contacts.ts`, 2 in `campaigns.ts`, 3 in `commercial.ts`. The metadata already carried
`leadId`/`contactId`. This install is **agency-scoped**, so its entries carry no
`clientId` and the sweep (clientId-only) can never reach them — which is why PII must
not be written there in the first place. *(`client-crm` doesn't have this bug: it is
client-scoped and stamps `clientId` on every entry.)*

**Half 2 — make the hook FIND the client's people.** Resolution order, reusing what the
app already maintains:
1. **`Lead.convertedClientId`** — stamped by `LeadService.recordConversion` on
   conversion. The explicit, authoritative link. *Chosen over stamping a new
   `Contact.clientId` because it already exists, is written on every real conversion,
   and reaches records created before this fix — a new stamp would reach none of them.*
2. **`clientMatchesLead` / `clientMatchesContact`** — the *same matchers the conversion
   handlers use* to decide "this client IS this lead/contact". This is what reaches a
   client converted straight from a **contact**
   (`convertContactToClientHandler` writes **no back-link at all** — a second instance
   of the same bug, found while fixing the first). Symmetry: whatever the app calls a
   match when converting, erasure calls a match when erasing.
3. `Contact.promotedFromLeadId` → a resolved lead, then canonical-email match.
4. `Contact.clientId` / `Lead.clientId`, kept so anything that ever sets it still matches.

**Dispositions applied** (per the policy above):
| Record | Disposition | Why |
|---|---|---|
| Contact row + `contacts/email/<email>` key | **DELETE** | a contact *is* a contact handle |
| Lead row | **ANONYMISE** (`LeadService.anonymiseForErasure`) | relationship/lifecycle fact — identity dropped, funnel record (source, timing, stage, journey) kept. Emailless leads are already a supported shape (a lead may be captured phone-only). |
| `leads/email/<…>` + `leads/phone/<…>` keys | **DELETE** | PII lives in the **key name** — a value-scan can never reach it |
| Commercial pack | **RETAIN, identity stripped** (`stripIdentityForErasure`) | finance/contract legal hold; same treatment as the ecommerce order hook |

`TenantPort.getClientForAgency` is now declared (the foundation port always implemented
it) so the hook can read the client record — `eraseClientCompletely` runs hooks *before*
deleting it.

**The test drives the real flow.** No raw `pluginData` seeding: `LeadService.upsert` →
`recordConversion` → `ContactService.promoteLead` → `update`, then erase, then assert
**zero trace of the email or phone anywhere in state** (walking every string value *and*
every storage-key name), plus each disposition and idempotency. **Verified to fail
against the pre-fix code** (4/4 new tests red; the old raw-seeded test still passed —
exactly the auditor's finding).

### 2b-rework (b) ✅ **email-sender — the same bug, found by probing the first fix**
A leads campaign emails a **lead**; `EmailMessage.clientId` is unset, so the generic
value-scan can't see the row. If that lead later converts, erasing the client left the
address in **5** places: `to[]`, `idempotencyKey`, `externalRef`, the
`email/idem/<key>` **STORAGE KEY NAME**, and the `Queued email → <address>` log line.

- **No addresses in messages** — `emails.ts` (queued/sent) and `webhook.ts` (delivered)
  now report counts + the message id.
- **`externalRef` keyed by lead id** (`campaigns.ts`) — that ref *becomes* the
  idempotency key name, so an address there is unreachable by any value-based sweep.
- **`onEraseClient` on email-sender** → `EmailService.eraseForAddresses(addresses, clientId)`:
  deletes the row, the idem pointer key, and both index entries for every message
  addressed to the client (**DELETE** — raw comms, the policy's clearest delete
  category, same as the live `inbox_*` scrub). Addresses resolve from `ownerEmail`,
  `metadata.portalLoginEmail`/`clientEmail` and `metadata.linkedContacts[]`, so a
  hand-made client record with no `ownerEmail` still resolves; messages that *do*
  carry `clientId` match too. Idempotent.
- email-sender's vendored `AquaPlugin` now declares `onEraseClient`; its `TenantPort`
  exposes `getClientForAgency`. **Erasure map: `email-sender` = hook, not delete.**
- Test added, **verified to fail without the hook**.
- ⚠ **Out of the erasure worker's named lane** (email-sender isn't in its file list) —
  taken because it is the same launch-gating hole; flagged to the commander.

### 2b-rework (c) ✅ **The whole class, not just the instances**
After the second instance I stopped waiting to trip over a third and swept every
plugin for the shape:

> **agency-scoped + holds a person's PII + no `clientId` on the record** ⇒ invisible to
> the erasure sweep. (Records are usually captured **before** the person is a client, so
> there is no `clientId` to stamp — the ADDRESS is the only link back to them.)

| Plugin | Verdict |
|---|---|
| `leads-pipeline` · `email-sender` | **was broken → fixed** (above) |
| `public-funnel` | **was broken → fixed.** Capture row, `captures/by-email/<email>` **key name**, 2 log messages, **and `actorEmail`**. Hook → `FunnelService.eraseForAddresses` (DELETE — marketing PII). |
| `agency-marketing` | **was broken → fixed.** Its own lead row, `leads/by-email/<email>` **key name**, 3 log messages. Hook → `LeadService.eraseForAddresses` (DELETE). |
| `client-crm` | **clean** — client-scoped and stamps `clientId` on every entry. This is precisely why it never had the bug. |
| `ecommerce` · `affiliates` | **clean** — hooks already strip PII, keep payment refs. |
| `memberships` · `agency-finance` · `fulfillment` | **RETAIN** by policy (legal hold). |
| `agency-hr` | **out of scope by design** — holds the agency's *employees*, not clients. |
| `bos-auth-gate` · `website-editor` | **clean** — no stored subject PII. |

**Contract change — `ErasureSubject` (additive, backward compatible).** Four hooks were
each re-deriving "who is this client" through their own tenant port. The sweep now
resolves it **once**, before anything is deleted, and hands it to every hook:

```ts
onEraseClient?: (ctx, clientId, subject?: ErasureSubject) => Promise<void>
//  subject = { emails[], name?, metadata }  ← ownerEmail + portalLoginEmail/clientEmail
//                                             + metadata.linkedContacts[]
```
The client record is deleted moments after the hooks run, so this is a hook's only
chance to know the person behind the id. `ecommerce`/`affiliates` ignore the new
argument and are unaffected; the per-plugin `TenantPort` additions were reverted.

**`actorEmail` is a second PII surface** — a *field* on every activity entry, not just
the message. `public-funnel` set it to the lead's address on both capture log sites; a
message-only fix would have left it. Found by walking real state after an erase, not by
reading. Fleet-wide sweep: those two sites were the only ones.

**Honestly still open (not fixed here):**
- **Historical activity entries** written *before* this fix still contain emails. No code
  path writes them any more, but Ed's existing dev state holds some. A one-off scrub
  would be a data migration, not a code change.
- ~~`Person` records are unreachable by erasure.~~ ✅ **RESOLVED** — Ed's
  anonymise-if-orphaned decision is implemented and tested (see the ⚖️ section below).
- **`PersonOrganisationLink.reason` is free text** (e.g. *"Shares the domain
  acme.example"*), so an orphaned person's own email domain can persist in a link
  *rationale*. Not in Ed's list, so **not** touched — the link itself is a fact worth
  keeping and I'm not extending a precise decision on my own. Flagged for Ed: clear
  `reason` on orphan-anonymise too? (A domain is weaker than an address, and the link's
  `organisationId`/`status`/`decidedBy` carry the fact without it.)
- **Prospects** have no link to a client at all, so client erasure cannot reach them;
  their log messages still name the scouted company. Separate concern.
- **`agreementBody` / signed-document blobs** on a retained commercial pack may name the
  recipient in free text. Deliberately kept — that *is* the signed contract.


**Disposition-sweep checkpoint:** local/plugin behaviour was runtime-verified in
memory and the live-query shape was exercised with a fake client. **Current P1
override:** end-to-end erasure is not code-complete because failure can be returned
as success, retry is stranded and the audit keeps `clientName`. See issue #24 and
[status.md](../status.md).

### ⚖️ Person records — Ed's decision (2026-08-19): **ANONYMISE IF ORPHANED** — ✅ **IMPLEMENTED + TESTED**

`Person` (`src/server/types.ts` `Person`, store `src/server/persons.ts`) has **no `clientId`**, so
neither the generic `record.clientId === clientId` sweep nor `pruneClientId` can reach it — a
client's email/phone survives erasure intact. Persons are created by the **website-enquiry intake**
path (`upsertPerson` in `websiteEnquiries.ts`, the classification route, `operationalAlerts.ts`),
so this hits any client whose relationship began as an enquiry.

Deleting the Person is wrong: `PersonFacets.clientIds` is an **array** (one buyer may hold several
client workspaces) and `PersonClassification` includes standalone roles (`supplier`,
`partnership`, `marketer`) that carry their own lawful basis. Doing nothing leaves real PII behind.

**The rule — the same split `brand_enquiries` already uses (and the auditor already passed):**

1. **ALWAYS unlink.** Remove the erased `clientId` from `facets.clientIds`; clear `relationshipId`
   if it pointed at that client's relationship. This happens for every Person, unconditionally.
2. **THEN strip PII only if the Person is orphaned** — i.e. ALL of:
   - `facets.clientIds` is now empty (no other client workspace), AND
   - `classification` is not a standalone role (`supplier` / `partnership` / `marketer`).
   When orphaned, clear the identifiers: `emails`, `phones`, `name`, `company`, `jobTitle`,
   `notes`, `customFields`, and the free text inside `record[]` entries.
   **KEEP:** `id`, `agencyId`, `facets` (minus the erased client), `classification`,
   `classificationHistory`, timestamps — so *what they did* survives, de-identified.
3. **If NOT orphaned**, keep their details untouched. They have another lawful basis; only the
   link to the erased client goes.

Why this shape: it satisfies Art.17 (identifiers gone once the only basis was the erased client)
without breaking the standing product rule that **changing what somebody IS must never destroy
what they DID** — facets and history are retained, just de-identified.

**✅ Implemented** — `anonymiseOrphanedPersons` in `server/clientErasure.ts`, inside the same
`mutate` as the rest of the sweep. `persons` is now a DEDICATED collection (skipped by the generic
pass, and excluded from `previewClientErasure` since a person is anonymised in place, never
deleted). The audit records `unlinked:persons` / `anonymised:persons` — counts only, never a name.

**✅ Tested, both directions** (5 cases, all seeded through the real `upsertPerson` /
`addPersonRecord` API, never a raw state write):
- orphaned enquirer → `emails`/`phones`/`name`/`company`/`jobTitle` gone, and the email + phone
  are absent from the WHOLE state; `facets.enquiryIds`, `classification` and
  `classificationHistory` kept
- person holding a **second** `clientIds` entry → details **intact**, only the link dropped
- person classified **`supplier`** → details **intact**, only the link dropped
- record entries → the meeting/call survives with its `kind` and `at`; `summary`/`body`/
  `location`/`outcome` cleared
- audit → counts only, no person named

Each direction was verified to FAIL against a broken implementation: with the pass removed, the
orphan cases go red; with the orphan guard removed (naive strip-always), the supplier and
second-workspace cases go red. A one-sided test would have passed both bugs.

⚠ Still needs DPO/solicitor sign-off on the retention schedule before real clients — this settles
the engineering policy, not the legal review.

## Reuse
`_runtime.ts` per-install storage model, `pluginStorage.ts`, the existing enquiry hard-delete path (`website-enquiries/erase`) for the live-table pattern.

## Decisions (Ed)
- Which plugins actually hold client data to hook first (leads-pipeline, ecommerce, client-crm, affiliates, memberships).
- ✅ **RESOLVED (2026-08-19): hard-delete vs anonymise → neither-blanket; use the disposition policy above.** `inbox_*` → delete + no-PII stub; `brand_enquiries` → anonymise; finance/contracts → retain (must not be swept). Needs DPO/solicitor sign-off on the retention schedule before real clients.

## Done when (runtime-verified) — ✅ **MET, by one capstone test**
`smoke-client-erasure.test.ts` → *"CAPSTONE: erasing a client who has everything"*. One client
carrying **every** surface at once — funnel capture, marketing lead, lead, promoted contact,
campaign email, canonical Person, commercial pack, retained finance, live inbox rows and a
`brand_enquiries` row — erased in a single call, asserting the whole policy together:

- **no identifier anywhere** — email, phone and name absent from the entire state (values *and*
  storage-key names) and from the live tables
- **the de-identified record survives** — the lead keeps its `source`, the commercial pack keeps
  its `totalCents` with `recipientEmail` stripped, the Person keeps facets + classification
- **finance RETAINED** untouched, `retained:agency-finance` recorded
- **all four hooks ran** (`hook:leads-pipeline` · `email-sender` · `public-funnel` ·
  `agency-marketing`) and `anonymised:persons` is recorded
- **the audit proves it happened and names nobody**

Guarded against a vacuous pass: every surface is asserted to exist — and the email asserted to BE
in state — *before* the erase. Verified to catch a regression (removing one plugin's hook turns it
red). A second case covers a client record with **no `ownerEmail`**, where the address-matching
hooks have nothing to match on and the leads hook must resolve through `convertedClientId` instead.

The original criteria, for reference:
Erase a client that has plugin data + inbox history → verify the **disposition policy** held:
**no identifying PII** remains for that `clientId` in pluginData, `inbox_*`, or `brand_enquiries`;
enquiries survive **anonymised** (de-identified shell, no PII); the **no-PII audit stub** proves
the inbox sweep; and **finance/contract records are untouched**. Behavioural test asserts each
disposition (deleted / anonymised / retained), not just "zero rows".

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/server/clientErasure.ts`
- `src/server/persons.ts`
- `src/built-ins/runtime/_types.ts`
- `src/app/api/portal/clients/[clientId]/erase/route.ts`
- `src/app/api/portal/website-enquiries/erase/route.ts`
- `scripts/smoke-client-erasure.test.ts`
- `src/built-ins/modules/leads-pipeline/index.ts`
- `src/built-ins/modules/leads-pipeline/src/server/leads.ts`
- `src/built-ins/modules/leads-pipeline/src/server/contacts.ts`
- `src/built-ins/modules/leads-pipeline/src/server/campaigns.ts`
- `src/built-ins/modules/leads-pipeline/src/server/commercial.ts`
- `src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts`
- `src/built-ins/modules/email-sender/index.ts`
- `src/built-ins/modules/email-sender/src/server/emails.ts`
- `src/built-ins/modules/email-sender/src/server/webhook.ts`
- `src/built-ins/modules/email-sender/src/lib/aquaPluginTypes.ts`
- `src/built-ins/modules/public-funnel/index.ts`
- `src/built-ins/modules/public-funnel/src/server/services.ts`
- `src/built-ins/modules/public-funnel/src/lib/aquaPluginTypes.ts`
- `src/built-ins/modules/agency-marketing/index.ts`
- `src/built-ins/modules/agency-marketing/src/server/leads.ts`
- `src/built-ins/modules/agency-marketing/src/lib/aquaPluginTypes.ts`
- `src/built-ins/modules/ecommerce/index.ts`
- `src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes.ts`
- `src/built-ins/modules/affiliates/index.ts`
- `src/built-ins/modules/affiliates/src/lib/aquaPluginTypes.ts`
- `src/built-ins/modules/memberships/index.ts`
- `docs/compliance/erasure-dpo-pack.md`
- `docs/development/plans/plugin-data-erasure.md`
