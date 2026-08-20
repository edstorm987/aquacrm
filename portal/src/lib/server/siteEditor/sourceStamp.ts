/**
 * Where a rendered element came from.
 *
 * The whole editor rests on not having to answer this by inspection. Working
 * backwards from a rendered `<h1>` to the JSX that produced it means guessing
 * — through components, props, loops and conditionals — and the guess is wrong
 * exactly when the page is interesting. So the origin is stamped on the way
 * out at build time and read back verbatim:
 *
 *     <h1 data-aqua-src="app/(site)/page.tsx:42:6">We build things</h1>
 *
 * React already keeps this internally: `@babel/plugin-transform-react-jsx-source`
 * attaches `__source` to every JSX node in development and strips it for
 * production. Editable sites keep it deliberately.
 */

export const SOURCE_ATTRIBUTE = "data-aqua-src";

export interface SourceLocation {
  /** Repo-relative, forward-slashed, no leading slash. */
  file: string;
  line: number;
  column: number;
}

/**
 * Parses a stamp back into a location.
 *
 * Rejects rather than repairs. A stamp that cannot be read exactly is a stamp
 * pointing somewhere unknown, and an editor that writes to a line it guessed
 * at is worse than one that refuses.
 */
export function parseSourceStamp(value: string | null | undefined): SourceLocation | null {
  if (typeof value !== "string") return null;
  // Windows paths and drive letters would make a naive split on ":" wrong, so
  // the line and column are taken from the end.
  const match = /^(.*):(\d+):(\d+)$/.exec(value.trim());
  if (!match) return null;
  const [, file, line, column] = match;
  const normalised = file.replace(/\\/g, "/").replace(/^\.?\//, "").trim();
  if (!normalised || normalised.includes("..")) return null;
  const parsedLine = Number(line);
  const parsedColumn = Number(column);
  if (!Number.isInteger(parsedLine) || parsedLine < 1) return null;
  if (!Number.isInteger(parsedColumn) || parsedColumn < 0) return null;
  return { file: normalised, line: parsedLine, column: parsedColumn };
}

export function formatSourceStamp(location: SourceLocation): string {
  return `${location.file}:${location.line}:${location.column}`;
}

/** The key a location has in the registry. */
export function sourceKey(location: SourceLocation): string {
  return formatSourceStamp(location);
}
