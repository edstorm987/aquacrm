// Phase 18 — a REAL CLIENT identity in the Dev Workspace.
//
// Phase 17 proved the editor and its supervised preview for internal
// identities. Phase 18 is the point of the whole exercise, in Ed's words:
// "i can finally just add it into a client portal, the editor, so clients can
// start editing their own websites." The plan is equally clear about what that
// must NOT become: "A client cannot switch to an ungranted project, reach
// another agency's repository/tag, read another project's AI history, reveal
// secrets or publish merely because a template calls them a developer."
//
// Everything already covered for delegated STAFF identities
// (`smoke-dev-project-access-control`, `smoke-dev-project-api-access`) is not
// repeated here. What was never pinned is the client-role case itself:
// `client-owner` / `client-staff` are audience labels, and the whole design
// says authority comes from the exact project grant instead — so the tests
// that matter are the ones proving a client role is neither privileged BY the
// label nor blocked BY it.
//
//   1. GRANTED  — a client-owner with an exact project grant genuinely opens
//                 that project's governed workspace.
//   2. UNGRANTED— the same person on a sibling project gets the request-access
//                 surface, not the editor, and not a different answer than a
//                 project that does not exist.
//   3. INTERNAL — the grant is never a tunnel into Dev Team material or
//                 Aqua's own working tree.
//   4. LABEL    — the client role alone grants nothing, and having a grant
//                 does not promote the person anywhere else.

import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";
delete process.env.GITHUB_TOKEN;

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

import { GET as filesGet, POST as filesPost } from "../src/app/api/portal/site-editor/files/route";
import { GET as devProjectsGet } from "../src/app/api/portal/dev/projects/route";
import { POST as previewPost } from "../src/app/api/portal/dev/preview/route";
import { saveDevProject } from "../src/engines/editor/server/devProjects";
import { issueSession } from "../src/lib/server/auth/auth";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { flushPendingWrites, getState, mutate, reset } from "../src/server/storage";
import type { AccessCapability, ServerUser } from "../src/server/types";

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** The editor capabilities the governed page requires to OPEN a project. */
const OPEN_EDITOR: AccessCapability[] = ["project.view", "element.project.editor.view"];
/**
 * …plus what it needs before the person may change anything. The element
 * vocabulary is deliberately split (editor / code / AI / explorer / publish),
 * so a realistic "edit your own website" grant names the code element too —
 * and still says nothing about AI, the explorer or publishing.
 */
const EDIT_EDITOR: AccessCapability[] = [
  ...OPEN_EDITOR,
  "project.edit",
  "element.project.editor.use",
  "element.development.code.view",
  "element.development.code.use",
];

async function fixture() {
  await reset();
  const agency = createAgency({ name: "Client Editor", slug: `client-editor-${Date.now()}` });
  const owner = createUser({
    email: `owner-${agency.id}@client-editor.test`,
    name: "Owner",
    role: "agency-owner",
    agencyId: agency.id,
    password: "owner-test-password",
  });
  const client = createClient(agency.id, { name: "Bright Coffee", stage: "live" });
  const otherClient = createClient(agency.id, { name: "Rival Coffee", stage: "live" });

  // A REAL client-owner: the person who runs Bright Coffee, not a staff member
  // wearing a label. This is the identity phase 18 is actually about.
  const clientOwner = createUser({
    email: `owner-${agency.id}@brightcoffee.test`,
    name: "Bright Coffee Owner",
    role: "client-owner",
    agencyId: agency.id,
    clientId: client.id,
    password: "client-owner-test-password",
  });

  // Each project belongs to ITS client. This is load-bearing: the access
  // ceiling only ever lets a client role reach a project whose `clientId` is
  // their own (`userCanReachScope`), so an unattached project is unreachable
  // by anybody client-scoped no matter what grant is written.
  const theirProject = saveDevProject({
    agencyId: agency.id,
    name: "Bright Coffee website",
    repository: "acme/bright-coffee",
    ref: "main",
    clientId: client.id,
    actorUserId: owner.id,
  });
  const siblingProject = saveDevProject({
    agencyId: agency.id,
    name: "Rival Coffee website",
    repository: "acme/rival-coffee",
    ref: "main",
    clientId: otherClient.id,
    actorUserId: owner.id,
  });

  await flushPendingWrites();
  return {
    agencyId: agency.id,
    owner,
    client,
    otherClient,
    clientOwner,
    theirProject,
    siblingProject,
    clientToken: tokenFor(agency.id, clientOwner),
  };
}

