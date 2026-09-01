import "server-only";

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isProvisionedClientProjectPath } from "@/lib/server/clients/clientProjectProvisioner";
import { resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";
import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";

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
  description?: string | null;
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
    throw new Error("GitHub publishing is not connected. Connect GitHub in Company → Connections.");
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

async function githubRequest<T>(
  fetchImpl: typeof fetch,
  config: GitHubPublishingConfig,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: T & { message?: string } }> {
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
  return { ok: response.ok, status: response.status, body };
}

async function githubJson<T>(
  fetchImpl: typeof fetch,
  config: GitHubPublishingConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { ok, status, body } = await githubRequest<T>(fetchImpl, config, path, init);
  if (!ok) {
    const detail = body.message ? ` ${body.message}` : "";
    throw new Error(`GitHub request failed (${status}).${detail}`.trim());
  }
  return body;
}

function toPublished(repository: GitHubRepositoryResponse, owner: string): PublishedGitHubProject {
  if (!repository.html_url || !repository.clone_url || !repository.full_name) {
    throw new Error("GitHub created an incomplete repository response.");
  }
  return {
    owner: repository.owner?.login ?? owner,
    fullName: repository.full_name,
    repoUrl: repository.html_url,
    cloneUrl: repository.clone_url,
    private: repository.private !== false,
  };
}

const GITHUB_DESCRIPTION_LIMIT = 350;

function repositoryDescriptions(description: string, recoveryToken?: string) {
  const clean = description.slice(0, GITHUB_DESCRIPTION_LIMIT);
  if (!recoveryToken) return { clean, marked: clean };
  const suffix = ` [aqua-recovery:${recoveryToken}]`;
  return {
    clean,
    marked: `${clean.slice(0, Math.max(0, GITHUB_DESCRIPTION_LIMIT - suffix.length))}${suffix}`,
  };
}

export async function publishProjectToGitHub(input: {
  agencyId?: string;
  clientId?: string;
  localPath: string;
  projectSlug: string;
  description: string;
  private?: boolean;
  config?: GitHubPublishingConfig;
  /**
   * A repository an unfinished publish operation already created. When present
   * it is read back and reused instead of creating a second repository.
   */
  adoptRepository?: { fullName: string };
  /**
   * Exact provider-visible marker for one logical publish and all of its retries.
   * It is written temporarily into the create description, required when an
   * unrecorded repository is reconciled, then removed after the durable checkpoint.
   */
  recoveryToken?: string;
  /**
   * Durable checkpoint, awaited the moment GitHub reports the repository and
   * BEFORE the remote is configured or anything is pushed. A publish that dies
   * during push therefore leaves a recorded repository for the retry to adopt.
   */
  onRepositoryCreated?: (repository: PublishedGitHubProject) => Promise<void> | void;
}, dependencies: PublishDependencies = {}): Promise<PublishedGitHubProject> {
  assertLiveProviderAccess("GitHub publishing");
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
  const descriptions = repositoryDescriptions(input.description, input.recoveryToken);
  const lookupName = input.adoptRepository?.fullName ?? `${owner}/${input.projectSlug}`;
  const lookupPath = `/repos/${lookupName.split("/").map(encodeURIComponent).join("/")}`;

  let published: PublishedGitHubProject | null = null;
  let recoveryMarkerPresent = false;
  if (input.adoptRepository?.fullName) {
    const existing = await githubRequest<GitHubRepositoryResponse>(fetchImpl, config, lookupPath);
    if (existing.ok) {
      recoveryMarkerPresent = Boolean(input.recoveryToken && existing.body.description === descriptions.marked);
      published = toPublished(existing.body, owner);
    }
  }

  if (!published) {
    const createPath = owner.toLowerCase() === authenticatedOwner.toLowerCase()
      ? "/user/repos"
      : `/orgs/${encodeURIComponent(owner)}/repos`;
    const created = await githubRequest<GitHubRepositoryResponse>(fetchImpl, config, createPath, {
      method: "POST",
      body: JSON.stringify({
        name: input.projectSlug,
        description: descriptions.marked,
        private: input.private !== false,
        has_issues: true,
        has_projects: false,
        has_wiki: false,
      }),
    });
    if (created.ok) {
      // We supplied the marked description in this request; the response need
      // not echo every repository field for us to know it is now present.
      recoveryMarkerPresent = Boolean(input.recoveryToken);
      published = toPublished(created.body, owner);
    } else if (created.status === 422) {
      // The name is taken — most often by this operation's own earlier attempt
      // whose record never became durable. An exact marker is ownership proof;
      // time, emptiness and name alone are deliberately insufficient.
      const reconciled = await githubRequest<GitHubRepositoryResponse>(fetchImpl, config, lookupPath);
      const ownedUnrecordedCreate = Boolean(
        reconciled.ok
        && input.recoveryToken
        && reconciled.body.description === descriptions.marked,
      );
      if (!ownedUnrecordedCreate) {
        const detail = created.body.message ? ` ${created.body.message}` : "";
        throw new Error(`GitHub request failed (422).${detail}`.trim());
      }
      recoveryMarkerPresent = true;
      published = toPublished(reconciled.body, owner);
    } else {
      const detail = created.body.message ? ` ${created.body.message}` : "";
      throw new Error(`GitHub request failed (${created.status}).${detail}`.trim());
    }
  }

  // Durable before the push: a failure below must not lose the repository.
  await input.onRepositoryCreated?.(published);

  // The recovery marker only bridges provider creation to the durable local
  // checkpoint. Once that checkpoint exists, restore the operator-facing
  // description before configuring or pushing the Git remote.
  if (input.recoveryToken && recoveryMarkerPresent) {
    const restored = await githubRequest<GitHubRepositoryResponse>(fetchImpl, config, lookupPath, {
      method: "PATCH",
      body: JSON.stringify({ description: descriptions.clean }),
    });
    if (!restored.ok) {
      const detail = restored.body.message ? ` ${restored.body.message}` : "";
      throw new Error(`GitHub description restore failed (${restored.status}).${detail}`.trim());
    }
  }

  try {
    runGit(["remote", "get-url", "origin"]);
    runGit(["remote", "set-url", "origin", published.cloneUrl]);
  } catch {
    runGit(["remote", "add", "origin", published.cloneUrl]);
  }
  const basicCredential = Buffer.from(`x-access-token:${config.token}`).toString("base64");
  runGit(["push", "-u", "origin", "main"], {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basicCredential}`,
    GIT_TERMINAL_PROMPT: "0",
  });

  return published;
}
