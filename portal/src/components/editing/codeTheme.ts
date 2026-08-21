// ─── DEV EDITOR — file colours and syntax colours ────────────────────────────
//
// Two jobs, both about reading a repository quickly:
//   • FILE COLOUR — the tint of a file's icon in the tree and tabs, so a
//     .tsx reads differently from a .json at a glance, the way VS Code's
//     Seti/Material icon themes work.
// SYNTAX colouring is NOT here: that is CodeMirror's job, with the real VS Code
// Dark+ theme — see CodeSurface.tsx. This file is only the icon tints, which
// are a navigation aid rather than a grammar.

/** The icon tint for a path — Seti-ish, and consistent across tree and tabs. */
export function fileColour(path: string): string {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop()! : name;
  switch (ext) {
    case "ts": case "mts": case "cts": return "#3178c6";
    case "tsx": return "#4ec9b0";
    case "js": case "mjs": case "cjs": return "#e2c08d";
    case "jsx": return "#e2c08d";
    case "json": case "json5": return "#cbcb41";
    case "css": case "scss": case "sass": case "less": return "#42a5f5";
    case "html": case "htm": return "#e44d26";
    case "md": case "mdx": case "txt": case "rst": return "#9aa7b2";
    case "yml": case "yaml": case "toml": case "ini": case "conf": return "#c586c0";
    case "sh": case "bash": case "zsh": return "#89e051";
    case "sql": case "prisma": case "graphql": case "gql": return "#e535ab";
    case "py": return "#3572a5";
    case "rb": return "#cc342d";
    case "go": return "#00add8";
    case "rs": return "#dea584";
    case "svg": case "png": case "jpg": case "jpeg": case "gif": case "webp": case "avif": case "ico":
      return "#a074c4";
    case "lock": return "#8b949e";
    case "gitignore": case "npmrc": case "editorconfig": case "env": return "#7d8590";
    default: return "#8b949e";
  }
}
