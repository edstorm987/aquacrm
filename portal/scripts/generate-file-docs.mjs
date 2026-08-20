// Generates ONE markdown doc per source file — the omega reference. Each doc
// says what the file is (its header doc-comment), its full exported API with
// signatures, what it depends on, and WHO USES IT (dependents), so everything
// in the app is findable and traceable. Deterministic + re-runnable.
//
//   node scripts/generate-file-docs.mjs
//
// Writes docs/reference/files/<path>.md (mirrors the source tree) + a master
// index docs/reference/files-index.md. Grep the index, click into any file.

import ts from "typescript";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const OUTROOT = join(ROOT, "docs", "reference", "files");
const SKIP = new Set(["node_modules", ".next", ".git", "_attic", "dist", "build"]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

const clean = (s) => s.replace(/\s+/g, " ").trim();
const trunc = (s, n = 240) => { s = clean(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

function headerDoc(node, sf, full) {
  const ranges = ts.getLeadingCommentRanges(full, node.getFullStart()) || [];
  if (!ranges.length) return "";
  return ranges.map((r) => full.slice(r.pos, r.end)
    .replace(/^\/\*\*?/, "").replace(/\*\/\s*$/, "")
    .split("\n").map((l) => l.replace(/^\s*\*\s?/, "").replace(/^\s*\/\/\s?/, "").trim())
    .filter((l) => l && !l.startsWith("@")).join(" ")).join(" ").trim();
}
function typeParams(node, sf) {
  return node.typeParameters?.length ? "<" + node.typeParameters.map((t) => t.getText(sf)).join(", ") + ">" : "";
}
function fnSig(name, node, sf, asy) {
  const params = (node.parameters || []).map((p) => p.getText(sf)).join(", ");
  return trunc(`${asy ? "async " : ""}${name}${typeParams(node, sf)}(${params})${node.type ? ": " + node.type.getText(sf) : ""}`);
}
const hasExport = (n) => (n.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const isAsync = (n) => (n.modifiers || []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
const isDefault = (n) => (n.modifiers || []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

function methods(node, sf) {
  const out = [];
  for (const m of node.members) {
    const priv = (m.modifiers || []).some((x) => x.kind === ts.SyntaxKind.PrivateKeyword) || (m.name && m.name.getText(sf).startsWith("#"));
    if (priv) continue;
    if (ts.isMethodDeclaration(m)) out.push(fnSig(m.name.getText(sf), m, sf, isAsync(m)));
    else if (ts.isConstructorDeclaration(m)) out.push(trunc(`constructor(${m.parameters.map((p) => p.getText(sf)).join(", ")})`));
  }
  return out;
}

function analyze(path) {
  const text = readFileSync(path, "utf8");
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const full = sf.getFullText();
  let doc = "";
  const syms = [];
  const imports = [];
  for (const node of sf.statements) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      imports.push(node.moduleSpecifier.text);
    }
  }
  // file doc = the first block comment at top of file
  const firstRanges = ts.getLeadingCommentRanges(full, sf.statements[0]?.getFullStart() ?? 0) || [];
  if (firstRanges.length) doc = headerDoc(sf.statements[0], sf, full);
  for (const node of sf.statements) {
    if (!hasExport(node)) {
      if (ts.isExportAssignment(node)) syms.push(`default ${trunc(node.expression.getText(sf).split("\n")[0], 80)}`);
      continue;
    }
    const def = isDefault(node) ? "default " : "";
    if (ts.isFunctionDeclaration(node) && node.name) syms.push(def + fnSig(node.name.getText(sf), node, sf, isAsync(node)));
    else if (ts.isClassDeclaration(node) && node.name) syms.push({ head: `${def}class ${node.name.getText(sf)}`, methods: methods(node, sf) });
    else if (ts.isInterfaceDeclaration(node)) syms.push(`interface ${node.name.getText(sf)} (${node.members.length} members)`);
    else if (ts.isTypeAliasDeclaration(node)) syms.push(trunc(`type ${node.name.getText(sf)}`));
    else if (ts.isEnumDeclaration(node)) syms.push(`enum ${node.name.getText(sf)} (${node.members.length} members)`);
    else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        const name = d.name.getText(sf);
        const init = d.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) syms.push(def + fnSig(name, init, sf, isAsync(init)));
        else syms.push(d.type ? trunc(`${name}: ${d.type.getText(sf)}`) : name);
      }
    }
  }
  return { doc, syms, imports };
}

// resolve an import specifier to an internal repo file (or null)
function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = join(dirname(fromFile), spec);
  else return null; // external / bare / @aqua plugin pkg
  for (const cand of [base, base + ".ts", base + ".tsx", join(base, "index.ts"), join(base, "index.tsx")]) {
    try { if (statSync(cand).isFile()) return cand; } catch {}
  }
  return null;
}

const files = [...walk(SRC)];
try { walk(join(ROOT, "scripts")).forEach((p) => files.push(p)); } catch {}

