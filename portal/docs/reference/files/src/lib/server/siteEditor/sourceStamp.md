# `src/lib/server/siteEditor/sourceStamp.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Where a rendered element came from. The whole editor rests on not having to answer this by inspection. Working backwards from a rendered `<h1>` to the JSX that produced it means guessing — through components, props, loops and conditionals — and the guess is wrong exactly when the page is interesting. So the origin is stamped on the way out at build time and read back verbatim: <h1 data-aqua-src="app/(site)/page.tsx:42:6">We build things</h1> React already keeps this internally: `@babel/plugin-transform-react-jsx-source` attaches `__source` to every JSX node in development and strips it for production. Editable sites keep it deliberately.

## Exports (5)

- `SOURCE_ATTRIBUTE`
- `interface SourceLocation (3 members)`
- `parseSourceStamp(value: string | null | undefined): SourceLocation | null`
- `formatSourceStamp(location: SourceLocation): string`
- `sourceKey(location: SourceLocation): string`

## Used by (3)

- [`scripts/smoke-site-registry.test.ts`](../../../../scripts/smoke-site-registry.test.md)
- [`src/lib/server/siteEditor/registry.ts`](./registry.md)
- [`src/lib/server/siteEditor/sourceAdapter.ts`](./sourceAdapter.md)

