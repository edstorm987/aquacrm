# `src/lib/editing/engine.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** The one editing loop, behind whatever face it wears. Aqua already edits four different things — client portals, the agency website, marketing funnels, and now website source — and each grew its own selection, patching, preview and publish code. They are not four problems. Every one of them is: map → select → patch → check → preview → publish What differs is only where the content lives and what "publish" means: saving portal state, or committing to git. Those are adapters. Writing the loop again per surface is how one editor gains an undo the others never get, and how a conflict check exists in one place and silently does not in three. Deliberately free of React and of `server-only` so the same contract can be used by a server route, a client component and a test. Something that can be selected and changed.

## Exports (12)

- `interface EditTarget (6 members)`
- `interface EditDocument (4 members)`
- `interface EditIntent (3 members)`
- `type EditRejectionReason`
- `interface EditRejection (3 members)`
- `interface EditChange (3 members)`
- `interface EditPlan (4 members)`
- `planEdits(input: { document: EditDocument; /** The revision the document is at right now, which may have moved. */ currentRevision: string; intents: EditIntent[]; }): EditPlan`
- `isPublishable(plan: EditPlan): boolean`
- `interface PublishOutcome (5 members)`
- `interface EditAdapter (3 members)`
- `async runEdits(input: { adapter: EditAdapter; intents: EditIntent[]; confirm?: boolean; }): Promise<PublishOutcome>`

## Used by (7)

- [`scripts/smoke-editing-engine.test.ts`](../../../scripts/smoke-editing-engine.test.md)
- [`src/app/api/portal/dev-team/editor/route.ts`](../../app/api/portal/dev-team/editor/route.md)
- [`src/app/portal/dev-team/editor/_AppConfigEditor.tsx`](../../app/portal/dev-team/editor/_AppConfigEditor.md)
- [`src/lib/server/editing/adapters.ts`](../server/editing/adapters.md)
- [`src/lib/server/editing/appConfigAdapter.ts`](../server/editing/appConfigAdapter.md)
- [`src/lib/server/siteEditor/codeAdapter.ts`](../server/siteEditor/codeAdapter.md)
- [`src/lib/server/siteEditor/sourceAdapter.ts`](../server/siteEditor/sourceAdapter.md)

