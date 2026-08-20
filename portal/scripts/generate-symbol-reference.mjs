// Generates an exhaustive function/symbol reference for the whole codebase by
// parsing every .ts/.tsx file with the TypeScript compiler API. Deterministic,
// complete (never misses a file), and re-runnable so the map stays current.
//
//   node scripts/generate-symbol-reference.mjs
//
// Writes docs/reference/{00-index,server,lib,components,app,built-ins,scripts}.md
// Each source file gets a heading listing its exported symbols with real
// signatures + leading doc-comments. Grep this instead of opening source.

import ts from "typescript";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs", "reference");
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

  for (const node of sf.statements) {
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
  return syms;
}

const KIND_ORDER = { default: 0, function: 1, class: 2, const: 3, type: 4, interface: 5, enum: 6, "re-export": 7 };

function renderFile(relPath, syms) {
  let md = `### \`${relPath}\`\n\n`;
  if (!syms.length) {
    md += "_No exported symbols (internal/side-effect module)._\n\n";
    return md;
  }
  syms.sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]));
  for (const s of syms) {
    const d = s.doc ? ` — ${s.doc}` : "";
    md += `- \`${s.sig}\`${d}\n`;
    if (s.methods && s.methods.length) {
      for (const m of s.methods) md += `    - \`${m}\`\n`;
    }
  }
  md += "\n";
  return md;
}

// Bucket files by top-level area
const BUCKETS = [
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
let totalFiles = 0,
  totalSyms = 0;

for (const path of targets.sort()) {
  const rel = relative(ROOT, path).split("\\").join("/");
  let syms = [];
  try {
    syms = extractFile(path);
  } catch (e) {
    syms = [{ kind: "const", sig: `/* parse error: ${e.message} */`, doc: "" }];
  }
  totalFiles++;
  totalSyms += syms.filter((s) => s.kind !== "re-export").length;
  const bucket = BUCKETS.find((b) => b.match(rel));
  byBucket.get(bucket.file).push({ rel, syms });
}

// group each bucket's files by their immediate directory for navigability
function renderBucket(title, entries) {
  let md = `# Symbol reference — ${title}\n\n`;
  md += `← Back to [the reference index](00-index.md) · [the map contents page](../WORKSPACE-FILE-TREE.md)\n\n`;
  md += `Every exported function, class, type and const in this area, with its real signature and doc-comment. Generated by \`scripts/generate-symbol-reference.mjs\` — grep it, don't read it top to bottom.\n\n`;
  let lastDir = null;
  for (const { rel, syms } of entries) {
    const dir = rel.slice(0, rel.lastIndexOf("/"));
    if (dir !== lastDir) {
      md += `\n## \`${dir}/\`\n\n`;
      lastDir = dir;
    }
    md += renderFile(rel, syms);
  }
  return md;
}

for (const b of BUCKETS) {
  const entries = byBucket.get(b.file);
  if (!entries.length) continue;
  writeFileSync(join(OUT, b.file), renderBucket(b.title, entries));
}

// index
let idx = `# Symbol reference — index\n\n`;
idx += `← Back to [the map contents page](../WORKSPACE-FILE-TREE.md)\n\n`;
idx += `The **function-by-function** map: every exported symbol in every source file, with its real signature and doc-comment. This is the "where is everything" layer — grep it to find any function without opening source.\n\n`;
idx += `**Generated** by \`scripts/generate-symbol-reference.mjs\` (parses the code with the TypeScript compiler — complete and re-runnable; regenerate after code changes). Covers \`src/\` + \`scripts/\`.\n\n`;
idx += `- **${totalFiles}** files · **${totalSyms}** exported symbols.\n\n`;
idx += `## Files\n\n`;
for (const b of BUCKETS) {
  const entries = byBucket.get(b.file);
  if (!entries.length) continue;
  const syms = entries.reduce((n, e) => n + e.syms.filter((s) => s.kind !== "re-export").length, 0);
  idx += `- [${b.title}](${b.file}) — ${entries.length} files, ${syms} symbols\n`;
}
idx += `\n> For the higher-level "what each area does" prose, see the [chapters](../workspace/). For where-a-feature-lives, the [feature index](../workspace/feature-index.md). This reference is the ground-truth symbol list beneath both.\n`;
writeFileSync(join(OUT, "00-index.md"), idx);

console.log(`Wrote ${OUT}`);
console.log(`Files: ${totalFiles}  Symbols: ${totalSyms}`);
for (const b of BUCKETS) {
  const entries = byBucket.get(b.file);
  if (entries.length) console.log(`  ${b.file.padEnd(16)} ${entries.length} files`);
}
