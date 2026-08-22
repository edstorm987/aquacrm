/**
 * Finding the line of source that produced a piece of text on a live page.
 *
 * ── Why this exists at all ──────────────────────────────────────────────────
 *
 * `sourceStamp.ts` describes the clean answer: the build stamps every element
 * with `data-aqua-src="file.tsx:42:6"` and the editor reads it back verbatim.
 * That is the right design and it is NOT what is running. Nothing stamps
 * anything today (grep `SOURCE_ATTRIBUTE` — it is referenced only by its own
 * module), and `AquaTagElement` carries no location field, so a selection
 * arriving from a tagged site is `{ id, tagName, kind, label, text, styles }`
 * and nothing else. `elementSource.ts` reads React's debug fibers instead,
 * which a browser will not expose across an origin — so on the external tagged
 * sites this whole feature is for, there is no location to read.
 *
 * What we do have is the text itself. So this module answers the only question
 * that is actually answerable: **which lines of the source contain these
 * words?** It GUESSES, and it says so — the result is a list of candidates for
 * a human to confirm, never a single answer applied silently. One wrong guess
 * here is a commit to a client's website on a line nobody looked at.
 *
 * ── Why matching is exact, and whitespace-tolerant ──────────────────────────
 *
 * The needle is DOM `textContent`, so HTML has already collapsed runs of
 * whitespace: source `We build\n      things` reaches us as `We build things`.
 * A plain `indexOf` would therefore miss most real headings. Collapsing the
 * LINE instead loses the indices we need to splice at. So the needle becomes a
 * regex whose literal tokens are escaped and whose gaps are `\s+`: the match is
 * still exact, and `match.index` is still an offset into the RAW line, which is
 * what a patch has to splice into.
 *
 * ── Nothing here reads a file, a network or a token ─────────────────────────
 *
 * Same reason `patch.ts` is separate from `publish.ts`: "did we find the right
 * line?" is the entire safety story, and it has to be testable exhaustively
 * without a repository.
 */

import "server-only";

import { classifyText, hashLine, type RegistryNode } from "./registry";

/**
 * Below this, a search matches half the repository.
 *
 * Three characters is already generous — "Hi" as a whole heading is a real
 * thing, but every `if` and `id` in the tree matches it, and handing back
 * forty candidates is not an answer. Short text goes through Dev mode.
 */
export const MIN_SEARCHABLE_CHARS = 3;

/** Longer than this is not a heading, and the regex would be silly. */
export const MAX_SEARCHABLE_CHARS = 2_000;

/**
 * More candidates than this and the answer is "we cannot tell you".
 *
 * A picker with sixty rows is not a confirmation step, it is a guess with
 * extra clicks — and the person clicking has no way to know which is right.
 */
export const MAX_CANDIDATES = 25;

export interface SourceTextCandidate {
  file: string;
  /** 1-based, matching `RegistryNode.line` and `SourcePatch.line`. */
  line: number;
  /** Indentation width, the same column `mapFile` records. */
  column: number;
  /** The RAW line, indentation included. What a patch replaces wholesale. */
  lineText: string;
  /** `hashLine(lineText)` — exactly the value `applyPatch` checks against. */
  expectedHash: string;
  /** Offsets of the match within `lineText`. */
  start: number;
  end: number;
  /** How many times the words occur on this line. More than one is ambiguous. */
  occurrences: number;
  /**
   * `registry.ts`'s own verdict on the line.
   *
   * `dynamic` means the line carries a JSX expression or an interpolation, so
   * the words on the page may not be the words in the file — patching it can
   * appear to work and revert on the next render. Carried through rather than
   * filtered out, because the person confirming should see it.
   */
  kind: RegistryNode["kind"];
}

