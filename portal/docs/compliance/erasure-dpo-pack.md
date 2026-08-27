# Right-to-erasure — review pack for a DPO / solicitor

← [development.md](../development.md) · [erasure plan](../development/plans/plugin-data-erasure.md) · [compliance & legal plan](../development/plans/compliance-legal.md)

**Prepared:** 2026-08-20 · **Subject:** what AquaCRM actually does when a client is
erased (UK GDPR Art. 17) · **Prepared by:** the engineering side, from the code.

> **Critical correction, 2026-08-24:** the disposition rules below describe the
> intended/local sweep, but the end-to-end operation is **not currently reliable**.
> Hosted-table failures are collected and still returned by the API as success;
> the local client is already gone, so the normal route cannot retry; and the
> surviving activity message includes the client's name. Sections 1, 5, 6 and 10
> below carry the corrected operational limits. Do not use this pack as evidence
> that a production erasure completed.

---

## 0. What this document is — and is not

**It is** a truthful, evidence-backed description of what the system *does* today,
written so a reviewer can check it rather than take our word for it. Every claim
below is either (a) enforced by an automated test we can run in front of you, or
(b) explicitly marked as unverified.

**It is not** a claim of compliance, and it is not legal advice. The software cannot
make anyone compliant — it can provide controls and evidence. Deciding whether the
retention choices below are lawful, and for how long, is exactly what we are asking
you to rule on.

> This mirrors the project's own standing rule: *never assume or claim compliance;
> verify from real evidence.*

**Current status, which matters for your risk assessment:** the product is
**pre-launch with no real clients**. All data in the system today is the founder's
own test data. Nothing here has yet been applied to a real data subject.

---

## 1. How an erasure happens

| | |
|---|---|
| **Trigger** | A manual action in the app. There is no automatic or scheduled erasure. |
| **Who can do it** | The agency **owner** only (`requireRole("agency-owner")`). Staff, managers and freelancers cannot. |
| **Confirmation** | The owner must type the client's name back exactly; a mismatch is rejected before anything is touched. |
| **Reversibility** | **None.** This is a hard erasure, not an archive. There is no undo in the application. |
| **Record kept** | One audit entry survives the erasure (§5). |
| **Unit of erasure** | One **client workspace**. A person may hold more than one — see §4 on how that interacts. |

**Completion warning:** the route currently answers `{ok:true}` even when the
hosted-table scrub reports errors. Because the local client row has already been
deleted, a normal retry returns “not found.” The UI/API result therefore cannot be
treated as proof that every system completed the erasure.

**Not built yet (process, not code):** there is no DSAR intake workflow — no place to
log that a request was received, verify the requester's identity, or track the
statutory response clock. Today the owner acts on a request out-of-band and presses
the button. See §8.

---

## 2. The disposition policy

Erasure is deliberately **not** "delete everything". Blanket deletion would destroy
records that may lawfully or necessarily be kept, leaving the business unable to
defend a claim or in breach of financial-record retention duties. Three dispositions
are assigned per category:

| Disposition | Meaning | Applied to |
|---|---|---|
| **DELETE** | Removed outright | Raw comms content, marketing PII, contact handles |
| **ANONYMISE** | Identifiers stripped; the de-identified business/funnel record kept | Enquiries, relationship & lifecycle facts, canonical person records |
| **RETAIN** | Excluded from the sweep, kept intact | Finance, contracts, deliverable proof, the erasure audit itself |

The stated basis for the RETAIN set is **Art. 17(3)(e)** — retention for the
establishment, exercise or defence of legal claims — plus statutory financial-record
retention. **Whether that basis holds, and for how long, is question Q1 in §7.**

The policy also honours a standing product rule: *changing what somebody IS must never
destroy what they DID.* That is why anonymise keeps the shape of the record (that an
enquiry happened, that a meeting took place) while removing who it was.

---

## 3. What happens to each category of personal data

This is the substantive table. "Verified" means an automated test asserts it and that
test has been checked to **fail** if the behaviour regresses.

### 3a. In the application's own store

| Data | Contains | Disposition | Verified |
|---|---|---|---|
| Client record (name, owner email, metadata) | Direct identifiers | **DELETE** | ✅ |
| Any record stamped with the client id (portal connections, tasks, comms, end-customers, …) | Varies | **DELETE** — a generic sweep, so new record types are covered automatically | ✅ |
| Activity log entries for that client | Actor, message | **DELETE** | ✅ |
| **Canonical person record** (`Person`) | Emails, phones, name, company, job title, notes, meeting/call notes | **ANONYMISE IF ORPHANED** — see §4 | ✅ both directions |
| **Identity-resolution reviews** | Enquirer name, email, phone, company | **ANONYMISE**, split by whether the enquirer *was* the erased client | ✅ both directions |
| Deliverable milestones | Delivery record | **RETAIN** | ✅ |

### 3b. In plugin-owned storage

Each plugin declares how its own data is treated. Several hold personal data that is
captured **before** the person is a client, so the record carries no client id at all —
those are matched on the person's own contact details instead.

