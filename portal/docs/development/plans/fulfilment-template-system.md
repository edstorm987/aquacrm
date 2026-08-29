# Plan — The Fulfilment template system (edit once, seed everything that follows)

← [development.md](../../development.md) · [dev-editor-finish.md](dev-editor-finish.md) · [portal-tiers-and-fractal-fulfilment.md](../../portal-tiers-and-fractal-fulfilment.md)

**Status: all four phases are code-complete as of 2026-08-27 — placement
consolidated, the update lifecycle legible/applied/browser-proven, and the origin
template's boundary, projection and seed built and tested. What remains is
presentation (a review-and-seed screen) and Ed's first real use.**

## What Ed asked for

> "in Ed's (owner's) dev editors I think this is the perfect thing to integrate
> templates — like the portal templates and different product portals — to make a
> system so I can edit and seed everything that will follow. It's like the
> original product will be the agency for everyone, with all products services,
> and we can choose to develop etc."

…then, immediately and correctly:

> "actually this should mean it all lives in fulfilment"

That second sentence is Ed applying his own contract. `CLAUDE.md` already says
**Fulfilment owns the actual work after a service is sold, including technical
delivery and _the product/service operating model_.** A library of product
portal templates that every client instance is seeded from IS the product
operating model. It belongs to Fulfilment.

## The good news: the spine exists, and it is already Fulfilment's

Verified against source 2026-08-27, not assumed:

- **Template → instance, with version pinning, is built.**
  `ClientPortalTemplateRecord` (`types.ts:2476`) is agency-scoped and carries
  `productId`, `baseTemplateId`, `draft`, `published`, `publishedVersionId` and a
  `versions` history. `ClientPortalInstanceRecord` is the per-client instance and
  pins **both** `templateId` and `templateVersionId` — so an instance knows which
  version of the template it was seeded from, which is the hard part of any
  "edit once, everything follows" system.
- **A portal template is provisioned per product automatically.**
  `ensureProductPortalTemplate(agencyId, product, actorUserId)`
  (`src/server/clientPortalDesigns.ts:67`) creates — or upgrades — the template
  for a product, named `<product> · <template>`, inheriting from a master via
  `baseTemplateId` (`:90`, `:341`).
- **The product vocabulary already names the kinds Ed means.**
  `AgencyProductPortalTemplateKey` = `website`, `brand-identity`, `photography`,
  `google-profile`, `content`, `social-ads`, `automation`, `custom-software`,
  `ongoing-care`, `business-os`, `health-check`.
- **The Dev Editor already edits templates.** `/portal/agency/portals/editor`
  mounts `DevEditor` with `templates` and `initialTemplateId`. This is the same
  one editor, pointed at a template instead of a site — exactly the "one surface
  that adapts to what it is pointed at" rule the editor was built on.
- **It is ALREADY governed by Fulfilment.** Every page under
  `/portal/agency/portals` gates on
  `requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.portals", …)` —
  view for the library, **manage** for the editor and forms. The element
  `fulfilment.portals` ("Client portal library and configuration") is registered
  in `accessModel.ts:123`.

So "it all lives in Fulfilment" is **already true of the authority**. What is not
yet true is the *placement*: the library sits at a top-level `/portal/agency/portals`
route rather than inside the Fulfilment workspace a person navigates.

## What is genuinely new

1. **Placement — fold the Portals library into Fulfilment.** One home, not two.
   ⚠ Check [hazards-and-duplication.md](../../workspace/hazards-and-duplication.md)
   first: fulfilment is named there as a feature that already exists in more than
   one place. **Move or alias the canonical copy — never add a third.** The
   authority does not change; only where a human finds it.
2. **The ORIGIN template — the one real gap.** Ed's "the original product will be
   the agency for everyone, with all products services" is an **agency-level**
   template: a canonical agency, carrying its whole product/service catalogue and
   their portal templates, from which a NEW agency is seeded. Today every
   template is `agencyId`-scoped and `baseTemplateId` inherits *within* an agency,
   so there is no cross-tenant origin. This is the piece that does not exist.
