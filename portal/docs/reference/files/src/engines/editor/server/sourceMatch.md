# `src/engines/editor/server/sourceMatch.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** Finding the line of source that produced a piece of text on a live page. ── Why this exists at all ────────────────────────────────────────────────── `sourceStamp.ts` describes the clean answer: the build stamps every element with `data-aqua-src="file.tsx:42:6"` and the editor reads it back verbatim. That is the right design and it is NOT what is running. Nothing stamps anything today (grep `SOURCE_ATTRIBUTE` — it is referenced only by its own module), and `AquaTagElement` carries no location field, so a selection arriving from a tagged site is `{ id, tagName, kind, label, text, styles }` and nothing else. `elementSource.ts` reads React's debug fibers instead, which a browser will not expose across an origin — so on the external tagged sites this whole feature is for, there is no location to read. What we do have is the text itself. So this module answers the only question that is actually answerable: **which lines of the source contain these words?** It GUESSES, and it says so — the result is a list of candidates for a human to confirm, never a single answer applied silently. One wrong guess here is a commit to a client's website on a line nobody looked at. ── Why matching is exact, and whitespace-tolerant ────────────────────────── The needle is DOM `textContent`, so HTML has already collapsed runs of whitespace: source `We build\n      things` reaches us as `We build things`. A plain `indexOf` would therefore miss most real headings. Collapsing the LINE instead loses the indices we need to splice at. So the needle becomes a regex whose literal tokens are escaped and whose gaps are `\s+`: the match is still exact, and `match.index` is still an offset into the RAW line, which is what a patch has to splice into. ── Nothing here reads a file, a network or a token ───────────────────────── Same reason `patch.ts` is separate from `publish.ts`: "did we find the right line?" is the entire safety story, and it has to be testable exhaustively without a repository.

## Exports (12)

- `MIN_SEARCHABLE_CHARS`
- `MAX_SEARCHABLE_CHARS`
- `MAX_CANDIDATES`
- `interface SourceTextCandidate (9 members)`
- `type SourceTextSearch`
- `textSearchPattern(text: string): RegExp`
- `findTextInSource(input: { files: Array<{ path: string; contents: string }>; text: string; }): SourceTextSearch`
- `type LineReplacement`
- `type TextContext`
- `contextAt(lineText: string, at: number, file?: string): TextContext | "unknown"`
- `unsafeCharactersFor(context: TextContext): string[]`
- `replaceTextInLine(input: { lineText: string; originalText: string; newText: string; /** The path the line came from — the file TYPE decides which characters are safe. */ file?: string; }): LineReplacement`

## Depends on (1)

- [`src/engines/editor/server/registry.ts`](./registry.md)

## Used by (3)

- [`scripts/smoke-editor-words-publish.test.ts`](../../../../scripts/smoke-editor-words-publish.test.md)
- [`src/engines/editor/server/sourceEdit.ts`](./sourceEdit.md)
- [`src/engines/editor/server/sourceInsert.ts`](./sourceInsert.md)

