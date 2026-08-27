// Generates an exhaustive function/symbol reference for the whole codebase by
// parsing every .ts/.tsx file with the TypeScript compiler API. Deterministic,
// complete (never misses a file), and re-runnable so the map stays current.
//
//   node scripts/generate-symbol-reference.mjs
//
// Writes nine consolidated docs: eight area volumes plus files-index.md and the
// small 00-index.md contents page. Each source file gets one anchored section
// with purpose, exports, dependencies and dependants. This deliberately replaces
// the old docs/reference/files/** one-stub-per-source tree.

import ts from "typescript";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs", "reference");
const LEGACY_FILES_DIR = join(OUT, "files");
mkdirSync(OUT, { recursive: true });

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "_attic", "dist", "build"]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

function clean(sig) {
  return sig.replace(/\s+/g, " ").trim();
}

function truncate(s, n = 220) {
  s = clean(s);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function docComment(node, sf, fullText) {
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart()) || [];
  if (!ranges.length) return "";
  const last = ranges[ranges.length - 1];
  let text = fullText.slice(last.pos, last.end);
  text = text
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/\s*$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").replace(/^\s*\/\/\s?/, "").trim())
    .filter((l) => l && !l.startsWith("@"))
    .join(" ")
    .trim();
  return truncate(text, 180);
}

function typeParams(node, sf) {
  if (!node.typeParameters || !node.typeParameters.length) return "";
  return "<" + node.typeParameters.map((t) => t.getText(sf)).join(", ") + ">";
}

function fnSig(name, node, sf, { asyncKw = false } = {}) {
  const params = (node.parameters || []).map((p) => p.getText(sf)).join(", ");
  const ret = node.type ? ": " + node.type.getText(sf) : "";
  const a = asyncKw ? "async " : "";
  return truncate(`${a}${name}${typeParams(node, sf)}(${params})${ret}`);
}

function hasExport(node) {
  return (node.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}
function isAsync(node) {
  return (node.modifiers || []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
}
function isDefault(node) {
  return (node.modifiers || []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
}

function classMethods(node, sf) {
  const out = [];
  for (const m of node.members) {
    const priv =
      (m.modifiers || []).some((x) => x.kind === ts.SyntaxKind.PrivateKeyword) ||
      (m.name && m.name.getText(sf).startsWith("#"));
    if (priv) continue;
    if (ts.isMethodDeclaration(m)) {
      out.push(fnSig(m.name.getText(sf), m, sf, { asyncKw: isAsync(m) }));
    } else if (ts.isGetAccessor(m)) {
      out.push(`get ${m.name.getText(sf)}(): ${m.type ? m.type.getText(sf) : "?"}`);
    } else if (ts.isConstructorDeclaration(m)) {
      const params = m.parameters.map((p) => p.getText(sf)).join(", ");
      out.push(truncate(`constructor(${params})`));
    }
  }
  return out;
}

// Extract exported symbols from one file. Returns [{kind,sig,doc,methods?}]
function extractFile(path) {
  const text = readFileSync(path, "utf8");
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, /* tsx */ ts.ScriptKind.TSX);
  const full = sf.getFullText();
  const syms = [];
  const imports = [];
  const fileDoc = sf.statements.length ? docComment(sf.statements[0], sf, full) : "";

  for (const node of sf.statements) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      imports.push(node.moduleSpecifier.text);
    }
    // export { a, b } from './x'  |  export * from './x'
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        const names = node.exportClause.elements.map((e) => e.name.getText(sf)).join(", ");
        const from = node.moduleSpecifier ? ` from ${node.moduleSpecifier.getText(sf)}` : "";
        syms.push({ kind: "re-export", sig: `{ ${names} }${from}`, doc: "" });
      } else if (node.moduleSpecifier) {
        syms.push({ kind: "re-export", sig: `* from ${node.moduleSpecifier.getText(sf)}`, doc: "" });
      }
      continue;
    }
    // export default <expr/identifier>
    if (ts.isExportAssignment(node)) {
      syms.push({ kind: "default", sig: truncate("default " + node.expression.getText(sf).split("\n")[0]), doc: docComment(node, sf, full) });
      continue;
    }
    if (!hasExport(node)) continue;
    const doc = docComment(node, sf, full);
    const def = isDefault(node) ? "default " : "";

    if (ts.isFunctionDeclaration(node) && node.name) {
      syms.push({ kind: "function", sig: def + fnSig(node.name.getText(sf), node, sf, { asyncKw: isAsync(node) }), doc });
    } else if (ts.isClassDeclaration(node) && node.name) {
      syms.push({ kind: "class", sig: `${def}class ${node.name.getText(sf)}${typeParams(node, sf)}`, doc, methods: classMethods(node, sf) });
    } else if (ts.isInterfaceDeclaration(node)) {
      syms.push({ kind: "interface", sig: `interface ${node.name.getText(sf)}${typeParams(node, sf)} (${node.members.length} members)`, doc });
    } else if (ts.isTypeAliasDeclaration(node)) {
      syms.push({ kind: "type", sig: truncate(`type ${node.name.getText(sf)}${typeParams(node, sf)} = ${node.type.getText(sf)}`), doc });
    } else if (ts.isEnumDeclaration(node)) {
      syms.push({ kind: "enum", sig: `enum ${node.name.getText(sf)} (${node.members.length} members)`, doc });
    } else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        const name = d.name.getText(sf);
        const init = d.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          syms.push({ kind: "function", sig: def + fnSig(name, init, sf, { asyncKw: isAsync(init) }), doc });
        } else if (d.type) {
          syms.push({ kind: "const", sig: truncate(`${name}: ${d.type.getText(sf)}`), doc });
        } else if (init) {
          // literal / call — show name and a hint of the initializer
          const hint = init.getText(sf).split("\n")[0];
          syms.push({ kind: "const", sig: truncate(`${name} = ${hint}`), doc });
        } else {
          syms.push({ kind: "const", sig: name, doc });
        }
      }
    }
  }
  return { syms, fileDoc, imports };
}