3. **Seeding downstream on purpose.** Instances pin `templateVersionId`, so the
   machinery to say "this client is on v3, the template is now v5" is present —
   but the deliberate *re-seed / upgrade / leave-alone* decision surface is not
   designed. That is the difference between a template library and a system.
4. **Ed's own seat.** He asked for this in his Dev Team editor. Since the editor
   is one component with different mounts, this is a mount + navigation question,
   not a second editor. Do not fork one.

## Phases

1. ✅ **Consolidate placement — DONE 2026-08-27.** It turned out to be two doors
   onto one room rather than a fork: the Fulfilment workspace already mounted the
   very same `PortalsWorkspace` component with the same `portalWorkspaceData`, and
   the authority was always `fulfilment.portals` (the sidebar has no Portals row
   and lights up FULFILMENT for that path). So `/portal/agency/portals` is now a
   **redirect stub** into `?view=portals`, resolving the element gate first so a
   person without access is refused rather than redirected.
   **One real gap had to close first:** Fulfilment hard-coded
   `initialView="library"`, so the Demo templates half was unreachable there — it
   now takes a `portalView` param, and the stub forwards `?view=templates` to it.
   `/portal/agency/portals/editor` and `/forms` are deliberately NOT stubs.
   Browser-verified on the sandbox lane: both redirects land on the Fulfilment
   home, the client card and its template line render, and the templates view
   opens with no overflow at 1280×900. Logged in
   [hazards-and-duplication.md](../../workspace/hazards-and-duplication.md).
2. **Make the template lifecycle legible.** Show, per template: its version, how
   many client instances are on which version, and what a re-seed would change.
   Nothing here should silently rewrite a live client portal.
3. 🟡 **The origin template — the tenant boundary is BUILT; the product shape is
   still Ed's call.** `src/server/agencyOriginTemplate.ts` owns what crosses when
   a new agency is seeded, because that is the part the open question does not
   change: whether the origin is a real agency Ed operates or a system-owned
   artefact, a client record or an API key must never appear in another tenant.

   **Nothing is contributed unless it is named.** All **88** `PortalState`
   collections are classified into `ORIGIN_CONTRIBUTES` (today: `agencyProducts`
   and `clientPortalTemplates` — the catalogue and how those services present) or
   `ORIGIN_NEVER_CONTRIBUTES`, grouped by WHY: *people*, *secrets*, *operations*,
   *tenancy*, and an honest **not-yet-classified-as-safe** bucket for things an
   origin plausibly should seed one day (phases, SOPs, task and contract
   templates) but which need their own reference-safety pass first.
   `assertOriginClassificationIsComplete()` throws the moment a new collection
   appears in neither list, so future state is **excluded until somebody decides**
   rather than silently copied.

   **No dangling references, and no borrowed identities.** A contributed record
   may only point at contributed records: `companyIds` and `sopIds` are dropped
   (and the drop is *reported*, so a review screen can say what was lost), and a
   package keeps links only to products that genuinely came across. Records are
   re-tenanted with deterministic new ids — so re-seeding is idempotent rather
   than duplicating a catalogue — and **re-attributed to the seeding actor**: the
   test caught `createdBy`/`updatedBy` on templates and every version in their
   history carrying user ids from the origin tenant, which would have handed a new
   agency a person it cannot see. A seeded template now starts from the published
   document alone, not somebody else's audit trail.

   `projectAgencyOrigin()` is pure — it describes what a seed would do and writes
   nothing, so it can back a review screen. Pinned by
   `scripts/smoke-agency-origin-template.test.ts` (**12/12**,
   `npm run smoke:agency-origin`), including a test that deliberately hides a
   collection to prove the classification check is not vacuous, and one asserting
   the projection contains no trace of the origin's client id, client name, user
   id or emails.

   **✅ Ed answered the product questions, 2026-08-27:**
   - *"just for now be a real agency I operate — I need to get this out for
     myself first. But it will be both."* → the origin is named by configuration
     (`AQUA_ORIGIN_AGENCY_ID`, `getOriginAgencyId()`), and because
     `projectAgencyOrigin` takes an agency id, a synthetic system-owned origin
     later only has to produce one. Nothing assumes which kind it is.
   - *"yes it will do designs too"* → portal designs transfer.
   - *"no phases, SOPs — individually written ones won't transfer"* → `phases`,
     `sops`, `sopGuides` and `legalDocuments` are now an explicit
     **written-material-and-lifecycle** never-bucket carrying his reason, not a
     "not yet".
   - *"contract templates — branded, no. Templates, sure."* → contract and task
     templates transfer, with the branding rule drawn where it can be drawn
     honestly: a contract template created **from a real client contract**
     (`sourceContractId`) is that client's agreement in template clothing and does
     **not** transfer at all; the rest do, and are **flagged in `needsRebrand`**
     because branding lives in free body text and a regex pretending to strip it
     would be worse than saying so. Task templates lose an SOP step reference
     (SOPs do not transfer) and any step link containing an identifier from the
     origin tenant — the step survives, the leaking link does not.

   **✅ The write path is built too.** `seedAgencyFromOrigin()` applies a
   projection with the same rule the Update button follows: **it never overwrites
   something the new agency already has.** Because the ids are deterministic,
   re-seeding after adding a service to the origin brings the new one across and
   leaves the rest alone — including any the new agency has since renamed or
   edited. It reports `created` versus `skipped` per collection, so a screen says
   "3 new services, 2 left alone" rather than claiming a wholesale copy, and
   carries `needsRebrand` through to the result. It refuses an origin or target
   that does not exist.

   **Phase 3 is code-complete at 23/23** (`npm run smoke:agency-origin`),
   including tests that the origin's own catalogue is untouched by seeding
   somebody else, that a second seed adds nothing, and that a rename made by the
   new agency survives a re-seed. What remains is presentation — a screen to
   review a projection and run the seed — and Ed's own first use, since he asked
   for the single-tenant path he needs before any multi-tenant governance.
