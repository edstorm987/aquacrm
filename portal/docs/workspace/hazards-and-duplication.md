# Chapter — Hazards & duplication (read before editing)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

This is the "don't get burned" page. Every place where two things look alike,
where editing the obvious file is the wrong move, or where a change hits **real
data**. If you read one chapter before touching the codebase, read this one.

---

## 🔴 Live-data hazards (real, un-sandboxed)

- **Live Supabase is not sandboxed.** `PORTAL_BACKEND=file` guards the local state file only. The Supabase **admin client reads env directly**, so any code path through `lib/supabase/admin.ts` hits the **real** auth + `brand_enquiries` + Storage project — even in local dev.
- **The env safety classifier blocks scripts that hard-delete live Supabase rows.** That's why `scripts/cleanup-junk-enquiries.mjs` exists for **Ed to run himself**, not me. Never expect me to run a live hard-delete.
- **What's live:** see the [API chapter's LIVE callout](api-and-routes.md#-live-supabase-callout-dont-break-real-data). Short version: all auth, all `brand_enquiries` enquiry endpoints, `telemetry/collect`, and all Storage-bucket file uploads.
- **Dev/demo inboxes load ZERO enquiries** (`agency/inbox/page.tsx`: `session.isDemo ? []`). The enquiry-delete button and master-tag ingestion only appear in a **real** (non-demo) inbox — don't conclude they're broken from the sandbox.

### A real person's identity is a SOURCE CONSTANT — erasure cannot reach it (2026-08-31)

**The audit that produced this entry.** Demo- and sample-seeded PII was checked
against the governance erasure surface for the first time on 2026-08-31. Two
halves, and they answer differently.

**The half that is fine.** Everything the demo seed *stores* is erasable, and
proven so: a demo tenant seeded by the real `seedDemoAgency()` appears in
`buildGovernanceSnapshot().erasureClients` (so the Governance workspace offers
it), and `eraseClientCompletely()` removes the client record, the client-owner
user carrying the demo email, and the seeded activity. Nothing about a demo
tenant is exempt from the sweep. Pinned in
`scripts/smoke-client-erasure.test.ts` → *"data-compliance check: demo-seeded
PII against the erasure surface"*.

**The half that is not.** A real person — Ed's client Felicia of Luv & Ker —
is **hardcoded in six source files as a runtime default**, and erasure
operates on *state*, not on the codebase. Erase the demo client and the next
seed puts the same name and email straight back. Worse, one of the six is not
demo data at all: `src/app/api/tenants/seed/route.ts` defaults its client-owner
to `felicia@luvandker.com` — a **real address on a real domain**, not the
`.demo` mirror — and that route answers any authenticated caller in production.
(It refuses with 409 once any agency exists, so it cannot re-seed a populated
install; the real address ships in the bundle either way.)

The six files, and what each holds:

| File | What it hardcodes |
| --- | --- |
| `src/lib/server/seeds/demoSeed.ts` | `DEMO_CLIENT_NAME`/`DEMO_CLIENT_EMAIL` (`felicia@luvandker.demo`), `"Felicia (demo)"`, `luvandker.com` |
| `src/app/api/tenants/seed/route.ts` | **`felicia@luvandker.com` — the real address**, `"Luv & Ker"`, `"Felicia"` |
| `src/built-ins/modules/website-editor/src/components/blockRegistry.ts` | `Felicia` as the testimonial author, team-grid member and author-bio default |
| `src/built-ins/modules/website-editor/src/components/blocks/AuthorBioBlock.tsx` | fallback bio: *"Crafted Odo by Felicia from her Ghanaian heritage…"* — **personal, ethnic-origin prose** shipped as a `??` default |
| `src/built-ins/modules/website-editor/src/components/pageTemplates.ts` | `Felicia` as a template testimonial author |
| `src/lib/projects/projects.ts` | the published `Luv & Ker` case study |

The count fell from seven to six on 2026-09-01 when the obsolete
`_BuildPortalWizard.tsx` runtime was removed; its preset can no longer restore
the persona. The retired website-editor `SitesPage.tsx` placeholder entry was
removed from the non-runtime list for the same reason.

**What this means when you edit here.** Do not describe erasure as removing a
person's data from AquaCRM without qualifying it — for these six files it
removes the row and not the persona. `semanticRegistry.ts`'s `client` entity now
says so in its `retention` line, which is the machine-readable copy of this
entry. And **do not add a seventh**: the same test sweeps `src/**` for the
persona tokens (skipping comments and `placeholder` text) and fails on any file
not listed above, so a new hardcoded default has to be argued for here first.

**What the sweep deliberately does NOT catch — so six is the count of runtime
defaults, not of every appearance.** Lines whose only hit is inside a comment, or
on a line containing `placeholder`, are exempt: a comment is context for the next
reader and a form placeholder is example text the user overwrites. That exemption
is a judgement, and it hides real occurrences that are still compiled into the
bundle and rendered on screen — at least these:

| File | Placeholder-shaped occurrence |
| --- | --- |
| `src/built-ins/modules/fulfillment/src/components/NewClientModal.tsx` | `placeholder="felicia@luvandker.com"` and `"e.g. Luv & Ker"` — the **real address**, shown in the new-client form |
| `src/built-ins/modules/website-editor/src/pages/EditorPage.tsx` | `luvandker.com` as the custom-domain placeholder |
| `src/built-ins/modules/ecommerce/index.ts` | `https://luvandker.com/checkout/...` as the Stripe URL placeholders |

If a reviewer decides placeholders are not exempt, the rule is one line in the
test (`if (/placeholder/i.test(code)) return false;`) and these files join the
table above. Until then, do not read "seven" as "seven places the name appears".

**Two decisions for Ed — not taken unilaterally.** (1) Replacing the persona
with a synthetic one is mechanically small, but it is *his* demo branding and it
re-pins several website-editor smoke tests, so it is his call, not a worker's.
(2) The demo-data **retention period** is Q4 in the DPO pack and stays open;
until it is answered, nothing may publish "we delete after X" wording. The
`AuthorBioBlock` ethnic-origin bio and the real `felicia@luvandker.com` default
in the seed route are the two worth deciding first — those are special-category
prose and a live address, not just a name.

---

## 🟠 Confirmed duplication (two real implementations — pick the right one)

### Fulfilment — THREE spellings that diverge (highest-risk)
| Path | What it is |
| --- | --- |
| `src/built-ins/modules/fulfillment/` | the **plugin** (American spelling) |
| `src/app/api/portal/fulfillment/` | the **plugin's API** (American) |
| `src/app/portal/agency/fulfilment/` | a **separate hand-rolled British-spelled workspace** outside the plugin system |
Editing one does **not** change the others. Confirm which surface you're on before touching fulfilment.

### Two contacts systems
- `src/app/portal/agency/contacts/` (`_ContactsIndex` + `_ContactCard`) — the canonical people/CRM view over `persons`.
- `src/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.tsx` (1494L) — the older **CSV rolodex** from the `leads-pipeline` plugin.

### Two "who is this person" models
- `lib/clients/clientContacts.ts` — simple contacts embedded on a client.
- `lib/server/identityResolution.ts` + `personInteractionsService.ts` — the resolution graph.

### Two client activity logs
- `lib/clients/clientRelationshipRecord.ts` (client-safe) vs `lib/server/clients/clientRecordLedger.ts`. Confirm canonical before writing history entries.

### Aqua-tag analytics twice
- `agency/fulfilment/_AquaTagsWorkspace.tsx` **[new]** vs `agency/performance/_AquaTagDashboard.tsx`.

### Aqua Tag ↔ editor protocol — one definition, one alias
**Canonical:** `src/engines/editor/editing/aquaTagBridge.ts` — message names,
payload types, the parser and the origin policy.

`src/lib/integrations/aquaExplorerBridge.ts` is now a **re-export alias only**
(the older `AquaExplorer*` spelling, kept so the Project Explorer and its tests
keep working). It declares nothing. **Do not add types there** — that rebuilds
the duplication it was collapsed to remove. New code imports the bridge directly.

The third copy is unavoidable and is guarded rather than removed:
`src/lib/integrations/aquaTagSource.ts` is a template string of browser JS served
at `/aqua-tag.js`, so it *cannot* import TypeScript. `scripts/smoke-aqua-tag-bridge.test.ts`
asserts the tag's literals, protocol version, `explorerDescribe` field list and
patch allow-list all match the bridge. **If that test fails, make the two agree —
never relax the assertion.**

⚠ `explorerTargetOrigin()` in the alias file is **deprecated and falls back to
`"*"`**, which posts to whatever page now occupies the frame. `aquaTagOrigin()`
returns `null` instead. Its call sites in `_FirstPartyProjectWorkspace.tsx` are
unchanged and still carry the old behaviour.

### The working-tree walk — one copy, moved 2026-08-21
`src/engines/editor/server/workspaceFiles.ts` is **canonical**. The identical
walk used to be a private `async function walk()` inside
`src/app/api/portal/site-editor/files/route.ts`; MAP needed the same tree, and a
second walk would have been a second set of rules about what is hidden (`.env`,
`.git/`, `.data/`, dot-directories, symlinks) — which is how a credential file
eventually ends up listed by one of them. The route now imports
`readWorkspaceFiles`. **Do not re-add a walk to the route**;
`scripts/smoke-editor-write-path.test.ts` asserts it has none, and
`scripts/smoke-dev-project-map.test.ts` drives the real walk over a temp
directory.

### "Publish goes to git" — HALF wired (2026-08-21). Read which half.
Ed's stated intent — *"the edits you make on dev editor when published just go to
git its so simple"* — is now true **for the words on a tagged page, and nothing
else**. Before adding a second path, know which one already exists.

**WIRED.** `patch.ts` → `publish.ts` finally has a caller:
`src/engines/editor/server/sourceEdit.ts`, behind **POST
`/api/portal/dev/source-edit`** (`find` then `publish`), driven from the Aqua Tag
words panel in `DevEditor.tsx` (`WordsSourceSave`). It commits to
`aqua-editor/<projectId>` from the commit the search read, opens a pull request,
and refuses a moved branch or a changed line. **Do not write a second route that
calls `publishEdits`** — extend this one.

Two things about it that look like bugs and are not:

* **It SEARCHES the repository for the words.** That is not laziness, it is the
  only option: `AquaTagElement` carries no file or line, `data-aqua-src` /
  `parseSourceStamp` are referenced by nothing but their own module, and
  `elementSource.ts` reads React fibers, which no browser exposes cross-origin.
  So FIND guesses and a human confirms. If somebody later makes the build stamp
  `data-aqua-src`, the search becomes a fallback rather than the mechanism.
* **It refuses `<`, `>`, `{`, `}` in JSX text** (and the delimiter inside a
  quoted value). Splicing a `{` into a heading makes the JSX an expression and
  the site stops building — refusing is recoverable, committing is not.

**STILL NOT WIRED — these have no path to git:**

* **Dev-mode CODE saves.** They POST `/api/portal/site-editor/files`, which
  writes this server's working tree and, for a repo-backed project, **refuses**
  with *"This project is backed by a repository — changes are committed and
  published, not written to this workspace."* That refusal is a deliberate
  backstop (the "+" button once created files in AquaCRM's own tree) — do not
  weaken it; give it the commit path instead.
* **Styling and image edits** through the tag are still a live preview patch,
  gone on reload. The panel says so, separately from the words now.
* **The `portalTarget`-gated Publish button** still POSTs
  `action: "publish"` to `/api/portal/client-portal-design`, promoting a portal
  design draft **inside AquaCRM's store**. It never touches git, and it is a
  different thing wearing the same word.

`githubSource.ts` stays read-only (`readRepoTree`, `readRepoHeadSha`,
`readRepoFile`) — `publish.ts` is still the only code in the repo that can write
to GitHub.

### "Is there a portal?" and "is there a browser?" are TWO questions
`DevEditor.tsx` keeps both, deliberately named apart (2026-08-21):

* `portalTarget = projectKind !== "software"` — owns the genuinely portal-only
  machinery: portal pages, the lifecycle stage, the draft/publish pair, the
  portal builder, the client/template selectors.
* `browserAvailable = portalTarget || tagMapped` — owns whether a live page can
  be shown and clicked. `tagMapped` comes from the server's one rule
  (`devProjectMapStatus(...).browserAvailable`), passed in as `projectTagged` and
  refreshed from `/api/portal/dev/projects` `statuses[id]`.

They were the SAME flag, and because every project defaults to kind `software`
that gated the browser off everything Ed builds. **Do not collapse them back.**
The `portalTarget` half of `browserAvailable` is the one exemption and it is
narrow: the Aqua-hosted portal preview is a page this app renders itself and it
reports selections through the first-party block protocol — the tag's job done by
our own renderer. Every other page needs the tag.
`scripts/smoke-dev-editor-tag-bridge.test.ts` pins both names.

### Two ways to point at something — they answer different questions
Both live in `DevEditor.tsx` and both are real:

* `picking` + `editing/elementSource.ts` — a click listener attached to the
  previewed **document**, reading React fibers to answer *"which FILE renders
  this?"*. Same-origin only, by construction.
* the Aqua Tag bridge — a `postMessage` protocol answering *"which ELEMENT is
  this, and what are its exact words?"*. Works cross-origin; that is the point.

Neither replaces the other. Do not "unify" them into one picker — one needs the
DOM and the other cannot have it.

### "Is the browser unlocked?" — ask ONE function
`devProjects.devProjectVisualEditorUnlocked(project)` → `Boolean(project.aquaTagId)`.
`devProjectMapStatus(project).browserAvailable` is the same value, and
`/api/portal/dev/projects` GET/POST send it to the screen as `statuses[id]` /
`status` **precomputed** so no client re-derives it. Do not re-implement the
check inline (`project.aquaTagId && project.kind !== ...` is the exact expression
that was wrong). Note `DevProjectMapStatus` lives in `src/server/types.ts`, not
beside the function — a client component must be able to name the type without
dragging `server-only` into the browser bundle.

### Two block registries — and the copies the element engine exists to delete
The **element vocabulary was lifted out of the website-editor plugin into
`src/engines/editor/elements/`** by element-engine P1+P2 (2026-08-20). `src/engines/editor/elements/index.ts:1-12`
names the duplication it was built to remove, in its own words: *"two block
registries with 14 of 16 types duplicated, three `BlockStyles`→CSS mappers, two
prop-schema vocabularies."* Nothing has been deleted yet — the lift is what makes
deleting possible — so all of it is still live and still drifts.

⚠ **Treat that "14 of 16" as the author's shorthand, not a measurement.** Comparing
the two registries by *exact type name* on 2026-08-20 gives an overlap of **4**
(`hero`, `image`, `video`, `divider`), not 14 — the other twelve client-portal
types are portal-specific live-data blocks (`metrics`, `service-grid`,
`product-hub`, `file-list`, `activity`, `request-form`, `approval-panel`,
`file-upload`, `link-list`, `custom-extension`, `callout`, `rich-text`) whose
website counterparts, where they exist, are named differently. The duplication is
real; the number is not one to plan a deletion against. **Re-measure before you
delete anything.**

| The twins | Where | Status |
| --- | --- | --- |
| **Block registry A** — 70 website element definitions + their lazy loaders | `built-ins/modules/website-editor/src/components/blockRegistry.ts:157` (`BLOCK_REGISTRY`) | live; **stays there on purpose** (`lazyBlock` is a hand-rolled `React.lazy` because `next/dynamic` throws under `--conditions react-server`). It now *pushes* into the shared lookup via `registerElementDefinitions` |
| **Block registry B** — 16 client-portal block types | `src/lib/portal/clientPortalBuilder.ts:18` (`CLIENT_PORTAL_BLOCK_REGISTRY`) | live, **independent**, its own `ClientPortalBlockType` union and its own `BLOCK_TYPES`/`BLOCK_TONES`/`BLOCK_WIDTHS`/`BLOCK_SPACING`/`BLOCK_ALIGNMENT` sets (`clientPortalBuilder.ts:42-52`). Exactly 4 of its 16 types share a type name with registry A — see the caveat above |
| **The shared lookup** (not a third registry) | `src/engines/editor/elements/registry.ts` | the surface-filtered `getElementDefinition`/`getElementRenderer` both sides are meant to converge on. `ElementSurface` is `"website" \| "portal" \| "stage"` (`definition.ts:37`) — **`"stage"` has no consumer yet**; the stage builder it was designed for is not built, so don't read its presence as a third live surface |

**Styles→CSS mappers, three of them:** `blockStylesToCss` (`src/engines/editor/elements/blockStyles.ts:11`, canonical) ·
`styleString` (`built-ins/modules/website-editor/src/server/staticExport.ts:64`, the static-export path) ·
the client-portal tone/width/spacing/alignment mapping inside `clientPortalBuilder.ts`.
`built-ins/modules/website-editor/src/components/blockStyles.ts` is **no longer a
mapper** — it is a 9-line re-export of the canonical one, kept so every block
component's `../blockStyles` import still resolves.

**Prop-schema vocabularies:** `PropField` (the *form-widget* descriptor) and the
**generated** `ElementSchema`/`ElementPropSchema` (the *validity* contract) both
live in `src/engines/editor/elements/{definition,schema}.ts` — and there is deliberately no
way to hand-write an `ElementSchema` (`schema.ts:5-13`), because a second
declaration of the same contract is exactly the drift being deleted. The plugin
system's own field vocabularies (`SetupField`/`SettingsField`,
`built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts:101,187`) are a
**different** contract for install/settings forms — don't fold them together, and
don't add a fourth.

**So, before you add an element:** extend `src/engines/editor/elements` + register into it.
Do **not** add a type to `CLIENT_PORTAL_BLOCK_REGISTRY` and a near-twin to
`BLOCK_REGISTRY` — that is how 14 of 16 got duplicated the first time.

**And do not write a fourth "what can I add here" list.** `src/engines/editor/elements/palette.ts`
(`elementPalette(surface)`) is the ONE answer, for every surface — the Dev Editor's add menu and
its Builder tab both read it. Its portal branch deliberately reads `PORTAL_ELEMENT_PAIRINGS`
rather than `listElementDefinitions("portal")`, because the shared lookup answers in the SHARED
names (`banner`, `text`) and a portal page stores the PORTAL's names (`callout`, `rich-text`);
inserting the shared name would write a `ClientPortalBlockType` that does not exist. That is a
naming layer over one registry, not a second registry.

**The website vocabulary only exists in a bundle that imported it.**
`registerElementDefinitions` runs as an import side effect, so
`listElementDefinitions("website")` legitimately answers `[]` in any bundle that never pulled
`blockRegistry.ts`. That is what emptied the Dev Editor's palette for months. Reach it through
`ensureWebsiteElements()` (`src/engines/editor/elements/websiteElements.ts`) — never by adding a
static import to a component, which drags the whole metadata table into that route's first paint.
Its indirection module `websiteVocabulary.ts` is **load-bearing**: the plugin's `package.json`
declares `"type": "module"` while `portal/`'s does not, so a direct
`await import("@/built-ins/.../blockRegistry")` crosses ESM/CJS under `tsx` and throws
*"does not provide an export named 'getElementDefinition'"* before any test can run.

### Two inbox surfaces — VERIFIED DISTINCT, do NOT merge (2026-08-30)
`agency/inbox/` (`_MasterInbox`) is the merged **Master Inbox** command surface — Needs-you /
Inbox / Updates over operational alerts, website enquiries, social and client conversations, plus
the actions queue. `agency/activity-inbox/` is a **standalone read-only system-history log**
(`listActivity`, limit 100). They do different jobs and cross-link on purpose: the Master Inbox
header launches "Activity log" (`_MasterInbox.tsx`) and the log's header offers "Open inbox"
(`activity-inbox/page.tsx`). Both links are pinned by `scripts/smoke-nav-audit.test.ts`, and
Operations reachability for `/portal/agency/activity-inbox` is pinned there too. Retiring or
rehoming the standalone log is a **separate open product decision** recorded in
`docs/development/plans/my-tools-palette.md` (its sidebar drop was a deliberate AquaOasis
override) — it is Ed's call, not a cleanup.

**The real duplication was the wording, and the render sites are fixed.** Four surfaces render the
same `listActivity` feed: the Activity log page, the dashboard "Today across the agency" feed
(`agency/_AgencyActivityFeed.tsx`), the Master Inbox **Updates** tab, and the client workspace
"recent movement" panel (`clients/[clientId]/page.tsx`). Two carried their own drifted copy of the
internal→product rewrite and the other two rendered the raw internal message, so one event read
"plugin installed" on one surface and "system activated" on another. The rewrite now lives once in
**`src/lib/shared/activityVocabulary.ts`** (`activityMessage` / `activityCategory` /
`activityAction`). Any new renderer of the activity feed must import it — never re-declare the
regexes at a render site. `scripts/smoke-nav-audit.test.ts` pins the shared module and asserts all
four surfaces source it.

**Still open, do not read the above as "done everywhere":**
- `src/lib/server/clients/clientRecordLedger.ts` (and the `clientRecordLedgerEvents` block in
  `clients/[clientId]/page.tsx`) still write `entry.message` / `entry.category` verbatim into
  **persisted** ledger rows. Routing those through the shared module changes stored data, not just
  a render, so it was left as a separate decision.
- Category **chip** labels come from `categoryStyle()` in `src/lib/chrome/activityCategoryStyle.ts`
  — a second live category→label map that disagrees with `activityCategory`: `tenant` reads
  "Business" on the dashboard chip and "client" in the Activity log / Updates tab. Two sources of
  category wording still exist; picking one is Ed's call.

### Two privacy notices — DELIBERATE, and `/privacy` is NOT the demo one (2026-08-31)
`/privacy` is the **published AquaCRM marketing notice**, served as a static file:
`next.config.ts` rewrites `/privacy` and `/privacy/` to `public/aquacrm-site/privacy/index.html`.
That rewrite is in **`beforeFiles`**, which Next evaluates *ahead of the filesystem*, so a page at
`src/app/(website)/privacy/` would never render — no 404, no flag, just silently unreachable. Its
content is pinned by `scripts/smoke-privacy-notice-truth.test.ts` (it holds an open, deliberate
contradiction with the Aqua Tag; read that test before editing it).

The **AquaCRM demo** notice is a different document with a different subject, and lives at
**`/demo-privacy`** (`src/app/(website)/demo-privacy/page.tsx`) behind `WEBSITE_DEMO_ENABLED`. It
was originally built at `/privacy` and was shadowed by the rewrite above — caught in review
2026-08-31 — which would have pointed the demo consent line at a document whose version is not the
one stamped on the visitor's record. `scripts/smoke-website-demo-gate.test.ts` now fails if any
demo route is shadowed by a `beforeFiles` rewrite. **Do not "tidy" `/demo-privacy` back onto
`/privacy`, and do not add a page under any other `beforeFiles` source** (`/`, `/projects`,
`/contact`, `/styles.css`, `/site-experience.js`, `/projects.js`, `/assets/*`).

Related, and NOT fixed: `src/app/(website)/layout.tsx` injects `/aqua-tag.js` on **every** page in
the route group under the *milesymedia* agency's site key and `data-property="milesymedia-website"`
— the AquaCRM demo pages included, flag or no flag. `DemoGateForm` therefore carries
`data-aqua-ignore` so the tag cannot read its field values into the live `form-capture` surface
(pinned). The remaining pageview beacons still attribute AquaCRM demo traffic to the Milesymedia
property; gating the layout's tag per brand is an open product decision.

### Two assistant conversation stores — DELIBERATE, do NOT unify (2026-08-21)
`PortalState.assistant` (keyed `${agencyId}|${userId}`, via
`src/lib/server/assistants/assistantStore.ts`) is the **Aqua Advisor's** — one private history
per PERSON. (Until 2026-08-22 the Dev Team Librarian read it too; the Librarian is now a find
tool over the file-finding skill and holds no conversation at all.)
`PortalState.editorAiConversations` (keyed `${agencyId}|${projectId}`, via
`src/engines/editor/server/editorAiHistory.ts`) is **Aqua Editor AI's** — one history per PROJECT,
shared by whoever is editing it.

The shapes are near-identical (threads of messages, newest first, capped) and that looks exactly
like something to merge. **It is the requirement, not an accident.** Ed: *"the chat history per
project only limited to a project nothing else"*. Two collections is what makes "clearing one
cannot empty the other" structural rather than a convention, and the KEYS are different concepts —
per-person vs per-project — so a merged store would need a discriminator on every read and would be
one missing filter away from the exact bleed this replaced.

Same story one level up: `editorAssistant.ts` deliberately does NOT use `isAssistantConfigured` /
`assistantModel` (the agency's `openai` connection). See `aqua dev.md` §9a. Both rules are pinned
by `scripts/smoke-aqua-editor-ai.test.ts` and `smoke-aqua-editor-ai-history.test.ts` — if those fail
because somebody re-unified the two "to remove duplication", fix the change, not the test.

### Two chat UIs — DELIBERATE, do NOT unify (2026-08-21)
`src/app/portal/agency/assistant/AssistantWorkspace.tsx` is the **Aqua Advisor's** chat surface:
a full-page/drawer client for `/api/assistant`, with memories, skills, voice and the agency
data-coverage strip, styled for a **light** page (`bg-white/35`, `text-black/90`). (The Dev Team
Librarian left it 2026-08-22: it is a FIND panel now — `components/editing/LibrarianPanel.tsx`
through `GlobalAdvisorDrawer`'s `body` seam — not a chat.)

`src/components/editing/AquaEditorAI*.tsx` (+ `editorAiClient.ts`, `editorAiSkin.ts`) is **Aqua
Editor AI's**: a narrow inspector panel for `/api/portal/dev/editor-ai` and its `history` sibling,
scoped to ONE dev project, styled for the **dark** editor (`--mode-accent`, `border-white/10`,
`bg-black/30` — and **never** `--dt-*`).

`AquaEditorAI.tsx` used to mount `AssistantWorkspace`. It must not again: that client reads AND
WRITES the per-person store, so pointing it at per-project data would render a per-project history
that the very next message merged back into the shared one — it would LOOK fixed. Pinned by
`scripts/smoke-aqua-editor-ai-ui.test.ts`, which also holds the style rules (no `--dt-*`, a visible
focus ring on every control, a `text-white/50` contrast floor on the editor's dark ground).

---

## 🟡 Drift-prone twins (same concept, `lib/` pure + `lib/server/` IO)
Kept in sync **by hand** — change one, check the other:
`clientRadar`, `clientTelemetry`, `commandIntelligence`, `brandPortfolio`,
`advisorSkills`, `personInteractions`.

Plus overlapping "intelligence" builders that are easy to confuse:
`commercialIntelligence`, `clientCommercialIntelligence`, `commercialLifecycle`,
`commandIntelligence`.

---

## 🟡 Sprawl zones (easy to add a thing in the wrong place)

- **Attention/alerts** live across seven files: `lib/operationalAttention`, `lib/attentionProtection`, `lib/customerPortalAttention`, `lib/server/operationalAlerts`, `lib/server/operationalAlertPreferences`, `lib/server/sidebarAttention`, `lib/inbox/attention*`. Find the existing owner before adding an alert.
- **Agency-seed constants** live in five files each with their own `*_AGENCY_SLUG`/owner: `demoSeed`, `founderSeed`, `aquaOasisSeed`, `showcaseMode`, `devMode`.
- **Three "company" concepts:** `server/company.ts` (own profile) vs `server/organisations.ts` (CRM companies) vs `server/tradingCompanies.ts` (trading arms).
- **Similar names, separate systems:** `server/persons.ts` (CRM contacts) vs `server/people.ts` (HR/staff).
- **Two staff directories:** `server/people.ts` `PeopleEmployee` (stations/onboarding/pay/training; agency-side console at `agency/people/_PeopleCommand.tsx`, staff-side at `portal/team/`) vs the **agency-hr plugin** `Staff` (roles/permissions/departments/client-assignments; pages at `agency/agency-hr/*` via `built-ins/modules/agency-hr`). **They share no key.** The Staff & Team plan makes **`PeopleEmployee` canonical** (the Staff Command builds on it; agency-hr `Staff` to be reconciled/retired in a later phase). Do **not** add a third staff surface — extend the People console.
- **Finance navigation — ONE source, one visible sidebar entry (was sprawling).** Finance sections are defined once in `built-ins/modules/agency-finance/src/lib/sections.ts` (`FINANCE_SECTIONS`); both the in-page tab bar (`components/FinanceNav.tsx`) and the plugin manifest `navItems` (`index.ts`) derive from it — they used to be two hand-kept lists that had drifted (Reports/Revenue, Operations/Finance operations, Overview/Finance overview). **The visible sidebar "Finance" is the single hardcoded `finance` item in `lib/chrome/sidebarLayout.ts`** — the plugin's `agency-finance.*` navItems are filtered out of the canonical agency sidebar by the AquaOasis-Web `canonicalMainIds` allow-list, so they never render there. Don't add a third registration. (The `DISCOVERED_PANEL_LABELS["agency-finance"]` label is dead — it names a panel the override discards; a foundation-owned cleanup candidate.) The founder dashboard mounts **once** at the plugin root (`""`); the old `/founder` duplicate route is gone (the `agency/[...rest]` catch-all redirects stale `/founder` links → root).
- **Payment channel: `channels.ts` is the single source; the stored value stays `PaymentMethod`.** Canonical channels are `bank-transfer | stripe | cash | other` (`PAYMENT_CHANNELS`, `built-ins/modules/agency-finance/src/lib/channels.ts`). Records still store `PaymentMethod` (which also carries a legacy `"manual"`); `normaliseChannel()` folds `"manual"` (and anything unknown) onto `"other"` for display + the money-in-by-channel breakdown. Don't reintroduce `"manual"` as a channel or add a parallel channel enum — extend `channels.ts`. The unified "money in" view lives in `components/IncomeSheet.tsx` + `lib/moneyIn.ts` (`summariseMoneyInByChannel`); it record+surfaces only — the app never holds funds.
- **Finance Stripe adapter mirrors ecommerce's — intentional, per-plugin.** `agency-finance/src/lib/stripe.ts` lifts the proven wrapper from `ecommerce/src/lib/stripe/server.ts` (this codebase vendors utilities per-plugin, so a shared copy isn't used) and adds refunds + an injectable client. Change one, consider the other. **The finance Stripe webhook is a `public: true` plugin route** resolving the agency from `?agencyId=` (Stripe has no session) — **note ecommerce's own `stripe/webhook` is NOT `public`, so it would not actually receive live Stripe calls**; the finance one is done right. **Keys are Ed's, in the ENCRYPTED INTEGRATIONS VAULT — corrected 2026-08-22, they are NOT on `install.config`.** That record is handed to page props and reaches the browser, so a secret on it is a secret in the client. Both plugins declare `secretVault: { provider: "stripe", field }` on the manifest field and read back through `lib/server/plugins/pluginSecretConfig.ts` `installConfigWithSecrets()`, which merges the vault's values under the manifest ids — so the pure `readStripeKeysFromInstall(config)` readers keep their shape and neither plugin learns about the vault. **Do not "simplify" that back to a direct `install.config` read.** Never hardcoded/logged; the app never holds funds. Refund/chargeback surface via finance events + activity only — a `finance:refund`/`finance:chargeback` operational alert is a follow-up in `operationalAlerts.ts` (the client-health worker's file).
- **THIRD Stripe wrapper — `memberships`, and it lives in the RUNTIME, not the plugin.** `src/built-ins/runtime/foundation-adapters/_membershipsStripeAdapter.ts` is the concrete `StripePort` for the memberships plugin (subscriptions, pause/resume/plan-change, checkout, billing portal, prices, webhook verification). It is deliberately NOT inside `built-ins/modules/memberships/` : that package declares `StripePort` in `src/server/ports.ts` and states it must never import the Stripe SDK — the foundation supplies the client. Same shape as the other two (narrow `StripeClientLike` slice + injectable client), so **change one, consider all three**. Its keys are the **ecommerce** install's keys in the same `(agencyId, clientId)` scope, read through `installConfigWithSecrets("ecommerce", …)` — one Stripe account per client, one place to configure it. **`stripeFor()` returns `null` when there is no key** and `containerFor` then falls back to a throwing NOOP port, so `isStripeAvailable()` is the honest question to ask before a paid flow; it used to return a stub unconditionally and answer `true` for every install on earth (issues #33). Don't reinstate an unconditional stub, and don't add a fourth wrapper.
- **FOURTH Stripe wrapper — `affiliates` CONNECT, added for todo:506. Different Stripe surface, but half of it IS a copy.** `src/built-ins/runtime/foundation-adapters/_affiliatesStripeConnectAdapter.ts` is the concrete `StripeConnectPort` for the affiliates plugin (`accounts.create` Express + `accountLinks.create` + `accounts.retrieve` + `transfers.create` + `webhooks.constructEvent`). Those calls do NOT overlap the memberships wrapper's surface (customers / subscriptions / prices / checkout / billing portal), which is why a fifth port was not folded into `StripePort`. **But `getAffiliatesStripeConnectClient` is a verbatim copy of `getMembershipsStripeClient`** — same per-secret-key `Map` cache, same `new Function("s", "return import(s)")` dynamic import, same hardcoded `apiVersion: "2024-12-18.acacia"`, and `affiliatesStripeConnectKeysFor` is a third copy of "read the ecommerce install's keys through `installConfigWithSecrets`". `ecommerce/lib/stripe/server.ts` now exports the canonical non-throwing reader `tryReadStripeKeysFromInstall`; `_membershipsStripeAdapter.readMembershipsStripeKeys` has NOT been converged onto it. **Change one, consider all four**, and if you touch the client builder, hoist it rather than adding a fifth. The status collapse is not duplicated: the adapter calls the plugin's own `snapshotToStatus`.
- **The affiliates Connect webhook currently verifies against the WRONG signing secret — `/api/portal/affiliates/webhooks/stripe` is not `/api/portal/ecommerce/stripe/webhook`.** `makeAffiliatesStripeConnectPort` verifies `account.updated` / `transfer.paid` with `keys.webhookSecret`, i.e. the **ecommerce** install's `stripeWebhookSecret`, whose own manifest help text says it is "Created in dashboard.stripe.com/webhooks for /api/portal/ecommerce/stripe/webhook". Stripe issues a distinct `whsec_…` per registered endpoint (and Connect endpoints are a separate endpoint kind from account endpoints), so in live/test mode the affiliates endpoint's signature can never match and every delivery answers 400. Consequence: onboarding status only ever advances through the customer's manual "refresh my status" button (which polls `accounts.retrieve`, so it does work), and a payout that reaches `in_progress` via `processPayout` has **no path to `completed`** — `confirmTransferPaid` is only reachable from the webhook, and the admin card only renders its buttons for `scheduled` payouts. Fixing it needs its own affiliates-scoped Connect webhook-secret setting (manifest field + `secretVault`), not a reuse of ecommerce's. Note also that `isStripeConnectAvailable()` gates on the SECRET key alone, so an install with a secret key and no webhook secret still offers both automated controls.
- **Money-CREATE idempotency: ONE shared mechanism — don't add a per-path scheme.** Every finance money-create dedups a double-submit through the single helper `built-ins/modules/agency-finance/src/lib/idempotency.ts` (`deriveRecordId(prefix, idempotencyKey?)`): a client-supplied one-time key derives a **deterministic record id**, so a resubmit overwrites the same slot instead of minting a duplicate (parallel-double-click-safe; a plain "seen this key?" map is NOT — it races). Used by `payments.record`, `income.create`, `plans.create`, `invoices.create`, `operations.createCompensationPayment`, and `lib/server/closeDeal.ts` (derives the contract id + passes the key to `invoices.create`). It generalises the Stripe path's stable-reference dedup (`PaymentService.findByExternalRef` on the PaymentIntent) and the delight wire's `reference: delight:<id>` — **reuse `deriveRecordId`, don't invent a parallel `processedKeys` set or a time-window guard.** **Preserve the nuance:** multiple payments per invoice are legitimate (partial payments) — dedup only ever collapses a resubmit of the *same* key; a genuine second payment carries a new key. The id is only deterministic *with* a key — no key → `makeId(prefix)`, unchanged; so dedup is opt-in from the client (the finance modals + close-deal callers mint a `crypto.randomUUID()` per intent).
- **Finance list reads are `index ∪ row-scan` — the index is a fast path, NEVER the source of truth.** Every finance store keeps an `<area>/index` array beside its `<area>/by-id/<id>` rows, and appending to that array is a **read-modify-write**: two records created concurrently both read the same array and the second write wins, so an id is lost and its row — stored perfectly well — becomes invisible to `list()`. For money that is a payment or invoice silently **off the books** (an under-count, the mirror of a double-count — and it can *mask* one, since three duplicate writes surface as a single row). Every list now goes through the one shared helper `built-ins/modules/agency-finance/src/server/rowIndex.ts` (`listRowIds(storage, indexKey, prefix)`), which unions the index with a prefix scan of the rows: `payments` · `invoices` · `income` · `plans` · `expenses` · `budgets` · `categories` · `operations.listRows`. **Don't add a new store that lists straight off its index array, and don't "optimise" the scan away.** Scope is unaffected — plugin storage is namespaced per install (`state.pluginData[installId]`, runtime `makeStorage`), so the scan sees exactly the keyspace the index did.
- **No write-only secondary indexes in finance — they were removed, twice.** `payments/by-invoice/`, `payments/by-client/`, `expenses/by-category/` and `expenses/by-staff/` were all maintained on every create (and every re-category/re-assign) and read by **nothing** — `listForInvoice`/`listForClient`/`listForCategory` all filter through `list()` instead. That's storage ops and extra racy read-modify-writes bought for queries that don't exist. If you need a "by X" view, add a field to the store's `Filter` type and go through `list()`; a secondary index is only worth it with a measured read problem, and then it needs the same union treatment as the primary. Stragglers left in existing stores are inert (unread keys in the plugin's own slice).
- **A native `<form method="post">` cannot reach ANY plugin API handler — they all parse `req.json()`.** A native submit sends `application/x-www-form-urlencoded` and navigates the page; `safeJson`'s `req.json()` throws on that, returns null, and the handler answers **400** — which reads as a validation error, so the page looks finished and merely "fussy" while being 100% non-functional. This shipped in finance's Plans page and was invisible to tests because none called the endpoint the way the form did. Submit with `fetch` from a client component (`agency-finance/src/components/NewPlanForm.tsx` is the reference shape: JSON body, idempotency key, busy + error states). `smoke-finance-idempotency.test.ts` guards the whole class for the finance plugin. **A codebase-wide sweep (2026-08-19) found 8 native form POSTs; one other pair is genuinely broken** — `website-editor`'s `LoginFormBlock`/`SignupFormBlock` default to `/api/auth/login`+`/api/auth/signup`, which are JSON-only, so a visitor to a published client site lands on a raw JSON 400 ([issues #14](../development/issues.md)). The rest are fine and show the two correct patterns: **`api/auth/profile/update` accepts either encoding and 303-redirects** (the right fix when a form must work without JS), and the logout forms simply ignore their body.
- **Stripe webhook: cache the event id only AFTER reconcile succeeds, and answer 5xx on a processing failure.** `server/stripeReconcile.ts` `reconcileStripeEventOnce` owns the in-process "already handled?" cache, and the ordering is load-bearing: caching first meant a transient failure poisoned the cache, Stripe's retry hit "already done", got a 200, stopped retrying, and **the payment was never recorded** (customer paid, invoice unpaid). The handler distinguishes **400 = verification failed** (not from Stripe; a retry achieves nothing) from **500 = processing failed** (it was from Stripe, so it must retry) — Stripe reads the status code as an instruction. **Don't drop the cache** even though payments now dedup durably on the PaymentIntent: refunds and disputes do NOT, so a redelivered `charge.refunded` would log and emit twice.
- **`expense.*` events are emitted but consumed by nothing (not dead code).** `agency-finance/src/server/expenses.ts` emits `expense.created`/`updated`/`approved`/`rejected`/`reimbursed`/`recurring.posted` (declared in `server/ports.ts`), but no consumer exists — the activity log already records each action. They are the plugin's **event contract**, a ready ingestion surface for a future cross-domain wire (e.g. You-Deserve-It → Finance). Don't assume they drive anything today; don't add a duplicate emitter. **AR/AP aging** (`lib/aging.ts` + the Reports panel) reads state directly, not these events.
- **Two contract systems — pick by scenario (both real, not a bug).** `lib/clients/clientContracts.ts` + `_ContractsPanel.tsx` + `/api/tenants/client-contracts` = **client contracts** (on `client.metadata.contracts`, for an existing client) — this is what the one-button **close-deal** (`lib/server/closeDeal.ts` + `api/tenants/close-deal`) creates. The **leads-pipeline** proposal/commercial-pack (`built-ins/modules/leads-pipeline`, `app/proposal/[token]`) is the **lead** (pre-client) path. The close-deal's lead→client flavour reuses that and **spans Journey — coordinate before editing leads-pipeline.** (Also distinct from staff contracts, `PeopleContract` — three contract concepts, no shared key.)
- **Payment-plan metadata key: `client.metadata.clientPaymentPlans` is canonical.** `lib/server/resolutionPlans.ts` used to read `metadata.paymentPlans` (a key nothing writes) at two sites → missed-instalment resolution plans + evidence silently returned null. Fixed 2026-08-19 (regression-locked in `smoke-operational-notifications`).

---

- **A Radar `value: 0` is not automatically a measurement.** `blind` (no data source), `learning` (not enough evidence yet) and `inactive` (doesn't apply) checks still carry `value: 0`, so an agency with **nothing monitored** looks identical to a tracked-but-quiet one. `marketingIntelligence.ts` only accepts a reading from a lens whose own status is `pass`/`critical`/`warning`/`watch` (`ASSESSED_STATUSES`); everything else reads `null` → "—". **Any surface reading `check.value` directly needs the same guard** — this was a live bug in the marketing funnel (it would have reported "0 pageviews" for an untracked agency) and it was invisible to the smoke tests, which feed synthetic checks. Caught only by `scripts/verify-marketing-runtime.ts` driving a real Radar build. **Update 2026-08-20:** the command-intelligence spine now enforces this at the type level — `commandIntelligenceService.ts` uses `measuredCheckValue` (`number | null`, never `?? 0`) and `demandFlow`/`lineage` pageviews/forms are `number | null`, so downstream consumers cannot read a fabricated zero. The guard above still applies to any NEW surface reading `check.value` directly.
- **Marketing metrics have ONE owner: `lib/server/marketingIntelligence.ts`.** Traffic, forms, conversions, conversion rate, tag coverage, enquiry counts, the KPI pulse and the funnel are all reshaped there from engines that already computed them (the Radar `marketing` domain, `lib/kpiRegistry`, `commercialIntelligence.lineage`, `server/websiteSources`, `lib/server/websiteEnquiries`). **Do not recompute any of them inside `agency/marketing/page.tsx` or a workspace component** — that is how marketing ended up half-fed the first time (the old overview showed `ownWebsiteSummary.pageviews24h`, the agency's own site only, next to Radar-derived numbers elsewhere; that field is now gone). Marketing is a **consumer**: it must never edit `lib/performance/kpiRegistry.ts`, the aqua-tag files, or the Radar engine — flag it to the commander instead. Note `agency/marketing` is also the redirect target for `agency/automations`.

- **Never put PII in an activity message — the erasure sweep is keyed by `clientId`.** `clientErasure` sweeps `state.activity` by `clientId` only, and an **agency-scoped plugin install writes activity entries with no `clientId` at all** — so an email in one of those messages survives a client erasure forever. Every message in `built-ins/modules/leads-pipeline/src/server/contacts.ts` names the contact by **id**, with `contactId` in the metadata for the UI to resolve a label from (the rule is written into the file header, `contacts.ts:10-15`). **This was one of tonight's three "🔴 launch blockers" and it is FIXED.** Apply the same rule to any new agency-scoped plugin activity.

## ✅ Fixed 2026-08-20 — verified in source, do NOT send a worker to re-fix
All three of the "🔴 launch blockers" that were still being briefed as open are
closed. Each was re-read from source during the 2026-08-20 docs pass:

| Was briefed as open | Actually |
| --- | --- |
| **Client Portals had two addresses** | **Consolidated 2026-08-27.** The Portals library was reachable at both `/portal/agency/portals` and `/portal/agency/fulfilment?view=portals`. It was never a code fork — one data function (`_portalWorkspaceData.ts`), one component (`_PortalsWorkspace.tsx`), and the authority was **always** Fulfilment's (`fulfilment.portals` on every page; the sidebar has no Portals row and lights up FULFILMENT for that path — see the "Fulfilment's widened surfaces" list in `SidebarNavLink.tsx`). It was two doors onto one room. The standalone page is now a **redirect stub** following the Dev Team pattern, forwarding `?view=templates` too — which first required Fulfilment to accept a `portalView` param, because it hard-coded `initialView="library"` and could not reach the Demo templates half. **`/portal/agency/portals/editor` and `/forms` are NOT stubs** and remain the canonical addresses for template editing and forms. Browser-verified: both redirects land, the client card and its template line render, and the templates view opens. |
| **Freelancer-preview privilege escalation** | Fixed. `app/api/auth/preview-as-freelancer/route.ts` stashes the enterer's own id as `previewReturnUserId` (`:101`) and `exit` re-mints **that** user (`:49`), instead of restoring "an owner it found". `previewReturnUserId` is a first-class session field (`lib/server/auth.ts:72,104`). `api/auth/switch-agency/route.ts` was built into the same shape and cites it. |
| **Finance create-surface idempotency** | Fixed. `built-ins/modules/agency-finance/src/lib/idempotency.ts` (`deriveRecordId`) is wired into six create surfaces + expenses — see the money-CREATE bullet above. |
| **Erasure logging an email** | Fixed. See the bullet directly above. |

**Also settled, and repeatedly mis-briefed:** **MFA on login is BUILT and WIRED** — the
server gate is `app/api/auth/login/route.ts:320-360` (it imports `loginMfaStep` from
`lib/server/auth/mfa.ts`, rate-limits code attempts, then calls `supabase.auth.mfa.challenge`
+ `.verify`) and the browser code step is in `app/login/LoginForm.tsx`. Any doc saying
"`/api/auth/login` has no MFA step" or "`mfa.ts` built, unwired" is describing a state
that ended. **What is genuinely NOT built is Phases 3–4**: the login gate proves aal2 once
(`raisedToSecondFactor(verified.access_token)`, `login/route.ts:355`) and then the app
mints its **own** HMAC cookie — no later request re-checks assurance, so `requireTwoFactor`
and `readTokenAssurance` (`mfa.ts:46,201`) still have **no app consumers at all**, only
`scripts/smoke-mfa.test.ts`. `requireTwoFactor` is described there (`smoke-mfa.test.ts:87`)
as "the intended long-term mechanism". There are no recovery codes.

## ⚪ Dead / stale / alias (don't mistake for live code)

- **`lib/server/editing/adapters.ts` stays.** The older “no app importers” claim
  was false: `lib/server/editing/appConfigAdapter.ts` imports its `fingerprint`,
  and the smoke suite imports the module directly. Removing it breaks the live
  app-config editing path and tests. There is no `lib/server/siteEditor/*` or
  `lib/editing/`; the universal surface is `src/engines/editor/DevEditor.tsx`,
  riding `src/engines/editor/editing/*` + `src/engines/editor/server/*`.
- **`agency/sops/page.tsx`** — compatibility redirect to the canonical
  `/portal/agency/sop-library`; keep it unless breaking external bookmarks is an
  explicit decision.
- **Alias route trees (edit the source, not these):**
  - `agency/fulfilment/technical/*` → re-export `agency/development/*`.
  - `agency/command-center` → re-exports `agency/page.tsx`.
- **Redirect-only (no UI of their own):** `agency/automations`→marketing, `agency/products`→fulfilment, `account/preferences`, `portal/preview`.
- ~~**Empty placeholders:** `app/client-site-preview/`, `app/client-website-preview/`.~~ **WRONG — corrected 2026-08-20.** Both are real, authenticated routes: `client-site-preview/[clientId]/[propertyId]/[[...assetPath]]/route.ts` is a path-confined, content-typed file server (`requireRoleForClient`, agency **or** client role), and `client-website-preview/[clientId]/[siteId]/[pageId]/page.tsx` (39L) renders a website-editor page through `PortalPageRenderer` for agency roles. Don't delete either as dead weight.
- **`milesy-tag.js/`** — legacy alias of `aqua-tag.js/`.

## ✅ Expected pairs (NOT bugs — the macro/micro model)
- SOP library (agency) vs `_ClientSopsTab` (client) — same capability, two scopes.
- `_PipelineBoard` (agency kanban) vs `_KanbanTabClient` (client kanban).
- **THREE boards now, and the word "pipeline" names all three. They are different
  SUBJECTS, not one feature in three places — check which you mean before editing:**
  | Board | Scope | What is on it | Columns |
  | --- | --- | --- | --- |
  | `app/portal/agency/pipelines/[slug]/_PipelineBoard.tsx` (`leads-pipeline`, `scopePolicy: "agency"`) | Agency | The agency's **leads**, CSV-driven | The plugin's |
  | `app/portal/clients/[clientId]/_KanbanTabClient.tsx` | One client | The agency's **work** for that client (`AgencyTask`) | **Fixed** — `lib/tasks/clientTaskBoard.ts` |
  | `built-ins/modules/client-crm/src/pages/PipelinesPage.tsx` (`journey-pipelines` add-on) | One client | The **client's own contacts** (`Contact` rows) | **Authored by the client**, any number of pipelines |

  The third is the only one whose stages the client writes, and the only one with
  automations. It was added 2026-08-28 **inside the existing `client-crm` module**
  rather than as a new one, because that module already owned the client's
  contacts. Do not merge them and do not build a fourth: a board's identity here
  is its subject (leads / work / contacts), not its shape.
- Any agency workspace vs its client-scoped equivalent — this is the intended architecture (`CLAUDE.md`), not duplication.
- Meta app credentials have **two save entry points** — the Company→Connections `IntegrationConnectionsPanel` modal and the social-inbox **"Connect now"** form (`MetaConnectForm` in `_SocialInboxWorkspace`) — but both write the **same** canonical `meta` integration connection via `/api/portal/settings/integrations`, using the same `integrationDefinition("meta")` fields. One store, two views (by design — see [meta-inbox-connect](../development/plans/meta-inbox-connect.md)), not a drift twin.

---

## Standing rules (from `CLAUDE.md` / memory — always apply)
- **Don't commit/push/deploy or alter git history unless Ed explicitly asks.**
  The first branch commit/push exists, but the shared working tree still carries
  well over one hundred active changed/untracked entries.
- **Run the FULL smoke suite** (`scripts/*.test.ts`, `PORTAL_BACKEND=memory`) before calling a behaviour change done — adjacent suites miss contract tests pinning old behaviour.
- **Respect role + agency scope on every server mutation.**
- **Changing what somebody IS must not destroy what they DID** — `Person` facets survive reclassification.
- **Guess, then human-confirm** for matching/classification — never auto-commit suggested work.
- Talk to Ed plainly and simply.

## Roadmap vs phases.md vs the board (2026-08-20; phases.md archived 2026-08-21)
Three things describe "what's next", and only one is canonical now:
- **`docs/development/roadmap.md` — CANONICAL.** Outcomes with horizons + target dates, edited
  from the Dev Console (`/portal/dev-team/roadmap`, `lib/server/dev/devTeamRoadmap.ts`). Progress is
  derived from each item's plans → phases → tasks, so it cannot drift.
- **`phases.md` — superseded**, and since 2026-08-21 it is off the live tree entirely: [context/archive/phases.md](../context/archive/phases.md). Do not add items.
- **The board** (`devTeamBoard.ts`) is a different altitude: it shows
  PLANS and WORKERS in flight, not outcomes. It is not a duplicate — do not merge them.
  It now lives at **`/portal/dev-team/roadmap?view=now`**; `/portal/dev-team/working` is a
  redirect stub onto it (see below).

## 🟠 The Dev Console moved (2026-08-20) — old routes are stubs, not deletions
Twelve sidebar items became six sections with `?view=` tabs, and are now **seven**
(Editor became a first-class row 2026-08-21). The nav items are
`app/portal/dev-team/layout.tsx:74-89`, in order: Home · Roadmap · Findings ·
Library · Tools · **Editor** · Notes. **Team chat is NOT a row** — `layout.tsx`
contains zero occurrences of "chat"; `dev-team/chat/page.tsx` still exists and
still renders `TeamChat`, it is just unlinked from the nav. **Every old route
still exists as a one-line `redirect()`**, so a bookmark or a doc link still
lands (`/editor` is the exception — see the table):

| Old route | Now |
| --- | --- |
| `/portal/dev-team/auditor` | `findings?view=auditor` |
| `/portal/dev-team/logs` | `library?view=logs` |
| `/portal/dev-team/updates` | `library?view=updates` |
| `/portal/dev-team/inspector` | `tools` (its default view) |
| ~~`/portal/dev-team/editor`~~ | **NO LONGER A STUB (2026-08-21).** It is the Dev Editor PROJECTS workspace (`editor/page.tsx`, renders `setup/_DevEditorSetup`); the canvas is `editor/studio/page.tsx`. The separate app-config editor still lives at `tools?view=editor` (`editor/_Section.tsx` + `_AppConfigEditor.tsx`). Edit the real files, not a stub that no longer exists. |
| `/portal/dev-team/api` | `tools?view=api` |
| `/portal/dev-team/working` | `roadmap?view=now` |
| `/portal/dev-team/tasks` | `roadmap?view=tasks` |

**The hazard:** the old directories still hold the *real* code — `auditor/_Section.tsx`,
`editor/_AppConfigEditor.tsx`, `api/_MasterTagPanel.tsx`, `working/_Board.tsx`,
`tasks/_TasksWorkspace.tsx` and so on are imported by the new section pages. Only
`page.tsx` became a stub. **Edit the `_Section.tsx` / workspace file; never
"restore" a stub page.tsx thinking the screen was lost.**

## Twin filenames across the lib halves — RESOLVED 2026-08-20

Six modules existed twice with the SAME filename — a client-safe half in
`src/lib/<domain>/` and a server half in `src/lib/server/` — making it easy to
import the wrong one. The server halves are now suffixed `Service`:
`clientRadarService` · `kpiRegistryService` · `clientTelemetryService` ·
`commandIntelligenceService` · `advisorSkillsService` · `brandPortfolioService`.
Rule going forward: a server counterpart of a client-safe module carries the
`Service` suffix, never the bare twin name.

**Straggler closed 2026-08-31:** the server half of `personInteractions` had kept
the bare name and is now **`lib/server/personInteractionsService.ts`** (the bare
`lib/server` filename no longer exists — do not link it). The rule is
no longer a convention: `scripts/smoke-person-interactions.test.ts` sweeps both
lib halves and fails on any shared filename.

**Still outstanding (two pairs, chrome preference cookies):**
`lib/server/devIconPreference.ts` ↔ `lib/chrome/devIconPreference.ts` and
`lib/server/performanceMode.ts` ↔ `lib/chrome/performanceMode.ts`. They are
pinned as known in that sweep's `KNOWN_UNRESOLVED` list so a NEW twin still
fails; renaming them touches the agency/clients/dev-team layouts and was left
out of the person-interactions change deliberately.

## Who decides the tenant on a plugin API call — SETTLED 2026-08-22

`/api/portal/[module]/[...rest]` used to let the URL name the tenant. R032 added
a "peek" so a `public: true` route (a Stripe webhook, the funnel capture) could
resolve its agency from `?agencyId=` when there is no session to resolve it
from — and the peek was then reused as the authoritative resolution for *every*
route. An agency-owner in agency A POSTing
`/api/portal/agency-hr/staff?agencyId=B` got `201 { agencyId: "B" }`, read it
back with the same parameter, and saw their own agency list empty. Role gating
never noticed: it answers *who* may call a route, not *whose data* they land in.

**The rule now lives in one place — `src/lib/server/portal/apiTenantScope.ts`.**
A query-supplied `agencyId` is authoritative ONLY on a genuinely public route.
The instant a session exists the SESSION decides the tenant, and a query naming
someone else is a 403, never a silent change of scope. `clientId` gets the same
treatment: client-side roles are pinned to their own client, agency-side roles
may only name a client their own agency owns. R025 master users may still name
any agency inside their own `agencyIds[]` — that is the Topbar switcher.

Two things to know before touching it:

- **Public routes on CLIENT-scoped plugins need `?clientId=` as well as
  `?agencyId=`** (`memberships/stripe/webhook`, `affiliates/webhooks/stripe`).
  The peek can only discover `public: true` by resolving the route, and
  resolving needs an install — a client-scoped plugin has no agency-scoped one,
  so `?agencyId=` alone falls through to `requireSession` and 401s. Pre-existing,
  pinned in `scripts/smoke-plugin-api-tenancy.test.ts`.
- **A public route is not re-gated by a session that happens to be present.**
  Deliberate: it answers anonymous callers by definition, so refusing the same
  call because the caller holds a cookie protects nothing and breaks a signed-in
  `lead` (sentinel tenant) completing a real agency's funnel form.

Same class, one layer up: `applyPhaseToClient` took `clientId` and `phaseId`
from a request body and only checked the two ids agreed *with each other*, so
naming a client AND a phase both belonging to agency B applied it. It now takes
the caller's `agencyId` as a required third parameter. Guards:
`scripts/smoke-plugin-api-tenancy.test.ts` (the dispatcher, two real agencies)
and `scripts/smoke-app-route-tenancy.test.ts` (the 133 non-plugin app routes,
`phases/apply`, and the marketing-page/campaigns-manifest agreement).