const KIND_ORDER = { default: 0, function: 1, class: 2, const: 3, type: 4, interface: 5, enum: 6, "re-export": 7 };

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = join(dirname(fromFile), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function fileAnchor(relPath) {
  const readable = relPath.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
  const unique = createHash("sha1").update(relPath).digest("hex").slice(0, 10);
  return `file-${readable}-${unique}`;
}

function renderFile(entry, bucketFile, bucketForRel) {
  const { rel: relPath, syms, fileDoc, deps, users } = entry;
  let md = `<a id="${fileAnchor(relPath)}"></a>\n\n### \`${relPath}\`\n\n`;
  md += fileDoc
    ? `**What it is:** ${fileDoc}\n\n`
    : `_No file-level doc-comment; purpose is inferred from the path and exports._\n\n`;
  if (!syms.length) {
    md += "**Exports:** _No exported symbols (internal/side-effect module)._\n\n";
  } else {
    md += `**Exports (${syms.length}):**\n\n`;
    syms.sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]));
    for (const s of syms) {
      const d = s.doc ? ` — ${s.doc}` : "";
      md += `- \`${s.sig}\`${d}\n`;
      if (s.methods && s.methods.length) {
        for (const m of s.methods) md += `    - \`${m}\`\n`;
      }
    }
    md += "\n";
  }

  const linkTo = targetRel => {
    const targetBucket = bucketForRel(targetRel).file;
    const prefix = targetBucket === bucketFile ? "" : targetBucket;
    return `${prefix}#${fileAnchor(targetRel)}`;
  };
  md += deps.length
    ? `**Depends on (${deps.length}):** ${deps.map(dep => `[\`${dep}\`](${linkTo(dep)})`).join(" · ")}\n\n`
    : "**Depends on:** _No internal imports._\n\n";
  md += users.length
    ? `**Used by (${users.length}):** ${users.map(user => `[\`${user}\`](${linkTo(user)})`).join(" · ")}\n\n`
    : "**Used by:** _No internal importers found; entry point, script, route, test or dynamically loaded module._\n\n";
  return md;
}

// Bucket files by top-level area
const BUCKETS = [
  // Engines first: they are the app's power systems, and burying them in
  // "Other src/" is how the reference stopped describing the real shape after
  // the src/engines/ move.
  { file: "engines.md", title: "Engines — `src/engines/`", match: (r) => r.startsWith("src/engines/") },
  { file: "server.md", title: "State layer — `src/server/`", match: (r) => r.startsWith("src/server/") },
  { file: "lib.md", title: "Shared logic — `src/lib/`", match: (r) => r.startsWith("src/lib/") },
  { file: "components.md", title: "Shared components — `src/components/`", match: (r) => r.startsWith("src/components/") },
  { file: "built-ins.md", title: "Plugins — `src/built-ins/`", match: (r) => r.startsWith("src/built-ins/") },
  { file: "app.md", title: "App routes & UI — `src/app/`", match: (r) => r.startsWith("src/app/") },
  { file: "scripts.md", title: "Scripts — `scripts/`", match: (r) => r.startsWith("scripts/") },
  { file: "misc.md", title: "Other `src/`", match: () => true },
];

const targets = [...walk(join(ROOT, "src"))];
try { walk(join(ROOT, "scripts")).forEach((p) => targets.push(p)); } catch {}

const byBucket = new Map(BUCKETS.map((b) => [b.file, []]));
const info = new Map();
const dependants = new Map();
let totalFiles = 0,
  totalSyms = 0;

for (const path of targets.sort()) {
  const rel = relative(ROOT, path).split("\\").join("/");
  let analysis;
  try {
    analysis = extractFile(path);
  } catch (e) {
    analysis = {
      syms: [{ kind: "const", sig: `/* parse error: ${e.message} */`, doc: "" }],
      fileDoc: "",
      imports: [],
    };
  }
  const deps = analysis.imports
    .map(spec => resolveImport(path, spec))
    .filter((dep, index, all) => dep && dep !== path && all.indexOf(dep) === index);
  info.set(path, { rel, ...analysis, deps });
  totalFiles++;
  totalSyms += analysis.syms.filter((s) => s.kind !== "re-export").length;
}

for (const [path, entry] of info) {
  for (const dep of entry.deps) {
    if (!dependants.has(dep)) dependants.set(dep, []);
    dependants.get(dep).push(path);
  }
}

const bucketForRel = rel => BUCKETS.find(bucket => bucket.match(rel));
for (const [path, entry] of info) {
  const deps = entry.deps.map(dep => info.get(dep)?.rel).filter(Boolean).sort();
  const users = (dependants.get(path) ?? [])
    .map(user => info.get(user)?.rel)
    .filter(Boolean)
    .filter((user, index, all) => all.indexOf(user) === index)
    .sort();
  const bucket = bucketForRel(entry.rel);
  byBucket.get(bucket.file).push({ ...entry, deps, users });
}

// group each bucket's files by their immediate directory for navigability
function renderBucket(bucket, entries) {
  let md = `# Consolidated source reference — ${bucket.title}\n\n`;
  md += `← Back to [the reference index](00-index.md) · [the map contents page](../WORKSPACE-FILE-TREE.md)\n\n`;
  md += `One large generated volume for this area. Every source file has an anchored entry with its purpose, exported API, internal dependencies and dependants. Generated by \`scripts/generate-symbol-reference.mjs\` — grep it; do not read it top to bottom.\n\n`;
  let lastDir = null;
  for (const entry of entries) {
    const { rel } = entry;
    const dir = rel.slice(0, rel.lastIndexOf("/"));
    if (dir !== lastDir) {
      md += `\n## \`${dir}/\`\n\n`;
      lastDir = dir;
    }
    md += renderFile(entry, bucket.file, bucketForRel);
  }
  return md;
}

