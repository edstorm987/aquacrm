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
  /** Whether it can be CHANGED here. */
  editable: boolean;
  /** Whether it can be SHOWN here — a separate question from editing. */
  readable?: boolean;
  /** How to render it. */
  kind?: "text" | "image" | "binary";
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
  /(^|\/)\.next/,
  /(^|\/)\.vercel\//,
  /(^|\/)\.env($|\.)/,
  /(^|\/)\.DS_Store$/,
  // Live operational state, not source. `.data/` holds the portal state blob
  // AND the worker check-in records that OTHER processes rewrite while this
  // server runs — a file the editor's fingerprint can know nothing about, so
  // its every save would be a race it cannot see. `.claude/` is tooling state.
  /(^|\/)\.data\//,
  /(^|\/)\.claude\//,
  /(^|\/)\.disabled-node-modules\//,
  /(^|\/)\.turbo\//,
];

/**
 * Text as far as an editor is concerned.
 *
 * Deliberately broad. The previous list covered the web stack only, and every
 * file outside it — a Python script, a Dockerfile, a .gitignore — reported
 * "this is not a text file" and rendered NOTHING, which is why the editor
 * looked like it could not see most of the repository.
 */
const TEXT = new RegExp(
  "\\.(" + [
    // web
    "tsx?", "jsx?", "mjs", "cjs", "css", "scss", "sass", "less", "html?", "vue", "svelte", "astro",
    // data + config
    "json5?", "ya?ml", "toml", "ini", "cfg", "conf", "properties", "xml", "csv", "tsv", "lock",
    // docs
    "md", "mdx", "txt", "rst", "adoc", "log", "patch", "diff", "gitignore", "gitattributes", "gitkeep",
    "npmrc", "nvmrc", "editorconfig", "prettierrc", "eslintrc", "babelrc",
    // other languages
    "py", "rb", "go", "rs", "java", "kt", "kts", "swift", "c", "h", "cpp", "hpp", "cs", "php",
    "sh", "bash", "zsh", "fish", "ps1", "sql", "graphql", "gql", "prisma", "proto", "r", "lua",
    "dart", "ex", "exs", "erl", "clj", "scala", "pl", "tf", "tfvars", "hcl", "svg",
  ].join("|") + ")$",
  "i",
);

/** Files with no extension that are still plainly text. */
const TEXT_BY_NAME = /^(dockerfile|makefile|procfile|license|licence|readme|changelog|codeowners|caddyfile|gemfile|rakefile|brewfile|justfile|\.env\.example|\.env\.sample|\.env\.template)$/i;

/** Shown as an image rather than as characters. */
export const IMAGE = /\.(png|jpe?g|gif|webp|avif|ico|bmp)$/i;

/** Keep data-URL previews bounded and aligned with GitHub's inline-content limit. */
export const MAX_IMAGE_PREVIEW_BYTES = 1024 * 1_024;

export function imageContentType(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    ico: "image/x-icon",
    bmp: "image/bmp",
  };
  return types[extension] ?? "application/octet-stream";
}

/** Beyond this a browser editor stops being usable rather than merely slow. */
export const MAX_EDITABLE_BYTES = 512 * 1_024;

/**
 * Beyond this we stop sending the whole file, but still send the beginning.
 *
 * Refusing outright was the bug: a big file rendered as an empty pane, so the
 * editor looked broken rather than honest about a limit.
 */
export const MAX_READ_BYTES = 2 * 1_024 * 1_024;

export function isTextPath(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return TEXT.test(path) || TEXT_BY_NAME.test(name);
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

/**
 * READABLE and EDITABLE are different questions.
 *
 * They used to be the same one, and answering "no" meant the pane rendered
 * nothing at all — the reason most of the repository looked invisible. A big
 * file is still worth reading; an image is worth looking at; only the write is
 * genuinely restricted.
 */
export function describeFile(path: string, size?: number): TreeFile {
  const name = path.split("/").pop() ?? path;

  if (IMAGE.test(path)) {
    if (size !== undefined && size > MAX_IMAGE_PREVIEW_BYTES) {
      return {
        path,
        name,
        size,
        kind: "image",
        readable: false,
        editable: false,
        reason: `${Math.round(size / 1024)} KB — too large to preview here.`,
      };
    }
    return { path, name, size, kind: "image", readable: true, editable: false, reason: "Images open as a preview." };
  }
  if (!isTextPath(path)) {
    return { path, name, size, kind: "binary", readable: false, editable: false, reason: "This is not a text file." };
  }
  if (size !== undefined && size > MAX_EDITABLE_BYTES) {
    return {
      path, name, size, kind: "text", readable: true, editable: false,
      reason: `${Math.round(size / 1024)} KB — read-only here.`,
    };
  }
  return { path, name, size, kind: "text", readable: true, editable: true };
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