| Plugin | Holds | Disposition | Verified |
|---|---|---|---|
| Leads pipeline | Contact record + email-keyed index | **DELETE** | ✅ |
| Leads pipeline | Lead record (the funnel history) | **ANONYMISE** — identity stripped, source/timing/stage/journey kept | ✅ |
| Leads pipeline | Commercial pack (invoice + signed agreement) | **RETAIN, identity stripped** | ✅ |
| Email sender | Messages sent to the person, incl. an email-keyed idempotency index | **DELETE** | ✅ |
| Public funnel | Health-check / tool captures, email-keyed index | **DELETE** | ✅ |
| Agency marketing | Its own lead store, email-keyed index | **DELETE** | ✅ |
| E-commerce | Orders | **RETAIN, customer identity stripped, payment references kept** | ✅ |
| Affiliates | Affiliate record | **RETAIN, identity stripped, earnings + payment reference kept** | ✅ |
| Memberships · Agency finance · Fulfilment | Subscriptions, invoices, delivery proof | **RETAIN** (legal hold) | ✅ |
| Client CRM | Client-scoped contacts | **DELETE** (whole slice) | ✅ |
| HR / people | The agency's **own employees and applicants** | **Not in scope** — they are not the client's data subjects and have their own basis | — |

### 3c. In the hosted database (Supabase)

| Table | Disposition | Verified |
|---|---|---|
| `inbox_conversations`, `inbox_messages`, `inbox_contact_identities` | **DELETE**, leaving a no-PII stub (how many, over what dates) | ⚠️ against a faithful **fake** database, not a live run — see §6 |
| `brand_enquiries` | **ANONYMISE** — the client link is always dropped; the enquirer's details are stripped only where identity resolution had resolved them **as** the erased client | ⚠️ same |
| `inbox_channel_connections` | Untouched — agency-level, no client PII | ⚠️ same |
| Finance / contract / deliverable tables | **Not swept** — confirmed by test that the sweep cannot reach them | ✅ |

---

## 4. The two judgement calls worth your attention

**(a) A person can outlive the client.** A `Person` is the canonical human behind a
relationship. One person may hold **several** client workspaces, and may also be on
file as a **supplier, partner or marketer** — a basis that has nothing to do with any
client. So erasing one client workspace applies this rule:

1. **Always unlink** — the erased client is removed from that person's record,
   unconditionally.
2. **Then strip their identifiers only if that leaves them orphaned** — no other
   client workspace **and** not one of those standalone roles.
3. **Otherwise their details are left alone**, because another basis still applies.

What is kept when they *are* anonymised: the record's identity is gone (emails,
phones, name, company, job title, notes, and the free text of meetings and calls),
while the de-identified facts survive — that meetings happened and when, which
enquiries existed, how they were classified and the history of that classification.

**Is this the right line? That is question Q2 in §7.**

**(b) Enquiries are anonymised, not deleted.** An enquiry that resolved to the erased
client has its enquirer details stripped but survives as a de-identified shell (that an
enquiry arrived, from what source, when). An enquiry from a *different* person that was
merely matched against this client keeps their own details; only the link is removed.
**Question Q3 in §7.**

---

## 5. The evidence trail left behind

One activity record survives every erasure. It records the actor, time, client id,
counts and per-area dispositions. Its metadata carries hosted-table counts/errors.

**Current defect:** the human-readable activity message interpolates the original
`clientName`. The permanent audit is therefore not de-identified, despite older
tests and comments asserting that it names no person. Until that is removed and
behaviourally tested at the activity-record boundary, the audit must be treated as
retaining personal data.

**Gap:** the audit records *what the system did*. It does not record *why* — who
requested the erasure, how their identity was verified, or when the request came in.
That is the DSAR workflow in §8.

---

## 6. Limits of the evidence — read this before relying on the table

We would rather understate this than oversell it.

1. **Failure is reported as completion and is not normally retryable.** Per-table
   hosted failures are caught into `live.errors`; the route still returns
   `{ok:true}` after the local client has been deleted. A durable partial/failed
   job record, truthful response and retry mechanism do not exist.
2. **The hosted-database scrub has never been run against the live database.** It is
   proven against a faithful fake that records the same calls. We have deliberately not
   tested a destructive operation against real records. **A staged run against a
   throwaway seeded client is outstanding** and should happen before any real client
   exists.
3. **Backups and point-in-time recovery are not addressed.** Erasing a row does not
   purge it from database backups or snapshots. We have not established what the
   retention window on those is. **Question Q6.**
4. **Records created before 2026-08-19 may still contain addresses in internal log
   messages.** Several components used to write a person's email into their own activity
   messages; that is fixed at source, but historical entries in the existing (test) data
   still carry them. A one-off clean-up has not been run. No real client data is
   affected, because there are no real clients yet.
5. **Third-party copies are out of scope of the button.** Anything already sent to a
   sub-processor (§9) is not reached by this erasure. **Question Q5.**
