import "server-only";

import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { isHiddenPath } from "./fileTree";

/**
 * The local working tree, as a flat list of files.
 *
 * Lifted out of `/api/portal/site-editor/files` unchanged, because MAP needs
 * exactly the same walk and a second implementation is a second set of rules
 * about what is hidden — which is how a `.env` eventually ends up listed by
 * one of them. There is now one walk, and the files route calls this.
 *
 * A project with a blank `repository` reads this tree; a project with one
 * reads GitHub (`readRepoTree`). Both feed the same `buildFileTree`.
 */

/**
 * Never descended into. Cheap, dumb and deliberate — the depth cap below is
 * the backstop, this is the part that keeps a walk fast.
 */
export const IGNORED_DIRECTORIES = new Set([".git", "node_modules", ".next", ".vercel", ".turbo", "coverage"]);

/** Deep enough for any real source tree, shallow enough to always terminate. */
export const MAX_WALK_DEPTH = 8;

export interface WorkspaceFile {
  path: string;
  size: number;
}

/**
 * Walk `root`, appending every readable source file to `out`.
 *
 * Mutates `out` rather than returning, matching the original recursion — the
 * caller allocates one array and the recursion never concatenates.
 *
 * Symlinks are skipped entirely: they are not something the editor is willing
 * to write through (a link inside the tree can point outside it), and listing
 * one invites opening it.
 */
export async function walkWorkspaceFiles(
  root: string,
  directory: string,
  out: WorkspaceFile[],
  depth = 0,
): Promise<void> {
  // Depth-capped so a stray symlink or a deep vendor tree cannot make one
  // request walk forever.
  if (depth > MAX_WALK_DEPTH) return;
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = join(directory, entry.name);
    const rel = relative(root, full);
    if (isHiddenPath(rel)) continue;

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      // Dot-directories are tooling and state, not source. This used to be a
      // NESTED if that only skipped names already covered by the line above —
      // so .data/, .claude/ and .next-verify/ were walked, listed and (for
      // text files) writable. Skipping is now unconditional.
      if (entry.name.startsWith(".")) continue;
      await walkWorkspaceFiles(root, full, out, depth + 1);
      continue;
    }

    // A symlink is not a file we are willing to write through — see safePath
    // in the files route. Listing one invites opening it, so leave it out.
    if (entry.isSymbolicLink()) continue;
    if (!entry.isFile()) continue;

    const info = await stat(full).catch(() => null);
    if (info) out.push({ path: rel.split(sep).join("/"), size: info.size });
  }
}

/** The whole working tree in one call, for callers that only want the list. */
export async function readWorkspaceFiles(root: string): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = [];
  await walkWorkspaceFiles(root, root, files);
  return files;
}
