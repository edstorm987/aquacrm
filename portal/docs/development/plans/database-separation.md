# Can I upload my clients yet? — and the storage split that answers it

**Written 2026-08-29**, after verifying the live Supabase project and measuring
the state document. Ed asked: *"would i be at a stage of now uploading my
clients in… i'd like to have a few different databases make it clear whats auth
data etc whats envs secrets data whats clients data and whats needed app data."*

---

## The short answer: yes — with your eyes open

*(This heading previously read "not yet". It was wrong, twice, and both
corrections are kept below rather than edited away — the reasoning matters more
than the verdict.)*

**Your Supabase is fine, and so is the security posture.** What is not ideal is
the **shape** the app stores its own data in — and "not ideal" turned out to be
the accurate phrase, not "not ready". See [What was verified](#what-was-verified).

Every client, contact, enquiry, invoice, note and file reference in AquaCRM is
**one JSON value, in one row.** Live, that value is **3.25 MB across 59
collections** in `app_datastores`.

> ### ⚠ A correction to the first draft of this document
>
> The first version of this section said *"every write rewrites everything"* and
> *"concurrency is last-write-wins"*. **Both were wrong for the backend you
> would actually deploy on**, and the difference matters, so the reasoning is
> corrected here rather than quietly edited away.
>
> There are two remote backends and they behave very differently:
>
> - **`postgres`** (via `DATABASE_URL`) implements only `loadBlob`/`saveBlob`.
>   Every write really is a full-document rewrite. This is the one whose
>   self-description — *"single-row JSONB blob in `portal_kv`"* — I read first.
> - **`supabase`** (via the keys already in your `.env.local`, and therefore the
>   one you would deploy on) implements **`applyPatch`**: `mutate()` diffs the
>   state and sends only the changed operations to the
>   `apply_app_datastore_patch` RPC.
>
> So writes are diffs, not whole documents, and **concurrent writers merge
> rather than clobber** — `storagePatch.ts` says so explicitly: *"sibling
> agencies and unrelated collections remain independently mergeable."*
>
> What remains true is subtler and still real: PostgreSQL applies each
> `jsonb_set` **against the complete value**, so a small logical change still
> rewrites a 3.25 MB row internally. The code already fights this by compacting
> busy branches (`MAX_PATCH_OPERATIONS_PER_BRANCH = 64`) — a mitigation that
> exists precisely because the problem is real.

> ### ⚠ A SECOND correction — the security claim was overstated too
>
> The draft above then said the blob was the *"genuine blocker"* because RLS
> could not protect it. **That was measured, and it is wrong.** `app_datastores`
> is protected from the public key completely:
>
> | Attempt as the public anon key | Result |
> | --- | --- |
> | `GET` | 200, **zero rows** (RLS filters them) |
> | `POST` | **401** |
> | `PATCH` | 204, **zero rows affected** |
> | `DELETE` | 204, **zero rows affected** |
> | `apply_app_datastore_patch` RPC | **401** |
>
> Verified rather than inferred: PostgREST answers `204` for "succeeded on zero
> rows" as readily as for a real write, so the state row was re-read afterwards
> — still present, still 3.25 MB, `updated_at` unchanged at
> `2026-08-26T23:02:24`, i.e. untouched by any of it.
>
> **This also means the second line of defence I said was missing already
> exists.** And the browser never talks to Supabase for application state at
> all: it talks to Next.js, which enforces the access kernel, `requireRole`, and
> per-element client access — the layer most of this test suite exists to prove.
> RLS is the primary control for apps where the browser holds database
> credentials. This is not one of those.

With both corrections made, here is what is actually true:

1. **Nothing is exposed.** The public key cannot read, write or delete
   application state, and the app's own access control is the gate that matters.
   The split is **defence in depth and operability, not a hole to plug.**
2. **Write amplification is real but mitigated.** Every `jsonb_set` rewrites
   3.25 MB of JSONB. Patching keeps the payload small and `storagePatch.ts`
   already compacts busy branches. It grows with the document, and the document
   grows with your clients — this is the argument that will actually bite,
   and it bites on *cost and latency*, not safety.
3. **Erasure works, but cannot be proven at the database level.** GDPR deletion
   is implemented and tested — but it is a document rewrite. "We rewrote a blob
   and it is not in there any more" is a weaker answer to a regulator than "the
   rows are deleted." This is the strongest remaining argument for the split.
4. **Granularity.** A policy saying "this agency's rows, not that one's" cannot
   be written about data inside one JSON value. Worth having; not currently
   load-bearing, because nothing untrusted can reach the row.

None of this is a bug. It is a stage — and it is **not** a barrier to putting
real clients in. The split is the right next investment, for cost, for
provable erasure, and for the day something other than this server needs to read
the data.

---

## What was verified

Read-only, against the live project, 2026-08-29.

| Check | Result |
| --- | --- |
| Connection with your keys | ✅ working (already in `.env.local` — nothing to paste) |
| Tables exposed via PostgREST | 12 |
| Readable by the **public** anon key | `brands` (5), `shoots` (3), `shoot_photos` (7) |
| Contact details in those | **none** — 0 emails, 0 phone-shaped values |
| Writable by the public key | **none** — all refused 401 |
| `brand_enquiries` | 41 rows on service-role, **0 to the public key** → RLS working |
| `website_consent_events` | 11 rows, 0 to public → RLS working |
| `profiles` | 3 rows, 0 to public → RLS working |
| Portal users vs Supabase auth | 2 vs 3; **1 locked out**, **2 with no role** |
| Unexpectedly public tables | **0** |
| Publicly writable tables | **0** (all 12 refuse anon writes, 401) |

Re-runnable at any time, read-only and with no destructive verb:

```bash
node scripts/supabase-live-rls-probe.mjs
```

`smoke-rls-policy-coverage.test.ts` already guards the repo half — the written
migration SQL against what the code assumes — but deliberately never touches the
network, so it cannot see the half that actually drifts: a policy changed in the
dashboard. That has happened once already (`rls_auto_enable` is live and in no
migration). The probe is the other half.

It reports four tables as **"empty — proves nothing"** rather than calling them
secure, because PostgREST answers `200 []` for "RLS filtered everything" and for
"the table has no rows" alike. A table nobody has written to yet has not
demonstrated anything about its policies.

The three readable tables are a public portfolio — slug, title, location, image
source. That is what they are for.

> **Why "0 rows to the public key" is not enough on its own:** PostgREST answers
> `200 []` both when RLS filters everything AND when a table is simply empty.
> Each was checked twice — service-role with `count=exact` to prove rows exist,
> then the anon key to prove it cannot see them. A single-sided check here would
> have called an empty table "secure".

---

## The split

Four concerns, four homes, each with a different answer to "who may read this".

### 1. Auth — **already right, leave it alone**

Supabase `auth.users` owns identity. The portal keeps its own user record and
the two are joined by email. Nothing to move.

*Outstanding:* the 1 + 2 account mismatch above. That is yours to fix in the
dashboard; `node scripts/supabase-cutover-preflight.mjs` names them.

### 2. Secrets — **must never be readable by anything but the server**

Integration credentials, tokens and webhook secrets already go through the
encrypted vault (`PORTAL_VAULT_ENCRYPTION_KEY`) rather than onto plugin config.
When they move to Postgres they want their own table with **no policies at
all** — service role only. A table with no policy and RLS enabled is readable by
nobody, which is exactly right for secrets.

Environment values (`.env.local`, Vercel) are not database rows and should not
become them.

### 3. Client data — **the one that needs real rows**

This is the PII: clients, contacts, enquiries, notes, files, invoices. Every row
carries `agency_id` and `client_id`, and the policy is the whole point:

```sql
create policy tenant_read on aqua_client_records
  for select using (agency_id = auth.jwt() ->> 'agency_id');
```

That is the sentence that cannot be written today, and having it is what makes
"upload my clients" safe rather than merely untested.

### 4. App data — **config, templates, layouts**

Not personal data. Portal templates, theme settings, saved layouts, plugin
installs. Can stay coarse-grained; agency-scoped is enough.

**Worth knowing before you plan this** — measured on the LIVE datastore
(2026-08-29), not the local file, which is a smaller stale copy:

| Collection | Size | Share |
| --- | --- | --- |
| `devTeamWorkspaceFiles` | 967 KB | 29.0% |
| `radarMemory` | 619 KB | 18.6% |
| `clientPortalTemplates` | 615 KB | 18.5% |
| `radarEvidence` | 349 KB | 10.5% |
| **`clients`** | **181 KB** | **5.4%** |
| `activity` | 171 KB | 5.1% |

**Your actual business data is 5% of the document.** The other 95% is machinery:
the dev editor's file contents, Radar's history, and portal templates. Those are
the collections to move out first — none of them is personal data, so a mistake
costs nothing, and each one shrinks the row that every `jsonb_set` rewrites.

---

## Suggested order

Each step is useful on its own and none of them is a big-bang cutover.

1. **Deploy first** (`NEXT_PUBLIC_PORTAL_SECURITY=strict`). Readiness goes 3/4 →
   4/4; re-measured 2026-08-29 against your real `.env.local`, the only failing
   item is `security`.
2. **Fix the three accounts.** Yours, in the dashboard.
3. **Move `clientPortalTemplates` out.** Biggest single win, no PII involved, so
   a mistake costs nothing. It is also the honest rehearsal for step 4.
4. **Move client records to real rows, with RLS.** The step that actually
   unblocks uploading clients.
5. **Move radar evidence to its own table** — see below.
6. **Secrets to a service-role-only table.**

---

## Radar: fixed today, and where it should end up

Ed: *"we dont want to completely clog the database with it."* Correct instinct,
and the measurement found a real defect.

Retention was expressed as **counts** — 288 raw points, 720 hourly buckets.
Those are the right numbers for a **five-minute** probe cadence: 24 hours of raw
and 30 days of hourly. The cadence later became **daily** (issues #170) and the
numbers stayed, so they silently came to mean **288 days of raw** and **about
two years of hourly** — roughly thirty times the intended history, inside the
document that gets rewritten on every save. Measured: 150 series, 72 KB today,
~13 MB at saturation.

**Measured live, and it is worse than the local file suggested: Radar is
974 KB — 29.2% of the whole document, more than five times the size of your
actual `clients` data.**

**Two fixes, both landed 2026-08-29.**

*Evidence (349 KB).* Retention is now expressed in **time** (14 days raw,
60 days hourly, 365 days daily), because a count is only a duration if you also
know the cadence — and the cadence is a setting someone can change. The counts
survive as runaway guards for exactly the case where someone turns the cadence
back up. A **daily tier** was added so shortening the windows does not throw the
long trend away: every sample folds into all three tiers on the way in, so
compaction is only ever a delete of something already summarised. Net: ~41 KB
per series instead of ~86 KB, while carrying a **full year** of trend.

*Scan history (473 KB — the single biggest item).* `radarMemory.scans` held 68
scans at **~7 KB each**, capped at 180, so heading for ~1.26 MB per agency.
Nearly all of that is four detail arrays — and **only `scans.at(-1)` is ever
read**, to work out what is new, worsening or recovered since the last sweep.
Nothing reads the detail of scan #170. So detail is kept on the newest five and
compacted away beyond that, leaving the ~200-byte summary that the trend is
actually built from.

The detail fields were made **optional and deleted**, not emptied. An empty
`issueStates: []` on a scan whose detail we no longer hold would say "nothing
was wrong that sweep" — a confident claim about discarded data. Absent means
"not retained"; `[]` means "genuinely none".

**Where it belongs eventually:** an append-only time series does not want to
live in a document that is rewritten whole on every write. Its own table, with
its own retention, is step 5 above. The windows are what keep it honest until
then.

---

## Enquiries inbox permissions

Deliberately listed after the split, because it depends on it.

The client-facing half already follows the right rule and it is worth not
breaking: a client's enquiries live in **their** Supabase, and AquaCRM stores
only a pointer (`ClientFormNotice`). `clientFormReader.ts` states it plainly —
*"nothing this returns may be written to our state"* — and that is why there is
no second copy of a client's customers to secure, leak or erase.

What is still coarse is the AQUA side: who inside an agency may open which
client's enquiries. Today that is enforced in application code
(`client.systems` / `client.overview` element access), which works and is
tested. Once client records are real rows it should ALSO be a database policy,
so the answer does not depend on every route remembering to ask.
