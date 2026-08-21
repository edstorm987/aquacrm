import "server-only";

/**
 * The repository as a file tree, for the code editor.
 *
 * The visual editor works on the elements a page is built from, so it only
 * ever needed the files that render markup. Code mode is the other half of the
 * same tool: every file, opened and edited directly, for the cases the visual
 * editor cannot reach — a config change, a new component, a stylesheet, or
 * simply preferring to type it.
 */

export interface TreeFile {
  path: string;
  name: string;
  /** Bytes, so something enormous can be refused before it is fetched. */
  size?: number;
  /** Whether it can be shown as text at all. */
  editable: boolean;
  /** Why not, when it cannot. Said out loud rather than the file vanishing. */
  reason?: string;
}

export interface TreeDirectory {
  path: string;
  name: string
  directories: TreeDirectory[];
  files: TreeFile[];
}

/**
 * Never listed. Not a matter of taste:
 *
 * `.env` files hold live credentials, `.git` holds history that editing by
 * hand corrupts, and lock files are machine-written. A code editor that
 * happily opens `.env.local` in a browser is a credential leak with a save
 * button.
 */
const HIDDEN = [
  /(^|\/)\.git\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)\.vercel\//,
  /(^|\/)\.env($|\.)/,
  /(^|\/)\.DS_Store$/,
];

/** Text as far as an editor is concerned. Everything else opens as binary. */
const TEXT = /\.(tsx?|jsx?|mjs|cjs|css|scss|html?|json|md|mdx|ya?ml|toml|txt|svg|graphql|sql|sh|env\.example)$/i;

/** Beyond this a browser editor stops being usable rather than merely slow. */
export const MAX_EDITABLE_BYTES = 512 * 1_024;

/**
 * Binary files that can still be SHOWN: pictures, rendered as a preview
 * instead of refused with "not a text file". Editing stays off — there is no
 * text to edit — but a designer opening `logo.png` should see the logo.
 */
const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i;

/**
 * Preview cap. GitHub's contents API only inlines base64 up to ~1 MB anyway;
 * the working-tree path honours the same bound so the two sources agree about
 * which images preview.
 */
export const MAX_PREVIEW_BYTES = 1024 * 1_024;

export function isImagePath(path: string): boolean {
  return IMAGE.test(path);
}

/** The `data:` MIME for an image path the preview embeds. */
export function imageContentType(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon",
  };
  return types[extension] ?? "application/octet-stream";
}

/**
 * Templates that deliberately hold no values — `.env.example` and friends.
 *
 * Worth showing: it is how somebody learns which variables a site needs, and
 * hiding it makes the editor look broken to anybody expecting it there.
 */
const ENV_TEMPLATE = /(^|\/)\.env\.(example|sample|template)$/;

export function isHiddenPath(path: string): boolean {
  const candidate = `/${path}`;
  if (ENV_TEMPLATE.test(candidate)) return false;
  return HIDDEN.some(pattern => pattern.test(candidate));
}

export function describeFile(path: string, size?: number): TreeFile {
  const name = path.split("/").pop() ?? path;
  if (!TEXT.test(path)) {
    if (isImagePath(path)) {
      // The reason must match what actually happens: a preview when the bytes
      // fit, a plain refusal when they do not — "shown as a preview" over an
      // empty pane reads as a broken editor.
      if (size !== undefined && size > MAX_PREVIEW_BYTES) {
        return { path, name, size, editable: false, reason: `An image, too large to preview here (${Math.round(size / 1024)} KB).` };
      }
      return { path, name, size, editable: false, reason: "An image — shown as a preview, not edited as text." };
    }
    return { path, name, size, editable: false, reason: "This is not a text file." };
  }
  if (size !== undefined && size > MAX_EDITABLE_BYTES) {
    return { path, name, size, editable: false, reason: `Too large to edit here (${Math.round(size / 1024)} KB).` };
  }
  return { path, name, size, editable: true };
}

/**
 * Builds the tree.
 *
 * Directories before files and both alphabetical, which is what every editor
 * does and therefore the only ordering that will not feel broken.
 */
export function buildFileTree(entries: Array<{ path: string; size?: number }>): TreeDirectory {
  const root: TreeDirectory = { path: "", name: "", directories: [], files: [] };

  for (const entry of entries) {
    if (isHiddenPath(entry.path)) continue;
    const segments = entry.path.split("/").filter(Boolean);
    const fileName = segments.pop();
    if (!fileName) continue;

    let directory = root;
    let walked = "";
    for (const segment of segments) {
      walked = walked ? `${walked}/${segment}` : segment;
      let next = directory.directories.find(child => child.name === segment);
      if (!next) {
        next = { path: walked, name: segment, directories: [], files: [] };
        directory.directories.push(next);
      }
      directory = next;
    }
    directory.files.push(describeFile(entry.path, entry.size));
  }

  const sort = (directory: TreeDirectory): TreeDirectory => ({
    ...directory,
    directories: directory.directories.map(sort).sort((a, b) => a.name.localeCompare(b.name)),
    files: [...directory.files].sort((a, b) => a.name.localeCompare(b.name)),
  });

  return sort(root);
}

/** Flattens back to paths, for search and for counting. */
export function treeFiles(directory: TreeDirectory): TreeFile[] {
  return [...directory.files, ...directory.directories.flatMap(treeFiles)];
}
