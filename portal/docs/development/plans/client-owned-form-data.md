# Client-owned form data — their Supabase, our notification

**Ed, 2026-08-27:** *"surely we have to link their superbase inside this to get
their forms data and then internally we just get a notification to say they got
the form so we can track enquiries without merging or breaching data but inside
their portal shows it all and the whole form mapping is just database connecting
mapping."*

That is the architecture. This records it, what is built, and what is not.

---

## Why it is the right shape

It also answers a problem found earlier the same day. `ContactFormBlock` posts to
`/api/portal/forms/submit`; there is no `forms` module, so **every published
contact form fails** and a visitor is told "Couldn't send. Please email us
directly." on a page carrying no email address (issue #29).

The obvious fix was to build a generic anonymous tenant-aware endpoint on our
side. Three existing candidates were checked and all three are the wrong home:
`/api/public/brand-enquiry` and `/api/public/contact` are hard-wired to the
founder agency, and `/api/public/form-capture` states in its own header that it
"enriches rather than duplicates" and that creating an enquiry there "would
double every count in the inbox".

Ed's model avoids the question entirely: **the client's form writes into the
client's own database.** Nothing of theirs needs a home in ours.

**It is also materially better for compliance.** The client stays the data
controller for their customers' data; AquaCRM holds event metadata. That is a far
easier story than the current Aqua Tag position (D10), and it does not need the
consent decision to be settled first.

---

## What is built and proven

### The vault entry — `client-supabase`

A client-scoped provider in the existing encrypted vault (AES-256-GCM), so this
reuses the machinery that already holds Stripe and Resend per client rather than
inventing a second credential store.

**Four fields, and one that is deliberately absent.** Project URL, anon key,
submissions table, webhook secret. **There is no service-role key field, and
there must never be one.** A service-role key bypasses row-level security — it
is root on that client's whole database. Holding one per client would mean a
single compromise of our vault hands over every client's entire database, and
encryption at rest does not change what the key itself grants. The anon key is
powerless on its own: it can do exactly what that project's RLS policies allow,
so the client controls what we may read and can revoke it without touching
anything else.

A test asserts no field id matches `/service.?role/i`, so adding one is a
conversation rather than a commit.

### The receiver — `POST /api/public/client-forms/[connectionId]`

A Supabase Database Webhook on their table posts here on insert. **They push; we
do not poll.** Polling would mean holding a live read connection open on a timer
and reading their data to discover something they could simply have told us.

The webhook body contains the entire inserted row. The route reads **one thing**
from it — the primary key — and discards everything else.

**Proven end to end on a real lane**, not asserted. A webhook carrying
`{"name":"Jane Customer","email":"jane@example.com","message":"Please call me
about a quote"}` produced exactly this in our store:

```json
{
  "id": "cfn_4151686cefdaee97",
  "agencyId": "milesymedia",
  "clientId": "cli_e5bd9f3e0e367962",
  "connectionId": "int_e8023e90ed46e457",
  "table": "form_submissions",
  "rowId": "row-abc-123",
  "receivedAt": 1787861870578
}
```

…and a search of the whole state file for "Jane Customer", "jane@example.com"
and the message text returns **zero occurrences of each**.

Other properties, each verified by breaking them:

- **The secret is compared in constant time** (`timingSafeEqual` on hashes, so
  unequal lengths do not throw before they are compared).
- **An unknown connection and a wrong secret answer identically** — both 202 —
  so status codes cannot be used to enumerate which connection ids exist.
- **The table comes from our stored configuration, never the payload**, so a
  forged body cannot aim a notice at a table the client never authorised.
- **Retries are absorbed.** Supabase retries deliveries; counting one twice
  would inflate every enquiry figure in the inbox. A repeat resolves to the
  same notice and cannot resurrect one somebody has already handled.
- **Rate limited**, per the public-surface rule established the same day.

One of these tests was initially **wrong in the dangerous direction** — it
checked for `body.record.<field>` and passed when a probe inserted
`(body.record as any)?.email`. A cast and an optional chain walked straight
through it. It is now arithmetic: the payload's record may be mentioned exactly
once in the entire route. A test that green-lights the leak it exists to prevent
is worse than no test.

### The governance declarations the type system demanded

Adding a state collection would not compile until three questions were answered,
which is the codebase working as designed:

