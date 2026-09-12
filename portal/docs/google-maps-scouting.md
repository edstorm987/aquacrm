# Sales scouting, research, and outreach

## Current workflow

The Sales focus sidebar is one operating loop over the existing agency-scoped
Prospect records:

1. **Scouting** (`/portal/agency/scouting`) is intake only. It provides the live
   Google Maps canvas, manual/networking capture, and mapped CSV/TSV/XLSX
   intake. New records always start as `unreviewed`.
2. **Researching** (`/portal/agency/researching`) is an optional, revisitable
   workbench over every active Prospect. It holds contact and company facts,
   private notes, live Maps context, research links, fit, and an optional core
   brief. A record can be researched before, during, or after contact.
3. **Outreach Command** (`/portal/agency/prospecting`) is another workbench over
   every active Prospect. It provides Power Dialler, Email, and Pipeline views,
   the contact dossier and research context, manual DM/SMS/WhatsApp/in-person
   outcomes, a channel-aware outreach plan and exact callbacks,
   staff-attributed history (including research edits and callback resolution),
   last-attempt and last-conversation summaries, and
   a link to call playbooks. Email can go through a connected Resend/SMTP sender
   or open as a reviewed draft in the default email app. The device handoff is
   recorded only as attempted until the operator records what really happened.
   Calls and emails remain deliberate one-recipient actions; this release does
   not auto-dial or bulk-send.
4. **Meetings** (`/portal/agency/meetings`) operates on the same Lead and
   Contact meeting records. It supports booking, rescheduling, reminders,
   preparation, outcomes, and chronological actor-attributed interaction
   history; it is not a read-only copy of the future-meeting feed.
5. **Inbox** (`/portal/agency/inbox`) remains the communication and action
   surface.
6. **Contacts** (`/portal/clients?view=contacts`) is the existing consolidated
   Journey Contacts screen, exposed directly while the Sales focus is active.

The Owner view without a department focus remains consolidated around Journey.
Journey shows the same acquisition views as tabs and renders active Prospect
cards in its Scouting column beside the later Lead stages. A person may go
straight from Scouting to outreach, return to research later, change channel,
book a meeting, or move backwards when new evidence demands it. The six
separate Sales rows are focused workbenches, not six new stores or mandatory
gates.

## Google Maps boundary

Scouting embeds the supported Google Maps Embed API `search` mode as the main
canvas, initially centred on a useful Stafford-area business search. Google's
map, listings, search box, pan, zoom, and place controls remain Google's own;
AquaCRM does not place a fake search/results layer in front of the map.

The map is a cross-origin iframe. AquaCRM cannot read which listing the operator
clicked and does not scrape Google. When a business is worth keeping, the
operator uses Google Maps' Share action, opens **Capture from map**, and records
the share URL plus the business/contact facts they choose to retain. Broader web
research opens in a separate browser tab because normal Google Search and many
publisher sites prohibit framing.

If the Embed API key is absent or refused, the page says so and offers the same
Google Maps search in a new tab plus manual capture. It does not show invented
local results or imply the map is connected.

## Spreadsheet and Claffy intake

Scouting accepts `.csv`, `.tsv`, and `.xlsx` lists, including Claffy exports.
Before saving, the operator sees the detected headings and sample cells and
maps each source column to one allowed Prospect field:

- Business name, person, email, phone, website, address, and Google Maps URL.
- Niche, tags, source, and research notes.

One source column can map to one destination field. A file must map at least a
business name, person, or website, must be no larger than 5 MB, and one request
may contain at most 500 data rows. XLSX archive entry and expanded-size ceilings
bound decompression before its XML is parsed. Default source, niche, and tags
can classify the batch. Notes are retained and every imported record starts
`unreviewed`, but it is immediately available in both Researching and Outreach
Command. Research is never a prerequisite for contact. Search and bounded
pagination keep every matching imported record reachable; Scouting does not
silently stop rendering after the first eight rows.

The Contacts screen links its spreadsheet action back to
`/portal/agency/scouting?import=1` for this reason. Raw lists enter Scouting;
qualified records enter Journey through the existing guarded Prospect-to-Lead
transition.

## Record ownership and known limitation

Scouting, Researching, Outreach Command, and the Scouting column in Journey use
one Prospect service and update the same Prospect id. Qualification state
offers workflow guidance but does not exclusively assign a record to a desk.
Outreach history, suppression state, follow-ups, and conversion lineage stay
attached to that record rather than being copied into per-screen UI state.
Actor IDs are resolved only to users in the current agency before staff names
are shown in the timeline, and raw actor IDs are not sent to the browser.

When a Prospect is qualified, the Lead receives a server-owned Prospect
backlink plus a structured acquisition snapshot. That snapshot retains the
original Prospect id, capture time, research editor, qualifier, outreach and
note actors, callback creator/resolver, stable attempt ids, and the dossier as
it existed at qualification. Replaying qualification repairs the same link
rather than appending a second acquisition. Human-readable Journey events are
a projection of that evidence, not the only copy of it.

Prospect is intentionally a pre-qualification dossier rather than the canonical
human record. Manual, website-enquiry, CSV, and qualified-Prospect Lead paths
resolve an agency-scoped Person; direct Contact creation does the same. A
Lead-to-Contact-to-client promotion preserves the exact `personId` and stamps
explicit Lead lineage. Shared phone numbers and email addresses are useful
matching signals, not proof that two people are identical, so shared mailboxes
do not silently collapse unrelated records. Prospect, Lead, Contact, Person,
and Client remain purpose-specific records linked by stable identifiers; they
are not falsely described as one physical database row.

