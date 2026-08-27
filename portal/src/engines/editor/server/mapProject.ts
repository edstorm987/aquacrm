import "server-only";

import { readWorkspaceFiles } from "./workspaceFiles";
import { readRepoTree, GitHubNotConfigured } from "./githubSource";
import { isMappableFile } from "./registry";
import { isHiddenPath } from "./fileTree";
import { devProjectGitHubToken } from "./devProjects";
import { detectAquaTag, type AquaTagDetection } from "@/lib/server/integrations/aquaTagDetection";
import { resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";
import type { DevProject, DevProjectMap, DevProjectRepoMap, DevProjectTagMap } from "@/server/types";

/**
 * MAP — Ed's one button.
 *
 *   "for setup create project create the repo give the editor the repo press a
 *    button called map and then it maps everything all good and then when for
 *    aqua tag you connect it you have to press map then it creates the aqua tag
 *    browser so bloody simple"
 *
 * Two halves, run together, both optional:
 *
 *   REPO — walk the tree once and record what is there, so the editor knows the
 *          project without re-walking on every open. A named repository is read
 *          from GitHub at its ref; a blank one is the local working tree.
 *   TAG  — fetch the project's address the way any visitor would and read back
 *          whether our tag is really on the page carrying THIS agency's key.
 *          That is what turns the browser on.
 *
 * Neither half can fail the other. A repo that will not read still leaves a
 * verified tag recorded, and vice versa — a Map that reported nothing because
 * one side threw would be worse than useless, because the operator would not
 * know which side broke.
 *
 * No new walk and no new detector: `readWorkspaceFiles` / `readRepoTree` are
 * the code mode already reads files with, and `detectAquaTag` is the detector
 * behind the aqua-tags endpoint. Both are injectable purely so the tests can
 * run without a network or a repository.
 */

export interface MapDevProjectDeps {
  /** Defaults to the real GitHub tree read. */
  readTree?: typeof readRepoTree;
  /**
   * Overrides the vault/env token resolution.
   *
   * The same seam `GitHubRepoSource.fetchImpl` already provides one layer down,
   * and for the same reason: without it the GitHub half of MAP cannot be driven
   * at all except by planting a real encrypted connection. Production never
   * passes it, so the resolution order below is what actually runs.
   */
  githubToken?: string;
  /** False for delegated requests: require this project's bound connection. */
  allowSharedCredentials?: boolean;
  /** Defaults to the local working tree walk. */
  readWorkspace?: (root: string) => Promise<Array<{ path: string; size?: number }>>;
  /** Defaults to the real network detection. */
  detect?: (input: { rawUrl: string; masterSiteKey: string }) => Promise<AquaTagDetection>;
  /** Defaults to `process.cwd()`. */
  workspaceRoot?: string;
  now?: number;
}

export interface MapDevProjectInput {
  agencyId: string;
  project: DevProject;
  /** The agency's master tag key — resolved by the caller, never from a body. */
  masterSiteKey: string;
  actorUserId: string;
}

/** Top-level folder names, for describing a project without storing the tree. */
function topDirectories(paths: string[]): string[] {
  const seen = new Set<string>();
  for (const path of paths) {
    const head = path.split("/")[0];
    if (head && head !== path) seen.add(head);
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).slice(0, 40);
}

/**
 * A GitHub failure, explained instead of relayed.
 *
 * Found live by Ed on the first real client run (2026-08-21): tag verified,
 * token connected, then Map said "GitHub request failed (404). Not Found" —
 * useless. The cause was GitHub's most misleading behaviour: a fine-grained
 * token answers **404, not 403**, for any repository it has not been granted,
 * to hide that the repo exists. The token authenticates fine (so "connect"
 * succeeds — that proves who you are, not what you can see) and then every
 * repo read 404s. A wrong owner/name and a missing branch look identical from
 * here, so the message names all three with the exact values it asked for.
 */
function explainRepoReadFailure(error: unknown, repository: string, ref: string): string {
  if (error instanceof GitHubNotConfigured) return error.message;
  const raw = error instanceof Error ? error.message : "";
  if (/\(404\)/.test(raw)) {
    return [
      `GitHub answered 404 for ${repository} at branch "${ref}". That means one of three things:`,
      `the token has not been GRANTED this repository (fine-grained tokens answer 404, not 403, for`,
      `repositories outside their grant — edit the token on GitHub and add it, with Contents read/write);`,
      `the repository name is not exactly owner/name; or the branch "${ref}" does not exist`,
      `(a repo whose default is "master" needs the project's branch changed from "main").`,
    ].join(" ");
  }
  if (/\(401\)/.test(raw)) {
    return `GitHub rejected the token for ${repository} (401) — it has expired or been revoked. Reconnect GitHub with a fresh fine-grained token.`;
  }
  if (/\(403\)/.test(raw)) {
    return `GitHub refused access to ${repository} (403) — the token is valid but this action is outside its permissions. Give it Contents read/write on this repository.`;
  }
  return raw || "That repository could not be read.";
}

function message(error: unknown, fallback: string): string {
  if (error instanceof GitHubNotConfigured) return error.message;
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * The repository half.
 *
 * Returns a record with `error` set rather than throwing: "this repo could not
 * be read, here is why" is a normal thing to show on the card, and a throw
 * would take the tag half down with it.
 */
export async function mapProjectRepository(
  input: MapDevProjectInput,
  deps: MapDevProjectDeps = {},
): Promise<DevProjectRepoMap> {
  const { project } = input;
  const now = deps.now ?? Date.now();
  const base = {
    repository: project.repository,
    ref: project.ref || "main",
    fileCount: 0,
    mappableCount: 0,
    directories: [] as string[],
    truncated: false,
    mappedAt: now,
  };

  if (project.repository) {
    try {
      const token = deps.githubToken
        || devProjectGitHubToken(input.agencyId, project)
        || (deps.allowSharedCredentials === false
          ? undefined
          : resolveIntegrationValues(input.agencyId, "github").token || process.env.GITHUB_TOKEN?.trim());
      if (!token) throw new GitHubNotConfigured();
      const head = await (deps.readTree ?? readRepoTree)({
        repository: project.repository,
        ref: base.ref,
        token,
      });
      // `readRepoTree` already drops hidden paths; the second check is for an
      // injected reader in a test, so the rule holds whoever supplies the list.
      const paths = head.files.map(file => file.path).filter(path => !isHiddenPath(path));
      return {
        ...base,
        source: "github",
        commitSha: head.sha,
        fileCount: paths.length,
        mappableCount: paths.filter(isMappableFile).length,
        directories: topDirectories(paths),
        truncated: head.truncated,
      };
    } catch (error) {
      return { ...base, source: "github", error: explainRepoReadFailure(error, project.repository, base.ref) };
    }
  }

  try {
    const files = await (deps.readWorkspace ?? readWorkspaceFiles)(deps.workspaceRoot ?? process.cwd());
    const paths = files.map(file => file.path).filter(path => !isHiddenPath(path));
    return {
      ...base,
      source: "workspace",
      fileCount: paths.length,
      mappableCount: paths.filter(isMappableFile).length,
      directories: topDirectories(paths),
    };
  } catch (error) {
    return { ...base, source: "workspace", error: message(error, "This workspace could not be read.") };
  }
}

/**
 * The Aqua Tag half.
 *
 * `undefined` when there is no address to check — that is "nothing was asked",
 * which the status line words differently from "we looked and it was not
 * there". Detection itself never throws for an unreachable site; it reports
 * `reachable: false` with a reason, and so does this.
 */
export async function mapProjectAquaTag(
  input: MapDevProjectInput,
  deps: MapDevProjectDeps = {},
): Promise<DevProjectTagMap | undefined> {
  const url = (input.project.siteUrl ?? "").trim();
  if (!url) return undefined;
  const now = deps.now ?? Date.now();
  try {
    const detection = await (deps.detect ?? detectAquaTag)({ rawUrl: url, masterSiteKey: input.masterSiteKey });
    return {
      url,
      finalUrl: detection.finalUrl,
      reachable: detection.reachable,
      tagPresent: detection.tagPresent,
      // A tag carrying somebody ELSE's key is not this agency's tag. Recorded
      // as present-but-not-matching so the screen can say which it is.
      keyMatches: detection.keyMatches,
      detectedSiteKey: detection.detectedSiteKey,
      // Presence is not execution. The detector reads the snippet's src and
      // judges whether a VISITOR's browser could fetch it; a src no browser can
      // reach (localhost, mixed content) is recorded as the reason it is dead,
      // and that reason is what turns the state into "dead-snippet".
      scriptSrc: detection.scriptSrc,
      scriptUnloadableReason: detection.scriptLoadable && !detection.scriptLoadable.ok
        ? (detection.scriptLoadable.reason ?? "The snippet's script could not be loaded by a visitor's browser.")
        : undefined,
      checkedAt: now,
      error: detection.error,
    };
  } catch (error) {
    return {
      url,
      reachable: false,
      tagPresent: false,
      keyMatches: false,
      checkedAt: now,
      error: message(error, "That address could not be checked."),
    };
  }
}

/** Both halves, run in parallel — one press, one record. */
export async function mapDevProject(
  input: MapDevProjectInput,
  deps: MapDevProjectDeps = {},
): Promise<DevProjectMap> {
  const now = deps.now ?? Date.now();
  const [repo, tag] = await Promise.all([
    mapProjectRepository(input, { ...deps, now }),
    mapProjectAquaTag(input, { ...deps, now }),
  ]);
  return { repo, tag, lastMappedAt: now, lastMappedBy: input.actorUserId };
}
