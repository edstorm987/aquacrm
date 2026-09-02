// The other half of application-wide client classification.
//
// `pluginClientElement.ts` settled the dynamic module catch-all. This is what
// the checklist kept open beside it: *"freelancer-job and generic
// task/task-template client associations remain genuinely unclassified."*
//
// ── Why they stayed open, and what settles them ────────────────────────────
//
// All three records are AGENCY work that merely NAMES a client, and all three
// were already gated as agency work — `workspace.actions`, an agency role,
// People's `staff.people` + `staff.pay`. None had a rule about the one field
// that crosses the boundary: `clientId`.
//
// The genuine difficulty was that a GENERIC task belongs to no single client
// element — it might be about money, delivery or a conversation — and guessing
// one would look enforced while guarding the wrong thing. The resolution is
// that a generic association does not need the element owning the SUBJECT; it
// needs the one that says **you may see this client at all**. That is
// `client.overview`, the client workspace's landing tab. A freelancer job is
// not generic: it is delivery work for a named client, so `client.fulfilment`.
//
// This file asserts the classification, the enforcement, and — the part that
// stops the gap reopening — that every agency-side surface taking a `clientId`
// is either classified or named as governed elsewhere.

// First, and statically — see the note in dev-console-request-scope.ts.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";

process.env.PORTAL_BACKEND ??= "memory";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

import { AuthError, SESSION_COOKIE_NAME, issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated, flushPendingWrites } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { createAccessGrant } from "../src/server/accessControl";
import { createAgencyTask } from "../src/server/tasks";
import { taskDeleteOperationId } from "../src/lib/client/actionsMutationTruth";
import { DELETE as tasksDelete } from "../src/app/api/portal/tasks/route";
import { POST as checklistPost } from "../src/app/api/portal/tasks/checklist/route";
import { POST as templatesPost } from "../src/app/api/portal/tasks/templates/route";
import { GET as attentionPlanGet } from "../src/app/api/portal/attention/plan/route";

type Mod = typeof import("../src/lib/server/access/clientAssociationElement");
let mod: Mod;

let ourAgencyId = "";
let ourClientId = "";
let theirClientId = "";
let ownerSession = "";
let ownerUserId = "";

before(async () => {
  mod = await import("../src/lib/server/access/clientAssociationElement");

  await ensureHydrated();
  const ours = createAgency({ name: "Assoc Ours", slug: `assoc-ours-${Date.now()}` });
  const other = createAgency({ name: "Assoc Theirs", slug: `assoc-theirs-${Date.now()}` });
  ourAgencyId = ours.id;
  ourClientId = createClient(ours.id, { name: "Our Client", slug: "our-client" }).id;
  theirClientId = createClient(other.id, { name: "Their Client", slug: "their-client" }).id;
  const owner = createUser({
    email: `owner-${Date.now()}@assoc.test`,
    name: "Assoc Owner",
    role: "agency-owner",
    agencyId: ours.id,
    password: "assoc-smoke-pass-phrase",
  });
  ownerUserId = owner.id;
  ownerSession = await issueSession({
    userId: owner.id, email: owner.email, role: "agency-owner",
    agencyId: ours.id, agencyIds: [ours.id], activeAgencyId: ours.id,
    sessionRev: owner.sessionRev ?? 0,
  });
});