- **Company promotion:** `leave`, needing confirmation. A notice is worthless
  without the connection that can read it, and that connection is a credential
  whose transfer is a human decision. A notice moved into a tenant that cannot
  resolve its row is a permanent "an enquiry arrived and you may never see it".
- **Origin template:** never contributed. A brand-new agency must not inherit
  pointers to somebody else's enquiries, or a count of them.
- **Storage parser:** listed explicitly, because that parser has no spread and
  an omitted collection is silently destroyed on every hydration.

---

### The reader — `GET /api/portal/client-forms/[noticeId]`

Built. Fetches the row from their Supabase via PostgREST at the moment somebody
looks, using the anon key, and returns it without writing it down.

- **Nothing it returns may be persisted.** No cache, no denormalised copy for
  search, no audit record of the values, and no logging of the response — an
  error string carrying the row ends up in a log file, which is a copy by
  another name. Pinned by a test that forbids `mutate(`, any write into the
  notice store, and `console.*`.
- **Gated on `client.communications` at `view`**, for the client named by the
  **stored notice** — nothing in the request says whose data it is. Reusing the
  element that governs the rest of that client's messages means somebody shut
  out of their communications does not get a second door here.
- **A failed read does not clear the unread badge.** A timeout that marked an
  enquiry seen would quietly lose one nobody ever looked at, which is the worst
  possible outcome for an enquiry tracker. Only a successful read marks it.
- Bounded with an `AbortController` (8s) — a call into somebody else's database
  cannot be allowed to hang a request.
- `401`/`403` from their project is reported as **refused**, not as an outage:
  that is the client withdrawing access through their own RLS policy, and it
  should read as such.

**Verified on the lane:** anonymous → 401 (not 500 — the auth call is inside the
try, per the four routes fixed earlier today); an unknown notice → 404; a real
notice against a deliberately non-existent project → **200 with
`{"status":"unavailable","reason":"error"}`** and the notice still **unread in
storage**. A graceful failure with the badge intact, confirmed in the state file
rather than inferred.

**Which column the key came from is now recorded.** Supabase does not promise
the primary key is called `id`, and guessing at read time would turn "we looked
in the wrong column" into a silent "that enquiry no longer exists". The webhook
records `rowKey` alongside `rowId`; the reader falls back to `id` for notices
written before the field existed.

### Three existing guards caught this work, which is the system behaving

None of these were anticipated; all three are the codebase refusing to let a new
collection or route in unexamined:

- The **read-path analyser** (built earlier the same day) flagged the reader as
  a GET that writes. It is — it marks the enquiry seen — so it is now declared
  with its cause and ruling rather than quietly excepted.
- The **route-tenancy pin** refused a new route under `api/portal` until its
  tenant source was audited and written down.
- The **promotion, origin-template and storage-parser** contracts refused the
  new state collection until each had a declared answer.

### Field mapping — built, onto Aqua's OWN vocabulary

Ed, 2026-08-27: *"make sure this all complies together please client facing and
internal facing and of course dev facing."*

That sentence shaped this piece. The internal enquiry path already has a
canonical vocabulary — `name`, `email`, `phone`, `message` — declared as
`CORE_KEYS` in `lib/enquiries/formCapture.ts` and used by `brand-enquiry`, the
Aqua Tag and the master inbox. A client submission arriving as
`customerName`/`emailAddress` would give the portal two words for the same thing
and make the two inboxes incomparable.

So `clientFormMapping.ts` maps **onto those names** and **reuses `isCoreField`**
rather than restating it. A term added there is added once. A test asserts the
canonical names are core fields on the internal path, so a future divergence
fails rather than drifts.

**No configuration needed in the ordinary case.** A form we built calls its
columns `name`, `email`, `message`; those are recognised, along with the usual
variants (`full_name`, `e-mail`, `mobile`, `enquiry`, `created_at`), and a name
split across `first_name` + `last_name` is joined so the surname is not lost.
Five optional overrides exist for the table that calls its message column
something else.

Three rules worth stating, each verified by breaking it:

- **Explicit beats detection.** A configured column is a statement; detection is
  a guess.
- **A configured column that is missing does NOT fall back to detection.**
  Somebody said which column that was; answering from a different one would hide
  a broken configuration behind a plausible value.
