# The SOP Engine

**Status:** planned — Ed's architectural decision 2026-08-20. Big, phased, unifies three
existing systems. Nothing built yet; this captures the vision + the merge.

## Ed's decision (verbatim intent)
> "unify its capability but just the staff version showing the staff stuff simple... this way
> for clients as well. I could create guides and just drop it into their resources... it's
> more than a traditional SOP — we can do traditional md/docx text files like we have, but I
> want interactive SOPs, interactive video guides, animations etc, and this will all stem from
> this. The People training just needs to be merged. We'll call it similar to what we did with
> the website portals — we'll make an **SOP Engine**. Multiple engines are the power in this
> app: engines in different cars, different views, tuned slightly different for the task."

## The engine philosophy (this is the app's spine now)
The app is powered by a few **engines**; each surface is a "car" running an engine with a
view tuned to its job. Established: **[Aqua Engine](aqua-engine-and-dev-team-plugin.md)** (the
website/portal editor over `src/engines/editor/elements/`). New: **SOP Engine**. Same idea — one engine,
many tuned views.

## What the SOP Engine unifies (all three ALREADY EXIST)
1. **SOP library** (`src/engines/sop/server/sops.ts`, `SopDocument`) — the content ATOMS. Today: written
   (markdown) or uploaded file (video/pdf/slides/etc.), categorised + tagged, linked
   everywhere via `sopIds`. Keep the simple library view Ed loves as the default.
2. **People training** (`PeopleTrainingModule` in types.ts:3066+) — the SEQUENCER: ordered
   blocks (heading/text/video/resource), quiz-gated completion, assigned via
   `PeopleTrainingAssignment`. **This gets MERGED into the SOP Engine** — it becomes "a guide
   built from SOPs", not a separate island.
3. **Element engine** (`src/engines/editor/elements/`) — the INTERACTIVE substrate. Interactive SOPs,
   video guides, animations = element blocks, exactly as website/portal pages are. This is how
   "more than a traditional SOP" is delivered without a new renderer.

## The model
- **SOP** = one atom. Content is EITHER traditional (md / uploaded docx-pdf-video) OR
  **interactive** (element-engine blocks: steps, embedded video, animation, checks).
- **Guide** = an ordered sequence of SOPs + optional quiz + assignment + progress. Droppable
  into a resources area (staff, client portal, product steps). Replaces standalone training
  modules.
- **Views (the "cars")** — same engine, tuned:
  - **Staff view** — simple: just the staff's own SOPs/guides.
  - **Client view** — the client portal surfaces guides dropped into their resources.
  - **Product view** — a product's `sopIds` steps already ARE a guide; render them as one.
  - **Library view** — today's simple list, preserved as the default.

## Phases
1. **Name + shell.** Establish "SOP Engine" as the concept; library view stays default.
2. **Interactive SOP content.** Let a `SopDocument` hold element-engine blocks (a third `kind`
   or a `content` that is a block tree), authored with the shared Aqua Engine editor.
3. **Guides.** A guide = ordered SOP sequence; compose in a "Guide mode" beside the library.
4. **Merge People training.** Fold `PeopleTrainingModule`/`Assignment`/quiz into guides;
   migrate existing modules; keep completion + quiz gating. Retire the separate training island.
5. **Tuned views.** Staff-simple, client-portal resources drop, product-steps-as-guide.
6. **Assignment + progress + certification** across audiences (staff/freelancer/client/end-customer).

## Open questions for Ed
- Guide audience priority: staff/freelancer first, or clients too from day one?
- Is the quiz/completion gate required on every guide, or opt-in per guide?
- Migration: auto-convert existing People training modules into guides, or start fresh + keep old ones readable?

## Files (when built — big surface)
`src/engines/sop/server/sops.ts`, `src/server/types.ts` (SopDocument gains block content; training types
fold in), `src/engines/editor/elements/**` (reuse), `src/app/portal/agency/sop-library/**`,
`src/app/portal/agency/people/**` (training merge), client portal resources, product steps.
Overlaps `src/server/types.ts` (SHARED — take the lock).
