# The two blockers, with the homework already done

**Written 2026-08-27.** Ed's blockers are decisions and credentials, not code —
but "it's blocked on you" is a poor handover if it leaves you to work out *what*
you're deciding. This does that part.

Two things are in here:

1. **The Supabase cutover**, traced through the actual login route rather than
   described. It contains one fact that changes the launch plan.
2. **The privacy-notice text**, drafted in full, with your decisions marked
   `[DECIDE]` and nothing invented.

---

## 1. Supabase — what the login route actually requires

Traced through `src/app/api/auth/login/route.ts`, not assumed.

### The fact that changes the plan

**Existing passwords cannot be migrated.** Line 249 calls
`supabase.auth.signInWithPassword({ email, password })`. Supabase Auth holds the
password; our own scrypt hashes are never consulted. There is no code path that
falls back to them.

So this is not a data copy. **Every user has to set a new password**, through an
invite or reset flow, on the day you cut over. That is a communication task with
a date on it, not a script — and it is much better known now than discovered on
launch morning with clients waiting.

### What must exist, per person, before they can sign in

The route checks four things in order. All four must line up:

| # | Requirement | Where it lives | What happens if missing |
| --- | --- | --- | --- |
| 1 | A **Supabase Auth user** with that email and a password | Supabase | 401 "Email or password is incorrect." |
| 2 | A **`profiles` row**, `id` = the Supabase auth user id, `role` ∈ `owner` \| `staff` \| `client` | Supabase, `public.profiles` | Treated as no role; internal cross-check at step 4 is skipped |
| 3 | A **portal user record** for that email | our own store — you already have these | 403 "not been provisioned in AquaCRM yet" (or "not attached to a client portal") |
| 4 | **Role agreement**: if `profiles.role` is `owner`/`staff`, our record's role must start with `agency-` | both | 403 "Account access is not configured correctly." |

Plus: the user's agency must still exist (`getAgency`), or 403 "not attached to
an active workspace."

### The three values

Without these, `requireSupabasePublicConfig()` throws and **the login route
cannot run at all** — this is why nobody can sign in, not merely why data is
missing:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only.** A `NEXT_PUBLIC_` prefix on this
  one would publish a key that bypasses row-level security.

### The `profiles` table

The route reads exactly two columns, `id` and `role`:

```sql
create table if not exists public.profiles (
  id   uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'staff', 'client'))
);

alter table public.profiles enable row level security;

-- A person may read their own row. Nothing else is needed by the login route.
create policy "profiles are self-readable"
  on public.profiles for select
  using (auth.uid() = id);
```

`[DECIDE]` whether anything other than the login route needs to read `profiles`.
If not, leave the policy exactly this narrow.

### Role mapping

Our roles are finer-grained than Supabase's three. The only rule the code
enforces is the one at step 4, so:

| Our role | `profiles.role` |
| --- | --- |
| `agency-owner` | `owner` |
| `agency-manager`, `agency-staff` | `staff` |
| `client-owner`, `client-staff`, `end-customer` | `client` |
| `freelancer` | `[DECIDE]` — `staff` would fail step 4 (their role does not start with `agency-`), so this must be `client` or left absent |

**That freelancer row is a real trap.** Marking a freelancer as `staff` in
Supabase locks them out with "Account access is not configured correctly", and
the message will not tell you why.

### Suggested order on the day

1. Create the project; put the three values in the environment.
2. Create `profiles` with the SQL above.
3. Create Supabase Auth users for everyone who needs access — start with
   **yourself only**, and prove the whole chain end to end before inviting
   anybody else.
4. Insert their `profiles` rows using the mapping.
5. Sign in as yourself. Then walk one client through it.
6. Only then invite the rest.

**Do not skip step 3's "yourself only".** Four independent things have to agree
per person; finding that out on your own account costs minutes, finding it out
on twenty accounts costs a day.

---

## 2. Privacy notice — drafted, with your decisions marked

The current notice (`public/aquacrm-site/privacy/index.html`, last updated
7 August 2026) is good on what it covers and silent on six things UK GDPR
Article 13 requires. Below is text you can paste, once you have settled the
`[DECIDE]` items. **I have not written these into the live page**, because every
one of them asserts a fact about your business that I would be inventing.

### 2a. Lawful basis — Art 13(1)(c)

> **Why we are allowed to hold this**
>
> When you send an enquiry, we process your details under `[DECIDE: "our
> legitimate interest in responding to enquiries about our services" OR "the
> steps necessary before entering a contract with you"]`. Where we send you
> marketing you did not ask for, we rely on your consent, which you can withdraw
> at any time.

`[DECIDE]` — legitimate interests is the usual choice for an enquiry form and
needs a balancing test on file; contract-preliminary is cleaner where the
enquiry is genuinely about buying.

### 2b. Retention — Art 13(2)(a)

> **How long we keep it**
>
> Enquiries and the messages attached to them are kept for `[DECIDE: a period,
> e.g. "24 months from our last contact with you"]`, after which they are
> deleted. Records we are required to keep for tax or accounting purposes are
> held for six years, as the law requires.

