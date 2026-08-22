# `src/engines/editor/editing/surfaces.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** WHAT you are working on — the surface — kept apart from HOW DEEP you go. Ed, 2026-08-21: *"website mode im going to need a specialied thing to do the seo and tags and everything like that per page... dont need a portal mode and then normal mode can do portal and software or whatever as its just universal"*. So there are exactly TWO: • **Website** — adds the per-page specialist work a website needs and nothing else does: the page's title and description, its social card, its canonical address, whether search engines may index it, and its structured data. Per PAGE, which is why it needs the navigator (phase 8) to say which page it is talking about. • **Normal** — the universal one. A portal, a piece of software, a game, a documentation site. Everything the editor already did. ─── ORTHOGONAL TO THE MODES. Do not conflate them. ───────────────────────── `editing/modes.ts` answers "how deep do I want to go?" — assist, visual, developer. This answers "what am I working on?". They are two axes and they multiply: a website at the assist depth and a website at the developer depth are the same website. The one place they meet is `inspectorTabsFor`, which takes both and is the ONLY place either is allowed to gate a tab. ─── AND NOT `projectKind`. ───────────────────────────────────────────────── `projectKind` ("software" | "website" | "portal") is a field somebody typed once when the project was created, and using it to decide what the editor IS caused half of last session's bugs: every project Ed makes defaults to "software", so every project he makes had the browser switched off, an empty palette and a hidden Builder tab. A declared kind is a claim; what is CONNECTED is evidence. So the default below is derived from evidence — an Aqua Tag answering on a real address — and the switcher overrides it, because the operator is better evidence than either. The derivation is deliberately CONSERVATIVE and says so out loud. A project it reads as Normal that is really a website costs one click on a switcher that is right there, with a sentence naming exactly what was missing. A project it reads as Website that is really a game shows an SEO panel that can only write nonsense into somebody's source. Missing is recoverable; inventing is not — the same rule the navigator's route derivation lives by. Client-safe: no server imports, no Node built-ins, no `next/*`. The two storage helpers at the bottom touch `window` and check for it first, so this module still imports and answers in a test. The two. There is no portal surface — Ed was explicit, and Normal covers it.

## Exports (13)

- `type EditorSurface`
- `interface EditorSurfaceDefinition (3 members)`
- `EDITOR_SURFACES: EditorSurfaceDefinition[]`
- `editorSurface(id: string | null | undefined): EditorSurfaceDefinition`
- `interface SurfaceSignals (4 members)`
- `interface DerivedSurface (2 members)`
- `derivedSurface(signals: SurfaceSignals): DerivedSurface`
- `interface ResolvedSurface (4 members)`
- `resolveSurface(stored: string | null | undefined, signals: SurfaceSignals): ResolvedSurface`
- `SURFACE_STORAGE_PREFIX`
- `surfaceStorageKey(scope: string): string`
- `loadSurfaceChoice(scope: string): EditorSurface | null`
- `saveSurfaceChoice(surface: EditorSurface, scope: string): void`

## Used by (4)

- [`scripts/smoke-editor-surface-modes.test.ts`](../../../../scripts/smoke-editor-surface-modes.test.md)
- [`src/components/editing/SurfaceSwitch.tsx`](../../../components/editing/SurfaceSwitch.md)
- [`src/engines/editor/DevEditor.tsx`](../DevEditor.md)
- [`src/engines/editor/editing/modes.ts`](./modes.md)

