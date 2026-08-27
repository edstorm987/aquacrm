import "server-only";

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { isProvisionedClientProjectPath } from "@/lib/server/clients/clientProjectProvisioner";
import { resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";
import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";

const VERCEL_API = "https://api.vercel.com";
const MAX_FILES = 150;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export interface VercelDeploymentConfig {
  token: string;
  teamId?: string;
}

export interface VercelPreviewDeployment {
  deploymentId: string;
  projectName: string;
  previewUrl: string;
  readyState: string;
  createdAt: number;
  fileCount: number;
}

interface DeploymentFile {
  absolutePath: string;
  file: string;
  sha: string;
  size: number;
}

interface VercelDeploymentResponse {
  created?: number;
  id?: string;
  name?: string;
  readyState?: string;
  url?: string;
}

interface DeployDependencies {
  fetchImpl?: typeof fetch;
}

export function isVercelProjectDeploymentConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VERCEL_TOKEN?.trim());
}

export function isVercelProjectDeploymentConfiguredForAgency(agencyId: string, clientId?: string): boolean {
  return Boolean(resolveIntegrationValues(agencyId, "vercel", { clientId }).token);
}

export function vercelDeploymentConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VercelDeploymentConfig {
  const token = env.VERCEL_TOKEN?.trim();
  if (!token) throw new Error("Vercel deployment is not connected. Connect Vercel in Company → Connections.");
  return { token, teamId: env.VERCEL_TEAM_ID?.trim() || undefined };
}

function teamQuery(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

function collectFiles(localPath: string): DeploymentFile[] {
  const files: DeploymentFile[] = [];
  let totalBytes = 0;
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      if (entry === ".git" || entry === "node_modules" || entry === ".DS_Store" || entry === ".vercel") continue;
      const absolutePath = path.join(directory, entry);
      const stats = statSync(absolutePath);
      if (stats.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      totalBytes += stats.size;
      if (files.length + 1 > MAX_FILES) throw new Error(`Vercel preview exceeds the ${MAX_FILES}-file safety limit.`);
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Vercel preview exceeds the 25 MB safety limit.");
      const content = readFileSync(absolutePath);
      files.push({
        absolutePath,
        file: path.relative(localPath, absolutePath).split(path.sep).join("/"),
        sha: createHash("sha1").update(content).digest("hex"),
        size: stats.size,
      });
    }
  };
  walk(localPath);
  if (!files.length) throw new Error("The client project has no deployable files.");
  return files;
}

async function vercelRequest(
  fetchImpl: typeof fetch,
  config: VercelDeploymentConfig,
  endpoint: string,
  init: RequestInit,
): Promise<Response> {
  return fetchImpl(`${VERCEL_API}${endpoint}${teamQuery(config.teamId)}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.token}`,
      ...(init.headers ?? {}),
    },
  });
}

export async function deployProjectPreviewToVercel(input: {
  agencyId?: string;
  clientId?: string;
  localPath: string;
  projectSlug: string;
  config?: VercelDeploymentConfig;
}, dependencies: DeployDependencies = {}): Promise<VercelPreviewDeployment> {
  assertLiveProviderAccess("Vercel deployment");
  if (!isProvisionedClientProjectPath(input.localPath)) {
    throw new Error("Only projects provisioned inside the Milesymedia client-projects workspace can be deployed.");
  }
  const managed = input.agencyId
    ? resolveIntegrationValues(input.agencyId, "vercel", { clientId: input.clientId })
    : {};
  const config = input.config ?? (managed.token
    ? { token: managed.token, teamId: managed.teamId || undefined }
    : vercelDeploymentConfigFromEnv());
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const files = collectFiles(input.localPath);

  for (const file of files) {
    const response = await vercelRequest(fetchImpl, config, "/v2/files", {
      method: "POST",
      body: readFileSync(file.absolutePath),
      headers: {
        "content-length": String(file.size),
        "content-type": "application/octet-stream",
        "x-vercel-digest": file.sha,
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Vercel file upload failed (${response.status}). ${detail}`.trim());
    }
  }

  const response = await vercelRequest(fetchImpl, config, "/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: input.projectSlug,
      files: files.map(file => ({ file: file.file, sha: file.sha, size: file.size })),
      projectSettings: { framework: null },
      target: "preview",
    }),
    headers: { "content-type": "application/json" },
  });
  const deployment = await response.json().catch(() => ({})) as VercelDeploymentResponse & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(`Vercel deployment failed (${response.status}). ${deployment.error?.message ?? ""}`.trim());
  }
  if (!deployment.id || !deployment.url) throw new Error("Vercel returned an incomplete deployment response.");

  return {
    deploymentId: deployment.id,
    projectName: deployment.name ?? input.projectSlug,
    previewUrl: `https://${deployment.url}`,
    readyState: deployment.readyState ?? "QUEUED",
    createdAt: deployment.created ?? Date.now(),
    fileCount: files.length,
  };
}
