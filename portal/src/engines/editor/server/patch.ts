import "server-only";

import { hashLine, isStale, type SiteRegistry } from "./registry";

/**
 * Turning an edit into a change to a file, and refusing when the ground moved.
 *
 * Kept separate from anything that talks to GitHub so the decision "is this
 * edit still valid?" can be tested exhaustively without a network, a token or
 * a repository. The answer to that question is the whole safety story: a patch
 * applied to a line that changed underneath silently overwrites somebody
 * else's work, and the build still succeeds, so nothing anywhere reports it.
 */

export interface SourcePatch {
  file: string;
  line: number;
  /** The hash the registry recorded for that line when it was mapped. */
  expectedHash: string;
  /** The replacement for the whole line, indentation included. */
  newLine: string;
}

export type PatchRejection =
  | { reason: "registry-stale"; detail: string }
  | { reason: "unknown-file"; detail: string }
  | { reason: "line-missing"; detail: string }
  | { reason: "line-changed"; detail: string }
  | { reason: "no-change"; detail: string };

export interface PatchedFile {
  file: string;
  contents: string;
  /** For the operator to read before publishing, not for the machine. */
  before: string;
  after: string;
  line: number;
}

export type PatchResult =
  | { ok: true; file: PatchedFile }
  | { ok: false; rejection: PatchRejection };

/**
 * Applies one patch to one file's current contents.
 *
 * Every rejection is typed and specific. "Something went wrong" leaves an
 * operator to guess whether to retry, re-map or give up, and the three have
 * very different consequences when a client's website is on the other end.
 */
export function applyPatch(input: {
  registry: SiteRegistry;
  headSha: string;
  patch: SourcePatch;
  contents: string;
}): PatchResult {
  const { registry, headSha, patch, contents } = input;

  // Checked first: every other check reads the registry, and a stale registry
  // makes all of them meaningless rather than merely wrong.
  if (isStale(registry, headSha)) {
    return { ok: false, rejection: {
      reason: "registry-stale",
      detail: `The site has changed since it was mapped (${registry.commitSha.slice(0, 7)} → ${headSha.slice(0, 7)}). Re-map before editing.`,
    } };
  }

  if (!registry.files.includes(patch.file)) {
    return { ok: false, rejection: { reason: "unknown-file", detail: `${patch.file} is not part of the mapped site.` } };
  }

  const lines = contents.split(/\r?\n/);
  const index = patch.line - 1;
  if (index < 0 || index >= lines.length) {
    return { ok: false, rejection: {
      reason: "line-missing",
      detail: `${patch.file} has ${lines.length} lines; line ${patch.line} does not exist.`,
    } };
  }

  const current = lines[index];
  const currentHash = hashLine(current);
  if (currentHash !== patch.expectedHash) {
    // The line was edited by somebody else, or by a commit made since mapping.
    // Rejecting loses this edit, which is recoverable; applying it loses
    // theirs silently, which is not.
    return { ok: false, rejection: {
      reason: "line-changed",
      detail: `${patch.file}:${patch.line} has changed since it was mapped. Re-map and make the edit again.`,
    } };
  }

  if (current === patch.newLine) {
    return { ok: false, rejection: { reason: "no-change", detail: "That edit leaves the line exactly as it was." } };
  }

  lines[index] = patch.newLine;
  return { ok: true, file: {
    file: patch.file,
    contents: lines.join("\n"),
    before: current,
    after: patch.newLine,
    line: patch.line,
  } };
}

export interface PatchPlan {
  files: PatchedFile[];
  rejected: Array<{ patch: SourcePatch; rejection: PatchRejection }>;
}

/**
 * Applies a set of edits together.
 *
 * All-or-nothing by design. An edit that spans a component and the page using
 * it must land as one commit, because half of it is a broken website — and a
 * half-published change is discovered by a visitor rather than by us.
 */
export function planPatches(input: {
  registry: SiteRegistry;
  headSha: string;
  patches: SourcePatch[];
  read: (file: string) => string | null;
}): PatchPlan {
  const plan: PatchPlan = { files: [], rejected: [] };
  // Later patches see earlier ones, so two edits to one file both survive
  // instead of the second overwriting the first.
  const working = new Map<string, string>();

  for (const patch of input.patches) {
    const contents = working.get(patch.file) ?? input.read(patch.file);
    if (contents === null || contents === undefined) {
      plan.rejected.push({ patch, rejection: { reason: "unknown-file", detail: `${patch.file} could not be read.` } });
      continue;
    }
    const result = applyPatch({ registry: input.registry, headSha: input.headSha, patch, contents });
    if (!result.ok) { plan.rejected.push({ patch, rejection: result.rejection }); continue; }
    working.set(patch.file, result.file.contents);
    plan.files = [...plan.files.filter(file => file.file !== patch.file), result.file];
  }

  return plan;
}
