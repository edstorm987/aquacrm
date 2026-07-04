#!/usr/bin/env node
// T1 perf-baseline — runs `next build` (Turbopack) and reports
// indicative bundle sizes from the .next/ output, since Next 16 with
// Turbopack no longer prints the per-route table the legacy webpack
// builder used to.
//
// What we report (best-effort, no Lighthouse, no perf API):
//   - total .next/static/chunks/ size      (initial-load JS+CSS pool)
//   - top-10 largest static chunks         (the fattest shared splits)
//   - top-10 largest prerendered .html    (rough proxy for "fattest
//     route" given turbopack's chunk graph isn't surfaced per-route)
//
// Output is a single JSON blob to stdout + a human summary to stderr,
// so a future round can diff baselines mechanically.

import { execSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const NEXT_DIR = join(ROOT, ".next");

function du(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    total += st.isDirectory() ? du(p) : st.size;
  }
  return total;
}

function listFiles(dir, suffix) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listFiles(p, suffix));
    else if (!suffix || name.endsWith(suffix)) out.push({ path: p, size: st.size });
  }
  return out;
}

const skipBuild = process.argv.includes("--no-build");
if (!skipBuild) {
  process.stderr.write("[perf-baseline] running next build…\n");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
}

const chunksDir = join(NEXT_DIR, "static", "chunks");
const totalChunks = du(chunksDir);
const chunks = listFiles(chunksDir, ".js")
  .sort((a, b) => b.size - a.size)
  .slice(0, 10);

const htmls = listFiles(join(NEXT_DIR, "server", "app"), ".html")
  .sort((a, b) => b.size - a.size)
  .slice(0, 10);

const baseline = {
  generatedAt: new Date().toISOString(),
  totals: {
    staticChunksBytes: totalChunks,
    staticChunksKb: Math.round(totalChunks / 1024),
  },
  topChunks: chunks.map((c) => ({
    file: c.path.replace(ROOT, ""),
    kb: Math.round(c.size / 1024),
  })),
  topPrerenderedHtml: htmls.map((h) => ({
    file: h.path.replace(ROOT, ""),
    kb: Math.round(h.size / 1024),
  })),
};

process.stderr.write(
  `[perf-baseline] total static chunks: ${baseline.totals.staticChunksKb} kB\n` +
    `[perf-baseline] top route HTMLs:\n` +
    baseline.topPrerenderedHtml
      .slice(0, 5)
      .map((h) => `  ${h.kb} kB  ${h.file}`)
      .join("\n") +
    "\n",
);

process.stdout.write(JSON.stringify(baseline, null, 2) + "\n");
