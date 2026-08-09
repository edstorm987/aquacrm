import "server-only";

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isProvisionedClientProjectPath } from "./clientProjectProvisioner";
import { resolveIntegrationValues } from "./integrationConnections";

const GITHUB_API = "https://api.github.com";

export interface GitHubPublishingConfig {
  token: string;
  owner?: string;
}

export interface PublishedGitHubProject {
  owner: string;
  fullName: string;
  repoUrl: string;
  cloneUrl: string;
  private: boolean;
}

interface GitHubRepositoryResponse {
  clone_url?: string;
  full_name?: string;
  html_url?: string;
  name?: string;
  owner?: { login?: string };
  private?: boolean;
}

interface GitHubUserResponse {
  login?: string;
}

type GitEnvironment = Record<string, string | undefined>;
type RunGit = (args: string[], extraEnv?: GitEnvironment) => string;

interface PublishDependencies {
  fetchImpl?: typeof fetch;
  runGit?: RunGit;
}

export function isGitHubPublishingConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GITHUB_TOKEN?.trim());
}

export function isGitHubPublishingConfiguredForAgency(agencyId: string, clientId?: string): boolean {
  return Boolean(resolveIntegrationValues(agencyId, "github", { clientId }).token);
}

export function githubPublishingOwner(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.GITHUB_OWNER?.trim() || undefined;
}

export function githubConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GitHubPublishingConfig {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error("GitHub publishing is not connected. Connect GitHub in Settings → Integrations.");
  }
  return { token, owner: githubPublishingOwner(env) };
}

function defaultRunGit(localPath: string): RunGit {
  return (args, extraEnv = {}) => execFileSync("git", args, {
    cwd: localPath,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function githubJson<T>(
  fetchImpl: typeof fetch,
  config: GitHubPublishingConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) {
    const detail = body.message ? ` ${body.message}` : "";
    throw new Error(`GitHub request failed (${response.status}).${detail}`.trim());
  }
  return body;
}

export async function publishProjectToGitHub(input: {
  agencyId?: string;
  clientId?: string;
  localPath: string;
  projectSlug: string;
  description: string;
  private?: boolean;
  config?: GitHubPublishingConfig;
}, dependencies: PublishDependencies = {}): Promise<PublishedGitHubProject> {
  if (!isProvisionedClientProjectPath(input.localPath) || !existsSync(input.localPath)) {
    throw new Error("Only projects provisioned inside the Milesymedia client-projects workspace can be published.");
  }
  const managed = input.agencyId
    ? resolveIntegrationValues(input.agencyId, "github", { clientId: input.clientId })
    : {};
  const config = input.config ?? (managed.token
    ? { token: managed.token, owner: managed.owner || undefined }
    : githubConfigFromEnv());
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const runGit = dependencies.runGit ?? defaultRunGit(input.localPath);
  const user = await githubJson<GitHubUserResponse>(fetchImpl, config, "/user");
  const authenticatedOwner = user.login?.trim();
  if (!authenticatedOwner) throw new Error("GitHub did not return an authenticated account.");

  const owner = config.owner ?? authenticatedOwner;
  const createPath = owner.toLowerCase() === authenticatedOwner.toLowerCase()
    ? "/user/repos"
    : `/orgs/${encodeURIComponent(owner)}/repos`;
  const repository = await githubJson<GitHubRepositoryResponse>(fetchImpl, config, createPath, {
    method: "POST",
    body: JSON.stringify({
      name: input.projectSlug,
      description: input.description,
      private: input.private !== false,
      has_issues: true,
      has_projects: false,
      has_wiki: false,
    }),
  });
  if (!repository.html_url || !repository.clone_url || !repository.full_name) {
    throw new Error("GitHub created an incomplete repository response.");
  }

  try {
    runGit(["remote", "get-url", "origin"]);
    runGit(["remote", "set-url", "origin", repository.clone_url]);
  } catch {
    runGit(["remote", "add", "origin", repository.clone_url]);
  }
  const basicCredential = Buffer.from(`x-access-token:${config.token}`).toString("base64");
  runGit(["push", "-u", "origin", "main"], {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basicCredential}`,
    GIT_TERMINAL_PROMPT: "0",
  });

  return {
    owner: repository.owner?.login ?? owner,
    fullName: repository.full_name,
    repoUrl: repository.html_url,
    cloneUrl: repository.clone_url,
    private: repository.private !== false,
  };
}
