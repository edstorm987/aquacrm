import "server-only";

import { createHash } from "node:crypto";

import type { EditAdapter, EditDocument, EditPlan, EditTarget } from "@/engines/editor/editing/engine";
import { describeFile, isHiddenPath } from "./fileTree";

/**
 * Code mode: whole files, on the same editing loop.
 *
 * The visual editor and the code editor are one tool at two granularities. The
 * visual one edits a line because that is what an element resolves to; this
 * one edits a file because that is what somebody typing code has open. Both
 * are `EditAdapter`s, so conflict detection, all-or-nothing publishing, dry
 * runs and the confirmation rule are identical between them — a change made in
 * code mode conflicts with one made in the visual editor exactly as it should,
 * because they are the same mechanism rather than two that resemble each other.
 *
 * The fingerprint is the whole file's hash. That is the right granularity here
 * for the same reason `git` uses it: somebody editing a file has read it as a
 * whole, and a change anywhere in it is a change to what they were working
 * from.
 */

export function hashFile(contents: string): string {
  return createHash("sha256").update(contents).digest("hex").slice(0, 16);
}

export interface CodeFile {
  path: string;
  contents: string;
  size?: number;
}

export function codeEditAdapter(input: {
  repository: string;
  ref: string;
  /** Every file in the tree, already filtered of anything hidden. */
  listFiles: () => Promise<Array<{ path: string; size?: number }>>;
  readFile: (path: string) => Promise<string | null>;
  headSha: () => Promise<string>;
  /** The commit the caller opened. */
  baseSha: string;
  commit: (plan: EditPlan) => Promise<{ revision: string; summary: string }>;
  /**
   * Which files are open. Only these are read, because mapping a repository
   * would otherwise mean fetching every file in it to build a list nobody has
   * looked at yet.
   */
  openPaths?: string[];
}): EditAdapter {
  return {
    async map(): Promise<EditDocument> {
      const entries = await input.listFiles();
      const open = new Set(input.openPaths ?? []);
      const targets: EditTarget[] = [];

      for (const entry of entries) {
        if (isHiddenPath(entry.path)) continue;
        const described = describeFile(entry.path, entry.size);
        if (!described.editable) {
          // Listed but not editable, with the reason attached. A file that
          // simply vanishes from the tree reads as a bug in the editor.
          targets.push({
            id: entry.path,
            label: entry.path,
            kind: "indirect",
            fingerprint: "",
            definedAt: described.reason,
          });
          continue;
        }
        // Contents are fetched only for files actually opened; the rest are
        // listed so the tree is complete without fetching the repository.
        const contents = open.has(entry.path) ? await input.readFile(entry.path) : null;
        targets.push({
          id: entry.path,
          label: entry.path,
          kind: "direct",
          value: contents ?? undefined,
          fingerprint: contents === null ? "" : hashFile(contents),
        });
      }

      return {
        id: `code:${input.repository}@${input.ref}`,
        label: `${input.repository} (${input.ref})`,
        revision: input.baseSha,
        targets,
      };
    },

    currentRevision: input.headSha,
    publish: input.commit,
  };
}
