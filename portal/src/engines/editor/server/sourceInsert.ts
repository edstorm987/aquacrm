import "server-only";

import { contextAt } from "./sourceMatch";

/**
 * WHERE emitted element code may land in a file — and where it may not.
 *
 * `elements/emit.ts` decides WHAT the code says; this module decides whether
 * the chosen spot can take it. Kept apart from anything that reads a network
 * or a token for the same reason `patch.ts` and `sourceMatch.ts` are: "is this
 * insert point safe?" is the entire safety story of phase 7, and it has to be
 * testable exhaustively without a repository.
 *
 * ─── The rule: REFUSE rather than guess into JSX ───────────────────────────
 *
 * An insert lands BETWEEN lines, so the question is what surrounds the gap.
 * The only oracle available is `sourceMatch.contextAt` — the same line-local
 * machine the words editor trusts for splices — asked at the END of the
 * anchor line. When it answers `jsx`, `html` or `markdown`, a sibling element
 * on the next line is sound. When it answers `unknown` (a statement line, a
 * blank line in a component file, a line this heuristic cannot read) or a
 * quote (the line ends inside a string), inserting is exactly the "guess into
 * JSX" the plan forbids — one wrong gap turns a client's page into a build
 * error. Every refusal is typed and says why.
 *
 * A component file's END is refused outright: after the last line of a
 * .tsx/.jsx file is outside the component, and code there is a syntax error.
 * Markdown and MDX take appends happily (a JSX block at MDX top level is
 * valid); an HTML document appends before its `</body>` when it has one.
 */

export type InsertAnchor =
  | { type: "after-line"; line: number }
  | { type: "end" };

export type SourceInsertPlan =
  | {
      ok: true;
      /** 1-based line the first inserted line lands on, in the NEW contents. */
      line: number;
      /** Exactly what goes in — indentation and blank separators included. */
      insertedLines: string[];
      newContents: string;
      /** The line the insert sits under, for the preview. Null at a file top. */
      anchorText: string | null;
      /** The line that now follows the insert. Null at a file end. */
      followingText: string | null;
    }
  | {
      ok: false;
      reason: "empty-code" | "line-missing" | "unknown-context" | "no-safe-end";
      detail: string;
    };

type FileKind = "source" | "mdx" | "markdown" | "html";

/** Mirrors `sourceMatch.fileKindOf`, minus kinds an insert never reaches. */
function fileKindOf(file: string): FileKind | null {
  if (/\.(tsx|jsx)$/i.test(file)) return "source";
  if (/\.mdx$/i.test(file)) return "mdx";
  if (/\.(md|markdown)$/i.test(file)) return "markdown";
  if (/\.html?$/i.test(file)) return "html";
  return null;
}

/** Prose formats want the block set off by blank lines; markup does not. */
function wantsBlankSeparation(kind: FileKind): boolean {
  return kind === "markdown" || kind === "mdx";
}

const UNKNOWN_CONTEXT_DETAIL =
  "The safety check cannot determine what surrounds the end of that line, so inserting after it could break the code. Pick the line of a page element for it to sit after — or paste it yourself in Dev mode.";

export function planSourceInsert(input: {
  contents: string;
  code: string;
  anchor: InsertAnchor;
  /** The path the contents came from — the file TYPE decides the rules. */
  file: string;
}): SourceInsertPlan {
  const kind = fileKindOf(input.file);
  if (!kind) {
    return {
      ok: false,
      reason: "unknown-context",
      detail: `${input.file} is not a page file, so there is no safe way to place an element in it. Elements go into .tsx, .jsx, .mdx, .md and .html files.`,
    };
  }

  // Trailing blank lines in the emitted code are noise; internal ones are shape.
  const codeLines = input.code.replace(/\s+$/, "").split(/\r?\n/);
  if (codeLines.length === 1 && !codeLines[0].trim()) {
    return { ok: false, reason: "empty-code", detail: "There is no code to insert." };
  }
  if (input.code.includes("\0")) {
    return { ok: false, reason: "empty-code", detail: "That code cannot be inserted." };
  }

  const lines = input.contents.split(/\r?\n/);

  // Resolve BOTH anchors to one 0-based gap index: insert before `lines[at]`.
  let at: number;
  let indent = "";
  if (input.anchor.type === "after-line") {
    const line = input.anchor.line;
    if (!Number.isInteger(line) || line < 1 || line > lines.length) {
      return {
        ok: false,
        reason: "line-missing",
        detail: `${input.file} has ${lines.length} line${lines.length === 1 ? "" : "s"}, so there is no line ${line} to insert after. Reopen the file and pick again.`,
      };
    }
    const anchorText = lines[line - 1];
    if (kind !== "markdown") {
      // The end of the anchor line is the gap's left edge. `contextAt` answers
      // conservatively (see sourceMatch.ts) — `unknown` and inside-a-string
      // both refuse, which is the point.
      const context = contextAt(anchorText, anchorText.length, input.file);
      if (context !== "jsx" && context !== "html" && context !== "markdown") {
        return { ok: false, reason: "unknown-context", detail: UNKNOWN_CONTEXT_DETAIL };
      }
    }
    at = line;
    indent = anchorText.slice(0, anchorText.length - anchorText.trimStart().length);
  } else if (kind === "source") {
    return {
      ok: false,
      reason: "no-safe-end",
      detail: "A component file has no safe end — code after its last line is outside the page entirely. Pick the exact line for it to sit after instead.",
    };
  } else if (kind === "html") {
    // Before the LAST </body> when the document has one; a fragment appends.
    let bodyAt = -1;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (/^<\/body\b/i.test(lines[index].trimStart())) { bodyAt = index; break; }
    }
    if (bodyAt >= 0) {
      const bodyLine = lines[bodyAt];
      if (contextAt(bodyLine, 0, input.file) !== "html") {
        return { ok: false, reason: "unknown-context", detail: UNKNOWN_CONTEXT_DETAIL };
      }
      at = bodyAt;
      indent = `${bodyLine.slice(0, bodyLine.length - bodyLine.trimStart().length)}  `;
    } else {
      at = lastContentLine(lines) + 1;
      indent = "";
    }
  } else {
    // markdown / mdx: after the last line that says anything.
    at = lastContentLine(lines) + 1;
    indent = "";
  }

  const block = codeLines.map(line => (line.trim() ? `${indent}${line}` : line));
  const insertedLines: string[] = [];
  if (wantsBlankSeparation(kind)) {
    const before = at > 0 ? lines[at - 1] : null;
    const after = at < lines.length ? lines[at] : null;
    if (before !== null && before.trim()) insertedLines.push("");
    insertedLines.push(...block);
    if (after !== null && after.trim()) insertedLines.push("");
  } else {
    insertedLines.push(...block);
  }

  const next = [...lines.slice(0, at), ...insertedLines, ...lines.slice(at)];
  return {
    ok: true,
    line: at + 1,
    insertedLines,
    newContents: next.join("\n"),
    anchorText: at > 0 ? lines[at - 1] : null,
    followingText: at < lines.length ? lines[at] : null,
  };
}

/** Index of the last line with content, or -1 in an empty file. */
function lastContentLine(lines: string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim()) return index;
  }
  return -1;
}
