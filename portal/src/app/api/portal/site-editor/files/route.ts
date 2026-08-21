import { NextResponse, type NextRequest } from "next/server";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { buildFileTree, describeFile, isHiddenPath } from "@/engines/editor/server/fileTree";
import { hashFile } from "@/engines/editor/server/codeAdapter";
import { GitHubNotConfigured, readRepoFile, readRepoTree } from "@/engines/editor/server/githubSource";
import { devProjectGitHubToken, getDevProject } from "@/engines/editor/server/devProjects";
import { resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";
import type { DevProject } from "@/server/types";

/**
 * The repository's files, for code mode.
 *
 * Reads the working tree rather than GitHub. The GitHub path is the one that
 * will ship, but it needs a connected token and a repository per site, and
 * neither is required to prove the editor works — the files on disk are the
 * same files.
 *
 * Read-only. Saving goes through the shared editing engine and its publish
 * path, which commits to a branch and needs an explicit confirmation; nothing
 * here writes to disk.
 */

/** Everything is resolved inside this. A path that escapes it is refused. */
const ROOT = process.cwd();

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", ".next", ".vercel", ".turbo", "coverage"]);

function safePath(requested: string): string | null {
  // Resolved and then checked, rather than pattern-matched: `..` can be
  // spelled many ways, and the only reliable question is where it lands.
  const target = resolve(ROOT, requested);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  const rel = relative(ROOT, target);
  if (rel && isHiddenPath(rel)) return null;
  return target;
}

async function walk(directory: string, out: Array<{ path: string; size: number }>, depth = 0): Promise<void> {
  // Depth-capped so a stray symlink or a deep vendor tree cannot make one
  // request walk forever.
  if (depth > 8) return;
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    }
    const full = join(directory, entry.name);
    const rel = relative(ROOT, full);
    if (isHiddenPath(rel)) continue;
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      await walk(full, out, depth + 1);
      continue;
    }
    const info = await stat(full).catch(() => null);
    if (info) out.push({ path: rel.split(sep).join("/"), size: info.size });
  }
}

/**
 * The GitHub connection to read a repository with.
 *
 * Resolution order, most specific first:
 *   1. the project's OWN bound connection (multi-project, multi-token)
 *   2. the agency's github connection
 *   3. the environment token (single-tenant deployments)
 *
 * `project` is optional, so callers that pass none behave exactly as before.
 */
function githubSourceFor(agencyId: string, repository: string, ref: string, project?: DevProject | null) {
  const token = (project ? devProjectGitHubToken(agencyId, project) : null)
    || resolveIntegrationValues(agencyId, "github").token
    || process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new GitHubNotConfigured();
  return { repository, ref, token };
}

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);

    const requested = request.nextUrl.searchParams.get("path");
    // A project supplies its own repo/ref (and its own token) — the engine's
    // multi-project path. Explicit repo/ref params still win, so the ad-hoc
    // "type a repository" behaviour is unchanged.
    const projectId = request.nextUrl.searchParams.get("project")?.trim();
    const project = projectId ? getDevProject(session.agencyId, projectId) : null;
    const repository = request.nextUrl.searchParams.get("repo")?.trim() || project?.repository || "";
    const ref = request.nextUrl.searchParams.get("ref")?.trim() || project?.ref || "main";

    // A repository named means GitHub. Without one the working tree is read,
    // which is the same repository when Aqua is editing itself.
    if (repository) {
      try {
        const source = githubSourceFor(session.agencyId, repository, ref, project);
        if (!requested) {
          const head = await readRepoTree(source);
          return NextResponse.json({
            ok: true,
            source: "github",
            repository,
            ref,
            sha: head.sha,
            count: head.files.length,
            // Said out loud: a silently half-listed repository is worse than
            // an error, because the missing file looks like it does not exist.
            truncated: head.truncated,
            tree: buildFileTree(head.files),
          });
        }
        return NextResponse.json({ ok: true, source: "github", ...await readRepoFile(source, requested) });
      } catch (error) {
        if (error instanceof GitHubNotConfigured) {
          return NextResponse.json({
            ok: false,
            needsGitHub: true,
            error: error.message,
            href: "/portal/agency/company?view=connections&integration=github",
          }, { status: 409 });
        }
        return NextResponse.json({
          ok: false,
          error: error instanceof Error ? error.message : "That repository could not be read.",
        }, { status: 502 });
      }
    }

    if (!requested) {
      const files: Array<{ path: string; size: number }> = [];
      await walk(ROOT, files);
      return NextResponse.json({ ok: true, tree: buildFileTree(files), count: files.length });
    }

    const target = safePath(requested);
    if (!target) return NextResponse.json({ ok: false, error: "That path cannot be opened." }, { status: 403 });

    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) return NextResponse.json({ ok: false, error: "Not a file." }, { status: 404 });

    const described = describeFile(requested, info.size);
    if (!described.editable) {
      return NextResponse.json({ ok: true, path: requested, editable: false, reason: described.reason });
    }

    const contents = await readFile(target, "utf-8");
    return NextResponse.json({
      ok: true,
      path: requested,
      editable: true,
      contents,
      // The same fingerprint the engine checks, so what the editor holds and
      // what a save is judged against cannot drift apart.
      fingerprint: hashFile(contents),
      size: info.size,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
