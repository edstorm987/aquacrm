import "server-only";

import type { DevDocsIndex } from "@/lib/server/dev/devDocs";

export const CONSOLIDATED_AUTHORED_DOC_PATHS = [
  "docs/00-START-HERE.md",
  "docs/01-PRODUCT-AND-ARCHITECTURE.md",
  "docs/02-CURRENT-STATE-AND-WORK.md",
  "docs/03-ISSUES-AUDITS-AND-TESTS.md",
  "docs/04-DEVELOPMENT-PLANS.md",
  "docs/05-WORKSPACE-ENGINEERING.md",
  "docs/06-DEV-TEAM-OPERATIONS.md",
  "docs/07-INTEGRATIONS-COMPLIANCE-AND-BRANDS.md",
  "docs/08-HISTORY-AND-ARCHIVE.md",
] as const;

const AUTHORED = new Set<string>(CONSOLIDATED_AUTHORED_DOC_PATHS);

/**
 * The founder-facing Library is intentionally small even while runtime-backed
 * roadmap/plan/finding fragments keep their compatibility paths. All authored
 * fragment text is present in the nine canonical volumes; the generated source
 * map remains as the eleven documents under docs/reference/.
 */
export function consolidatedDevDocsIndex(index: DevDocsIndex): DevDocsIndex {
  const entries = index.entries.filter(entry =>
    AUTHORED.has(entry.relPath) || entry.relPath.startsWith("docs/reference/"),
  );
  return {
    entries,
    tree: buildTree(entries),
    total: entries.length,
    scannedAtMs: index.scannedAtMs,
  };
}

function buildTree(entries: DevDocsIndex["entries"]): DevDocsIndex["tree"] {
  type MutableNode = DevDocsIndex["tree"][number] & { children?: MutableNode[] };
  const roots: MutableNode[] = [];
  for (const entry of entries) {
    const parts = entry.relPath.split("/");
    let nodes = roots;
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const relPath = parts.slice(0, index + 1).join("/");
      const isDir = index < parts.length - 1;
      let node = nodes.find(candidate => candidate.name === name && candidate.isDir === isDir);
      if (!node) {
        node = isDir
          ? { name, path: relPath, isDir: true, count: 0, newestMtimeMs: 0, children: [] }
          : { name, path: relPath, isDir: false, count: 1, newestMtimeMs: entry.mtimeMs, entry };
        nodes.push(node);
      }
      if (isDir) {
        node.count += 1;
        node.newestMtimeMs = Math.max(node.newestMtimeMs, entry.mtimeMs);
        nodes = node.children ?? (node.children = []);
      }
    }
  }
  const sort = (nodes: MutableNode[]) => {
    nodes.sort((left, right) => Number(right.isDir) - Number(left.isDir) || left.name.localeCompare(right.name));
    for (const node of nodes) if (node.children) sort(node.children);
  };
  sort(roots);
  return roots;
}