describe("the classification is explicit and reasoned", () => {
  it("maps each association to the element that actually owns it", () => {
    assert.deepEqual(mod.CLIENT_ASSOCIATION_ELEMENT, {
      "agency-task": "client.overview",
      "agency-task-template": "client.overview",
      "freelancer-job": "client.fulfilment",
    });
  });

  it("a generic task asks only whether you may SEE the client", () => {
    // The whole reason this was unclassified. If someone later "tidies" these
    // onto client.fulfilment, a generic Action about an invoice starts asking
    // for Delivery — enforced, and guarding the wrong thing.
    assert.equal(mod.clientAssociationElement("agency-task"), "client.overview");
    assert.notEqual(mod.clientAssociationElement("agency-task"), "client.fulfilment");
  });

  it("returns null for anything unclassified rather than inventing an element", () => {
    assert.equal(mod.clientAssociationElement("something-new"), null);
  });

  it("names every alternative authority with a real reason", () => {
    const entries = Object.entries(mod.CLIENT_ASSOCIATION_ALTERNATIVE_AUTHORITY);
    assert.ok(entries.length >= 3, "the alternative-authority list emptied out");
    for (const [key, reason] of entries) {
      assert.ok(reason.trim().length > 40, `${key} needs a real reason, got "${reason}"`);
    }
    // The one the checklist names explicitly: the contractor's own view is
    // governed by FreelancerAccessConfig, and forcing the agency gate on it
    // would be "the wrong client gate".
    assert.ok(
      mod.CLIENT_ASSOCIATION_ALTERNATIVE_AUTHORITY["freelancer-job-as-seen-by-the-freelancer"]
        ?.includes("FreelancerAccessConfig"),
      "the freelancer's own authority is no longer named",
    );
  });
});

describe("it refuses a client the caller cannot reach", () => {
  async function attempt(kind: "agency-task" | "agency-task-template" | "freelancer-job", clientId: string) {
    return withSession(ownerSession, async () => {
      try {
        await mod.requireClientAssociation(kind, clientId, "use");
        return null;
      } catch (error) { return error; }
    });
  }

  it("allows the owner to associate with their OWN client", async () => {
    for (const kind of ["agency-task", "agency-task-template", "freelancer-job"] as const) {
      assert.equal(await attempt(kind, ourClientId), null, `${kind} refused the owner's own client`);
    }
  });

  it("refuses ANOTHER agency's client for every association", async () => {
    for (const kind of ["agency-task", "agency-task-template", "freelancer-job"] as const) {
      const error = await attempt(kind, theirClientId);
      assert.ok(error instanceof AuthError, `${kind} did not refuse a cross-tenant client`);
      assert.equal((error as AuthError).status, 403);
    }
  });

  it("says nothing at all when there is no client — that is agency work", async () => {
    for (const value of [undefined, null, ""]) {
      assert.equal(await attempt("agency-task", value as unknown as string), null,
        "an unattached Action was refused; it has no client to answer for");
    }
  });
});

describe("the three surfaces actually enforce it", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("Actions gate both the write and the re-association", () => {
    const src = read("src/app/api/portal/tasks/route.ts");
    assert.match(src, /await requireClientAssociation\("agency-task", body\.clientId, "use"\)/,
      "creating a client-attached Action is ungated again");
    // Both sides of a move: checking only the destination would let someone
    // detach a task from a client they cannot see.
    assert.match(src, /requireClientAssociation\("agency-task", existing\?\.clientId, "use"\)/,
      "the client an Action is currently on is no longer checked on PATCH");
    assert.match(src, /requireClientAssociation\("agency-task", patch\.clientId, "use"\)/,
      "the client an Action is moving to is no longer checked on PATCH");
  });

  it("the Actions list filters rows whose client the reader may not see", () => {
    const src = read("src/app/api/portal/tasks/route.ts");
    const getHandler = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
    assert.match(getHandler, /canReadClientAssociation\(actor, "agency-task", task\.clientId\)/,
      "the Actions list stopped filtering by client visibility");
    // Resolved ONCE, not per row.
    assert.match(getHandler, /const actor = await requireCurrentAccessActor\(\);/);
    assert.equal((getHandler.match(/requireCurrentAccessActor\(\)/g) ?? []).length, 1,
      "the actor is being resolved more than once — that is a per-row session read");
  });

  it("applying a task template at a client is gated — it had NO client rule", () => {
    const src = read("src/app/api/portal/tasks/templates/route.ts");
    assert.match(src, /requireClientAssociation\(\s*"agency-task-template"/,
      "the template route is back to an agency role being the whole gate");
  });

  it("a freelancer job checks tenancy FIRST, then the element", () => {
    const src = read("src/app/api/portal/people/route.ts");
    const block = src.slice(src.indexOf('if (action === "save-freelancer-job")'));
    const tenancy = block.indexOf("routeTenantScope(session");
    const element = block.indexOf('requireClientAssociation("freelancer-job"');
    assert.ok(tenancy >= 0, "the freelancer job stopped resolving tenant scope");
    assert.ok(element > tenancy,
      "the element gate runs before tenancy — a cross-tenant id would answer 403 where the house answers not-found");
  });

  it("the freelancer's OWN view is left to FreelancerAccessConfig", () => {
    // The named alternative authority. If this file ever starts gating the
    // contractor's view as an agency identity, that is the "wrong client gate"
    // the checklist warns about.
    const workspace = read("src/server/freelancerWorkspace.ts");
    assert.match(workspace, /clientIdentity === "named"/,
      "the freelancer's client-naming policy is gone");
    assert.doesNotMatch(workspace, /requireClientAssociation|requireCurrentClientWorkspaceElementAccess/,
      "the contractor's own view is now being evaluated as an agency identity");
  });
});

