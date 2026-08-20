/**
 * Rebuilds `route-inventory.json` — every destination a template step is
 * allowed to point at.
 *
 * Two sources, because one is not enough: directories with a `page.tsx` cover
 * the literal routes, and `/portal/...` strings already used in the source
 * cover the agency tool paths, which are served by the `[...rest]` catch-all
 * and so have no page of their own.
 */
import fs from "node:fs";
import path from "node:path";

const literal = [];
(function walk(dir, url) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) { if (entry.name === "page.tsx") literal.push(url || "/"); continue; }
    if (entry.name.startsWith("(") || entry.name.startsWith("@")) walk(path.join(dir, entry.name), url);
    else walk(path.join(dir, entry.name), `${url}/${entry.name}`);
  }
})("src/app", "");

const linked = new Set();
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!/\.tsx?$/.test(entry.name)) continue;
    // The file under test must not vouch for itself.
    if (full.includes("lib/tasks/taskTemplates")) continue;
    for (const match of fs.readFileSync(full, "utf-8").matchAll(/"(\/portal\/[a-z0-9/-]*)"/g)) {
      linked.add(match[1].replace(/\/$/, ""));
    }
  }
})("src");

const all = [...new Set([...literal, ...linked])].filter(Boolean).sort();
fs.writeFileSync("scripts/route-inventory.json", `${JSON.stringify(all, null, 2)}\n`);
console.log(`${all.length} paths`);