The provider attempt and the later human outcome are separate evidence. Call or
email delivery records who initiated it; the operator who later records the
outcome is attributed independently, without rewriting the provider timestamp.
Meeting attempts similarly retain their actor. Legacy rows without attribution
are labelled honestly instead of assigning them to the current viewer.

Website enquiries become part of the same flow only through the authenticated
classification write. A Sales classification ensures the active Lead and its
acquisition dossier before the board card is projected, and the Inbox links to
that exact Lead rather than a guessed shared-email match.

## Access and provider configuration

- The three interactive Prospect workbenches currently require an agency owner or
  manager with `growth.outreach` use access.
- Import and dismissal require Outreach `manage` access. Moving a qualified
  prospect into Journey additionally requires Leads `use` access.
- An explicit provider action may target an active scouting Prospect or a
  qualified Prospect whose exact linked Lead still exists in this agency and is
  neither archived, converted, nor Won. Recipient-only resolution remains
  scouting-only so an old qualified dossier cannot shadow legitimate Contact
  communication.
- This release does not grant the desks to an `agency-staff` Sales seat. Staff
  navigation and API policy must be designed and accepted separately before a
  hired caller is onboarded.
- Set `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` to a browser-visible key that has
  only Maps Embed API enabled and HTTP-referrer restrictions for the exact local,
  staging, and production origins that render AquaCRM.
- A server-side Places Text Search endpoint remains elsewhere in the codebase,
  but the map-first Scouting interface does not call it and does not require a
  Places key.

Use separate keys/projects for staging and production where practical. Provider
credentials, billing controls, quota alarms, and accepted Google terms are
deployment-owner gates and cannot be proven by source tests.

## Security and incident response

- Every declared Leads Pipeline API method has an explicit Growth workspace-
  element policy, independently of sidebar visibility. Unclassified future
  methods fail closed; the signed Stripe webhook is the sole documented public
  exemption.
- The iframe uses `strict-origin-when-cross-origin` so referrer restrictions can
  validate the site without receiving the complete CRM path.
- Provider and research links use explicit external navigation with opener
  isolation; arbitrary websites are not rendered as trusted Aqua content.
- Preview and import share the same streaming request bound. Files and JSON
  text are limited to 5 MB, XLSX archive expansion is bounded, and batches over
  500 rows are rejected before the first record write. Uploaded fields then
  pass through the Prospect input constraints and only mapped, allowlisted
  destinations are accepted.
- Contact-to-client conversion acquires a durable request claim before client
  creation. Identical concurrent requests converge on one client; a reused
  operation with changed options fails with a conflict instead of creating a
  second client.
- Outreach uses the protected call/email routes and suppression checks. Raw
  SMS or WhatsApp links are not presented as an unlogged shortcut in Outreach
  Command.
- Provider writes use stable attempt ids so a delivery response can be retried
  or its ledger repaired without repeating the external send. Recipient binding
  prevents a browser from pairing one Prospect's id with another person's
  address or number.
- Twilio, Resend, and SMTP are called only after the recipient resolves to one
  exact Prospect, Lead, Contact, or Client acquisition component. An unknown or
  shared recipient with no exact selection is refused before provider I/O;
  device/manual handoff remains available and does not claim delivery.
- Provider replay admissions retain only a fingerprint and typed Prospect or
  Lead, Contact, or Client lineage, expire after 30 days, and are pruned both on
  new admissions and by scheduled maintenance. Client erasure removes
  subject-linked call, email, and replay rows by exact lineage while preserving
  unrelated people who happen to share an email address or switchboard. If a
  legacy identity-only client is ambiguous, erasure stops and retains the client
  for review/retry rather than deleting across the shared route or reporting a
  false success.
- Meeting details, evidence, and a new interaction are saved through one
  mutation. HTTP(S) asset URLs and bounded text are validated before writing;
  timestamps and actors are server-controlled and interaction history has a
  hard 1,000-entry ceiling.
- If Maps usage or spend is unexpected, disable or rotate the Embed key, inspect
  Google Cloud usage, correct referrer/API restrictions, and retain AquaCRM
  audit evidence before re-enabling it.

Before enabling Google Maps in a public deployment, ensure the public Terms and
Privacy Policy cover the applicable Google Maps Platform terms, including any
EEA-specific terms for the billing account.

Official references:

- <https://developers.google.com/maps/documentation/embed/embedding-map>
- <https://developers.google.com/maps/api-security-best-practices>

## Acceptance status

The feature is not accepted merely because its routes compile. The release gate
must include:

- State-partition, import-mapping, access, outreach-ledger, navigation, and
  conversion tests.
- Desktop, 768 px, 390 px, and 320 px browser runs, plus 200% zoom.
- Keyboard and screen-reader semantics for map fallback, capture forms, mapping
  modal, mode switcher, contact dossier, and Next-contact control.
- A missing-key run and a staging run with a real referrer-restricted Embed key.
- Call and email provider evidence, suppression behavior, one-attempt ledger
  integrity, follow-up/outcome recording, and Journey hand-off.

Until those checks and the deployment/provider gates are green, this is a
locally implemented workflow rather than a production-cleared claim.