- **Patterns are anchored.** `email_opt_in` is a consent flag, and a loose match
  would put "true" in the address line — where somebody would reply to it.

Anything else the visitor answered is **kept, never dropped** (`additional`),
for the same reason `additionalFields` keeps it on the internal path: a portal
showing only the four fields it recognised would misrepresent what the customer
actually said.

---

### The confirmation — the client's thank-you, from the client's own address

Built. When a notice arrives, the client's configured confirmation goes out to
their customer through **their own** Resend or SMTP connection.

**The tension this had to resolve:** sending a thank-you needs the customer's
email address — the one thing this design keeps out of our store. The address is
read on demand, used for one send, and dropped. It exists in a local variable
and reaches nothing else.

The easiest place for it to leak back in is a failure reason: *"could not send
to jane@example.com"* is the most natural thing in the world to write down. So
`confirmationReason` is a **fixed union of four codes**, not a string, and a
test fails if it is ever widened to free text. The provider reference is the
notice id for the same reason — an `externalRef` carrying the recipient would
put it in the email provider's logs.

**It claims before it sends.** Supabase retries deliveries; a "have we sent it
yet?" check that only recorded success would let two concurrent deliveries both
decide they were first, and the customer gets two thank-yous from a client who
configured one. At worst a crash mid-send loses a confirmation, which is much
better than duplicating it.

**It runs after the response**, using `after()` — the same tool
`webhooks/meta` already uses. Reading their row and then sending are two
outbound calls; inline they would push past the timeout Supabase allows, and a
slow webhook is a retried webhook.

**It is enabled by writing a subject.** Blank means the client did not ask for
it. A checkbox would let somebody switch it on and ship a default nobody read,
under the client's name.

One probe here was badly chosen and worth recording: moving the claim after the
*read* did not break idempotency, because the claim is still atomic and still
precedes the send. The real failure mode is claiming after the SEND, and the
assertion catches that one.

### The published form — the loop is closed, via the export

The last piece: a visitor filling in a form on a client's site, and it reaching
the client's database. Tracing it turned up two things worth stating plainly.

**There is no public route serving client websites from AquaCRM.**
`PortalPageRenderer` is used by exactly one route —
`client-website-preview/[clientId]/[siteId]/[pageId]` — and that is gated to
agency roles. There is no `/p/[slug]`, which is what issue #31 said and is now
confirmed. So a client site is not served by this app; it is **exported and
deployed**, which matches Ed's *"vercel for deployments"*.

**The export was not rendering the form at all.** Its README listed "Form
submissions (contact-form, …)" under *things that will not work*, and the reason
was blunter than "unwired": `renderBlockToHtml` handled twelve block types and
`contact-form` fell through to `default`, which emits an empty `<div>`. Nothing
was broken — nothing was drawn.

**Both halves are fixed.** An exported page now renders a real form that posts
from the visitor's browser straight to the client's PostgREST endpoint, with no
server of ours in the path. No framework, no build step — it has to run in a
bundle dropped on a static host.

- **The anon key is in the bundle, and that is correct.** Supabase anon keys are
  designed to be public; the row-level-security policy on the table is the
  control, which is why the README now says to keep that policy INSERT-only and
  never to put a service-role key near a static bundle. Somebody who finds a key
  in a ZIP and is not told why will reasonably assume the worst, so the README
  tells them.
- **The export is given only the public half.** `clientSupabaseExportTarget`
  is a separate function from `findClientSupabaseConnection` specifically because
  the latter returns the webhook secret. A function that *cannot* return the
  secret beats one that promises not to — the return type is the guarantee, and
  a test fails if it grows a secret field.
- **An unconnected client gets an honest form**: fields render, the submit
  button is disabled, and it says it is not connected — instead of a Send button
  that throws the message away, which is the exact failure this whole thread
  began with.
- **The README stops lying either way** — it now says forms DO work and names
  the table, or says they are NOT connected, depending on what is actually true.

The palette label was corrected rather than removed. `contact-form` stays listed
because the React component still posts to `/api/portal/forms/submit`, which is
still unreachable — so submitting from the *editor preview* still does not work.
But "Submissions have nowhere to go" became wrong the moment the export worked,
and a label that overstates a problem gets ignored as fast as one that
understates it.

## The wider vision, as Ed described it

