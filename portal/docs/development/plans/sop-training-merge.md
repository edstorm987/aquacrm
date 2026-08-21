# SOP guides ⋈ People training island (queue #12)

**Status:** PLAN — deliberate architecture call, Ed decides. Captured 2026-08-21, autonomous loop.

## Proven current state

**SOP Engine (phases 1-3 built, phase 4 = this merge, explicitly deferred)**
- `SopDocument` supports `kind: "written" | "file" | "interactive"`; interactive content is an element-engine `BlockTreeJSON` — types.ts:1607-1617.
- Interactive validation *composes* the element engine (`validateElementProps`), never re-implements — src/engines/sop/server/sops.ts:113-155; composer UI seeds via `createComposerBlock` and renders via shared `BlockRenderer` — _SopLibrary.tsx:1023-1026, 718-721.
- `SopGuide` = ordered `sopIds` + `quizEnabled?` + `audience?` ("staff"|"founder"|"freelancer"|"client") — types.ts:1645-1662. The type comment records the deal: "the People-training island (`PeopleTrainingModule`) is deliberately left in place for now — a later phase folds it in" — types.ts:1634-1636; quiz is opt-in per Ed 2026-08-20 — types.ts:1638-1640.
- Guide CRUD with referential validation (`assertSopsExist`, tenant-checked, order-preserving, dedup) — src/engines/sop/server/sopGuides.ts:40-115, 122-136. API is owner/manager-gated for writes, all-agency read — src/app/api/portal/sop-guides/route.ts:13-29.
- **`quizEnabled` is a badge only.** No quiz content, grading, assignment, or progress exists on guides — the flag renders as a label in _SopLibrary.tsx:550 and 691; the only consumers are the composer checkbox (line 675) and viewer. Guides surface *only* in the agency sop-library (page.tsx:17); staff team workspace lists raw SOPs, not guides — src/app/portal/team/_data.ts:22.
- Tenant-move disposition already covers `sopGuides` (closure with SOPs) — src/server/companyPortal/disposition.ts:449-454. Tests: scripts/smoke-sop-guides.test.ts:45,75,112.

**People training island (shipped + browser-verified, docs/development/status.md:64)**
- `PeopleTrainingModule`: own flat 4-type block vocabulary (`heading|text|video|resource`, types.ts:3149-3157), quiz (`PeopleTrainingQuizQuestion/Option`, types.ts:3159-3169), `passMark`, `draft|published` — types.ts:3171-3182.
- `PeopleTrainingAssignment` is **already dual-homed**: it carries `sopId?` (SOP-library link) *and* `moduleId?`, plus `dueAt`, status `assigned|in-progress|completed|overdue`, `score`, `evidence` — types.ts:3025-3041.
- Server: `savePeopleTrainingModule` (block/quiz sanitization vs `TRAINING_BLOCK_TYPES`) — people.ts:523, 536-588; `gradeTrainingQuiz` is a **pure function** (empty quiz passes) — people.ts:598-609; `completeModuleAssignment` (only the assignee; pass gates completion, fail records score + stays in-progress) — people.ts:615-633; `sanitizeModuleForStaff` strips the answer key — people.ts:1489-1498, used in `employeePeopleSnapshot` people.ts:1500-1517.
- API actions `save-training-module` / `assign-module` / `complete-module` — src/app/api/portal/people/route.ts:379, 395, 143. Builder: `TrainingModules`/`ModuleEditor`/`AssignModule` — _PeopleCommand.tsx:1079-1169. Taker: `Training`/`ModuleTaker` — _TeamWorkspace.tsx:186-249. Staff card has a Training tab reading assignments — _PeopleCommand.tsx:623, 829-834. Tests: scripts/smoke-people-workspace.test.ts:258-286.

