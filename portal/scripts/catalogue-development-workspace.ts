import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

async function main() {
  const { ensureHydrated, getState } = await import("../src/server/storage");
  const {
    createDevelopmentResource,
    developmentStageRef,
    ensureDefaultDevelopmentWorkflow,
    listDevelopmentResources,
  } = await import("../src/server/developmentToolkit");

  await ensureHydrated();
  const state = getState();
  const agency = Object.values(state.agencies).find(item => item.slug === "milesymedia" || item.id === "milesymedia");
  const owner = Object.values(state.users).find(user => user.agencyId === agency?.id && user.role === "agency-owner");
  if (!agency || !owner) throw new Error("Milesymedia agency owner not found.");

  const defaultWorkflow = ensureDefaultDevelopmentWorkflow(agency.id, owner.id);
  const portalRoot = process.cwd();
  const workspaceRoot = resolve(portalRoot, "../../..");
  const existingPaths = new Set(listDevelopmentResources(agency.id).map(resource => resource.localPath).filter(Boolean));
  let imported = 0;
  let skipped = 0;

  function add(input: Parameters<typeof createDevelopmentResource>[1]) {
    if (input.localPath && existingPaths.has(input.localPath)) {
      skipped += 1;
      return;
    }
    const resource = createDevelopmentResource(agency.id, input, owner.id);
    if (resource.localPath) existingPaths.add(resource.localPath);
    imported += 1;
  }

  const moduleRoot = resolve(portalRoot, "..", "github-templates", "modules");
  for (const entry of directories(moduleRoot)) {
  const packageJson = readJson(join(moduleRoot, entry, "package.json"));
  add({
    kind: entry.includes("seo") || entry.includes("rank") ? "seo-tool" : "git-template",
    title: readable(entry),
    description: typeof packageJson?.description === "string" ? packageJson.description : "Reusable Milesymedia module.",
    category: "Git modules",
    localPath: relative(workspaceRoot, join(moduleRoot, entry)),
    tags: ["catalogued", "module", entry],
    workflowStageIds: entry.includes("ga4") || entry.includes("notifications")
      ? [developmentStageRef(defaultWorkflow.id, "launch"), developmentStageRef(defaultWorkflow.id, "care")]
      : [developmentStageRef(defaultWorkflow.id, "build")],
    visibility: "team",
  });
  }

  const starterRoot = resolve(portalRoot, "..", "github-templates", "starters");
  for (const entry of directories(starterRoot)) {
  add({
    kind: "git-template",
    title: `${readable(entry)} starter`,
    description: "Reusable project starting point.",
    category: "Project starters",
    localPath: relative(workspaceRoot, join(starterRoot, entry)),
    tags: ["catalogued", "starter"],
    workflowStageIds: [
      developmentStageRef(defaultWorkflow.id, "plan"),
      developmentStageRef(defaultWorkflow.id, "build"),
    ],
    visibility: "team",
  });
  }

  const researchRoot = join(workspaceRoot, "01 development", "context", "prior research");
  for (const file of files(researchRoot).filter(file => file.endsWith(".md")).slice(0, 400)) {
  add({
    kind: "knowledge",
    title: readable(file.replace(/\.md$/i, "")),
    description: "Existing development research imported from the Milesymedia workspace.",
    category: "Prior research",
    localPath: relative(workspaceRoot, join(researchRoot, file)),
    tags: ["catalogued", "research"],
    visibility: "team",
  });
  }

  const developmentRoot = join(workspaceRoot, "01 development");
  for (const file of files(developmentRoot).filter(file => file.endsWith(".md"))) {
  add({
    kind: "knowledge",
    title: readable(file.replace(/\.md$/i, "")),
    category: "Development notes",
    localPath: relative(workspaceRoot, join(developmentRoot, file)),
    tags: ["catalogued", "notes"],
    visibility: "team",
  });
  }

  const templateRoot = join(workspaceRoot, "scripts", "templates");
  for (const file of files(templateRoot)) {
  add({
    kind: "template",
    title: readable(file),
    category: "Deployment templates",
    localPath: relative(workspaceRoot, join(templateRoot, file)),
    tags: ["catalogued", "deployment"],
    workflowStageIds: [developmentStageRef(defaultWorkflow.id, "launch")],
    visibility: "team",
  });
  }

  const inspirationRoot = resolve(portalRoot, "..", "development-assets", "inspiration");
  for (const absolutePath of recursiveFiles(inspirationRoot).filter(isImage)) {
  const collection = readable(relative(inspirationRoot, absolutePath).split(/[\\/]/)[0] ?? "Saved inspiration");
  add({
    kind: "design-inspiration",
    title: `${collection} · ${readable(absolutePath.split(/[\\/]/).at(-1) ?? "Reference")}`,
    description: "Saved visual reference available inside the Development toolkit.",
    category: collection,
    localPath: relative(workspaceRoot, absolutePath),
    tags: ["catalogued", "inspiration", "screenshot"],
    workflowStageIds: [
      developmentStageRef(defaultWorkflow.id, "discover"),
      developmentStageRef(defaultWorkflow.id, "design"),
    ],
    visibility: "team",
  });
  }

  console.log(`Development catalogue complete: ${imported} imported, ${skipped} already present.`);
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

function directories(path: string): string[] {
  try { return readdirSync(path, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort(); }
  catch { return []; }
}

function files(path: string): string[] {
  try { return readdirSync(path, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name).sort(); }
  catch { return []; }
}

function recursiveFiles(root: string): string[] {
  const output: string[] = [];
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) output.push(...recursiveFiles(path));
      if (entry.isFile()) output.push(path);
    }
  } catch {
    return [];
  }
  return output.sort();
}

function isImage(path: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(path);
}

function readJson(path: string): Record<string, unknown> | null {
  try { return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>; }
  catch { return null; }
}

function readable(value: string): string {
  return value.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