Recorded because it changes what "done" means for several other pieces.

> *"the dev editor we'd need to make their database so it might be worth the
> read write supabase with supabase ui and then we build project git and
> supabase then we deploy… aqua tag marketing and injection, the supabase for
> databases, vercel for deployments and github for making it… the client portal
> becomes their experience to our products."*

**The stack, with one job each:** GitHub builds it, Supabase holds its data,
Vercel deploys it, the Aqua Tag measures it. All four already exist as
client-scoped vault providers — `github`, `vercel`, `client-supabase` (new
today), and the Tag's per-site keys. The wiring is what is missing, not the
credential machinery.

**The read/write question Ed raised and did not settle** — *"we could remove the
supabase or switch to different api key with production gdpr permissions say or
we keep it in dev mode to develop im not sure"* — is the right question and it
has a clear shape:

- **Provisioning** a client's database (creating tables, RLS policies) needs a
  powerful key. **Reading their enquiries does not.**
- Those should therefore be **two different credentials with two different
  lifetimes**: a provisioning key used during the build and then removed, and
  the anon key that stays.
- Today's vault entry deliberately holds only the second. If a provisioning key
  is added it should be a separate provider with its own capability, so
  "AquaCRM can read this client's enquiries" and "AquaCRM can restructure this
  client's database" are never the same grant.

**Client Resend/Twilio for confirmations and thank-yous** — Ed is right that
much of this exists: `resend`, `smtp` and `twilio` are already in
`CLIENT_SCOPED_PROVIDERS`, so a client's own sender can already be stored. What
is missing is the trigger: a notice arriving should be able to fire the client's
own automation. That is a small piece on top of what now exists, and it belongs
with the notice, not with the reader.

### The internal path is deliberately different, and was NOT touched

Ed's own sites go straight to the master inbox and merge into internal fields —
*"our smart internal system for having one inbox for multiple sites of our
own"* — and he asked whether today's work disturbed it.

**It did not.** All seven files in that chain are unmodified since the
checkpoint: `brand-enquiry`, `form-capture`, `formCapture.ts`,
`identityResolution.ts`, `websiteSources.ts`, `aquaTagSource.ts` and
`submissionIdentity.ts`. The internal sites post plain HTML to
`/api/public/brand-enquiry` and do not use the website editor's `FormBlock` at
all, so the block changes made today cannot reach them.

The two paths stay separate on purpose — Ed's sites merge into his fields
because they are his; a client's data does not merge because it is not — but
they now speak the same vocabulary, which is what makes one inbox able to show
both.

### The client's own inbox — built

Ed, 2026-08-27: *"the client needs an inbox as well, a snapshot of our system
with enquiries and actions… this way they can actually receive stuff
effectively."*

`/portal/customer/enquiries`, in their own portal, with its own nav link.
Verified with a real `end-customer` session: the client sees the heading, the
enquiry row, its unread dot and its timestamp; an agency owner hitting the same
URL is refused.

**The list shows no names, and that is the design rather than a gap.** What
AquaCRM holds is a pointer — which form, which row, when. The customer's details
sit in the client's own database and are fetched only when somebody opens one.
So a list of fifty enquiries makes **no calls into their database at all**, and a
portal left open on a screen in an office is not quietly displaying fifty
customers' details. A test forbids `email`, `name`, `phone` or `message` on the
summary type.

**Why it is a VIEW section and not a stored one.** The stored model is
`Record<ClientPortalSectionId, ClientPortalPagePresentation>` — not partial. A
ninth stored id would leave every client portal already in the database missing
a key it is typed as having, and the nav resolves its labels through that same
record. So "enquiries" joins "service" and "custom" as a view-only section with
its own link. **The compiler caught this within seconds** of the first attempt,
which is that non-partial `Record` earning its keep: a `Partial` there would
have compiled and produced `undefined.eyebrow` at runtime instead.

**Not walked in a browser.** The client account still has to complete setup
before the portal chrome will render it, and completing setup means choosing a
password. The server-rendered output is the proof instead, and it is a good one:
the payload contains the row, the `sr-only` "(unread)" text and the timestamp.

### Opening one, from the client's side

`/portal/customer/enquiries/<id>` — built. The values are read live from their
database for that render and are gone afterwards.

