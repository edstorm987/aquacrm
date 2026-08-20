/**
 * Which file rendered the thing you just clicked.
 *
 * React keeps this already. In development the JSX transform attaches
 * `_debugSource` — file, line, column — to every element's fiber, and the DOM
 * node carries a `__reactFiber$…` key pointing at it. That is how React
 * DevTools' "view source" works, and it means element-to-source needs no build
 * configuration at all in dev.
 *
 * It is deliberately dev-only. Production builds strip `_debugSource`, and the
 * honest answer there is to say so rather than to guess: shipping a build stamp
 * to every client site is a decision with a cost, and it should be made
 * explicitly rather than snuck in to make one feature work.
 */

export interface ElementSource {
  /** Absolute at first — the fiber records the compiler's path. */
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
}

interface FiberLike {
  _debugSource?: ElementSource;
  /** React 19: an Error whose stack names the component's source file. */
  _debugStack?: { stack?: string } | string;
  _debugOwner?: FiberLike;
  return?: FiberLike;
}

/**
 * Reads a source location out of a React 19 debug stack.
 *
 * React 19 removed `_debugSource` and replaced it with `_debugStack` — an
 * Error captured at the JSX call site, whose stack frames name the component's
 * module. In a Next dev build those frames read
 *
 *     at PageIntro (…webpack-internal:///(rsc)/./src/app/…/_Views.tsx?97:189:96)
 *
 * so the repository path and line are recoverable from the first frame that
 * points into the app's own source. Frames into node_modules and React
 * internals are skipped — they are the machinery, not the component.
 */
const STACK_SOURCE = /\.\/((?:src|app|components|lib|pages)\/[^?:)\s]+)(?:\?\d+)?:(\d+):(\d+)/;

export function sourceFromDebugStack(stack: string | undefined): ElementSource | null {
  if (!stack) return null;
  for (const line of stack.split("\n")) {
    if (line.includes("node_modules")) continue;
    const match = STACK_SOURCE.exec(line);
    if (!match) continue;
    return { fileName: match[1], lineNumber: Number(match[2]), columnNumber: Number(match[3]) };
  }
  return null;
}

function fiberFor(element: Element): FiberLike | null {
  for (const key of Object.keys(element)) {
    if (key.startsWith("__reactFiber$")) {
      return (element as unknown as Record<string, FiberLike>)[key] ?? null;
    }
  }
  return null;
}

/**
 * Walks up until something knows where it came from.
 *
 * The clicked node is often a `<span>` inside a component that itself has no
 * debug source — a styled primitive, a fragment. Climbing to the nearest
 * ancestor that does know is what makes the answer useful rather than
 * technically correct and unhelpful.
 */
export function elementSource(element: Element | null, maxDepth = 25): ElementSource | null {
  let node: Element | null = element;
  while (node) {
    let fiber: FiberLike | null = fiberFor(node);
    let depth = 0;
    while (fiber && depth < maxDepth) {
      // React 18 and earlier record the location directly; React 19 records a
      // stack to parse. Checked in that order because the direct field is
      // exact where the stack is best-effort.
      if (fiber._debugSource?.fileName) return fiber._debugSource;
      const stack = typeof fiber._debugStack === "string" ? fiber._debugStack : fiber._debugStack?.stack;
      const fromStack = sourceFromDebugStack(stack);
      if (fromStack) return fromStack;
      fiber = fiber._debugOwner ?? fiber.return ?? null;
      depth += 1;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Turns the compiler's absolute path into one the repository browser knows.
 *
 * Matched from the right rather than by stripping a known prefix: the path a
 * build records depends on where it was built, and a hard-coded prefix breaks
 * the moment the project moves or somebody else runs it.
 */
export function repoRelativePath(fileName: string, roots = ["src/", "app/", "components/", "lib/"]): string | null {
  const normalised = fileName.replace(/\\/g, "/");
  for (const root of roots) {
    const index = normalised.lastIndexOf(`/${root}`);
    if (index >= 0) return normalised.slice(index + 1);
    if (normalised.startsWith(root)) return normalised;
  }
  return null;
}

export function describeSource(source: ElementSource | null): string {
  if (!source) return "No source recorded for that element.";
  const path = repoRelativePath(source.fileName) ?? source.fileName;
  return `${path}:${source.lineNumber}`;
}