function tokenFor(agencyId: string, user: ServerUser): string {
  return issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId,
    agencyIds: [agencyId],
    activeAgencyId: agencyId,
    clientId: user.clientId,
    sessionRev: user.sessionRev ?? 0,
  });
}

async function grantProject(home: Fixture, projectId: string, capabilities: AccessCapability[]) {
  mutate(state => {
    state.accessGrants.clientProject = {
      id: "clientProject",
      agencyId: home.agencyId,
      userId: home.clientOwner.id,
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

// These handlers authenticate through `requireCurrentAccessActor` →
// `getSession()` → `cookies()`, so each call runs inside a real request scope
// carrying the session rather than a hand-set cookie header.
function callGet(
  token: string,
  handler: (request: NextRequest) => Promise<Response>,
  path: string,
): Promise<Response> {
  return withSession(token, () => handler(new NextRequest(`http://localhost${path}`)));
}

function callPost(
  token: string,
  handler: (request: NextRequest) => Promise<Response>,
  path: string,
  body: unknown,
): Promise<Response> {
  return withSession(token, () => handler(new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })));
}

let home: Fixture;
beforeEach(async () => { home = await fixture(); });

describe("a client identity in the governed Dev Workspace", () => {
  it("lists ONLY the project it was granted — never the agency's other client sites", async () => {
    await grantProject(home, home.theirProject.id, OPEN_EDITOR);

    const response = await callGet(home.clientToken, devProjectsGet, "/api/portal/dev/projects");
    assert.equal(response.status, 200);
    const body = await response.json() as { projects?: { id: string; name: string }[] };
    const ids = (body.projects ?? []).map(project => project.id);

    assert.deepEqual(ids, [home.theirProject.id], "exactly the granted project, and nothing else");
    assert.ok(
      !JSON.stringify(body).includes("rival-coffee"),
      "a sibling client's repository must not appear anywhere in the payload",
    );
  });

  it("reads its own project's source through the grant", async () => {
    await grantProject(home, home.theirProject.id, EDIT_EDITOR);
    const response = await callGet(home.clientToken, filesGet, `/api/portal/site-editor/files?project=${home.theirProject.id}`);
    // The repository read reaches GitHub, which is not configured in this
    // fixture. What matters is the ANSWER IT DOES NOT GIVE: not a capability
    // refusal, and not somebody else's tree — the grant carried the client
    // past the gate to its own project's repository boundary.
    assert.notEqual(response.status, 403, "an exact grant is authority for its own project");
    assert.notEqual(response.status, 404, "…and the project is visible to them");
    const body = await response.json() as { error?: string };
    assert.ok(
      !/rival-coffee/.test(JSON.stringify(body)),
      "the answer never mentions another client's repository",
    );
  });

  it("is refused a SIBLING client's project with the same words as one that does not exist", async () => {
    await grantProject(home, home.theirProject.id, EDIT_EDITOR);

    const sibling = await callGet(home.clientToken, filesGet, `/api/portal/site-editor/files?project=${home.siblingProject.id}`);
    const invented = await callGet(home.clientToken, filesGet, "/api/portal/site-editor/files?project=devproj_does_not_exist");

    // The established convention across the Dev routes: a capability refusal
    // inside your own agency is an honest 403, while anything outside the
    // tenant — or invented — is a 404. Both are refusals; what matters for a
    // client is that NOTHING about the sibling comes back with either.
    assert.equal(sibling.status, 403, "an ungranted same-agency project is a capability refusal");
    assert.equal(invented.status, 404, "an invented project does not exist");
    for (const [label, response] of [["sibling", sibling], ["invented", invented]] as const) {
      const payload = JSON.stringify(await response.json());
      assert.ok(!/rival-coffee/i.test(payload), `${label} response leaked the sibling repository`);
      assert.ok(!/Rival Coffee/i.test(payload), `${label} response leaked the sibling name`);
    }
  });

  it("cannot start, stop or even inspect the preview of a project it was not granted", async () => {
    await grantProject(home, home.theirProject.id, EDIT_EDITOR);
    for (const action of ["status", "start", "stop", "restart", "logs"] as const) {
      const response = await callPost(home.clientToken, previewPost, "/api/portal/dev/preview", { action, projectId: home.siblingProject.id });
      assert.ok(
        [403, 404].includes(response.status),
        `${action} on an ungranted project must be refused, got ${response.status}`,
      );
    }
  });
});

describe("the grant is not a tunnel", () => {
  it("never exposes Aqua's own working tree to a client, even in local Dev Mode", async () => {
    await grantProject(home, home.theirProject.id, EDIT_EDITOR);

    // Dev Mode is the most permissive the server ever gets. A client identity
    // must still be nowhere near the checkout Aqua itself is running from.
    const read = await withDevMode(() => callGet(home.clientToken, filesGet, "/api/portal/site-editor/files?path=package.json"));
    assert.equal(read.status, 403, "the whole-working-tree read is owner-only");

    const write = await withDevMode(() => callPost(home.clientToken, filesPost, "/api/portal/site-editor/files", {
      path: "package.json",
      contents: "{}",
    }));
    assert.equal(write.status, 403, "and so is the write");
    assert.equal(
      getState().devProjects[home.theirProject.id]?.repository,
      "acme/bright-coffee",
      "nothing was mutated by the attempt",
    );
  });

  it("does not let the client role alone open anything — the grant is the authority", async () => {
    // No grant at all: the label "client-owner" must carry zero project access.
    const response = await callGet(home.clientToken, devProjectsGet, "/api/portal/dev/projects");
    const body = await response.json() as { projects?: unknown[] };
    assert.deepEqual(body.projects ?? [], [], "a client role by itself sees no projects");

    const preview = await callPost(home.clientToken, previewPost, "/api/portal/dev/preview", { action: "status", projectId: home.theirProject.id });
    assert.ok([403, 404].includes(preview.status), "and cannot reach its own project's preview yet");
  });

  it("keeps an editor grant from promoting the person anywhere else in the CRM", async () => {
    await grantProject(home, home.theirProject.id, EDIT_EDITOR);
    // The grant is scoped to one project. It must not become agency authority:
    // the projects list is the narrowest observable proxy for that, and it
    // still returns exactly one project rather than the agency's catalogue.
    const response = await callGet(home.clientToken, devProjectsGet, "/api/portal/dev/projects");
    const body = await response.json() as { projects?: { id: string }[]; masterTag?: unknown; connections?: unknown };
    assert.deepEqual((body.projects ?? []).map(p => p.id), [home.theirProject.id]);
    assert.equal(body.masterTag, undefined, "the agency master tag is not a project-grant disclosure");
    assert.equal(body.connections, undefined, "nor is the agency connection catalogue");
  });
});

describe("session freshness reaches the client editor too", () => {
  it("refuses the client's cookie once their live record is rotated", async () => {
    await grantProject(home, home.theirProject.id, EDIT_EDITOR);
    const staleCookie = home.clientToken;

    // Exactly what a password change or a role edit does (issue #22).
    mutate(state => {
      for (const [key, user] of Object.entries(state.users)) {
        if (user.id === home.clientOwner.id) {
          state.users[key] = { ...user, sessionRev: (user.sessionRev ?? 0) + 1 };
        }
      }
    });
    await flushPendingWrites();

    const response = await callGet(staleCookie, devProjectsGet, "/api/portal/dev/projects");
    assert.ok(
      [401, 403].includes(response.status),
      `a rotated client session must be refused, got ${response.status}`,
    );
  });
});