**A customer can open only their own.** The id comes from the URL so it is not
trusted: the notice is looked up scoped to the client the session already
resolved to, and anything else is not found. Proven by seeding a notice against
a different client and requesting it — it renders "not found", not its contents.
(It answers **200**, like the rest of the customer portal's refusals; that is
issue #168's convention question, and checking the body rather than the status
is the only thing that means anything here.)

**Failures say WHICH failure.** A deleted row, a revoked connection, a timeout
and an RLS refusal need four different actions from the client, and only they
can take them — so "something went wrong" would be useless. Verified against the
deliberately-dead test project: it renders "could not be reached", not a crash.

### The render stays pure — and the analyser is why

The obvious implementation marks the enquiry read inside the server render.
**The read-path analyser built earlier the same day caught it on the first test
run**, and flagged *two* renders: the detail view, and `customer/page.tsx`,
which cannot reach the write but calls the same function — a name-level call
graph cannot see that the branch is unreachable there.

Declaring a false positive as a deliberate writing render would have made that
inventory less trustworthy, which is the opposite of its purpose. So the render
was made pure instead: a small client component posts once on mount to
`POST /api/portal/customer/enquiries/seen`.

That endpoint takes its tenant from the session and the **agency from the client
record**, never from the request — the body's only influence is which notice id
it names. Probed across every role:

| Caller | Answer |
| --- | --- |
| anonymous | **401** |
| agency owner (wrong audience) | **403** |
| client, unknown notice | **404** |
| client, their own notice | **200**, and `seenAt` set in storage |

The marker fires once per view rather than twice — effects run twice in strict
mode and this one POSTs — and fails silently, because the safe direction for a
failed badge update is "stays unread", and an error toast about a badge is noise
about something nobody asked for.

### The instant-mapping detector — one implementation, not two

Ed, 2026-08-27: *"aqua tag to scan for form fields perhaps so we can just press
a button instant mapping."*

Both halves already existed — the Tag imports each field's name, label, type and
required flag; `clientFormMapping` decides which column plays which role. They
are now joined by `mapScannedForm(fields, overrides)`, which returns the
proposed roles **and the fields it could not place**, because a preview that
silently omits three questions is how somebody approves a mapping that loses
them.

**Labels are matched loosely, names are not.** A label is prose — "How can we
help?" is a message field and no anchored pattern will ever say so. A name is an
identifier, where a whole-string match is the only thing stopping `email_opt_in`
putting "true" in the address line. That split is not new reasoning: it is
exactly what `formCapture.ts` already does next door, and this follows it.

**And a correction worth recording.** The first version added a schema detector
while leaving `mapClientFormSubmission` running its own copy of the same
matching. A test asserted the two "share one detector" — but it compared
outputs on one example, which is not the same claim at all. A probe proved it:
loosening the name patterns broke the scanned-form guard and left the submission
guard **green**, because they were two implementations agreeing by coincidence.

They are now one. The same probe breaks **four** tests instead of one, and the
test asserts the structure as well as the behaviour — that the submission mapper
calls the shared detector and contains no copy of the patterns. Comparing
outputs was the kind of green that means nothing.

### The mapping, on screen

`Inbox → Channels → Website sources` now shows the detected mapping under each
scanned form. Verified in the browser against a seeded scan of a six-field
contact form:

```
DETECTED MAPPING
  Email   ← e-mail
  Name    ← full_name
  Phone   ← mobile
  Message ← enquiry
Kept as extra answers: which_branch, email_opt_in
```

**`email_opt_in` landing in "extra answers" rather than winning the Email role
is the anchored-name rule working on real data**, not only in a test — which is
the whole reason names are matched strictly and labels loosely.

Computed in the browser, not through an endpoint: `mapScannedForm` is pure and
imports only `isCoreField`, so a round trip would be a request whose only
purpose is to call a function.

Two things this cost, worth recording because both wasted time:

- The panel is behind the **Channels tab** (`?view=channels`), so a first check
  on `/portal/agency/inbox` found nothing and looked like a broken render.
- `innerText` reflects `text-transform`, so a case-sensitive search for
  "Detected mapping" failed against a heading rendered as "DETECTED MAPPING".
  The component had been working for two checks before that was spotted.

**Seeded demo data left on the 3051 lane**, so this is inspectable: a website
source `ws_mapping_demo` for `walkthrough-client.test` with one scanned contact
form. Delete it whenever — it is scratch, like the test connection.

