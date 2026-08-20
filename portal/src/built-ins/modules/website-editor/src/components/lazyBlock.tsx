// Lazy loader for block components — the `next/dynamic` equivalent this plugin
// can actually use.
//
// Why not `next/dynamic` itself: `blockRegistry.ts` is imported by server code
// (the plugin manifest reads `BLOCK_DESCRIPTORS`) and by the smoke suite, which
// runs under `NODE_OPTIONS='--conditions react-server'`. Under that condition
// `next/dynamic` reaches `loadable-context.shared-runtime`, which calls
// `React.createContext` — a function the react-server build of React does not
// export — so a single top-level `import dynamic from "next/dynamic"` would
// throw before a test could run.
//
// Nothing is lost by hand-rolling it. In the App Router `next/dynamic` is
// aliased to `next/dist/api/app-dynamic`, which is `React.lazy` plus an
// optional `<Suspense>` wrapper (see `next/dist/shared/lib/lazy-dynamic/
// loadable.js`). That is what this is, so the split behaves the same way: each
// `() => import(...)` becomes its own webpack chunk, fetched the first time
// that block actually renders.
//
// The `<Suspense>` boundary is per block deliberately. `next/dynamic` only adds
// one when you pass a `loading` component; without it a block suspending on
// first paint bubbles to the nearest ancestor boundary — the whole canvas —
// instead of blanking just its own slot for a frame.

import { Suspense, lazy, type ComponentType } from "react";

export function lazyBlock<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  name: string,
): ComponentType<P> {
  const Loaded = lazy(load);
  function LazyBlock(props: P) {
    return (
      <Suspense fallback={null}>
        <Loaded {...props} />
      </Suspense>
    );
  }
  LazyBlock.displayName = `LazyBlock(${name})`;
  return LazyBlock;
}
