import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";
delete process.env.GITHUB_TOKEN;

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

import { POST as lifecyclePost } from "../src/app/api/portal/dev/lifecycle/route";
import { POST as repoWritePost } from "../src/app/api/portal/dev/repo-write/route";
import { POST as sourceEditPost } from "../src/app/api/portal/dev/source-edit/route";
import { POST as librarianPost } from "../src/app/api/portal/dev/librarian/route";
import { POST as editorAiPost } from "../src/app/api/portal/dev/editor-ai/route";
import { POST as historyPost } from "../src/app/api/portal/dev/editor-ai/history/route";
import { POST as replyPost } from "../src/app/api/portal/dev/editor-ai/reply/route";
import { GET as filesGet, POST as filesPost } from "../src/app/api/portal/site-editor/files/route";
import { saveDevProject } from "../src/engines/editor/server/devProjects";
import { issueSession } from "../src/lib/server/auth/auth";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { flushPendingWrites, mutate, reset } from "../src/server/storage";
import type { AccessCapability } from "../src/server/types";

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture() {
  await reset();
  const agency = createAgency({ name: "Scoped Dev", slug: `scoped-dev-${Date.now()}` });
  const owner = createUser({
    email: `owner-${agency.id}@scoped-dev.test`,
    name: "Owner",
    role: "agency-owner",
    agencyId: agency.id,
    password: "owner-test-password",
  });
  const staff = createUser({
    email: `staff-${agency.id}@scoped-dev.test`,
    name: "Staff",
    role: "agency-staff",
    agencyId: agency.id,
    password: "staff-test-password",
  });
  const workspaceProject = saveDevProject({
    agencyId: agency.id,
    name: "Local project",
    actorUserId: owner.id,
  });
  const repoProject = saveDevProject({
    agencyId: agency.id,
    name: "Repository project",
    repository: "acme/scoped-site",
    ref: "main",
    actorUserId: owner.id,
  });
  const tokenFor = (user: typeof owner) => issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: user.sessionRev ?? 0,
  });
  await flushPendingWrites();
  return {
    agencyId: agency.id,
    owner,
    staff,
    ownerToken: tokenFor(owner),
    staffToken: tokenFor(staff),
    workspaceProject,
    repoProject,
  };
}

