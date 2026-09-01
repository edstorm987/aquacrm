import "server-only";

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CLIENT_PROJECT_STARTERS = {
  "luxury-service-site": {
    id: "luxury-service-site",
    label: "Luxury service website",
    description: "Editorial service-business site with a private client portal link and Aqua monitoring.",
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
  aquaOrigin: string;
  propertyId?: string;
  /** Immutable normalised route request; persisted into the generated repo. */
  requestHash?: string;
  /** Durable operation token used only to name and prove ownership of staging. */
  recoveryToken?: string;
}

export interface ProvisionedClientProject {
  propertyId: string;
  projectSlug: string;
  localPath: string;
  starterId: ClientProjectStarterId;
  initialCommit: string;
  createdAt: number;
}

interface ProvisionClientProjectDependencies {
  /** Fault-injection seam immediately before the atomic directory claim. */
  beforeFolderClaim?: (localPath: string) => void;
  /** Fault-injection seam after the starter folder exists but before tokenisation. */
  afterFolderCreated?: (localPath: string) => void;
  /** Fault-injection seam after the initial commit exists but before returning. */
  afterInitialCommit?: (localPath: string, initialCommit: string) => void;
}

/**
 * The slug, folder and property id a provisioning attempt intends to use. It is
 * chosen — and recorded durably — BEFORE any folder is created, so a retry after
 * a lost save re-enters the same folder instead of suffixing a `-2` sibling.
 */
export interface ClientProjectPlan {
  propertyId: string;
  projectSlug: string;
  localPath: string;
  /** True when this plan re-enters a folder an unfinished operation already owns. */
  adopted: boolean;
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

export function clientProjectDirectory(input: { clientName: string; clientSlug: string }): string {
  const { projectsRoot } = projectRoots();
  return path.join(projectsRoot, slugifyProject(input.clientSlug || input.clientName));
}

/**
 * Choose the slug/folder/property id for a provisioning attempt without touching
 * the filesystem. `adopt` carries the milestone of an unfinished operation: when
 * it names a folder inside this client's directory the plan re-enters it rather
 * than suffixing, which is what stops a retry minting a `-2` sibling.
 */
export function planClientProject(input: {
  clientName: string;
  clientSlug: string;
  projectName: string;
  propertyId?: string;
  adopt?: { propertyId?: string; projectSlug?: string; localPath?: string };
}): ClientProjectPlan {
  const clientDirectory = clientProjectDirectory(input);
  const desiredSlug = slugifyProject(input.projectName);
  const adopt = input.adopt;
  if (adopt?.localPath && adopt.projectSlug && adopt.propertyId) {
    const adopted = path.resolve(adopt.localPath);
    if (path.dirname(adopted) === path.resolve(clientDirectory)) {
      return {
        propertyId: adopt.propertyId,
        projectSlug: adopt.projectSlug,
        localPath: adopted,
        adopted: true,
      };
    }
  }
  const { slug: projectSlug, targetPath } = uniqueProjectPath(clientDirectory, desiredSlug);
  return {
    propertyId: input.propertyId ?? `prop_${randomUUID()}`,
    projectSlug,
    localPath: targetPath,
    adopted: false,
  };
}

type ProjectConfig = {
  clientId?: unknown;
  propertyId?: unknown;
  projectSlug?: unknown;
  requestHash?: unknown;
  recoveryToken?: unknown;
};

function readProjectConfig(localPath: string): ProjectConfig | null {
  try {
    return JSON.parse(readFileSync(path.join(localPath, "aqua.config.json"), "utf8")) as ProjectConfig;
  } catch {
    return null;
  }
}

function projectFolderMatchesOperation(input: {
  localPath: string;
  clientId: string;
  propertyId: string;
  projectSlug: string;
  requestHash?: string;
}): boolean {
  const config = readProjectConfig(input.localPath);
  return Boolean(config)
    && config?.clientId === input.clientId
    && config.propertyId === input.propertyId
    && config.projectSlug === input.projectSlug
    && (!input.requestHash || config.requestHash === input.requestHash);
}

function reusableCompletedProject(input: {
  localPath: string;
  clientId: string;
  propertyId: string;
  projectSlug: string;
  requestHash?: string;
}): Pick<ProvisionedClientProject, "initialCommit" | "createdAt"> | null {
  if (!projectFolderMatchesOperation(input)) return null;
  try {
    if (!statSync(path.join(input.localPath, ".git")).isDirectory()) return null;
    const initialCommit = execFileSync("git", ["rev-list", "--max-parents=0", "HEAD"], {
      cwd: input.localPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim().split("\n")[0];
    if (!/^[a-f0-9]{40}$/.test(initialCommit)) return null;
    const stat = statSync(input.localPath);
    return { initialCommit, createdAt: stat.birthtimeMs || stat.ctimeMs || Date.now() };
  } catch {
    return null;
  }
}

function stagingPathFor(input: {
  clientDirectory: string;
  recoveryToken?: string;
  clientId: string;
  propertyId: string;
}): string {
  const token = input.recoveryToken ?? randomUUID();
  const suffix = createHash("sha256")
    .update([token, input.clientId, input.propertyId].join("\u0000"))
    .digest("hex")
    .slice(0, 24);
  return path.join(input.clientDirectory, `.aqua-staging-${suffix}`);
}

function stagingMarker(input: ProvisionClientProjectInput, projectSlug: string) {
  return {
    clientId: input.clientId,
    propertyId: input.propertyId,
    projectSlug,
    recoveryToken: input.recoveryToken,
    requestHash: input.requestHash,
  };
}

function clearOwnedStaging(stagingPath: string, marker: ReturnType<typeof stagingMarker>) {
  const ownerPath = `${stagingPath}.owner`;
  if (!existsSync(stagingPath) && !existsSync(ownerPath)) return;
  let current: ReturnType<typeof stagingMarker> | null = null;
  try {
    current = JSON.parse(readFileSync(ownerPath, "utf8")) as ReturnType<typeof stagingMarker>;
  } catch {
    // An unmarked directory is not ours to remove, even when its name happens
    // to resemble a staging path.
  }
  if (!current
    || current.clientId !== marker.clientId
    || current.propertyId !== marker.propertyId
    || current.projectSlug !== marker.projectSlug
    || current.recoveryToken !== marker.recoveryToken
    || current.requestHash !== marker.requestHash) {
    throw new Error("The project recovery staging path is occupied by different work. It was preserved.");
  }
  if (existsSync(stagingPath)) rmSync(stagingPath, { force: true, recursive: true });
  rmSync(ownerPath, { force: true });
}

function writeProjectIdentity(
  directory: string,
  input: ProvisionClientProjectInput,
  projectSlug: string,
) {
  const configPath = path.join(directory, "aqua.config.json");
  const config = readProjectConfig(directory);
  if (!config) throw new Error("The project starter has no valid aqua.config.json.");
  writeFileSync(configPath, `${JSON.stringify({
    ...config,
    ...(input.requestHash ? { requestHash: input.requestHash } : {}),
    ...(input.recoveryToken ? { recoveryToken: input.recoveryToken } : {}),
    projectSlug,
  }, null, 2)}\n`, "utf8");
}

export function provisionClientProject(
  input: ProvisionClientProjectInput,
  plan?: ClientProjectPlan,
  dependencies: ProvisionClientProjectDependencies = {},
): ProvisionedClientProject {
  const starter = CLIENT_PROJECT_STARTERS[input.starterId];
  if (!starter) throw new Error("Unknown client project starter.");

  const { templatesRoot } = projectRoots();
  const templatePath = path.join(templatesRoot, starter.id);
  if (!existsSync(templatePath)) throw new Error(`Starter "${starter.id}" is not installed.`);

  const resolved = plan ?? planClientProject(input);
  let targetPath = resolved.localPath;
  let projectSlug = resolved.projectSlug;
  const propertyId = input.propertyId ?? resolved.propertyId;
  input = { ...input, propertyId };
  const clientDirectory = path.dirname(targetPath);
  mkdirSync(clientDirectory, { recursive: true });
  if (existsSync(targetPath)) {
    const completed = resolved.adopted ? reusableCompletedProject({
      localPath: targetPath,
      clientId: input.clientId,
      propertyId,
      projectSlug,
      requestHash: input.requestHash,
    }) : null;
    if (completed) {
      // The external folder may contain later commits or uncommitted user edits.
      // A retry adopts it byte-for-byte; it is never recursively rebuilt.
      clearOwnedStaging(
        stagingPathFor({ clientDirectory, recoveryToken: input.recoveryToken, clientId: input.clientId, propertyId }),
        stagingMarker(input, projectSlug),
      );
      return {
        propertyId,
        projectSlug,
        localPath: targetPath,
        starterId: input.starterId,
        ...completed,
      };
    }
    // A different or incomplete final folder is evidence, not scratch space.
    // Preserve it and build the retry beside it.
    const stepAside = uniqueProjectPath(clientDirectory, slugifyProject(input.projectName));
    projectSlug = stepAside.slug;
    targetPath = stepAside.targetPath;
  }

  // The complete repository is assembled off-path. A crash can therefore
  // leave only recovery-token scratch; the user-visible final folder is either
  // absent or complete. `renameSync` is the final filesystem operation.
  let beforeFolderClaimCalled = false;
  for (;;) {
    const createdAt = Date.now();
    const marker = stagingMarker(input, projectSlug);
    const stagingPath = stagingPathFor({ clientDirectory, recoveryToken: input.recoveryToken, clientId: input.clientId, propertyId });
    clearOwnedStaging(stagingPath, marker);
    writeFileSync(`${stagingPath}.owner`, `${JSON.stringify(marker)}\n`, { encoding: "utf8", flag: "wx" });
    try {
      mkdirSync(stagingPath);
    } catch (error) {
      rmSync(`${stagingPath}.owner`, { force: true });
      throw error;
    }

    try {
      cpSync(templatePath, stagingPath, { recursive: true, force: false, errorOnExist: true });
      dependencies.afterFolderCreated?.(stagingPath);
      const origin = input.aquaOrigin.replace(/\/+$/, "");
      replaceTemplateTokens(stagingPath, {
        CLIENT_EMAIL: input.clientEmail?.trim() || "hello@milesymedia.co",
        CLIENT_ID: input.clientId,
        CLIENT_NAME: input.clientName,
        CLIENT_PORTAL_URL: `${origin}/login`,
        AQUA_ORIGIN: origin,
        PROJECT_NAME: input.projectName,
        PROJECT_SLUG: projectSlug,
        PROPERTY_ID: propertyId,
      });
      writeProjectIdentity(stagingPath, input, projectSlug);
      const initialCommit = initialiseRepository(stagingPath, input.projectName);
      dependencies.afterInitialCommit?.(stagingPath, initialCommit);
      if (!beforeFolderClaimCalled) {
        beforeFolderClaimCalled = true;
        dependencies.beforeFolderClaim?.(targetPath);
      }
      if (existsSync(targetPath)) {
        // The hook or another process claimed the final name while we built.
        // Preserve it and rebuild for a fresh slug so generated URLs/config
        // match the directory Aqua records.
        const stepAside = uniqueProjectPath(clientDirectory, slugifyProject(input.projectName));
        projectSlug = stepAside.slug;
        targetPath = stepAside.targetPath;
        rmSync(stagingPath, { force: true, recursive: true });
        rmSync(`${stagingPath}.owner`, { force: true });
        continue;
      }
      try {
        renameSync(stagingPath, targetPath);
      } catch (error) {
        const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
        if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
        const stepAside = uniqueProjectPath(clientDirectory, slugifyProject(input.projectName));
        projectSlug = stepAside.slug;
        targetPath = stepAside.targetPath;
        rmSync(stagingPath, { force: true, recursive: true });
        rmSync(`${stagingPath}.owner`, { force: true });
        continue;
      }
      rmSync(`${stagingPath}.owner`, { force: true });
      return { propertyId, projectSlug, localPath: targetPath, starterId: input.starterId, initialCommit, createdAt };
    } catch (error) {
      // Only the recovery-token staging directory is disposable. A final path,
      // matching or otherwise, is never recursively removed here.
      if (existsSync(stagingPath)) rmSync(stagingPath, { force: true, recursive: true });
      rmSync(`${stagingPath}.owner`, { force: true });
      throw error;
    }
  }
}