## "I swear I already built half of this" — you had, and here is the audit

Ed, 2026-08-27. He was right, and it changed what got built. Rather than write
new machinery, the useful work turned out to be **connecting things that already
existed**. Written down because the next person will otherwise build the second
copy that the hazards document exists to prevent.

| What Ed asked for | What already existed | What was actually needed |
| --- | --- | --- |
| *"aqua tag scan for form fields… instant mapping"* | **`aquaTagDetection.ts` already imports form schemas** — every field's `name`, visible `label`, `type` and `required`, from a tagged site's HTML. `_WebsiteSourcesConfig` already shows them per source. | The mapping itself. `clientFormMapping.ts` (built today) does exactly that detection onto Aqua's own vocabulary — the two halves just need joining. |
| *"automations… thank yous etc"* | **A full automation engine**: folders, workflows, runs, graph validation, and twelve triggers including `website-enquiry.received`. | One trigger — `client-form.received` — so an arriving form reaches the engine. Done. |
| *"clients resend or twilios"* | **Already client-scoped** in the vault (`resend`, `smtp`, `twilio`). | Only the trigger to fire them. |
| *"the client needs an inbox"* | The customer portal exists with its own chrome, views and sub-routes. | A notices surface inside it. **Not built.** |

### The correction this forced on my own work

The confirmation I built earlier in this document is a **hardcoded automation**.
AquaCRM already had an engine for exactly that, and shipping a second place to
configure "what happens when an enquiry arrives" is the duplication the house
rules forbid.

So the webhook now does **both**: it sends the zero-config confirmation *and*
fires `client-form.received` into the existing engine. The built-in stays
because a client who wants a thank-you and nothing else should not have to build
a workflow — but it is a default, not the only door.

The event carries **the pointer and nothing else**, for the same reason the
notice does. A workflow that needs the customer's details reads them through the
client's connection, so the privacy boundary holds no matter what anybody builds
on top of it later. A test asserts the event payload contains no `email`,
`name`, `phone` or `message`.

Runs are keyed on the notice id, so a retried webhook re-runs no workflows.

## What is NOT built

- **SMS confirmations.** Email is wired; Twilio is client-scoped in the vault
  already, and the `client-form.received` trigger can now drive it from a
  workflow — but no workflow action sends SMS yet.
- **Contacts in the client portal.** Ed asked for these alongside enquiries.
- **Contacts, and "actions", in the client portal.** Ed asked for both alongside
  enquiries. Only enquiries exist.
- **SAVING a mapping.** The detected mapping is shown; there is no control to
  accept it and write the column overrides onto the connection. Today they are
  typed in by hand. Their column names to our canonical fields (name / email /
  phone / message / submitted_at). Small per-client config, same shape as the
  portal entity fields that already exist. Not written.
- **Submitting from the editor preview.** The React `ContactFormBlock` still
  posts to `/api/portal/forms/submit`. The exported site works; the preview
  inside the editor does not.
- **A public route for client sites** (`/p/[slug]`). Today they must be exported
  and deployed; AquaCRM cannot serve them.
- **The database editor.** See below.
- **A UI for any of it.** The connection can currently only be created through
  the API, and nothing in the portal lists notices or opens one yet — the
  endpoint exists, the screen does not.

## The database editor — a caution, not a refusal

Ed also asked for *"a database editor in dev mode... like the vs code but a
database backend version just connecting their superbase"*.

A **read-only** table browser and query runner is genuinely achievable and would
make the mapping work above much easier.

**Write access against a client's production database is a different risk.** The
Aqua Editor AI was bound to the operator's permissions earlier the same day
precisely so an assistant cannot act beyond its principal; an AI with write
access to a client's live database is the same class of problem with a much
worse blast radius — there is no undo on a dropped table. If it is built, it
should be read-only by default, with writes behind an explicit per-connection
toggle and their own capability, never inherited from "can edit code".

## Left on the lane for you to look at

A test connection exists on the 3051 lane — `int_e8023e90ed46e457`, "Walkthrough
Client site", pointing at `https://example-test.supabase.co` with a fake anon
key. It is scratch data on a sandbox lane, kept so the webhook can be
demonstrated. Delete it whenever.
