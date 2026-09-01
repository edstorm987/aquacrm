#!/usr/bin/env node

import crypto from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const ROOT = process.cwd();

export const AUTHORED_VOLUMES = [
  {
    path: "docs/00-START-HERE.md",
    title: "AquaCRM documentation — start here",
    description: "The catalogues, runbooks and entry-point instructions for people and agents.",
  },
  {
    path: "docs/01-PRODUCT-AND-ARCHITECTURE.md",
    title: "Product and architecture",
    description: "Product shape, portal model, brand architecture and plain-English system explanations.",
  },
  {
    path: "docs/02-CURRENT-STATE-AND-WORK.md",
    title: "Current state and work",
    description: "The current checklist, status, roadmap, goals, decisions and working queue.",
  },
  {
    path: "docs/03-ISSUES-AUDITS-AND-TESTS.md",
    title: "Issues, audits and tests",
    description: "Verified findings, independent reviews, browser audits and the testing record.",
  },
  {
    path: "docs/04-DEVELOPMENT-PLANS.md",
    title: "Development plans",
    description: "Every active, completed and archived phased implementation plan and handoff.",
  },
  {
    path: "docs/05-WORKSPACE-ENGINEERING.md",
    title: "Workspace engineering",
    description: "Source maps, subsystem dossiers, components, routes, state and built-in module notes.",
  },
  {
    path: "docs/06-DEV-TEAM-OPERATIONS.md",
    title: "Dev Team operations",
    description: "Commander/worker briefs, orchestration, live state and operational handoffs.",
  },
  {
    path: "docs/07-INTEGRATIONS-COMPLIANCE-AND-BRANDS.md",
    title: "Integrations, compliance and brands",
    description: "External APIs, inbox and portal concepts, compliance packs and brand records.",
  },
  {
    path: "docs/08-HISTORY-AND-ARCHIVE.md",
    title: "History and archive",
    description: "The append-only change record, dated handoffs and superseded historical summaries.",
  },
];

const VOLUME_PATHS = new Set(AUTHORED_VOLUMES.map(volume => volume.path));
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".data",
  ".cache",
  ".claude",
  "node_modules",
  "coverage",
  "dist",
  "build",
]);

function posix(path) {
  return path.split("\\").join("/");
}

function ignoredDirectory(name) {
  return IGNORED_DIRECTORIES.has(name) || name.startsWith(".next");
}

async function walk(directory, out = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectory(entry.name)) await walk(join(directory, entry.name), out);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const relPath = posix(relative(ROOT, join(directory, entry.name)));
    if (!VOLUME_PATHS.has(relPath)) out.push(relPath);
  }
  return out;
}

function volumeFor(path) {
  if (path.startsWith("docs/reference/")) return null;
  if (path === "docs/development/updates.md" || path.startsWith("docs/context/archive/")) {
    return "docs/08-HISTORY-AND-ARCHIVE.md";
  }
  if (path.startsWith("docs/development/plans/") || /(?:^|\/)DELIVERY-PLAN\.md$/i.test(path)) {
    return "docs/04-DEVELOPMENT-PLANS.md";
  }
  if (
    path === "docs/development/issues.md"
    || path === "docs/development/audits.md"
    || path === "docs/development/tests.md"
    || path.includes("/development/findings/")
    || /audit|review/i.test(path)
  ) {
    return "docs/03-ISSUES-AUDITS-AND-TESTS.md";
  }
  if (
    path === "docs/development/checklist.md"
    || path === "docs/development/status.md"
    || path === "docs/development/roadmap.md"
    || path === "docs/development/todo-retired.md"
    || path === "docs/development/goals.md"
    || path === "docs/development/notes.md"
    || path === "docs/CURRENT-IMPLEMENTATION.md"
  ) {
    return "docs/02-CURRENT-STATE-AND-WORK.md";
  }
  if (
    path.startsWith("docs/workspace/")
    || path === "docs/WORKSPACE-FILE-TREE.md"
    || path === "docs/development/STRUCTURE.md"
    || path.startsWith("src/")
  ) {
    return "docs/05-WORKSPACE-ENGINEERING.md";
  }
  if (
    path.startsWith("docs/context/")
    || path === "aqua dev.md"
  ) {
    return "docs/06-DEV-TEAM-OPERATIONS.md";
  }
  if (
    path.startsWith("docs/compliance/")
    || path.startsWith("assistant-integrations/")
    || /(?:external-assistant|meta-master-inbox|portal-tiers|zimante-brand)/i.test(path)
  ) {
    return "docs/07-INTEGRATIONS-COMPLIANCE-AND-BRANDS.md";
  }
  if (
    path === "docs/PRODUCT-ARCHITECTURE.md"
    || path === "docs/architecture-noobie.md"
  ) {
    return "docs/01-PRODUCT-AND-ARCHITECTURE.md";
  }
  return "docs/00-START-HERE.md";
}

