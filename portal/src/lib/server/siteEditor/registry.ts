import "server-only";

import { createHash } from "node:crypto";

import { formatSourceStamp, type SourceLocation } from "./sourceStamp";

/**
 * A map of a website's source, pinned to the commit it describes.
 *
 * Built read-only on purpose at this stage: it maps a repository and proves
 * every stamped element resolves to a real line, and it cannot write anything.
 * Getting resolution right is the whole risk — an editor that commits to a
 * line it mapped incorrectly damages a client's website, and does it silently
 * because the build still succeeds.
 */

export interface RegistryNode {
  /** `path/to/file.tsx:42:6` — the same key the DOM stamp carries. */
  key: string;
  file: string;
  line: number;
  column: number;
  /** The literal text on that line, when there is one to edit. */
  text?: string;
  /**
   * Whether the text can be edited where it sits.
   *
   * `literal` is text written directly in the source. `dynamic` is a value
   * arriving from props, a loop or an API — the stamp points at the component
   * that rendered it, not at the value, so editing the text in place would
   * revert on the next render. Those open the file instead.
   */
  kind: "literal" | "dynamic";
  /** Of the line as mapped, so a stale patch is rejected rather than applied. */
  hash: string;
}

export interface SiteRegistry {
  repository: string;
  ref: string;
  /** The commit this describes. Part of the registry, not metadata about it. */
  commitSha: string;
  mappedAt: number;
  files: string[];
  nodes: Record<string, RegistryNode>;
  /** Files seen but not mapped, with the reason. Never silently skipped. */
  skipped: Array<{ file: string; reason: string }>;
}

export function hashLine(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Source files worth mapping. Everything else is noise or generated. */
const MAPPABLE = /\.(tsx|jsx|html|mdx?)$/i;
const IGNORED = /(^|\/)(node_modules|\.next|dist|build|out|coverage|\.git)\//;

export function isMappableFile(path: string): boolean {
  return MAPPABLE.test(path) && !IGNORED.test(path);
}

/**
 * Text that arrives from somewhere else at render time.
 *
 * Detected rather than assumed, because getting it wrong in the optimistic
 * direction is the expensive one: offering an inline text edit on a value that
 * comes from a database means the change appears to work, commits, and then
 * reverts on the next render with no error anywhere.
 */
const DYNAMIC_MARKERS = [
  /\{[^}]*\}/,           // any JSX expression
  /\$\{/,                // template interpolation
  /\bprops\./,
  /\.map\s*\(/,
];

/**
 * `text` is what is on the line; `kind` is whether it can be edited in place.
 *
 * They are separate on purpose. Dropping the text of a dynamic line would hide
 * it from the editor entirely, and those are exactly the lines somebody needs
 * to reach in order to edit the component producing the value.
 */
export function classifyText(raw: string): { kind: RegistryNode["kind"]; text?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "dynamic" };
  if (DYNAMIC_MARKERS.some(pattern => pattern.test(trimmed))) return { kind: "dynamic", text: trimmed };
  return { kind: "literal", text: trimmed };
}

/**
 * Maps one file's lines into registry nodes.
 *
 * Line-based rather than AST-based at this stage, and deliberately so: the
 * stamp already carries the exact line, so the registry's job is to describe
 * what is there and whether it can be edited in place — not to re-derive the
 * structure the compiler already knew.
 */
export function mapFile(file: string, contents: string): RegistryNode[] {
  return contents.split(/\r?\n/).map((raw, index) => {
    const line = index + 1;
    const column = raw.length - raw.trimStart().length;
    const { kind, text } = classifyText(raw);
    return {
      key: formatSourceStamp({ file, line, column }),
      file,
      line,
      column,
      text,
      kind,
      hash: hashLine(raw),
    };
  });
}

/**
 * Looks up what a stamped element points at.
 *
 * Matches on file and line, not column: the stamp records where the element
 * began and the registry records where its line's content began, and those
 * differ whenever an element is indented or shares a line. Requiring both to
 * agree would fail to resolve most of a real page.
 */
export function resolve(registry: SiteRegistry, location: SourceLocation): RegistryNode | null {
  const exact = registry.nodes[formatSourceStamp(location)];
  if (exact) return exact;
  return Object.values(registry.nodes)
    .find(node => node.file === location.file && node.line === location.line) ?? null;
}

/** Whether the registry still describes the repository as it stands. */
export function isStale(registry: SiteRegistry, headSha: string): boolean {
  return registry.commitSha !== headSha;
}

export interface ResolutionReport {
  total: number;
  resolved: number;
  literal: number;
  dynamic: number;
  unresolved: string[];
}

/**
 * How much of a real page the registry can actually account for.
 *
 * The number that decides whether this is worth building on. A mapper that
 * resolves most elements is not nearly good enough — the ones it misses are
 * the ones somebody will click.
 */
export function reportResolution(registry: SiteRegistry, stamps: SourceLocation[]): ResolutionReport {
  const report: ResolutionReport = { total: stamps.length, resolved: 0, literal: 0, dynamic: 0, unresolved: [] };
  for (const stamp of stamps) {
    const node = resolve(registry, stamp);
    if (!node) { report.unresolved.push(formatSourceStamp(stamp)); continue; }
    report.resolved += 1;
    if (node.kind === "literal") report.literal += 1; else report.dynamic += 1;
  }
  return report;
}
