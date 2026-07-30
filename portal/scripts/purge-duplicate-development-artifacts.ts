import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const APPLY = process.argv.includes("--apply");
const GENERATED = new Set([".git", ".next", "node_modules", "tsconfig.tsbuildinfo"]);

const portalRoot = process.cwd();
const workspaceRoot = resolve(portalRoot, "../../..");
const legacyRoot = join(workspaceRoot, "04-milesymedia-portal", "plugins");
const canonicalRoot = resolve(portalRoot, "..", "github-templates", "modules");

if (!existsSync(legacyRoot) || !existsSync(canonicalRoot)) {
  throw new Error("Expected legacy plugins and canonical Git modules were not found.");
}

const duplicateNames: string[] = [];
const review: Array<{ name: string; differences: string[] }> = [];

for (const name of directories(legacyRoot)) {
  const legacy = join(legacyRoot, name);
  const canonical = join(canonicalRoot, name);
  if (!existsSync(canonical) || !statSync(canonical).isDirectory()) {
    review.push({ name, differences: ["No canonical Git-template module"] });
    continue;
  }

  const legacyFiles = sourceFiles(legacy);
  const canonicalFiles = sourceFiles(canonical);
  const keys = new Set([...legacyFiles.keys(), ...canonicalFiles.keys()]);
  const differences = [...keys].filter(key => legacyFiles.get(key) !== canonicalFiles.get(key));

  if (!differences.length && legacyFiles.size > 0) {
    duplicateNames.push(name);
    if (APPLY) rmSync(legacy, { recursive: true });
  } else {
    review.push({ name, differences });
    if (APPLY) {
      const generatedBuildInfo = join(legacy, "tsconfig.tsbuildinfo");
      if (existsSync(generatedBuildInfo)) rmSync(generatedBuildInfo);
    }
  }
}

console.log(`${APPLY ? "Removed" : "Found"} ${duplicateNames.length} source-identical legacy plugin folders.`);
if (duplicateNames.length) console.log(duplicateNames.join(", "));
if (review.length) {
  console.log(`Kept ${review.length} folder${review.length === 1 ? "" : "s"} for review:`);
  for (const item of review) {
    console.log(`- ${item.name}: ${item.differences.slice(0, 8).join(", ") || "source differs"}`);
  }
}
if (!APPLY) console.log("Run with --apply to remove only the source-identical folders.");

function directories(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function sourceFiles(root: string): Map<string, string> {
  const output = new Map<string, string>();
  walk(root);
  return output;

  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (GENERATED.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      if (entry.isFile()) {
        output.set(relative(root, path), createHash("sha256").update(readFileSync(path)).digest("hex"));
      }
    }
  }
}
