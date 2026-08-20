# Website editor, the git registry, and site migration

Working notes for the Aqua Tag's editing side. Written 18 August 2026 during
the inbox/form-capture work; the capture half shipped, the editor half is
designed but not built.

## The decision that makes source editing possible

Do not work out which source file produced a rendered element by inspecting the
DOM. Stamp the origin on the way out instead, at build time:

```html
<h1 data-aqua-src="app/(site)/page.tsx:42:6">We build things</h1>
```

React already carries this internally — `@babel/plugin-transform-react-jsx-source`
attaches `__source` to every JSX node in development and strips it for
production. Editable sites keep it deliberately. Selection then becomes a
lookup rather than an inference, which is the difference between this being
buildable and being a research project.

## The registry

Mapped from GitHub at a known commit SHA:

```
tree at SHA → fetch editable files → parse → nodes
{ file, line, col, kind, text, hash }
```

The SHA is part of the registry, not metadata about it. If HEAD has moved the
registry is stale and must be re-mapped before any edit is accepted — that is
what stops the editor overwriting somebody else's commit.

Every patch carries the hash of the text it expects to replace. A mismatch is
rejected and re-mapped rather than applied, on the same reasoning as an
optimistic-concurrency conflict: losing an edit is recoverable, silently
clobbering one is not.

## Editing is code editing, not just text

Ed's requirement, and it resolves the hardest case cleanly. Text bound to
props, a loop or an API cannot be patched as text — the stamp points at the
component, not the value. Rather than marking those read-only, clicking one
opens the component source at that line and it is edited as code.

So the editor is a git-backed code editor with visual selection: click an
element to land on the line that produced it, then either edit the text inline
where it is literal, or edit the file directly where it is not.

## Preview

Two layers, deliberately:

- **Instant** — patch the DOM in the iframe. The explorer bridge already does
  this. Gives the feel of direct manipulation.
- **Real** — commit to a branch, let the host build a preview deployment, and
  iframe that. Slower, but it is the actual build.

Trusting only the instant layer is how you ship something that looked right in
the editor and broke live.

## Build order

1. Build stamp + registry mapper, read-only. Prove every element resolves to a
   real line before anything can write.
2. Patch, hash check, commit.
3. Preview deployments.
4. Editor UI.

## Known constraints

- `publishProjectToGitHub` refuses anything outside the provisioned
  client-projects workspace. Widening that is a deliberate decision, not a
  side effect of building the editor.
- Full source editing needs the repo *and* the build stamp. Client sites are
  GitHub + Vercel, so this holds for them.

## Later: migration into Aqua

Ed's idea, worth keeping. Sites that did not start in this structure can be
brought into it rather than rebuilt by hand:

- **Squarespace → Aqua** and **WordPress → Aqua** migrations. WordPress has
  plugin surface for the export side; Squarespace needs scraping or its own
  export.
- The target is Aqua's structure, so the migration is: export content → map to
  components and content files → produce a repo → stamp it → it becomes
  editable like any other client site.
- External builders are not a special case for long. Most platforms export,
  and the gap between an export and Aqua's structure is small enough to close.

## One editing loop, many faces

Added 18 August 2026 after Ed's point that the portal editor, website editor and
client site editor are the same thing wearing different faces.

They were not sharing anything. Four surfaces each had their own selection,
preview and patch code:

| surface | lines |
| --- | --- |
| `portals/editor/_ClientPortalStudio.tsx` | 1,156 |
| `marketing/_FunnelsWorkspace.tsx` | 897 |
| `clients/[clientId]/_FulfilmentPortalPreview.tsx` | 733 |
| `development/website/_WebsiteWorkspace.tsx` | 269 |

The site editor was about to become a fifth. That is how one editor gains an
undo the others never get, and how a conflict check exists in one place and
silently does not in three.

`src/engines/editor/editing/engine.ts` is now the loop, and it is the same loop everywhere:

    map → select → patch → check → preview → publish

Surfaces supply an `EditAdapter` — `map`, `currentRevision`, `publish` — and
nothing else. Conflict detection, all-or-nothing publishing, dry runs and the
explicit-confirmation rule are the engine's, so a new editor cannot
accidentally ship without them.

`sourceEditAdapter` is the first adapter and carries no editing logic of its
own: a registry node is a target, a line hash is a fingerprint, a stale commit
is a stale document. A test drives the source case and a portal-shaped case
through the same engine to keep it that way.

Still to migrate: the portal studio, funnels and the website workspace. Each is
an adapter plus deleting its private copy of the loop — worth doing one at a
time, with the studio last because it is the largest.
