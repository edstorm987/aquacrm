import "server-only";

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CLIENT_PROJECT_STARTERS = {
  "luxury-service-site": {
    id: "luxury-service-site",
    label: "Luxury service website",
    description: "Editorial service-business site with a private client portal link and Milesymedia monitoring.",
  },
} as const;

export type ClientProjectStarterId = keyof typeof CLIENT_PROJECT_STARTERS;

export interface ProvisionClientProjectInput {
  clientId: string;
  clientName: string;
  clientSlug: string;
  clientEmail?: string;
  projectName: string;
  starterId: ClientProjectStarterId;
  milesymediaOrigin: string;
  propertyId?: string;
}

export interface ProvisionedClientProject {
  propertyId: string;
  projectSlug: string;
  localPath: string;
  starterId: ClientProjectStarterId;
  initialCommit: string;
  createdAt: number;
}

const TEXT_FILE_NAMES = new Set([".gitignore"]);
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".md", ".txt"]);

export function slugifyProject(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "client-project";
}

function projectRoots() {
  const portalRoot = process.cwd();
  const templatesRoot = path.resolve(portalRoot, "..", "github-templates", "starters");
  const projectsRoot = process.env.CLIENT_PROJECTS_ROOT
    ? path.resolve(process.env.CLIENT_PROJECTS_ROOT)
    : path.resolve(portalRoot, "..", "client-projects");
  return { templatesRoot, projectsRoot };
}

export function isProvisionedClientProjectPath(localPath: string): boolean {
  const { projectsRoot } = projectRoots();
  const root = path.resolve(projectsRoot);
  const candidate = path.resolve(localPath);
  return candidate.startsWith(`${root}${path.sep}`);
}

function uniqueProjectPath(clientDirectory: string, desiredSlug: string): { slug: string; targetPath: string } {
  let suffix = 1;
  let slug = desiredSlug;
  let targetPath = path.join(clientDirectory, slug);
  while (existsSync(targetPath)) {
    suffix += 1;
    slug = `${desiredSlug}-${suffix}`;
    targetPath = path.join(clientDirectory, slug);
  }
  return { slug, targetPath };
}

function replaceTemplateTokens(directory: string, tokens: Record<string, string>) {
  for (const entry of readdirSync(directory)) {
    if (entry === ".git") continue;
    const fullPath = path.join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      replaceTemplateTokens(fullPath, tokens);
      continue;
    }
    if (!TEXT_FILE_NAMES.has(entry) && !TEXT_EXTENSIONS.has(path.extname(entry))) continue;
    let content = readFileSync(fullPath, "utf8");
    for (const [token, replacement] of Object.entries(tokens)) {
      content = content.replaceAll(`{{${token}}}`, replacement);
    }
    writeFileSync(fullPath, content, "utf8");
  }
}

function initialiseRepository(targetPath: string, projectName: string): string {
  const run = (args: string[]) => execFileSync("git", args, {
    cwd: targetPath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  run(["init", "-b", "main"]);
  run(["add", "."]);
  run([
    "-c", "user.name=Milesymedia",
    "-c", "user.email=hello@milesymedia.co",
    "commit", "-m", `Provision ${projectName}`,
  ]);
  return run(["rev-parse", "HEAD"]);
}

export function provisionClientProject(input: ProvisionClientProjectInput): ProvisionedClientProject {
  const starter = CLIENT_PROJECT_STARTERS[input.starterId];
  if (!starter) throw new Error("Unknown client project starter.");

  const { templatesRoot, projectsRoot } = projectRoots();
  const templatePath = path.join(templatesRoot, starter.id);
  if (!existsSync(templatePath)) throw new Error(`Starter "${starter.id}" is not installed.`);

  const clientDirectory = path.join(projectsRoot, slugifyProject(input.clientSlug || input.clientName));
  mkdirSync(clientDirectory, { recursive: true });
  const desiredSlug = slugifyProject(input.projectName);
  const { slug: projectSlug, targetPath } = uniqueProjectPath(clientDirectory, desiredSlug);
  const propertyId = input.propertyId ?? `prop_${randomUUID()}`;
  const createdAt = Date.now();

  try {
    cpSync(templatePath, targetPath, { recursive: true, errorOnExist: true });
    const origin = input.milesymediaOrigin.replace(/\/+$/, "");
    replaceTemplateTokens(targetPath, {
      CLIENT_EMAIL: input.clientEmail?.trim() || "hello@milesymedia.co",
      CLIENT_ID: input.clientId,
      CLIENT_NAME: input.clientName,
      CLIENT_PORTAL_URL: `${origin}/login`,
      MILESYMEDIA_ORIGIN: origin,
      PROJECT_NAME: input.projectName,
      PROJECT_SLUG: projectSlug,
      PROPERTY_ID: propertyId,
    });
    const initialCommit = initialiseRepository(targetPath, input.projectName);
    return {
      propertyId,
      projectSlug,
      localPath: targetPath,
      starterId: input.starterId,
      initialCommit,
      createdAt,
    };
  } catch (error) {
    rmSync(targetPath, { force: true, recursive: true });
    throw error;
  }
}