async function grant(home: Fixture, projectId: string, capabilities: AccessCapability[]) {
  mutate(state => {
    state.accessGrants.staffProject = {
      id: "staffProject",
      agencyId: home.agencyId,
      userId: home.staff.id,
      scope: { kind: "project", id: projectId },
      environment: "live",
      capabilities,
      createdBy: home.owner.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });
  await flushPendingWrites();
}

function post(handler: (request: never) => Promise<Response>, token: string, path: string, body: unknown) {
  return withSession(token, () => handler(new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never));
}

beforeEach(async () => {
  delete process.env.GITHUB_TOKEN;
});

describe("project-scoped Dev Editor route enforcement", () => {
  it("enforces independent lifecycle, code, explorer and AI element levels", async () => {
    const home = await fixture();
    const project = home.workspaceProject.id;

    await grant(home, project, ["project.view", "project.edit", "project.ai"]);
    assert.equal((await post(lifecyclePost, home.staffToken, "/api/portal/dev/lifecycle", { action: "status", project })).status, 403);
    assert.equal((await post(repoWritePost, home.staffToken, "/api/portal/dev/repo-write", { action: "save", project })).status, 403);
    assert.equal((await post(sourceEditPost, home.staffToken, "/api/portal/dev/source-edit", { action: "find", project, text: "hello" })).status, 403);
    assert.equal((await post(editorAiPost, home.staffToken, "/api/portal/dev/editor-ai", { action: "status", projectId: project })).status, 403);
    assert.equal((await post(historyPost, home.staffToken, "/api/portal/dev/editor-ai/history", { action: "read", projectId: project })).status, 403);
    assert.equal((await post(replyPost, home.staffToken, "/api/portal/dev/editor-ai/reply", { projectId: project, threadId: "thread" })).status, 403);

    await grant(home, project, [
      "project.view",
      "project.edit",
      "project.ai",
      "element.project.editor.view",
      "element.development.code.use",
      "element.development.explorer.view",
      "element.development.ai.view",
    ]);
    assert.equal((await post(lifecyclePost, home.staffToken, "/api/portal/dev/lifecycle", { action: "status", project })).status, 409);
    assert.equal((await post(repoWritePost, home.staffToken, "/api/portal/dev/repo-write", { action: "save", project })).status, 400);
    assert.equal((await post(sourceEditPost, home.staffToken, "/api/portal/dev/source-edit", { action: "find", project, text: "hello" })).status, 409);
    assert.equal((await post(editorAiPost, home.staffToken, "/api/portal/dev/editor-ai", { action: "status", projectId: project })).status, 200);
    assert.equal((await post(historyPost, home.staffToken, "/api/portal/dev/editor-ai/history", { action: "read", projectId: project })).status, 200);
    // View does not imply use: provider replies remain forbidden.
    assert.equal((await post(replyPost, home.staffToken, "/api/portal/dev/editor-ai/reply", { projectId: project, threadId: "thread" })).status, 403);
  });

  it("does not let code edit authority open, revert or deploy a release", async () => {
    const home = await fixture();
    const project = home.workspaceProject.id;
    await grant(home, project, [
      "project.edit",
      "element.development.code.use",
      "element.development.publish.use",
    ]);

    for (const action of ["publish", "merge", "revert"] as const) {
      const response = await post(repoWritePost, home.staffToken, "/api/portal/dev/repo-write", { action, project });
      assert.equal(response.status, 403, `${action} must not inherit project.edit`);
    }

    await grant(home, project, ["project.pull-request", "element.development.publish.use"]);
    assert.equal((await post(repoWritePost, home.staffToken, "/api/portal/dev/repo-write", { action: "publish", project })).status, 409);

    await grant(home, project, ["project.deploy", "element.development.publish.use"]);
    assert.equal((await post(repoWritePost, home.staffToken, "/api/portal/dev/repo-write", { action: "merge", project })).status, 409);

    await grant(home, project, ["project.publish", "element.development.publish.use"]);
    assert.equal((await post(repoWritePost, home.staffToken, "/api/portal/dev/repo-write", { action: "revert", project })).status, 409);
  });

  it("requires PR and publish-element authority for a confirmed source edit's default PR", async () => {
    const home = await fixture();
    const project = home.workspaceProject.id;
    await grant(home, project, ["project.edit", "element.development.explorer.use"]);

    const denied = await post(sourceEditPost, home.staffToken, "/api/portal/dev/source-edit", {
      action: "publish",
      project,
      confirm: true,
    });
    assert.equal(denied.status, 403, "edit/explorer use must not imply opening a pull request");

    const dryRun = await post(sourceEditPost, home.staffToken, "/api/portal/dev/source-edit", {
      action: "publish",
      project,
      confirm: false,
    });
    assert.equal(dryRun.status, 400, "a dry run reaches input validation without PR authority");

    const branchOnly = await post(sourceEditPost, home.staffToken, "/api/portal/dev/source-edit", {
      action: "publish",
      project,
      confirm: true,
      openPullRequest: false,
    });
    assert.equal(branchOnly.status, 400, "an explicitly branch-only commit does not claim PR authority");

    await grant(home, project, [
      "project.edit",
      "project.pull-request",
      "element.development.explorer.use",
      "element.development.publish.use",
    ]);
    const allowed = await post(sourceEditPost, home.staffToken, "/api/portal/dev/source-edit", {
      action: "publish",
      project,
      confirm: true,
    });
    assert.equal(allowed.status, 400, "with both permissions the request reaches source input validation");
  });

  it("keeps AI configuration and credentials at manage while chat stays at use", async () => {
    const home = await fixture();
    const project = home.workspaceProject.id;
    await grant(home, project, ["project.ai", "element.development.ai.use"]);

    for (const action of ["save", "set-token", "clear-token"] as const) {
      const response = await post(editorAiPost, home.staffToken, "/api/portal/dev/editor-ai", {
        action,
        projectId: project,
        model: "gpt-5-mini",
      });
      assert.equal(response.status, 403, `${action} requires AI manage, not AI use`);
    }

    await grant(home, project, ["project.ai", "element.development.ai.manage"]);
    const managed = await post(editorAiPost, home.staffToken, "/api/portal/dev/editor-ai", {
      action: "save",
      projectId: project,
      model: "gpt-5-mini",
    });
    assert.equal(managed.status, 200);
  });

  it("never lets a project grant expose Aqua's working tree or internal docs", async () => {
    const home = await fixture();
    await grant(home, home.workspaceProject.id, [
      "project.view",
      "project.edit",
      "element.development.code.view",
      "element.development.code.use",
      "element.development.explorer.view",
    ]);

    const getLocal = await withSession(home.staffToken, () => filesGet(new NextRequest(
      `http://localhost/api/portal/site-editor/files?project=${home.workspaceProject.id}&path=package.json`,
    )));
    assert.equal(getLocal.status, 403);

    const writeLocal = await post(filesPost, home.staffToken, "/api/portal/site-editor/files", {
      project: home.workspaceProject.id,
      path: "package.json",
      contents: "{}",
      fingerprint: "not-used",
    });
    assert.equal(writeLocal.status, 403);

    const librarian = await post(librarianPost, home.staffToken, "/api/portal/dev/librarian", {
      projectId: home.workspaceProject.id,
      query: "authentication",
    });
    assert.equal(librarian.status, 403);
  });

  it("binds a granted project to its configured repository and ref", async () => {
    const home = await fixture();
    await grant(home, home.repoProject.id, [
      "project.view",
      "element.development.code.view",
      "element.development.explorer.view",
    ]);

    const wrongRepo = await withSession(home.staffToken, () => filesGet(new NextRequest(
      `http://localhost/api/portal/site-editor/files?project=${home.repoProject.id}&repo=other/private&ref=main`,
    )));
    assert.equal(wrongRepo.status, 403);
    const wrongRef = await withSession(home.staffToken, () => filesGet(new NextRequest(
      `http://localhost/api/portal/site-editor/files?project=${home.repoProject.id}&repo=acme/scoped-site&ref=secret-branch`,
    )));
    assert.equal(wrongRef.status, 403);

    const librarian = await post(librarianPost, home.staffToken, "/api/portal/dev/librarian", {
      projectId: home.repoProject.id,
      query: "authentication",
    });
    assert.equal(librarian.status, 200);
    const librarianBody = await librarian.json() as {
      result: { searched: { docs: { searched: boolean }; reference: { searched: boolean } } };
    };
    assert.equal(librarianBody.result.searched.docs.searched, false);
    assert.equal(librarianBody.result.searched.reference.searched, false);
  });

  it("does not let a delegated project use an agency or environment GitHub token", async () => {
    const home = await fixture();
    process.env.GITHUB_TOKEN = "global-token-must-not-answer-a-delegated-project";
    await grant(home, home.repoProject.id, [
      "project.view",
      "element.project.editor.view",
      "element.development.code.view",
      "element.development.explorer.view",
    ]);

    const source = await post(sourceEditPost, home.staffToken, "/api/portal/dev/source-edit", {
      action: "find",
      project: home.repoProject.id,
      text: "authentication",
    });
    assert.equal(source.status, 409, "delegated source must fail before any global token can reach GitHub");
    assert.equal((await source.json() as { code?: string }).code, "no-token");

    const files = await withSession(home.staffToken, () => filesGet(new NextRequest(
      `http://localhost/api/portal/site-editor/files?project=${home.repoProject.id}`,
    )));
    assert.equal(files.status, 409, "delegated file reads use only the project's bound credential");
    assert.equal((await files.json() as { needsGitHub?: boolean }).needsGitHub, true);

    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const lifecycle = await post(lifecyclePost, home.staffToken, "/api/portal/dev/lifecycle", {
        action: "status",
        project: home.repoProject.id,
      });
      assert.equal(lifecycle.status, 409, "delegated lifecycle reads require the project's bound credential");
      assert.equal((await lifecycle.json() as { code?: string }).code, "no-token");
      assert.equal(providerCalls, 0, "the agency/environment token must not reach GitHub");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retains the owner's explicitly local working-tree read path", async () => {
    const home = await fixture();
    const response = await withDevMode(() => withSession(home.ownerToken, () => filesGet(new NextRequest(
      "http://localhost/api/portal/site-editor/files?path=package.json",
    ))));
    assert.equal(response.status, 200);
    const body = await response.json() as { ok?: boolean; path?: string };
    assert.equal(body.ok, true);
    assert.equal(body.path, "package.json");
  });
});