`[DECIDE]` — a period, or the criteria you use to decide one. "As long as
necessary" is not sufficient under Art 13(2)(a).

### 2c. The ICO — Art 13(2)(d), currently absent entirely

> **If you are unhappy with how we have handled your information**
>
> Please tell us first at edwardhallam07@gmail.com so we can put it right. You
> also have the right to complain to the Information Commissioner's Office, the
> UK's data protection regulator, at ico.org.uk or on 0303 123 1113.

No decision needed. This one is simply required and simply missing.

### 2d. The rest of the rights — Art 13(2)(b)

The notice offers access, correction, deletion and withdrawal. It should also
name:

> You can also ask us to **restrict** how we use your information while a
> question about it is resolved, **object** to processing we carry out under
> legitimate interests, and receive a copy of information you gave us in a
> portable electronic format.

### 2e. Where the data lives — Art 13(1)(f)

> **Where your information is stored**
>
> Enquiries and consent records are stored in our Supabase project, hosted in
> `[DECIDE: the region, e.g. "London (United Kingdom)"]`. `[IF the region is
> outside the UK, add: "This means your information is transferred outside the
> UK. That transfer is covered by [DECIDE: the UK International Data Transfer
> Addendum / adequacy regulations], and you can ask us for a copy of those
> safeguards."]`

`[DECIDE]` — check the region in the Supabase dashboard before writing this.
**If it is not in the UK or an adequate country, this is not optional wording**
— an undisclosed international transfer is one of the more commonly enforced
failures.

### 2f. Who else sees it — Art 13(1)(e)

> **Who else handles your information**
>
> We use a small number of service providers who process information on our
> behalf and only on our instructions: `[DECIDE: the live list — likely Supabase
> (database and sign-in), Resend (email), Stripe (payments), Vercel (hosting),
> Sentry (error monitoring)]`. We do not sell your information or share it for
> anyone else's marketing.

`[DECIDE]` — list only what is actually configured on launch day. Naming a
processor you do not use is its own inaccuracy.

### 2g. The one that is not a drafting job

The notice currently says **"Form field values are never included in
telemetry."** As set out in the launch document, the Aqua Tag captures field
values and sends them to `/api/public/form-capture`, with no consent gate on
that path.

**No wording fixes this.** Either the behaviour changes to match the sentence,
or the sentence changes to match the behaviour — and if it is the latter, the
clients whose sites carry the tag need the same disclosure in *their* notices,
because their visitors have never seen yours. The three options are in the
launch document under D10.

---

## What I have deliberately not done

- Not edited the live privacy notice. Publishing a lawful basis or a retention
  period I invented would be worse than the gaps.
- Not created anything in Supabase, and not generated or entered any key.
- Not changed the Aqua Tag's capture behaviour, because narrowing it silently
  could break enquiry enrichment you rely on, and widening the notice instead is
  your call.

## Cutover blast radius — measured 2026-08-28

> Re-measure any time with `node scripts/supabase-cutover-preflight.mjs`
> (read-only; `--show-missing` names the addresses that need action). The
> numbers below came from it.

Read-only against the live project. Emails compared as SHA-256 hashes, so the
overlap is counted without either list of addresses being read out.

```
portal users (.data/portal-state.json)     2   (both agency-owner, both with scrypt hashes)
Supabase Auth users                        3   (all three have an email/password identity)
present in both                            1
portal users with NO Supabase Auth account 1   ← cannot sign in after cutover
Supabase Auth users with no portal record  2   ← authenticate, but have no role or agency
```

**This is much smaller than "everyone sets a new password" implied.** Two
concrete actions, not a migration:

1. **One portal user has no Supabase Auth account.** Create it, or they are
   locked out the moment `signInWithPassword` becomes the only path.
2. **Two Supabase Auth accounts have no portal record.** They would authenticate
   and then resolve to no role and no agency. Decide whether each is a real
   person who needs a portal user, or a leftover to delete.

> **A wrong reading, caught before it was written down.** The admin LIST
> endpoint returns `identities: null` — not an empty array — so a first pass
> concluded **0 of 3 users have a password identity**, which would have meant
> nobody could sign in at all. Fetching each user individually expands
> `identities` properly: **all three have `email`.** The list endpoint simply
> does not include them.
>
> The tell was `typeof u.identities === "object"` while `Array.isArray` was
> false — `typeof null` is `"object"`, and a `?? []` fallback then silently
> produced an empty list that looked like a finding. Same shape as the RLS
> zero: **an absent value and an empty one are not the same thing, and only one
> of them is evidence.**

### 2f. The form-field sentence — the one that is currently untrue

The live notice says:

> Form field values are never included in telemetry.