**Overlap map (precise)**
- *Sequencing*: module = flat ordered blocks in one record; engine = atoms (`SopDocument`) + sequence (`SopGuide.sopIds`). A module's block list ≡ one interactive SOP wrapped in a one-SOP guide.
- *Block vocabulary*: every module block type has an element-engine equivalent — heading/text→`rich-text` (portalElements.ts:127), video→`video` (portalElements.ts:148), resource→`link-list` (portalElements.ts:212). **No quiz element exists** in the registry.
- *Quiz*: full model + grading on the island; flag-only on guides. Only genuinely novel work in the merge.
- *Assignment/completion*: island only. Guides have none (sop-engine.md Phase 6).
- *Status gating*: `draft|published` on modules only; SOPs/guides have no status.
- *Authoring*: bespoke inline form (island) vs shared element composer (engine).
## What is genuinely missing
1. Quiz content + `passMark` on `SopGuide` (today a boolean), plus guide-level grading and an answer-key-stripping sanitizer.
2. Guide-backed assignment/completion (a `guideId` on `PeopleTrainingAssignment` — the record and its due/score/evidence machinery already exist).
3. Staff-facing guide rendering (team workspace never loads guides; `listSopGuides` has exactly 2 consumers: the API route and sop-library page.tsx:17).
4. A migration path for existing `peopleTrainingModules` + module-linked assignments.
5. Optional: `draft|published` on guides (needed to preserve module semantics), and a quiz block element if quizzes should ever be inline (see RISKS — recommend against).
## Options
- **A. Full merge now (plan Phase 4 verbatim)** — extend `SopGuide` with quiz/passMark/status, generalize assignments to `guideId`, migrate all modules to interactive-SOP+guide, delete the island types/server/UI in one move. *Cost*: high (types.ts SHARED lock per sop-engine.md:64, 2 UIs rewritten, migration, ~5 test suites touched). *Risk*: high — regresses a shipped, browser-verified Staff Command P9; answer-key-leak surface reopened.
- **B. Shared substrate, staged retirement (recommended)** — port the quiz model + pure `gradeTrainingQuiz` to the guide layer, add `guideId` to the existing assignment record, render assigned guides in the team workspace beside `ModuleTaker`, then migrate modules and retire the builder only after test parity. *Cost*: medium, spread; each step ships green. *Risk*: low-medium; temporary dual system (must be logged in hazards-and-duplication.md, which already tracks the adjacent dupes at lines 111, 156, 165).
- **C. Leave separate + cross-link** — surface `assignment.sopId`/add a guide picker in `AssignModule`, done. *Cost*: trivial. *Risk*: contradicts Ed's recorded decision (sop-engine.md:3-13, types.ts:1634-1636); two block vocabularies and a stub `quizEnabled` flag drift forever.
## Recommendation
**Option B.** The expensive-looking parts are already portable: `gradeTrainingQuiz` is pure (people.ts:598), the assignment record is already multi-source (`sopId`+`moduleId`, types.ts:3031-3032), and all four module block types map onto registered elements. Keep the quiz **at guide level, not as a block element** — blocks ship to staff verbatim through `BlockRenderer`, so an in-tree quiz would carry `correct` flags to the client; guide-level quiz preserves the `sanitizeModuleForStaff` hygiene contract (people.ts:1489) with a direct analogue.
## Risks
- Answer-key leak: any path that sends `SopGuide.quiz` to staff must go through a sanitizer; test it like smoke-people-workspace.test.ts:274.
- Staff Command P9 is shipped + browser-verified (status.md:64); regressions there are visible to Ed immediately — keep `ModuleTaker` until guide parity is asserted.
- `types.ts` is the shared lock (sop-engine.md:64) — coordinate the `SopGuide`/assignment edits.
- Guides lack `draft|published`; migrating published/draft modules without adding status silently exposes drafts to the all-agency-read guide API (sop-guides route.ts:22-28).
- Assignments live inside people snapshots/staff cards (people.ts:1464-1486, 1503-1514) — completion must keep writing the people store or those surfaces go stale.
- Guide deletion currently ignores references (sopGuides.ts:102-115); once assignments carry `guideId`, deletion needs a dangling-reference stance (block or orphan-tolerant read, matching the "missing" handling in _SopLibrary.tsx:539-540).
## Phases
1. **Guide quiz substrate** — Add `quiz[]`/`passMark`/`status` to `SopGuide` (types.ts:1645), move quiz types + a relocated pure `gradeGuideQuiz` + `sanitizeGuideForAssignee` into `src/engines/sop/server/`, extend smoke-sop-guides.test.ts with grading + answer-key assertions.
2. **Guide assignment** — Add `guideId?` to `PeopleTrainingAssignment` (types.ts:3025), an `assign-guide` action beside `assign-module` (people route.ts:395), and `completeGuideAssignment` mirroring people.ts:615-633 including only-assignee and fail-stays-in-progress semantics.
3. **Staff car** — Team workspace Training tab loads assigned guides (sanitized) and renders them via `BlockRenderer` + a GuideTaker beside `ModuleTaker` (_TeamWorkspace.tsx:186-249); guides finally leave the sop-library.
4. **Migration** — One-shot converter: each `PeopleTrainingModule` → one interactive `SopDocument` (heading/text→rich-text, video→video, resource→link-list) + one `SopGuide` carrying its quiz/passMark/status; rewrite assignments `moduleId`→`guideId`; keep old records readable, assert score/evidence survive.
5. **Retire the island** — Replace `TrainingModules`/`ModuleEditor` (_PeopleCommand.tsx:1079-1157) with a link into the sop-library guide composer, delete module server fns/types/actions once smoke-people-workspace training cases are re-pointed; log the interim dual system in hazards-and-duplication.md and update docs/reference + feature-index.
6. **Audience cars** — Use `SopGuide.audience` to drop guides into client portal resources and render product `sopIds` steps as guides (sop-engine.md Phases 5-6, disposition.ts:449 already covers tenant moves).