// ── The Actions surfaces the first pass left open ──────────────────────────
//
// Classifying `agency-task` gated creating, re-associating and LISTING an
// Action. Four sibling surfaces reach the same record and were not gated,
// which meant the association was enforced on the surfaces that announce it
// and absent on the ones beside them:
//
//  • DELETE `portal/tasks` — the strongest mutation of all. PATCH refused to
//    MOVE a restricted client's Action; DELETE destroyed it.
//  • POST `portal/tasks/checklist` — writes sub-tasks and answers with the
//    whole task, so the title and notes GET withholds came back anyway.
//  • `saveFromTask` on `portal/tasks/templates` — copies an Action's title,
//    notes and steps into an agency template and returns it.
//  • GET `portal/attention/plan?alert=task:<id>` — a plain read that answers
//    with the Action's title and its notes verbatim as alert evidence.
//
// These run through the real handlers with a real governed identity: a
// manager holding one workspace-scope grant and no client policy, which is
// what makes absence meaningful (see `resolveActorClientWorkspaceElementAccess`).
describe("every Action surface answers to the association, not just the ones that announce it", () => {
  let token = "";
  let clientTaskId = "";
  let agencyTaskId = "";

  before(async () => {
    const manager = createUser({
      email: `manager-${Date.now()}@assoc.test`,
      name: "Assoc Manager",
      role: "agency-manager",
      agencyId: ourAgencyId,
      password: "assoc-smoke-pass-phrase",
    });
    // A manager, not an owner: `ownerBaseline` would pass every check and make
    // the whole block vacuous. One workspace grant migrates them into
    // canonical governance without naming any client element, so every client
    // element resolves Hidden — restricted, not un-migrated.
    await createAccessGrant({
      agencyId: ourAgencyId,
      actorUserId: ownerUserId,
      userId: manager.id,
      scope: { kind: "workspace", id: "staff" },
      environment: "live",
      capabilities: ["element.staff.schedule.view"],
    });
    token = await issueSession({
      userId: manager.id, email: manager.email, role: "agency-manager",
      agencyId: ourAgencyId, agencyIds: [ourAgencyId], activeAgencyId: ourAgencyId,
      sessionRev: manager.sessionRev ?? 0,
    });

    clientTaskId = createAgencyTask({
      agencyId: ourAgencyId, title: "Chase Our Client's invoice",
      notes: "Bank details are in the contract.", clientId: ourClientId, createdBy: ownerUserId,
    }).id;
    // The control. An Action naming NO client is agency work, and every gate
    // below must let it through — otherwise the block would pass just as well
    // if the routes started refusing everything.
    agencyTaskId = createAgencyTask({
      agencyId: ourAgencyId, title: "Renew the office insurance", createdBy: ownerUserId,
    }).id;
    // The handlers re-enter `ensureHydrated()`, which reloads the backend and
    // would drop these still-pending writes.
    await flushPendingWrites();
  });

  const deleteTask = (id: string) => withSession(token, () => tasksDelete(new NextRequest(
    `http://localhost/api/portal/tasks?id=${encodeURIComponent(id)}&operationId=${encodeURIComponent(taskDeleteOperationId(id))}`,
    { method: "DELETE", headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } },
  )));

  const post = (path: string, body: unknown) => withSession(token, () => (
    path === "checklist" ? checklistPost : templatesPost
  )(new Request(`http://localhost/api/portal/tasks/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE_NAME}=${token}` },
    body: JSON.stringify(body),
  })));

  it("refuses to DELETE an Action naming a client the caller may not see", async () => {
    const refused = await deleteTask(clientTaskId);
    assert.equal(refused.status, 403,
      "a restricted identity destroyed a client's Action — PATCH refuses to MOVE it, so this is the "
      + "wider hole of the two");
  });

  it("refuses to write OR read back sub-tasks on that Action", async () => {
    const refused = await post("checklist", { taskId: clientTaskId, action: "add", label: "Call them" });
    assert.equal(refused.status, 403,
      "sub-tasks are content of the Action, and the response returns the whole task — title and notes "
      + "the Actions list withholds");
  });

  it("refuses to clone that Action into an agency-wide template", async () => {
    const refused = await post("templates", {
      action: "saveFromTask", taskId: clientTaskId, name: "Invoice chase",
    });
    assert.equal(refused.status, 403,
      "`saveFromTask` copied a withheld Action's title, notes and steps into a template and handed "
      + "them straight back");
  });

  it("refuses to hand that Action's notes back as alert evidence", async () => {
    // The fourth surface, found in review: `/api/portal/attention/plan` is keyed
    // by alert id, and `task:<id>` builds its evidence card straight from the
    // record — `label: task.title` and a `Notes` field carrying `task.notes`
    // verbatim (resolutionPlans.ts `taskEvidence`). An agency role was the whole
    // gate, so the notes the three surfaces above now withhold were readable by
    // asking for the alert about the Action instead. It is also the sharpest of
    // the four: the others need a mutation, this is a plain GET.
    const refused = await withSession(token, () => attentionPlanGet(new Request(
      `http://localhost/api/portal/attention/plan?alert=task:${encodeURIComponent(clientTaskId)}`,
      { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } },
    )));
    assert.equal(refused.status, 403,
      "the evidence card returned a withheld Action's title and notes to a restricted identity");

    // …and the refusal is a refusal, not the route's own "never fail the banner"
    // fallback quietly answering ok:true with an empty panel.
    const body = await refused.json() as { ok?: boolean; evidence?: unknown };
    assert.notEqual(body.ok, true, "a refusal was swallowed into an empty-but-successful panel");
  });

  it("…and lets all four through for an Action that names no client", async () => {
    const plan = await withSession(token, () => attentionPlanGet(new Request(
      `http://localhost/api/portal/attention/plan?alert=task:${encodeURIComponent(agencyTaskId)}`,
      { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } },
    )));
    assert.equal(plan.status, 200, "unattached agency work was refused its own alert evidence");

    const checklist = await post("checklist", { taskId: agencyTaskId, action: "add", label: "Get quotes" });
    assert.equal(checklist.status, 200, "unattached agency work was refused; it has no client to answer for");

    const template = await post("templates", {
      action: "saveFromTask", taskId: agencyTaskId, name: `Insurance renewal ${Date.now()}`,
    });
    assert.equal(template.status, 201, "cloning unattached agency work was refused");

    const removed = await deleteTask(agencyTaskId);
    assert.equal(removed.status, 200, "deleting unattached agency work was refused");
  });
});