// The old generator created one tiny Markdown file per source file. Remove that
// exact generated tree only after source analysis has completed successfully.
rmSync(LEGACY_FILES_DIR, { recursive: true, force: true });

for (const b of BUCKETS) {
  const entries = byBucket.get(b.file);
  if (!entries.length) continue;
  writeFileSync(join(OUT, b.file), renderBucket(b, entries));
}

// index
let idx = `# Symbol reference — index\n\n`;
idx += `← Back to [the map contents page](../WORKSPACE-FILE-TREE.md)\n\n`;
idx += `The **consolidated source map**: every source file, exported symbol, internal dependency and dependant in eight large volumes. This is the "where is everything" layer — grep it to find any file or function without opening source.\n\n`;
idx += `**Generated** by \`scripts/generate-symbol-reference.mjs\` (parses the code with the TypeScript compiler — complete and re-runnable; regenerate after code changes). Covers \`src/\` + \`scripts/\`.\n\n`;
idx += `- **${totalFiles}** files · **${totalSyms}** exported symbols.\n\n`;
idx += `- **8** large source-reference volumes · **1** master file index · **0** per-source Markdown stubs.\n\n`;
idx += `## Volumes\n\n`;
for (const b of BUCKETS) {
  const entries = byBucket.get(b.file);
  if (!entries.length) continue;
  const syms = entries.reduce((n, e) => n + e.syms.filter((s) => s.kind !== "re-export").length, 0);
  idx += `- [${b.title}](${b.file}) — ${entries.length} files, ${syms} symbols\n`;
}
idx += `\n- [Master source-file index](files-index.md) — every path linked directly to its anchored entry in the correct volume.\n\n`;
idx += `> For the higher-level "what each area does" prose, see the [chapters](../workspace/). For where-a-feature-lives, the [feature index](../workspace/feature-index.md). These volumes are the ground-truth source graph beneath both.\n`;
writeFileSync(join(OUT, "00-index.md"), idx);

let fileIndex = `# Consolidated source-file index\n\n`;
fileIndex += `← Back to [the reference index](00-index.md) · [the map](../WORKSPACE-FILE-TREE.md) · [development.md](../development.md)\n\n`;
fileIndex += `Every source path links to its anchored entry inside one of eight large generated volumes. Those entries preserve the old per-file reference's purpose, exported API, dependencies and dependants without creating thousands of tiny Markdown files. **${totalFiles} source files; 0 per-source stubs.**\n\n`;
for (const b of BUCKETS) {
  const entries = byBucket.get(b.file);
  if (!entries.length) continue;
  fileIndex += `## ${b.title} (${entries.length})\n\n`;
  for (const entry of entries.sort((left, right) => left.rel.localeCompare(right.rel))) {
    const summary = entry.fileDoc ? ` — ${truncate(entry.fileDoc, 100)}` : "";
    fileIndex += `- [\`${entry.rel}\`](${b.file}#${fileAnchor(entry.rel)})${summary}\n`;
  }
  fileIndex += "\n";
}
writeFileSync(join(OUT, "files-index.md"), fileIndex);

console.log(`Wrote ${OUT}`);
console.log(`Files: ${totalFiles}  Symbols: ${totalSyms}`);
for (const b of BUCKETS) {
  const entries = byBucket.get(b.file);
  if (entries.length) console.log(`  ${b.file.padEnd(16)} ${entries.length} files`);
}
console.log("Removed legacy docs/reference/files/ per-source stubs");