export type SourceTextSearch =
  | { ok: true; candidates: SourceTextCandidate[] }
  | { ok: false; reason: "too-short" | "too-long" | "not-found" | "too-many"; detail: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The needle, as a whitespace-tolerant exact pattern.
 *
 * Exported for the tests, because "does this actually tolerate the newline a
 * formatter puts in the middle of a heading" is the question the whole feature
 * turns on and it deserves to be asserted directly.
 */
export function textSearchPattern(text: string): RegExp {
  const tokens = text.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  return new RegExp(tokens.join("\\s+"), "g");
}

/** Non-whitespace characters, which is what "long enough to search for" means. */
function significantLength(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/**
 * Every line in the supplied files that contains these words.
 *
 * Ranked so the likeliest sits first: a line where the words are the only
 * content beats one where they are buried in a longer line, and a `literal`
 * line beats a `dynamic` one. Ranking is a convenience for the human reading
 * the list — it never collapses the list to one answer.
 */
export function findTextInSource(input: {
  files: Array<{ path: string; contents: string }>;
  text: string;
}): SourceTextSearch {
  const text = input.text.trim();
  if (significantLength(text) < MIN_SEARCHABLE_CHARS) {
    return {
      ok: false,
      reason: "too-short",
      detail: `“${text}” is too short to find in the source without matching half the repository. Open the file in Dev mode instead.`,
    };
  }
  if (text.length > MAX_SEARCHABLE_CHARS) {
    return {
      ok: false,
      reason: "too-long",
      detail: `That is ${text.length} characters; ${MAX_SEARCHABLE_CHARS} is the most that can be searched for.`,
    };
  }

  const candidates: SourceTextCandidate[] = [];
  for (const file of input.files) {
    const lines = file.contents.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const lineText = lines[index];
      // A fresh regex per line: `g` regexes carry `lastIndex` between calls,
      // and a shared one would skip every other match.
      const pattern = textSearchPattern(text);
      const matches = [...lineText.matchAll(pattern)];
      if (!matches.length) continue;
      const first = matches[0];
      candidates.push({
        file: file.path,
        line: index + 1,
        column: lineText.length - lineText.trimStart().length,
        lineText,
        expectedHash: hashLine(lineText),
        start: first.index ?? 0,
        end: (first.index ?? 0) + first[0].length,
        occurrences: matches.length,
        kind: classifyText(lineText).kind,
      });
      if (candidates.length > MAX_CANDIDATES) {
        return {
          ok: false,
          reason: "too-many",
          detail: `Those words appear on more than ${MAX_CANDIDATES} lines. Edit a longer piece of text, or find the file in Dev mode.`,
        };
      }
    }
  }

  if (!candidates.length) {
    return {
      ok: false,
      reason: "not-found",
      detail: "Those words are not in the source that was searched. They may be split across several lines, built from a variable, or come from a database — in which case the file that produces them is what needs editing, not the words.",
    };
  }

  candidates.sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file) || a.line - b.line);
  return { ok: true, candidates };
}

/** Lower is likelier. Deliberately crude — this orders a list, it does not decide. */
function rank(candidate: SourceTextCandidate): number {
  const matched = candidate.end - candidate.start;
  const surplus = candidate.lineText.trim().length - matched;
  return (candidate.kind === "dynamic" ? 1_000 : 0)
    + (candidate.occurrences > 1 ? 500 : 0)
    + Math.min(surplus, 400);
}

// ─── Splicing one line ───────────────────────────────────────────────────────

export type LineReplacement =
  | { ok: true; newLine: string; before: string; after: string }
  | {
    ok: false;
    reason: "not-on-line" | "ambiguous-line" | "unsafe-text" | "unknown-context" | "no-change";
    detail: string;
  };

/**
 * What kind of place the match sits in.
 *
 * `"jsx"` is bare text between tags in a JSX/MDX file; `"html"` is the same
 * place in plain HTML (where `{` and `}` are ordinary characters); `"markdown"`
 * is prose in a markdown/plain-text file (where nothing can stop a build); a
 * quote character means the words are inside a string literal
 * (`title="We build things"`, `alt='…'`, a template literal). Each has
 * different characters that would break it, and conflating them means either
 * refusing apostrophes in body copy or accepting a quote that ends an
 * attribute early.
 */
export type TextContext = "jsx" | "html" | "markdown" | '"' | "'" | "`";

/** How a file's extension says its lines should be read. */
type FileKind = "source" | "mdx" | "markdown" | "html" | "unknown";

function fileKindOf(file: string | undefined): FileKind {
  // No file named: the callers that predate the file being threaded through
  // are all reading JSX/TSX source, so that is the compatible default.
  if (file === undefined) return "source";
  if (/\.(tsx|jsx|ts|js|mjs|cjs)$/i.test(file)) return "source";
  if (/\.mdx$/i.test(file)) return "mdx";
  if (/\.(md|markdown|txt)$/i.test(file)) return "markdown";
  if (/\.html?$/i.test(file)) return "html";
  return "unknown";
}

/**
 * Lines that are recognisably STATEMENT code rather than markup or prose.
 *
 * Only consulted for lines that do not start with `<` or `{` in a source file.
 * Deliberately a list of unambiguous openers — a keyword, a closing bracket, a
 * comment — rather than "anything with an identifier in it": a line this does
 * not recognise is answered `"unknown"` and refused, never guessed.
 */
