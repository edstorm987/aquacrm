// NESTED PROJECTS — Ed's two levels, enforced in the store.
//
//   Ed, 2026-08-21: a project can contain projects — "one project could be a
//   website they might have a software going on with it too". From inside a
//   project you can create another and it is a CHILD of the project you are
//   in, never a new top-level one. And EXACTLY TWO LEVELS: "project → inner
//   projects and that's it".
//
// What is under test, in order of how much it matters:
//
//   1. THE TWO-LEVEL RULE, FROM EVERY DIRECTION. A child can never be a
//      parent (no third level from below), a parent can never become a child
//      (no third level from above), nothing contains itself — and because
//      every cycle needs some project to be both parent AND child, those
//      three refusals make a cycle INEXPRESSIBLE rather than merely checked
//      for. That proof is run here, not assumed.
//   2. THE STORE IS THE BOUNDARY. Every refusal is asserted at
//      `saveDevProject` / `deleteDevProject` AND at the route, so no future
//      screen can talk its way past the rule.
//   3. A DELETE THAT WOULD ORPHAN CHILDREN refuses and NAMES them — and the
//      route refuses BEFORE its destructive AI cleanup, so a refused delete
//      leaves the project exactly as it was, assistant history included.
//   4. TENANT FIRST, the devProjects order: a foreign parent id and an
//      invented one are the same answer, word for word.
//   5. OLD RECORDS — written before `parentProjectId` existed — parse, list,
//      rename and group exactly as before: top level, field absent.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// First, and statically — see the note in dev-console-request-scope.ts.
import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";

import {
  deleteDevProject,
  devProjectDeleteRefusal,
  getDevProject,
  listDevProjectChildren,
  saveDevProject,
} from "../src/engines/editor/server/devProjects";
import { getEditorAiConversation, startEditorAiThread } from "../src/engines/editor/server/editorAiHistory";
import { groupDevProjects } from "../src/lib/shared/devProjectGrouping";
import { POST } from "../src/app/api/portal/dev/projects/route";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated, getState, mutate } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { DevProject } from "../src/server/types";

const AGENCY = "agency_nest_test";
const OTHER_AGENCY = "agency_nest_other";
const ACTOR = "user_nest_test";

before(async () => {
  await ensureHydrated();
});