function anchorFor(path) {
  return `source-${path.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function wordCount(content) {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}

function renderVolume(volume, sources) {
  const totalWords = sources.reduce((sum, source) => sum + source.words, 0);
  let output = `# ${volume.title}\n\n`;
  output += `> ${volume.description}\n>\n`;
  output += `> Consolidated ${new Date().toISOString().slice(0, 10)} from **${sources.length}** source documents / **${totalWords.toLocaleString("en-GB")} words**. `;
  output += "Each source is retained verbatim between provenance markers. The original path remains alongside it because relative links and runtime-backed Dev Team records still resolve from that location during the compatibility phase.\n\n";
  output += "## Source map\n\n";
  for (const source of sources) {
    output += `- [\`${source.path}\`](#${source.anchor}) — ${source.words.toLocaleString("en-GB")} words · \`${source.sha256.slice(0, 12)}\`\n`;
  }
  output += "\n---\n";

  for (const source of sources) {
    output += `\n<a id="${source.anchor}"></a>\n\n`;
    output += `## Source document — \`${source.path}\`\n\n`;
    output += `<!-- AQUACRM_SOURCE_START path=${JSON.stringify(source.path)} sha256=${JSON.stringify(source.sha256)} -->\n`;
    output += source.content;
    if (!source.content.endsWith("\n")) output += "\n";
    output += `<!-- AQUACRM_SOURCE_END path=${JSON.stringify(source.path)} -->\n\n---\n`;
  }
  return output;
}

const markdownPaths = (await walk(ROOT)).sort((left, right) => left.localeCompare(right));
const sourcePaths = markdownPaths.filter(path => !path.startsWith("docs/reference/"));
const sourceRecords = await Promise.all(sourcePaths.map(async path => {
  const content = await readFile(join(ROOT, path), "utf8");
  return {
    path,
    volume: volumeFor(path),
    anchor: anchorFor(path),
    sha256: sha256(content),
    words: wordCount(content),
    bytes: Buffer.byteLength(content),
    content,
  };
}));

for (const volume of AUTHORED_VOLUMES) {
  const sources = sourceRecords.filter(source => source.volume === volume.path);
  if (sources.length === 0) throw new Error(`${volume.path} received no source documents.`);
  await writeFile(join(ROOT, volume.path), renderVolume(volume, sources), "utf8");
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  canonicalMarkdownCount: AUTHORED_VOLUMES.length + 11,
  authoredVolumes: AUTHORED_VOLUMES,
  generatedReferenceDirectory: "docs/reference",
  sources: sourceRecords.map(({ content: _content, ...record }) => record),
};
await writeFile(
  join(ROOT, "docs", "consolidation-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

const totalWords = sourceRecords.reduce((sum, source) => sum + source.words, 0);
console.log(`Wrote ${AUTHORED_VOLUMES.length} authored volumes from ${sourceRecords.length} Markdown sources (${totalWords.toLocaleString("en-GB")} words).`);
console.log("Together with docs/reference's 11 generated volumes, the canonical Library view contains 20 documents.");