const CODE_LINE_START = /^(?:(?:export|import|const|let|var|return|function|async|await|if|else|for|while|do|switch|case|default|break|continue|throw|new|try|catch|finally|typeof|void|delete|yield|class|extends|interface|type|enum|namespace|declare)\b|[}\])]|\/\/|\/\*|\*)/;

/**
 * Which context position `at` on this line falls inside, or `"unknown"`.
 *
 * The old version of this was ONE state machine that treated any quote
 * anywhere as opening a string — which read the apostrophe in
 * `<h1>Don't stop believing</h1>` as a string opener, classed the rest of the
 * line as inside-a-string, and thereby ACCEPTED `<script>` and `{` into JSX
 * text (and refused honest apostrophe edits in markdown). Quotes only delimit
 * strings where strings exist — attribute values and JS/JSX expressions —
 * never in bare JSX text between tags, and never in markdown or plain text.
 *
 * So the context is derived from where the line sits:
 *
 *   - markdown/plain-text file → `"markdown"`, whatever is on the line;
 *   - a line starting with `<` or `{` → a markup machine that knows about
 *     tags, attribute values and `{…}` expressions;
 *   - a line starting with recognisable statement code → a string-literal
 *     machine (quotes DO delimit strings there);
 *   - MDX prose → `"jsx"` (quotes are ordinary, but `<` and `{` still open
 *     JSX/expressions);
 *   - anything else → `"unknown"`. A bare line in a .tsx file could be JSX
 *     text a formatter wrapped or a statement this heuristic does not know,
 *     and guessing either way is how the filter inverts — the caller refuses
 *     with an honest "cannot determine" instead.
 */
export function contextAt(lineText: string, at: number, file?: string): TextContext | "unknown" {
  const kind = fileKindOf(file);
  if (kind === "markdown") return "markdown";
  if (kind === "unknown") return "unknown";

  const trimmed = lineText.trimStart();
  if (trimmed.startsWith("<") || trimmed.startsWith("{")) return markupContextAt(lineText, at, kind);
  if (kind !== "html" && CODE_LINE_START.test(trimmed)) return codeContextAt(lineText, at);
  // MDX prose: neither markup nor code, so quotes are ordinary text — but the
  // file still compiles, so the JSX character set applies to what goes in.
  if (kind === "mdx") return "jsx";
  return "unknown";
}

/**
 * The markup machine: text between tags, tags, attribute values, expressions.
 *
 * Line-local, starting in text — which is what a line beginning with `<` or
 * `{` is. Attribute values have NO backslash escapes (HTML and JSX both): the
 * matching quote is the only way out, so `alt="Ed's site"` reads correctly.
 */
function markupContextAt(lineText: string, at: number, kind: "source" | "mdx" | "html"): TextContext | "unknown" {
  // In plain HTML `{` is an ordinary character; in JSX/MDX it opens an expression.
  const expressions = kind !== "html";
  let where: "text" | "tag" | "attr" | "expr" | "string" = "text";
  let quote: '"' | "'" | "`" | null = null;
  let exprDepth = 0;
  let exprFrom: "text" | "tag" = "text";

  for (let index = 0; index < at && index < lineText.length; index += 1) {
    const char = lineText[index];
    switch (where) {
      case "text":
        if (char === "<") where = "tag";
        else if (expressions && char === "{") { where = "expr"; exprDepth = 1; exprFrom = "text"; }
        break;
      case "tag":
        if (char === '"' || char === "'") { where = "attr"; quote = char; }
        else if (expressions && char === "{") { where = "expr"; exprDepth = 1; exprFrom = "tag"; }
        else if (char === ">") where = "text";
        break;
      case "attr":
        if (char === quote) { where = "tag"; quote = null; }
        break;
      case "expr":
        if (char === '"' || char === "'" || char === "`") { where = "string"; quote = char; }
        else if (char === "{") exprDepth += 1;
        else if (char === "}") { exprDepth -= 1; if (exprDepth === 0) where = exprFrom; }
        break;
      case "string":
        if (char === "\\") index += 1;
        // A template interpolation nested inside an expression inside markup —
        // this line-local machine cannot track that honestly, so it says so.
        else if (quote === "`" && char === "$" && lineText[index + 1] === "{") return "unknown";
        else if (char === quote) { where = "expr"; quote = null; }
        break;
    }
  }

  if (where === "text") return kind === "html" ? "html" : "jsx";
  if ((where === "attr" || where === "string") && quote) return quote;
  // Inside a tag but outside any value (an attribute name), or inside raw
  // expression code — not places where "the words on the page" can sit.
  return "unknown";
}