let n = 0;
function make(overrides: Partial<Parameters<typeof saveDevProject>[0]> = {}): DevProject {
  n += 1;
  return saveDevProject({ agencyId: AGENCY, name: `Nest ${n}`, actorUserId: ACTOR, ...overrides });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("the two-level rule, from every direction (store)", () => {
  it("creates a project INSIDE a top-level project", () => {
    const parent = make({ name: "Website" });
    const child = make({ name: "The software behind it", parentProjectId: parent.id });
    assert.equal(child.parentProjectId, parent.id);
    assert.deepEqual(listDevProjectChildren(AGENCY, parent.id).map(p => p.id), [child.id]);
  });

  it("refuses a child of a child — no third level from below", () => {
    const parent = make({ name: "Top" });
    const child = make({ name: "Inner", parentProjectId: parent.id });
    assert.throws(
      () => make({ name: "Third level", parentProjectId: child.id }),
      /parent_is_child:Inner/,
      "the refusal names the would-be parent so the route can say who is already nested",
    );
  });

  it("refuses REPARENTING an existing project under a child, same rule", () => {
    const parent = make({ name: "Top again" });
    const child = make({ name: "Inner again", parentProjectId: parent.id });
    const wanderer = make({ name: "Wanderer" });
    assert.throws(
      () => saveDevProject({ agencyId: AGENCY, id: wanderer.id, name: wanderer.name, parentProjectId: child.id, actorUserId: ACTOR }),
      /parent_is_child:/,
      "a save and a create are the same door; neither may open a third level",
    );
  });

  it("refuses making a project WITH children into a child — no third level from above", () => {
    const grandparent = make({ name: "Would-be grandparent" });
    make({ name: "Its child", parentProjectId: grandparent.id });
    const other = make({ name: "Other top-level" });
    assert.throws(
      () => saveDevProject({ agencyId: AGENCY, id: grandparent.id, name: grandparent.name, parentProjectId: other.id, actorUserId: ACTOR }),
      /project_has_children_cannot_nest/,
    );
  });

  it("refuses a project containing itself", () => {
    const loner = make({ name: "Loner" });
    assert.throws(
      () => saveDevProject({ agencyId: AGENCY, id: loner.id, name: loner.name, parentProjectId: loner.id, actorUserId: ACTOR }),
      /project_cannot_contain_itself/,
      "self-containment is the one degenerate loop the two directional rules alone would admit",
    );
  });

  it("PROOF: no cycle is expressible", () => {
    // A cycle of length 1 is self-containment — refused above. A cycle of
    // length ≥ 2 requires some project to be simultaneously a parent and a
    // child. Both ways of creating that project are refused: giving a child
    // children is `parent_is_child` (the child cannot be named as a parent),
    // and giving a parent a parent is `project_has_children_cannot_nest`.
    // Run both closures on a real pair rather than trusting the argument.
    const a = make({ name: "Cycle A" });
    const b = make({ name: "Cycle B", parentProjectId: a.id });
    // Close the 2-cycle from A's side: A into B. B is a child AND A has a
    // child — either rule alone refuses it.
    assert.throws(
      () => saveDevProject({ agencyId: AGENCY, id: a.id, name: a.name, parentProjectId: b.id, actorUserId: ACTOR }),
      /parent_is_child:|project_has_children_cannot_nest/,
    );
    // A longer cycle needs a chain of length 2 first, and the chain itself
    // is refused before any loop could close.
    assert.throws(
      () => make({ name: "Cycle C", parentProjectId: b.id }),
      /parent_is_child:/,
    );
    // Nothing moved while being refused.
    assert.equal(getDevProject(AGENCY, a.id)?.parentProjectId, undefined);
    assert.equal(getDevProject(AGENCY, b.id)?.parentProjectId, a.id);
  });

  it("tenant first: a foreign parent id and an invented one are the SAME answer", () => {
    const foreign = saveDevProject({ agencyId: OTHER_AGENCY, name: "Theirs", actorUserId: ACTOR });
    const errors: string[] = [];
    for (const parentId of [foreign.id, "devproj_invented"]) {
      try {
        make({ name: `Probe ${parentId}`, parentProjectId: parentId });
        assert.fail("must refuse");
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    assert.equal(errors[0], "parent_project_not_found");
    assert.equal(errors[0], errors[1], "probing ids must teach nothing about another tenant's projects");
  });

  it("…and the project's OWN tenant check still comes before any parent guard", () => {
    const foreign = saveDevProject({ agencyId: OTHER_AGENCY, name: "Not yours to move", actorUserId: ACTOR });
    assert.throws(
      () => saveDevProject({ agencyId: AGENCY, id: foreign.id, name: "Hijack", parentProjectId: "devproj_invented", actorUserId: ACTOR }),
      /project_not_found/,
      "the devProjects order: whose project is this, THEN where may it go",
    );
  });

  it("reparents a child between top-level projects — legal, two levels preserved", () => {
    const a = make({ name: "Home A" });
    const b = make({ name: "Home B" });
    const child = make({ name: "Mover", parentProjectId: a.id });
    const moved = saveDevProject({ agencyId: AGENCY, id: child.id, name: child.name, parentProjectId: b.id, actorUserId: ACTOR });
    assert.equal(moved.parentProjectId, b.id);
    assert.equal(listDevProjectChildren(AGENCY, a.id).length, 0);
  });

  it("clears the parent with an EXPLICIT empty value — '' and null both", () => {
    const parent = make({ name: "Emptied" });
    for (const clearValue of ["", null] as const) {
      const child = make({ name: `Freed by ${JSON.stringify(clearValue)}`, parentProjectId: parent.id });
      const cleared = saveDevProject({ agencyId: AGENCY, id: child.id, name: child.name, parentProjectId: clearValue, actorUserId: ACTOR });
      assert.equal(cleared.parentProjectId, undefined);
    }
  });

  it("OMITTING the field carries the parent — a rename must not promote a child", () => {
    // `saveDevProject` rebuilds the record field by field; the editor's
    // Settings form and the connect-tag save know nothing about nesting.
    // If omission cleared, every such save would silently flatten the tree —
    // the exact bug class the EditorAiConfig comment in types.ts documents.
    const parent = make({ name: "Kept" });
    const child = make({ name: "Renamed child", parentProjectId: parent.id });
    const renamed = saveDevProject({ agencyId: AGENCY, id: child.id, name: "Renamed, still inside", actorUserId: ACTOR });
    assert.equal(renamed.parentProjectId, parent.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("deleting a parent (store)", () => {
  it("refuses while children exist, and NAMES them in the sentence", () => {
    const parent = make({ name: "Busy parent" });
    make({ name: "First inside", parentProjectId: parent.id });
    make({ name: "Second inside", parentProjectId: parent.id });

    const refusal = devProjectDeleteRefusal(AGENCY, parent.id);
    assert.ok(refusal, "there must be a refusal");
    assert.match(refusal!, /"Busy parent"/, "says WHO cannot be deleted");
    assert.match(refusal!, /"First inside"/, "…and names the first child in the way");
    assert.match(refusal!, /"Second inside"/, "…and the second");

    assert.throws(() => deleteDevProject(AGENCY, parent.id, ACTOR), new RegExp('"First inside"'),
      "the store itself refuses — a caller that never asked for the refusal still cannot orphan a child");
    assert.ok(getDevProject(AGENCY, parent.id), "the parent survives the refused delete");
    assert.equal(listDevProjectChildren(AGENCY, parent.id).length, 2, "so do the children");
  });

  it("returns no refusal for a childless project or an unknown id", () => {
    const loner = make({ name: "Deletable" });
    assert.equal(devProjectDeleteRefusal(AGENCY, loner.id), null);
    assert.equal(devProjectDeleteRefusal(AGENCY, "devproj_nope"), null, "not-found stays its own answer");
  });

  it("delete the children first, then the parent goes normally", () => {
    const parent = make({ name: "Emptied then deleted" });
    const child = make({ name: "Temporary child", parentProjectId: parent.id });
    assert.ok(deleteDevProject(AGENCY, child.id, ACTOR), "a child deletes like any project");
    assert.ok(deleteDevProject(AGENCY, parent.id, ACTOR), "…and the parent follows once it is empty");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("old records — written before parentProjectId existed", () => {
  it("a record without the field lists, renames and groups as top level", () => {
    const project = make({ name: "From the old blob" });
    // Simulate the on-disk shape of a record saved before this change: the
    // key is simply not there.
    mutate(state => {
      const stored = { ...state.devProjects[project.id]! };
      delete (stored as Partial<DevProject>).parentProjectId;
      state.devProjects[project.id] = stored as DevProject;
    });
    assert.ok(!("parentProjectId" in getState().devProjects[project.id]!));

    assert.equal(listDevProjectChildren(AGENCY, project.id).length, 0);
    assert.equal(devProjectDeleteRefusal(AGENCY, project.id), null);

    const renamed = saveDevProject({ agencyId: AGENCY, id: project.id, name: "Old but renamed", actorUserId: ACTOR });
    assert.equal(renamed.parentProjectId, undefined, "omission carries 'no parent' unchanged");

    const groups = groupDevProjects([getDevProject(AGENCY, project.id)!]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.children.length, 0);
  });

  it("a top-level project serialises WITHOUT the field — the stored shape does not churn", () => {
    const project = make({ name: "Shape check" });
    const serialised = JSON.parse(JSON.stringify(getState().devProjects[project.id]!)) as Record<string, unknown>;
    assert.ok(!("parentProjectId" in serialised),
      "undefined must not become a persisted null/empty — old and new top-level records stay the same shape");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("grouping for display (pure)", () => {
  const p = (id: string, parentProjectId?: string) => ({ id, parentProjectId });

  it("gathers children under their parent, preserving input order both levels", () => {
    const groups = groupDevProjects([p("b"), p("b1", "b"), p("a"), p("a2", "a"), p("a1", "a")]);
    assert.deepEqual(groups.map(g => g.parent.id), ["b", "a"]);
    assert.deepEqual(groups.find(g => g.parent.id === "a")!.children.map(c => c.id), ["a2", "a1"]);
  });

  it("an orphan (parent not in the list) renders top level rather than vanishing", () => {
    const groups = groupDevProjects([p("child", "gone_parent")]);
    assert.deepEqual(groups.map(g => g.parent.id), ["child"],
      "display code must never make a record unreachable");
  });

  it("a record claiming to be its own parent renders top level too", () => {
    // The store forbids it; a drifted blob might still say it. It must not
    // vanish into a group that is never built.
    const groups = groupDevProjects([p("self", "self")]);
    assert.deepEqual(groups.map(g => g.parent.id), ["self"]);
    assert.equal(groups[0]!.children.length, 0, "and it is not its own child");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The route — the same rules, refused in sentences, and the delete ordering.

interface ProjectsBody {
  ok?: boolean;
  error?: string;
  project?: DevProject;
  projects?: DevProject[];
}

let seq = 0;
async function founder() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Nest Co", slug: `nest-co-${Date.now()}-${seq}` });
  const user = createUser({
    email: `owner-${agency.id}@nest.test`,
    name: "Operator",
    role: "agency-owner",
    agencyId: agency.id,
    password: "nest-operator-pass",
  });
  return {
    agency,
    user,
    token: issueSession({
      userId: user.id, email: user.email, role: "agency-owner",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: user.sessionRev ?? 0,
    }),
  };
}

async function send(token: string, body: unknown): Promise<{ status: number; body: ProjectsBody }> {
  const response = await withDevMode(() => withSession(token, () => POST(new Request(
    "http://localhost/api/portal/dev/projects",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  ))));
  return { status: response.status, body: await response.json() as ProjectsBody };
}

describe("the projects route speaks the same rules", () => {
  it("accepts parentProjectId on CREATE", async () => {
    const { token } = await founder();
    const parent = await send(token, { action: "save", name: "Route parent" });
    const child = await send(token, { action: "save", name: "Route child", parentProjectId: parent.body.project!.id });
    assert.equal(child.status, 200);
    assert.equal(child.body.project?.parentProjectId, parent.body.project!.id);
  });

  it("accepts parentProjectId on UPDATE — reparent in, and '' back out to top level", async () => {
    const { token } = await founder();
    const parent = await send(token, { action: "save", name: "Adoptive" });
    const created = await send(token, { action: "save", name: "Moved by update" });
    const nested = await send(token, { action: "save", id: created.body.project!.id, name: "Moved by update", parentProjectId: parent.body.project!.id });
    assert.equal(nested.body.project?.parentProjectId, parent.body.project!.id);
    const cleared = await send(token, { action: "save", id: created.body.project!.id, name: "Moved by update", parentProjectId: "" });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.project?.parentProjectId, undefined);
  });

  it("refuses a child of a child with the two-levels sentence", async () => {
    const { token } = await founder();
    const parent = await send(token, { action: "save", name: "L1" });
    const child = await send(token, { action: "save", name: "L2", parentProjectId: parent.body.project!.id });
    const third = await send(token, { action: "save", name: "L3", parentProjectId: child.body.project!.id });
    assert.equal(third.status, 400);
    assert.match(third.body.error ?? "", /two levels deep only/);
    assert.match(third.body.error ?? "", /"L2"/, "names the project that is already nested");
  });

  it("refuses moving a parent inside another project, and says why", async () => {
    const { token } = await founder();
    const parent = await send(token, { action: "save", name: "Full nest" });
    await send(token, { action: "save", name: "Occupant", parentProjectId: parent.body.project!.id });
    const other = await send(token, { action: "save", name: "Somewhere else" });
    const refused = await send(token, { action: "save", id: parent.body.project!.id, name: "Full nest", parentProjectId: other.body.project!.id });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error ?? "", /contains projects of its own/);
  });

  it("refuses self-containment", async () => {
    const { token } = await founder();
    const created = await send(token, { action: "save", name: "Klein bottle" });
    const refused = await send(token, { action: "save", id: created.body.project!.id, name: "Klein bottle", parentProjectId: created.body.project!.id });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error ?? "", /inside itself/);
  });

  it("a foreign parent id and an invented one get the IDENTICAL response", async () => {
    const mine = await founder();
    const theirs = await founder();
    const foreign = await send(theirs.token, { action: "save", name: "Their parent" });
    const probeForeign = await send(mine.token, { action: "save", name: "Probe F", parentProjectId: foreign.body.project!.id });
    const probeInvented = await send(mine.token, { action: "save", name: "Probe I", parentProjectId: "devproj_invented" });
    assert.equal(probeForeign.status, 400);
    assert.equal(probeForeign.status, probeInvented.status);
    assert.equal(probeForeign.body.error, probeInvented.body.error,
      "word for word — probing ids across the tenant line teaches nothing");
  });

  it("refuses deleting a parent BEFORE the destructive AI cleanup — names the children, keeps the history", async () => {
    const { token, agency, user } = await founder();
    const parent = await send(token, { action: "save", name: "Parent with a past" });
    await send(token, { action: "save", name: "Reason it stays", parentProjectId: parent.body.project!.id });

    // Give the parent an assistant history. The route's delete used to run
    // forgetEditorAiForProject/History FIRST (correct for an allowed delete);
    // a refusal discovered after that would have stripped a still-existing
    // project of its assistant. The refusal must come first.
    const thread = startEditorAiThread({ agencyId: agency.id, projectId: parent.body.project!.id, title: "Must survive", actorUserId: user.id });

    const refused = await send(token, { action: "delete", id: parent.body.project!.id });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error ?? "", /"Parent with a past" still contains "Reason it stays"/);

    assert.ok(getDevProject(agency.id, parent.body.project!.id), "the project is untouched");
    const conversation = getEditorAiConversation(agency.id, parent.body.project!.id);
    assert.ok(conversation?.threads.some(item => item.id === thread.id),
      "…and so is its AI history — nothing destructive ran before the refusal");
  });

  it("deletes a CHILD exactly like any project, cleanup included", async () => {
    const { token, agency, user } = await founder();
    const parent = await send(token, { action: "save", name: "Stays" });
    const child = await send(token, { action: "save", name: "Goes", parentProjectId: parent.body.project!.id });
    const childId = child.body.project!.id;

    startEditorAiThread({ agencyId: agency.id, projectId: childId, title: "To be forgotten", actorUserId: user.id });
    assert.ok(getState().editorAiConversations[`${agency.id}|${childId}`], "history exists before the delete");

    const deleted = await send(token, { action: "delete", id: childId });
    assert.equal(deleted.status, 200);
    assert.equal(getDevProject(agency.id, childId), null);
    assert.equal(getState().editorAiConversations[`${agency.id}|${childId}`], undefined,
      "a child's history is forgotten on delete exactly like any project's");
    assert.ok(getDevProject(agency.id, parent.body.project!.id), "the parent is untouched");
    // And now that it is empty, the parent deletes normally.
    const parentGone = await send(token, { action: "delete", id: parent.body.project!.id });
    assert.equal(parentGone.status, 200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The screens. Source pins in the walkthrough test's style: the workspace
// groups and indents, the create form offers only legal parents, and the
// editor's panel creates ONLY inside the open project.

describe("the Projects workspace draws two levels", () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const setup = readFileSync(join(__dirname, "..", "src", "app", "portal", "dev-team", "editor", "setup", "_DevEditorSetup.tsx"), "utf8");
  const code = (source: string) => source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
  const panelAt = setup.indexOf("export function DevEditorProjectSettings");
  const workspace = setup.slice(0, panelAt);
  const panel = setup.slice(panelAt);

  it("renders through the shared grouping, children indented under their parent", () => {
    assert.match(workspace, /groupDevProjects\(projects\)\.map/);
    const childrenBlockAt = workspace.indexOf("children.map(child => projectCard(child))");
    assert.ok(childrenBlockAt > 0, "children render through the same card as parents — a child is a full project");
    const wrapper = workspace.slice(workspace.lastIndexOf("<div", childrenBlockAt), childrenBlockAt);
    assert.match(wrapper, /ml-5/, "…visibly indented");
    assert.match(wrapper, /border-l-2/, "…with the level drawn, not implied");
  });

  it("offers 'Add a project inside' on TOP-LEVEL cards only", () => {
    // Comments stripped first: the rule is EXPLAINED in a comment above the
    // card, and prose about the affordance must not match as the affordance.
    const ws = code(workspace);
    const at = ws.indexOf("Add a project inside");
    assert.ok(at > 0);
    const guardAt = ws.lastIndexOf("!project.parentProjectId", at);
    assert.ok(guardAt > 0 && at - guardAt < 800,
      "the affordance is gated on being top-level — a child never offers to become a parent");
    assert.match(ws.slice(guardAt, at), /parentProjectId: project\.id/,
      "…and it opens the create form pre-parented to that card's project");
  });

  it("the form's 'Inside' select lists top-level projects only, never the project itself", () => {
    assert.match(workspace, /!project\.parentProjectId && project\.id !== draft\.id/);
    assert.match(setup, /Top level — its own project/, "clearing the parent is a visible, choosable option");
  });

  it("the form ALWAYS sends parentProjectId — '' is how a project moves back to top level", () => {
    assert.match(workspace, /parentProjectId: draft\.parentProjectId/,
      "omission means 'carry' to the server, so a form with an Inside select must always state its answer");
  });

  it("a project with children is told it stays top level instead of offered a select that always fails", () => {
    assert.match(workspace, /hasChildren \?/);
    assert.match(setup, /two levels deep and no further/);
  });

  it("the editor's panel creates ONLY inside the open project, and announces it", () => {
    const panelCode = code(panel);
    assert.match(panel, /parentProjectId: project\.id/, "the create-inside is pre-parented to the project the editor is open on");
    // It rides `post`, which is where the DEV_PROJECTS_CHANGED_EVENT
    // announcement lives — the editor around the panel re-reads on success.
    const createAt = panel.indexOf("async function createChild");
    assert.ok(createAt > 0);
    const createChild = panel.slice(createAt, panel.indexOf("\n  }", createAt));
    assert.match(createChild, /await post\(/);
    // A child cannot create a grandchild from here either: the affordance is
    // swapped for the two-levels sentence when the open project is a child.
    assert.match(panelCode, /project\.parentProjectId \? \(/);
    assert.match(panel, /two levels deep and\s+no further/);
  });
});