describe("no agency surface can take a clientId unclassified and unnoticed", () => {
  it("every classified kind is reachable, and the map has no orphans", () => {
    // Cheap completeness: each key must be used by a real surface, so a stale
    // entry cannot sit here looking like enforcement that no longer happens.
    const sources = [
      "src/app/api/portal/tasks/route.ts",
      "src/app/api/portal/tasks/checklist/route.ts",
      "src/app/api/portal/tasks/templates/route.ts",
      "src/app/api/portal/people/route.ts",
    ].map(path => readFileSync(path, "utf8")).join("\n");
    for (const kind of Object.keys(mod.CLIENT_ASSOCIATION_ELEMENT)) {
      assert.ok(sources.includes(`"${kind}"`), `${kind} is classified but nothing uses it`);
    }
  });

  it("no portal API route reaches Actions without a rule about the client", () => {
    // The sweep that stops this reopening. Naming the four surfaces above is a
    // snapshot; this asks the question of every portal route that reads the
    // task store DIRECTLY, so a new one has to answer it too — either by
    // gating, or by being added to the alternative-authority list with a
    // reason.
    //
    // Say what it does NOT cover, so a pass is not read as more than it is:
    // routes that reach Actions through a derived surface rather than an
    // `@/server/tasks` import are invisible here. `portal/notifications` is the
    // live example — `operationalAlerts` turns every open Action into an alert
    // titled with its title, for any agency role. That is a real remaining gap
    // in the alert pipeline, not an alternative authority, so it is written
    // here rather than filed in CLIENT_ASSOCIATION_ALTERNATIVE_AUTHORITY as
    // though somebody else governed it.
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (entry.name === "route.ts" && readFileSync(path, "utf8").includes('@/server/tasks')) {
          routes.push(path);
        }
      }
    };
    walk("src/app/api/portal");

    // A CALL, not a mention: an import left behind after the gate it served was
    // deleted would otherwise keep this green while the route ran ungated.
    const ungoverned = routes.filter(path => !/(requireClientAssociation|canReadClientAssociation)\s*\(/
      .test(readFileSync(path, "utf8")));
    assert.deepEqual(ungoverned.sort(), ["src/app/api/portal/search/route.ts"],
      "a portal route reads or writes Actions with no client-association rule. Gate it, or — if a "
      + "different authority genuinely governs it — name that authority in "
      + "CLIENT_ASSOCIATION_ALTERNATIVE_AUTHORITY and add it here.");

    // …and the one exception says WHY, in the same file the classification
    // lives in, rather than only here.
    assert.match(mod.CLIENT_ASSOCIATION_ALTERNATIVE_AUTHORITY["portal-search"] ?? "",
      /searchCandidateAccess/,
      "search is excused above but no longer names the authority that governs it");
  });
});