/**
 * The string-literal machine, for lines that are statement code.
 *
 * This is the one place the old everything-is-maybe-a-string rule was actually
 * right: in `const t = "We build things";` quotes DO delimit strings and
 * backslash DOES escape. A position outside any string is raw code, which the
 * words editor must not touch — `"unknown"`, refused by the caller.
 */
function codeContextAt(lineText: string, at: number): TextContext | "unknown" {
  let quote: '"' | "'" | "`" | null = null;
  for (let index = 0; index < at && index < lineText.length; index += 1) {
    const char = lineText[index];
    if (char === "\\") { index += 1; continue; }
    if (quote) { if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'" || char === "`") quote = char;
  }
  return quote ?? "unknown";
}

/**
 * Characters that would turn this edit into a different program.
 *
 * The failure this prevents is the expensive one: typing a `{` into a heading
 * makes the JSX an expression, the build fails, and the site that was working
 * ten seconds ago is not. Refusing is recoverable; committing is not.
 */
export function unsafeCharactersFor(context: TextContext): string[] {
  if (context === "jsx") return ["<", ">", "{", "}"];
  // HTML text between tags: braces are ordinary characters there, but an angle
  // bracket changes the markup.
  if (context === "html") return ["<", ">"];
  // Markdown/plain prose: quotes, braces and angle brackets are all just
  // characters — nothing that can be typed here stops a build.
  if (context === "markdown") return [];
  // Inside a string: only the delimiter and a backslash can end it early.
  return [context, "\\"];
}

/**
 * Replace the matched words inside one raw line.
 *
 * Returns the WHOLE new line because that is what `SourcePatch` takes and what
 * `applyPatch` checks — indentation and everything else on the line survive
 * untouched, which is the only way an edit to a heading does not reformat the
 * component around it.
 */
export function replaceTextInLine(input: {
  lineText: string;
  originalText: string;
  newText: string;
  /** The path the line came from — the file TYPE decides which characters are safe. */
  file?: string;
}): LineReplacement {
  const { lineText, newText } = input;
  const pattern = textSearchPattern(input.originalText);
  const matches = [...lineText.matchAll(pattern)];

  if (!matches.length) {
    return {
      ok: false,
      reason: "not-on-line",
      detail: "Those words are no longer on that line — the file changed since it was searched. Find them again.",
    };
  }
  if (matches.length > 1) {
    // Which one did they mean? There is no way to know, and picking the first
    // silently edits a line the person did not look at.
    return {
      ok: false,
      reason: "ambiguous-line",
      detail: `Those words appear ${matches.length} times on that one line, so there is no way to tell which was clicked. Edit that line in Dev mode.`,
    };
  }
  if (/[\r\n]/.test(newText)) {
    return {
      ok: false,
      reason: "unsafe-text",
      detail: "A line break cannot be saved this way — it would split the line of source. Edit the file in Dev mode.",
    };
  }

  const match = matches[0];
  const start = match.index ?? 0;
  const context = contextAt(lineText, start, input.file);
  if (context === "unknown") {
    // Guessing a set here is how the filter inverts (see `contextAt`): the
    // wrong guess either refuses honest copy or commits a broken build.
    return {
      ok: false,
      reason: "unknown-context",
      detail: "The safety check cannot determine the context those words sit in on that line, so it cannot tell which characters are safe to save. Edit the file in Dev mode.",
    };
  }
  const forbidden = unsafeCharactersFor(context).filter(char => newText.includes(char));
  if (forbidden.length) {
    const listed = forbidden.map(char => `“${char}”`).join(", ");
    return {
      ok: false,
      reason: "unsafe-text",
      detail: context === "jsx"
        ? `${listed} cannot be saved into the page's text — those characters mean something to the code and would stop the site building. Edit the file in Dev mode.`
        : context === "html"
          ? `${listed} cannot be saved into the page's text — those characters would change the page's markup. Edit the file in Dev mode.`
          : `${listed} cannot be saved here — those words sit inside a ${context === "`" ? "template" : "quoted"} value and that character would end it early. Edit the file in Dev mode.`,
    };
  }

  const newLine = lineText.slice(0, start) + newText + lineText.slice(start + match[0].length);
  if (newLine === lineText) {
    return { ok: false, reason: "no-change", detail: "That edit leaves the line exactly as it was." };
  }
  return { ok: true, newLine, before: lineText, after: newLine };
}