const rel = (p) => relative(ROOT, p).split("\\").join("/");
const docPathFor = (p) => join(OUTROOT, rel(p).replace(/\.tsx?$/, ".md"));
const docHref = (fromDoc, targetFile) => {
  const t = join(OUTROOT, rel(targetFile).replace(/\.tsx?$/, ".md"));
  let h = relative(dirname(fromDoc), t).split("\\").join("/");
  return h.startsWith(".") ? h : "./" + h;
};

// pass 1: analyze all + build forward edges
const info = new Map();
const dependents = new Map();
for (const f of files) {
  const a = analyze(f);
  const resolved = [];
  for (const spec of a.imports) {
    const r = resolveImport(f, spec);
    if (r && r !== f) resolved.push(r);
  }
  info.set(f, { ...a, deps: resolved });
}
for (const f of files) for (const dep of info.get(f).deps) {
  if (!dependents.has(dep)) dependents.set(dep, []);
  dependents.get(dep).push(f);
}

const AREA = (r) => {
  if (r.startsWith("src/server/")) return "State layer — src/server/";
  if (r.startsWith("src/lib/")) return "Shared logic — src/lib/";
  if (r.startsWith("src/components/")) return "Components — src/components/";
  if (r.startsWith("src/built-ins/")) return "Plugins — src/built-ins/";
  if (r.startsWith("src/app/")) return "App routes & UI — src/app/";
  if (r.startsWith("scripts/")) return "Scripts — scripts/";
  return "Other";
};
const CHAPTER = {
  "State layer — src/server/": "../../workspace/state-layer.md",
  "Shared logic — src/lib/": "../../workspace/shared-logic.md",
  "Components — src/components/": "../../workspace/components.md",
  "Plugins — src/built-ins/": "../../workspace/plugins.md",
  "App routes & UI — src/app/": "../../workspace/portal-ui.md",
  "Scripts — scripts/": "../../workspace/scripts-config-docs.md",
  "Other": "../../WORKSPACE-FILE-TREE.md",
};

// pass 2: write one doc per file
let written = 0;
for (const f of files) {
  const r = rel(f);
  const { doc, syms, deps } = info.get(f);
  const outPath = docPathFor(f);
  mkdirSync(dirname(outPath), { recursive: true });
  const area = AREA(r);
  const chapterHref = relative(dirname(outPath), join(OUTROOT, "..", "..", "workspace")).split("\\").join("/");
  let md = `# \`${r}\`\n\n`;
  md += `← [File index](${relative(dirname(outPath), join(OUTROOT, "..", "files-index.md")).split("\\").join("/")}) · Area: ${area}\n\n`;
  md += doc ? `**What it is:** ${doc}\n\n` : `_No file-level doc-comment. Purpose inferred from its path (${area}) and its exports below._\n\n`;
  if (syms.length) {
    md += `## Exports (${syms.length})\n\n`;
    for (const s of syms) {
      if (typeof s === "string") md += `- \`${s}\`\n`;
      else { md += `- \`${s.head}\`\n`; for (const m of s.methods) md += `    - \`${m}\`\n`; }
    }
    md += `\n`;
  } else md += `_No exported symbols (side-effect / internal module)._\n\n`;
  const internalDeps = deps.filter((d, i) => deps.indexOf(d) === i);
  if (internalDeps.length) {
    md += `## Depends on (${internalDeps.length})\n\n`;
    for (const d of internalDeps.sort()) md += `- [\`${rel(d)}\`](${docHref(outPath, d)})\n`;
    md += `\n`;
  }
  const users = (dependents.get(f) || []).filter((d, i, arr) => arr.indexOf(d) === i).sort();
  if (users.length) {
    md += `## Used by (${users.length})\n\n`;
    for (const u of users) md += `- [\`${rel(u)}\`](${docHref(outPath, u)})\n`;
    md += `\n`;
  } else md += `## Used by\n\n_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._\n\n`;
  writeFileSync(outPath, md);
  written++;
}

// master index grouped by area
const byArea = new Map();
for (const f of files) {
  const r = rel(f), area = AREA(r);
  if (!byArea.has(area)) byArea.set(area, []);
  byArea.get(area).push(f);
}
let idx = `# File-by-file reference — every source file\n\n`;
idx += `← Back to [the reference index](00-index.md) · [the map](../WORKSPACE-FILE-TREE.md) · [development.md](../development.md)\n\n`;
idx += `**One doc per source file** — what it is, its full API, what it depends on, and who uses it. ${written} files. Generated by \`scripts/generate-file-docs.mjs\` (re-run after code changes). Grep this index, click into any file.\n\n`;
for (const [area, list] of [...byArea.entries()].sort()) {
  idx += `## ${area} (${list.length})\n\n`;
  for (const f of list.sort((a, b) => rel(a).localeCompare(rel(b)))) {
    const r = rel(f);
    const href = "./files/" + r.replace(/\.tsx?$/, ".md");
    const one = info.get(f).doc ? " — " + trunc(info.get(f).doc, 100) : "";
    idx += `- [\`${r}\`](${href})${one}\n`;
  }
  idx += `\n`;
}
writeFileSync(join(ROOT, "docs", "reference", "files-index.md"), idx);

console.log(`Wrote ${written} per-file docs under docs/reference/files/`);
console.log(`Index: docs/reference/files-index.md`);