4. **Re-seed / upgrade semantics — DECIDED and the core is BUILT.** Ed, 2026-08-27:
   *"update button with changes and possible conflicts — in other words, in future
   as I update my services I can have legacy clients etc on older versions for
   whatever reason."* So: an **offer**, never a forced upgrade and never silence,
   and **a client on an old version is a supported state, not drift.**

   `src/server/clientPortalTemplateUpdate.ts` computes what the button would do,
   pinned by `scripts/smoke-client-portal-template-update.test.ts` (**8/8**,
   `npm run smoke:portal-template-update`). It is a three-way comparison, which
   `templateVersionId` makes possible by being the merge base:

   | | meaning |
   |---|---|
   | `base` | the template document when this client was seeded |
   | `incoming` | the template's current published document |
   | `current` | what this client actually has now |

   Each differing path comes back as **clean** (template moved, client never
   touched it — safe), **conflict** (both moved — a person decides, because
   applying would discard the client's own work), or **already-matches**.
   `describeTemplateUpdate()` gives the one line to show beside a client's name,
   deliberately neutral about staying behind.

   Three deliberate properties: it **mutates nothing** (safe to call for a whole
   client list), arrays are compared **whole** (a reordered block list is one
   decision, not twenty), and when the seeded version has fallen out of history it
   reports `baseKnown: false` and marks **everything** a conflict rather than
   guessing who changed what.

   **The apply half is built too.** `applyClientPortalTemplateUpdate({ plan,
   current, accept })` merges only the accepted paths into the client's document
   and returns `{ document, accepted, declined, fullyApplied, advanceVersionPin }`.
   A declined conflict simply is not applied — the client keeps what they had,
   which is the point of showing conflicts at all. It is pure: it returns a NEW
   document and never writes, publishes or moves the pin, because draft → review →
   publish are separate reversible steps here and a merge helper must not quietly
   publish to a live client portal. It also ignores any path that was not on
   offer, so a caller cannot smuggle an edit through the accept list, and a field
   the template DROPPED is removed rather than left as `undefined`.

   **Version-pin semantics the caller should follow, and why:**
   - *Accept everything* → `fullyApplied: true`; advance `templateVersionId` to
     `plan.toVersionId`. They are genuinely on the new version.
   - *Accept some* → still `advanceVersionPin: true`. This is a merge and the
     declined changes are **resolved, not pending** — keep the client's values and
     move the base. Otherwise the same declined change is offered forever, which
     is how a person learns to ignore the button.
   - *Accept nothing* → `advanceVersionPin: false`. Nothing moves. The client
     stays legacy, deliberately, and the offer stands next time.

   **The route is built too.** Rather than a third home, the two actions were added
   to the existing `/api/portal/client-portal-design` endpoint (reuse → repurpose →
   simplify): **`update-plan`** returns the plan plus its one-line summary and
   writes nothing, and **`update-apply`** merges the accepted paths. Persistence
   lives beside the other instance mutations as `planClientPortalUpdate()` /
   `applyClientPortalUpdate()` in `clientPortalDesigns.ts`, which writes the
   **draft** and advances the pin only when something was accepted, then logs the
   decision (accepted, declined, from/to version) to the activity log.
   Authority is the existing gate: owner-or-manager, plus `client.portal` **use**
   to plan and **manage** to apply — changing a live client's portal is manager
   work. Pinned by `scripts/smoke-portal-update-route.test.ts` (**7/7**) driving the
   real handler: planning writes nothing, applying touches the draft while the live
   portal stays byte-identical, a declined conflict keeps the client's wording and
   does not move the pin, a resolved change is not offered again, and agency-staff
   is refused with nothing written. Combined gate **21/21** via
   `npm run smoke:portal-template-update`.

   **The surface is built and browser-proven (2026-08-27).**
   `listClientPortalUpdateOffers(agencyId)` gives the Fulfilment Portals list who is
   on which version and what each would receive — read-only, so rendering it never
   writes. `_PortalUpdateControl.tsx` is the button itself, mounted on every portal
   card. Its shape follows the rule: being behind is **not** a warning (a client on
   the current version gets one quiet line and no control), opening the panel only
   calls `update-plan` and writes nothing, and **a conflict starts unticked** while
   clean changes start ticked — the destructive default is "keep theirs". Without
   `fulfilment.portals` manage it is read-only: "You can see what changed."

   **Browser-accepted on an isolated `sandbox:fork` lane (3047; 3032 untouched).**
   A real client was created, its portal instance seeded from the template, and the
   template genuinely published a new version. The list then read
   *"1 change available, none affecting this client's own edits."*, Review update
   opened the panel showing **Chrome · service label — Now: Your website** with the
   box pre-ticked, and Apply reported *"1 change saved to the draft. Publish the
   portal to make it live."* Verified through the API afterwards:
   `draft.chrome.serviceLabel = "Your website"` while
   `published.chrome.serviceLabel` stayed **"Private client service"** — the live
   portal untouched — and the version pin advanced. No horizontal overflow at
   1280×900.

   What remains: the Fulfilment placement consolidation in phase 1 — the library is
   already governed by `fulfilment.portals` but still sits at a top-level
   `/portal/agency/portals` route rather than inside the Fulfilment workspace.
   ⚠ `resetClientPortalFromTemplate` (`clientPortalDesigns.ts:353`) is the blunt
   instrument this replaces — it overwrites an instance wholesale with the
   template's published document, discarding client edits with no preview. Do not
   wire the Update button to it.

## Guard rails

- **Never add a third home for fulfilment.** The hazard file exists because this
  has already happened here.
- **An instance is a client's live portal.** Editing a template must not mutate
  instances implicitly; `templateVersionId` is the contract that makes that safe.
- **One editor.** Templates, portals and repositories are mounts of the same
  `DevEditor`, not variants of it.
- **Authority stays `fulfilment.portals`** — view to look, manage to change.
  Moving the surface must not quietly widen who can edit the library every client
  is seeded from.

## Open decisions for Ed

- Does the origin template ship products/services **and** their portal designs, or
  the catalogue only, with designs authored per agency?
- ~~When the origin changes, what happens to agencies already seeded from it?~~
  **ANSWERED 2026-08-27: an offer with visible changes and conflicts, and legacy
  stays put on purpose.** The same rule should hold at agency level as at portal
  level; the planner above is the pattern to reuse rather than re-invent.
- Is the origin a real agency record Ed operates, or a distinct system-owned
  artefact that no tenant can see?