The Aqua Tag reads `field.value` (and a `<select>`'s option text) and sends it.
`smoke-privacy-notice-truth` pins both halves so this cannot drift further.

**Three ways out, and the sentence each one needs.** Pick a row; the wording is
written so the decision is a choice rather than a drafting job.

---

**Option 1 — GATE IT.** Add `permitted("analytics")` to the capture path, so it
behaves like every other event. The sentence then becomes true *after consent
is declined*, but not before, so it still needs rewording:

> Form field values are only included in telemetry once you have accepted
> analytics cookies. If you decline, we record that a form was submitted and
> nothing you typed into it.

*Cost:* you lose enquiry enrichment from visitors who decline. *Effort:* one
condition. *Risk:* silently changes what arrives in the inbox — check that
nothing downstream depends on those values before shipping it.

---

**Option 2 — NARROW IT.** Capture field names and labels but not values. The
original sentence becomes literally true and can stay exactly as written:

> Form field values are never included in telemetry.

*Cost:* you keep "which form, which page, how far they got" and lose the
contents. *Effort:* return `""` from the value readers in `aquaTagSource.ts`.
*Risk:* lowest of the three — the sentence you have already published becomes
accurate, with no new legal assertion.

---

**Option 3 — JUSTIFY IT.** Keep the behaviour and describe it accurately:

> **What we collect from forms**
>
> When you submit a form on one of our sites, we receive what you typed into
> it, so that we can answer you and so the enquiry reaches the right person.
> We process this under `[DECIDE: "our legitimate interest in responding to
> enquiries" / "steps taken at your request before entering a contract"]`.
> Fields marked as passwords are never read, and forms can be excluded
> entirely by their owner.

*Cost:* none to behaviour. *Effort:* wording only. *Risk:* highest — it asserts
a lawful basis, which is a solicitor's call, and it must also appear in **your
clients' notices**, because the Tag runs on their sites where visitors have
never seen yours.

---

> **Whichever you choose, the client-side half is not optional.** The Tag runs
> on client websites keyed by `siteKey`/`propertyId`. A visitor filling in a
> form there has no relationship with AquaCRM and has never seen this notice.
> Options 1 and 2 make that mostly moot by collecting less; option 3 requires a
> matching paragraph in every client's own privacy notice, which is a thing you
> would have to get each client to publish.

## 3. Retention periods — three numbers, with starting points

The mechanism is built and the form is on **Governance → Subject requests**.
Every period is empty, and empty means keep forever, so nothing expires until
you type something.

These are **starting points, not advice** — the reasoning is shown so you can
move each one and know what you are trading.

| Category | Suggested | Why that, and what it costs |
|---|---|---|
| **Activity log** | `2555` (7 years) | It is the audit trail — the evidence for everything else, including erasures you have performed. Seven years lines up with the usual UK business-record horizon, so it will not expire before the records it evidences. Shorter is defensible; going below ~2 years starts destroying proof of your own compliance. |
| **DSAR register** | `1095` (3 years) | Long enough to show a regulator a pattern of handled requests, short enough not to keep people's names indefinitely. Note the register only ever holds a label, a date and an outcome — never the exported data. **Open requests never expire**, whatever this is set to. |
| **Enquiry notices** | `730` (2 years) | These are pointers, not content: an id, a timestamp, a seen flag. Deleting one removes *our* record that an enquiry arrived; the enquiry itself lives in the client's own database and is untouched. Two years keeps a useful reporting window without holding pointers to people indefinitely. |

**Before enabling any of them**, set the numbers and read the count the panel
shows — it tells you exactly how many records that period would remove *right
now*, and saving never sweeps. If a number surprises you, change it before
anything runs.

**Deliberately not covered by any period:** finance records, contracts,
deliverable proof and the erasure audit. Those are the RETAIN set in
`clientErasure`, kept for legal-hold reasons that outlive a person's
relationship with the business. Whether they should ever expire is question Q1
in the DPO pack — a legal answer, not a default this app should choose.

### 2g. "The server independently rejects events" — the second untrue sentence

Found in the 2026-08-28 production-grade audit. The notice says:

> After a choice, the server independently rejects events outside the
> categories you allowed.

`eventIsConsented()` in `src/app/api/telemetry/collect/route.ts` reads
`body.consentAnalytics`, `body.consentMarketing` and friends **from the request
body**. It checks that the client's own self-declared flags cover the category
it is sending. That is a consistency check on the payload, not independent
verification.

The visitor's real decision **is** stored, in `website_consent_events` — and
that table is **only ever `insert`ed**. Nothing in the codebase reads it back to
gate anything. Confirmed by search, and pinned by `smoke-privacy-notice-truth`.

**How bad, honestly:** not a security hole. The collector is a public endpoint,
so anyone can post to it whatever the server does, and in normal operation the
flags the Tag sends *are* the visitor's stored choice. This is an **accuracy**
problem in a published notice — Art. 5(1)(a), fairness and transparency.

**Two ways out:**

- **Make it true.** Look the most recent stored consent up by `anonymousId`
  before accepting an event. Costs a database read on a high-volume endpoint,
  and needs a decision about what to do when no stored consent exists for a
  session (reject is the safe answer). This is the only option that makes the
  word "independently" honest.
- **Soften the sentence.** Describe what actually happens:

  > After a choice, events are only sent for the categories you allowed, and the
  > server rejects any event whose consent flags do not cover it.

  Accurate, no code change, and it drops the claim of independence rather than
  making it.

I have not chosen. Rewriting a published privacy claim is your call, and adding
a per-event database read to the collector is a performance decision.

