# Plan — Enquiry detail card (mirror the real form) + Import forms

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: ✅ COMPLETE (P1–P5), 2026-08-19 — see [handoff](enquiry-detail-card-handoff.md).** Built, tested (29 dedicated tests; full suite green), and browser-verified end-to-end. Two enhancements left as commander-coordinated follow-ups (manual details → canonical `Person`; inline lead/contact/client re-linking). Nothing committed. Original plan below.

Clicking an enquiry opens a card that shows
*everything* about it — and the layout **mirrors the actual website form**
(because the Aqua Tag knows the fields), not a guessed generic layout. Plus an
**"Import forms"** step so each form's layout is exact from the moment you add a
website.

## The design (Ed's — mirror, don't guess)
The Aqua Tag already knows a site's form fields, so the enquiry card should
mirror the real form. Two layers:

- **A) The form's own fields — exact.** Rendered in the form's own field order/structure. Source of truth:
  - **On a received enquiry:** the tag already captures the submitted fields with labels/types (`formCapture` / `captureSubmission`) — already on the item.
  - **Ahead of time:** **Import forms** pulls each form's full field schema when you add a website, so the layout is known even before a submission.
- **B) Aqua's internal contact fields.** Our CRM requirements (name, email, phone, contact method, classification, owner, services, consent, linked lead/contact/client) that a given form **may not have** — shown alongside and **filled manually / discovered** where the form doesn't provide them.

So the card = "here's exactly what they submitted, in the shape of the form they
used" + "here's the Aqua contact record we keep, completed by hand where the form
didn't cover it".

### Field inventory (found from the code)
**Layer A — already on every enquiry (`WebsiteEnquiry`), just render it:** name,
email, phone, contactMethod · message + **`formCapture`** (the exact submitted
fields) · source (brand/brandName, channel, siteName, siteHost, pagePath,
sourceUrl, campaign, siteKey, propertyId) · triage (classification +
classifiedAt, priority, topic, suggestedAction, routeNote) · status + submittedAt
· consent (flag, purpose, version, capturedAt) · services[] · (+ metadata:
routedClientId, leadId, contactId, clientId, calls, replies, identityResolution).

**Layer B — Aqua's internal contact record (`Person`), the form usually won't
have:** company, jobTitle, organisation/organisationLinks, isPrimaryContact,
classification, notes, `record[]`, and **`customFields: Record<string,string>`**
— so **non-standard imported form fields have a home** (customFields) rather than
being lost. These are the "fill manually / find out" fields.

## Import forms (the new capability)
- **When:** adding / tagging a website (the [Aqua Tags wizard](../../workspace/aqua-tag.md) already has a *scan for forms* step — this extends it from *counting* forms to *importing their schema*).
- **How:** extend `lib/server/aquaTagDetection.ts` `scanFormsInHtml` (today: counts total + capturable via regex over `<form>` blocks) to also **extract each form's fields** — name, label (`labelFor` logic already exists in the tag), input type, required. SSRF-safe fetch via `safeSiteFetch.ts` (already used).
- **Store:** the imported form schema(s) on the `websiteSources` entry (or a form registry keyed by host+form), so each form has a stable layout template.
- **Result:** "Import forms" button → "3 forms found: Contact, Callback, Newsletter" → each becomes an enquiry layout that matches the real form field-for-field.

## Phases
1. ✅ **Card mirrors the submission** (quick win, no import needed) — build `_EnquiryDetailCard.tsx` rendering `formCapture` faithfully (the exact submitted fields, in order) as layer A, + Aqua contact fields (layer B) alongside, + the comms panel (**reuse `EnquiryCommunications`**). Clicking a row opens it (drawer — see decision).
2. ✅ **Import forms** — extend the form-scan to extract field schemas; add the "Import forms" button to the add-website / Aqua Tags flow; store schemas on the website source.
3. ✅ **Layout from schema** — the card uses the imported form schema as the template (so even fields left blank in a submission show in the form's shape), matched to the enquiry by form name/id.
4. ✅ **Aqua contact layer** — the internal CRM fields, editable inline, with "form didn't provide this — add manually" affordances; link matched lead/contact/client.
5. ✅ **Polish** — Portal visual language, "—" for genuinely empty, never invent.

## Reuse
`formCapture` (submitted fields already on the item) · `EnquiryCommunications` + `FormSubmission` · `aquaTagDetection.scanFormsInHtml` + `safeSiteFetch` (extend for schema) · `websiteSources` (store schemas) · the Aqua Tags wizard scan step.

## Decisions (Ed)
- **Open as:** side drawer (reads most like "open a card") / in-place expand / modal?
- Where "Import forms" lives — in the add-website flow, the Aqua Tags wizard, or the inbox Channels website-sources config? (All are candidates.)
- When a form changes on the site, re-import (overwrite) vs version the schema?

## Done when (verified)
Clicking an enquiry opens a card whose fields **match the real form it came from**, with Aqua's contact fields alongside (manual where the form lacks them); "Import forms" on a website pulls the real form schemas and drives the layout. Visually confirmed + a behavioural test on the schema import + card plumbing.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/app/portal/agency/inbox/_EnquiryDetailCard.tsx`
- `src/app/portal/agency/inbox/_MasterInbox.tsx`
- `src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx`
- `src/server/websiteFormSchemas.ts`
- `src/server/enquiryContactDetails.ts`
- `src/lib/enquiries/enquiryFormLayout.ts`
- `src/lib/server/integrations/aquaTagDetection.ts`
- `src/app/api/portal/website-enquiries/form-template/route.ts`
- `src/app/api/portal/website-enquiries/contact-details/route.ts`
- `src/app/api/portal/website-sources/route.ts`
- `src/server/types.ts`
- `scripts/smoke-import-forms.test.ts`
- `scripts/smoke-enquiry-detail-card.test.ts`
- `scripts/smoke-enquiry-contact-details.test.ts`
- `docs/development/plans/enquiry-detail-card.md`
