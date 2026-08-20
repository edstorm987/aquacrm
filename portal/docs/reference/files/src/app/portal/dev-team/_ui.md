# `src/app/portal/dev-team/_ui.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

_No file-level doc-comment. Purpose inferred from its path (App routes & UI — src/app/) and its exports below._

## Exports (14)

- `ACCENT`
- `ACCENT_SOFT`
- `interface Accent (4 members)`
- `ACCENTS: Record<string, Accent>`
- `accentFor(key?: string): Accent`
- `INK`
- `MUTED`
- `FAINT`
- `HAIR`
- `PageHeader({ icon, title, subtitle, meta, accent, }: { icon?: ReactNode; title: string; subtitle?: string; meta?: ReactNode; /** Key into ACCENTS — keeps the header the same hue as the section's card. */ accent?: string; })`
- `Panel({ title, hint, right, children, className = "", }: { title?: string; hint?: string; right?: ReactNode; children: ReactNode; className?: string; })`
- `NavCard({ href, icon, label, hint, accent, badge, }: { href: string; icon?: ReactNode; label: string; hint?: string; /** Key into ACCENTS — gives the card its meaning-colour. */ accent?: string; badge?: ReactNode; })`
- `Pill({ children, tone = "muted", }: { children: ReactNode; tone?: "muted" | "danger" | "ok" | "accent" | "warn"; })`
- `EmptyState({ children }: { children: ReactNode })`

## Used by (17)

- [`src/app/portal/dev-team/api/page.tsx`](./api/page.md)
- [`src/app/portal/dev-team/auditor/page.tsx`](./auditor/page.md)
- [`src/app/portal/dev-team/docs/page.tsx`](./docs/page.md)
- [`src/app/portal/dev-team/editor/_AppConfigEditor.tsx`](./editor/_AppConfigEditor.md)
- [`src/app/portal/dev-team/editor/page.tsx`](./editor/page.md)
- [`src/app/portal/dev-team/findings/page.tsx`](./findings/page.md)
- [`src/app/portal/dev-team/inspector/InspectorClient.tsx`](./inspector/InspectorClient.md)
- [`src/app/portal/dev-team/inspector/page.tsx`](./inspector/page.md)
- [`src/app/portal/dev-team/layout.tsx`](./layout.md)
- [`src/app/portal/dev-team/library/_LibraryIndex.tsx`](./library/_LibraryIndex.md)
- [`src/app/portal/dev-team/logs/page.tsx`](./logs/page.md)
- [`src/app/portal/dev-team/page.tsx`](./page.md)
- [`src/app/portal/dev-team/plans/new/page.tsx`](./plans/new/page.md)
- [`src/app/portal/dev-team/tasks/page.tsx`](./tasks/page.md)
- [`src/app/portal/dev-team/updates/_UpdateComposer.tsx`](./updates/_UpdateComposer.md)
- [`src/app/portal/dev-team/updates/page.tsx`](./updates/page.md)
- [`src/app/portal/dev-team/working/page.tsx`](./working/page.md)

