# Handoff — Enquiry detail card (plan COMPLETE, P1–P5)

> 🗄 **Dated worker debrief — the PLAN is the authority on status.** For where `enquiry-detail-card` stands, read [enquiry-detail-card.md](enquiry-detail-card.md) and its Status line; for where the project stands, [checklist.md](../checklist.md); for what changed, the one log [updates.md](../updates.md). This file is the story — what was built, what broke, what is left — and is kept for that, not as a second status page.
>
> *It stays in `plans/` rather than moving to [archive/](archive/README.md) for two reasons: `smoke-dev-tasks-parse.test.ts` pins it by name in the set of plans that parse to zero phases, and `archive/README.md` says not to archive a handoff another plan still points at as its brief.*

← [plan](enquiry-detail-card.md) · [updates.md](../updates.md) · [status.md](../status.md) · [development.md](../../development.md)

**Worker handoff, 2026-08-19.** The [enquiry-detail-card plan](enquiry-detail-card.md)
is built end-to-end — all five phases shipped, tested, and browser-verified.
Nothing committed (Ed's call). This doc is the single review of what changed, how
it fits together, what's verified, and the two follow-ups left for the commander.

---

## What shipped (the arc)

Clicking an enquiry in the Master Inbox opens a **focus-trapped modal** that:

| Phase | What it does | Verified |
|---|---|---|
| **P1 — mirror the submission** | Modal (Ed's choice over drawer/expand) with two layers — **A) what they submitted** (every `formCapture` field in order + extras shown in full) and **B) Aqua's contact record** (consent-first, classification, source, triage, timeline, linked records) — and reuses the `EnquiryCommunications` composer. | ✅ browser (rendered with data; header/layers/consent/comms/scroll) |
| **P2 — import forms** | An **"Import forms"** button on each website source reads the site's real forms (SSRF-safe fetch) and stores each form's **field schema** on the site config. | ✅ browser (button → live fetch → "N forms found") |
| **P3 — layout from schema** | Layer A now mirrors the **whole real form** when its schema is imported — every field in order, **blank where the visitor skipped it** — matched to the enquiry by host + form. | ✅ browser (endpoint live; render is unit-tested `mergeFormLayout`) |
| **P4 — editable contact layer** | An editable **"Added by hand"** block — company, job title, notes, custom key/values — saves what the form didn't ask, per enquiry. | ✅ browser (type → Save → persist → reload pre-fills) |
| **P5 — polish** | Genuinely-empty fields show a muted **"—"** (never an invented value; the fabricated campaign "Direct" is gone); meaningful distinctions kept. | ✅ browser (sparse enquiry → "—", no "Direct") |

---

## Architecture / data model

- **Layer A source of truth:** the enquiry's own `formCapture` (what the visitor sent), optionally overlaid on an **imported form schema** (the template).
- **Imported schemas** live on `WebsiteSiteConfig.formSchemas` (the aqua-tag worker's config record — the home its own comment reserved), keyed by website-source id. Extracted by `scanFormSchemasInHtml`, resolved to an enquiry by `resolveFormSchemaForEnquiry(host, form)`.
- **Merge** is pure: `mergeFormLayout(capture, schema)` → template rows (value-or-blank + `submitted` flag) + extras.
- **Manual details** live in a **new, file-backed, agency-scoped** store `enquiryContactDetails` keyed by enquiry id — deliberately **never** touching the live `brand_enquiries` row or the canonical `Person`.
- The card fetches the template + manual details **on open** (graceful fallbacks); everything else it already receives as props.

## Files

**New (mine, 6 source + 3 test):**
- `src/app/portal/agency/inbox/_EnquiryDetailCard.tsx` (474L) — the modal (all phases).
- `src/server/websiteFormSchemas.ts` (108L) — import + `matchFormSchema`/`resolveFormSchemaForEnquiry`.
- `src/lib/enquiries/enquiryFormLayout.ts` (66L) — pure `mergeFormLayout`.
- `src/server/enquiryContactDetails.ts` (81L) — the manual-details store.
- `src/app/api/portal/website-enquiries/form-template/route.ts` (28L) — GET the template.
- `src/app/api/portal/website-enquiries/contact-details/route.ts` (58L) — GET/POST manual details.
- `scripts/smoke-import-forms.test.ts` (17 tests) · `scripts/smoke-enquiry-detail-card.test.ts` (6) · `scripts/smoke-enquiry-contact-details.test.ts` (6).

**Edited (additive; see coordination):**
- `src/app/portal/agency/inbox/_MasterInbox.tsx` — extracted the inline expand into the card; renders one section-level modal.
- `src/lib/server/integrations/aquaTagDetection.ts` — added `scanFormSchemasInHtml` (didn't touch `scanFormsInHtml`).
- `src/server/types.ts` — additive: `AquaFormFieldSchema`/`AquaFormSchema` + `WebsiteSiteConfig.formSchemas`; `enquiryContactDetails` state slot.
- `src/app/api/portal/website-sources/route.ts` — additive `import-forms` action + `formSchemasBySource` on GET.
- `src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx` — the "Import forms" button.
- 5 tests **retargeted** in P1 (the extraction moved asserted strings from `_MasterInbox` to the card): `smoke-master-inbox-communications`, `smoke-form-capture`, `smoke-enquiry-classification`, `smoke-public-contact`, `smoke-lead-wait-tracing`.
- Docs: `updates.md`, `status.md`, `todo.md`, `workspace/portal-ui.md`, `workspace/api-reference.md`, symbol reference regenerated.

## Tests

**29 dedicated tests** across the 3 smoke files (extraction, merge, match/resolve, store logic + agency-scoping, route/card wiring, a guard that manual details **never import `createSupabaseAdminClient`/`brand_enquiries`**, and a never-invent guard). **Full suite green (1732), `tsc` clean** at last run.

## Verification

Every phase browser-verified on a self-started `:3032` (dev:verify) using throwaway sim routes (all deleted): the card renders with data, Import forms runs a live fetch, the form-template endpoint responds, the manual-details save/reload round-trips, and empties render "—". The **real inbox-list → click → open** flow was also driven with a dummy enquiry on the real `MasterInbox`.

---

## Coordination notes (for the aqua-tag worker + Worker-10)

- **Aqua-Tag worker:** form schemas now live on **your** `WebsiteSiteConfig.formSchemas` (additive; the home your own comment reserved) + a new `websiteFormSchemas.ts` module. Nothing of yours changed shape. If you build form-schema handling, reuse these — don't add a second store. `scanFormSchemasInHtml` is additive alongside your `scanFormsInHtml`.
- **Worker-10 (inbox):** the "Import forms" button was added to `_WebsiteSourcesConfig.tsx` **additively, alongside your live "Editor" link** — no clobber.

## Follow-ups left for the commander (beyond the plan)

Two enhancements deliberately **not** done because they leave my lane into shared/hot territory and need coordination:

1. **Manual details → canonical `Person` on conversion.** Today `enquiryContactDetails` is enquiry-scoped. When an enquiry is converted (Create lead/contact), those details should flow onto the canonical `Person` (company/jobTitle/notes/customFields). That edits the shared `people.ts` and must respect the "facets retained through reclassification" contract — coordinate with the staff/people workers.
2. **Inline lead/contact/client re-linking.** The card shows linked records read-only; the row's "Create lead" exists. Inline re-linking is leads-pipeline territory.

## What the commander should do

1. **Confirm shipped** from `updates.md` (5 entries) + this doc; mark the enquiry-detail-card row done (already ticked in `todo.md`).
2. **Optional real-data browser pass** on a milesymedia-seeded `:3032`: open a real enquiry → the card mirrors the form; register a real form-bearing site → Import forms shows chips; add manual details → they persist.
3. **Log the two follow-ups** into the backlog and serialise them against the people/leads-pipeline lanes when ready.
4. Nothing is committed — first commit is still Ed's call.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `docs/development/plans/enquiry-detail-card-handoff.md`