6. **One known residue:** where the system suggested linking a person to an organisation,
   it stores a short rationale in free text, which can quote the person's own email
   domain. We left it in place rather than extend the policy on our own initiative.
   **Question Q4.**

---

## 7. Decisions we are asking you for

| # | Question | Why it matters |
|---|---|---|
| **Q1** | Is the **RETAIN** set (finance, contracts, deliverable proof, erasure audit) correctly justified under Art. 17(3)(e) and financial-record retention — and **for how long**? What should the time-box be, after which even those are purged? | Today RETAIN has no expiry. Indefinite retention is the weakest point in this design. |
| **Q2** | Is **anonymise-if-orphaned** the right treatment for a canonical person, or should an erasure request delete the person outright even when they hold another workspace or a supplier role? | Determines whether we are under- or over-deleting for people who wear two hats. |
| **Q3** | Is keeping a **de-identified enquiry shell** acceptable, or must the whole enquiry go? | Same question for the funnel/lead history. |
| **Q4** | Should the organisation-link **rationale text** be cleared too (§6.5)? | A domain is weaker than an address, but it is derived from one. |
| **Q5** | What must happen to data already held by **sub-processors** (§9) on an erasure — and do we have the DPAs to require it? | The button does not reach them. |
| **Q6** | What is required for **backups / point-in-time recovery**, given a restore would resurrect erased records? | Common regulator question; currently unaddressed. |
| **Q7** | What **response timeframe and identity-verification standard** should the DSAR process meet, so we build the workflow to it? | The workflow is unbuilt; we would rather build it to your spec than guess. |
| **Q8** | Is a **person's own record** (as opposed to a client's) in scope for the same button? Today erasure is per client workspace. | Affects people who never became a client — leads, enquirers, funnel captures. |

---

## 8. Known gaps beyond erasure

These are tracked in the [compliance & legal plan](../development/plans/compliance-legal.md)
and are **not built**: a Records-of-Processing map (ROPA), a DSAR intake and fulfilment
workflow (including subject **access** and **portability**, not just erasure), automated
retention expiry, and a breach register with the 72-hour clock. A legal-document
register and cookie-consent capture do exist today.

**Since 2026-08-20 these gaps are visible in the product, not only in this document.**
A compliance posture at `/portal/agency/company?view=legal` lists each control, its
status, and — for anything not evidenced — what is still missing, built from real data
rather than assertion. Every gap named in this pack appears there, including that the
hosted-database scrub has never been run for real (§6.1), that the questions in §7 are
unanswered, and that nobody has signed this framework off. An automated test fails if
the number of open questions in §7 drifts from what the product reports, so the two
cannot quietly disagree. The posture also carries the optional per-company **HIPAA
readiness track**; switching it on states plainly that it confers nothing.

---

## 9. Sub-processors referenced by the code

Listed so you can check the paperwork. This is what the codebase integrates with — not
a statement that each is contracted or live.

| Processor | Used for | Notes |
|---|---|---|
| **Supabase** | Primary hosted database (enquiries, inbox, consent events) | Holds the personal data in §3c |
| **Vercel** | Hosting, and blob storage for uploaded media | Published media is content-addressed; see the note on unpublishing below |
| **Stripe** | Payments | TEST mode only at time of writing |
| **Postmark / SMTP** | Outbound email | Message content leaves the system on send |
| **OpenAI** | Assistant features | Requires a key to be configured; not enabled by default |

**Related known limitation:** unpublishing a web page does not currently retract media
already pushed to public storage, because those files are shared by content hash. If
published media ever carried personal data, "unpublish" would not erase it.

---

## 10. How to verify any of this yourself

The erasure suite contains extensive automated coverage of the local disposition
rules and successful fake-Supabase path. That coverage does **not** currently
prove truthful route completion, retry after a hosted failure, or removal of the
client name from the surviving activity message. The prior “27 tests prove the
behaviour above” wording was therefore too broad. Existing tests drive the **real**
creation paths — capturing a lead, converting them to a
client, sending them a campaign email, resolving their identity — and then assert on the
**entire** stored state afterwards, searching for the person's email, phone and name in
every stored value *and* in every storage key name.

Two disciplines are worth knowing about, because they are what makes the suite
meaningful rather than decorative:

- **Every test was checked to fail against the broken code.** A test that passes both
  before and after a fix proves nothing. Earlier versions of this feature were twice
  declared complete on the strength of tests that did exactly that.
- **Both directions are asserted.** For every rule that strips data, there is a paired
  test that a person who should be *left alone* — a supplier, someone holding a second
  workspace, a separate enquirer — comes through untouched. Over-deletion is a fault too.

A single "capstone" test erases one client who has every kind of record at once and
asserts the whole policy in one go.

To run them: `PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/smoke-client-erasure.test.ts`

---

*Questions or corrections: this document should be updated whenever the erasure
behaviour changes — the engineering plan it summarises is
[plugin-data-erasure.md](../development/plans/plugin-data-erasure.md).*