describe("the notifications feed does not leak client action titles", () => {
  // The gap the sweep's own comment missed: it collects only portal routes
  // whose text names `@/server/tasks`, so routes reaching Actions through a
  // DERIVED surface were invisible to it. `/api/portal/notifications` is one —
  // `operationalAlerts.ts` turned every open Action into an alert titled
  // "Overdue task: <title>" for any agency role, with no client filter, so the
  // titles of one client's actions were readable by someone with no access to
  // that client.
  it("an action naming a client the viewer cannot see contributes no alert", async () => {
    const { listOperationalAlerts } = await import("../src/lib/server/inbox/operationalAlerts");
    const secret = `Ship ${Math.random().toString(36).slice(2, 8)} rebrand`;
    createAgencyTask({
      agencyId: ourAgencyId,
      title: secret,
      clientId: ourClientId,
      createdBy: ownerUserId,
      dueAt: Date.now() - 86_400_000,
      priority: "urgent",
    } as Parameters<typeof createAgencyTask>[0]);
    await flushPendingWrites();

    // The owner may see their own client, so the alert IS offered to them.
    const forOwner = await withSession(ownerSession, () => listOperationalAlerts(ourAgencyId));
    assert.ok(
      forOwner.some(alert => alert.title.includes(secret)),
      "the owner's own client action stopped appearing — the filter is too strict, not just safe",
    );

    // With no resolvable actor the feed must DROP a client-named action rather
    // than include it: a feed that cannot check permission must not guess in
    // the permissive direction.
    const withoutSession = await listOperationalAlerts(ourAgencyId);
    assert.ok(
      !withoutSession.some(alert => alert.title.includes(secret)),
      "a client's action title is published to a caller whose access could not be resolved",
    );
  });
});
