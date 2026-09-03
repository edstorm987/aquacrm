// An AI may never be worth more than the person it acts for.
//
// Ed, 2026-08-27: *"Aqua AI editor must be bound to the user's permissions to
// prevent unauthorised changes in areas!!! same for all AI scopes actually."*
//
// ── The shape of the defect ──────────────────────────────────────────────
//
// `ExternalAssistantAuth` had no user in it at all. A key carried its own list
// of modules and permissions, chosen once and checked against nothing else
// afterwards — so an assistant could read what its creator could not, kept
// working after that person's access was narrowed, and kept working after they
// were revoked or removed. The last one is the sharp end: issue #22 made
// revocation immediate for SESSIONS, and AI had no equivalent.
//
// A delegate's authority is the intersection of what it was granted and what
// its principal can still do TODAY. Re-derived per request, never cached into
// the key, because caching it would reintroduce the defect one indirection
// later.
//
// ── The mistake this file also exists to prevent ─────────────────────────
//
// The first attempt read `key.createdBy` as a user id. It holds an EMAIL — it
// was named before there was an access kernel — so every key ever minted would
// have been refused. A change that looks like a security fix and is actually an
// outage is worse than the hole, and the email path is pinned below.

// First, and statically — see the note in dev-console-request-scope.ts.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { createRequire } from "node:module";

process.env.PORTAL_BACKEND ??= "memory";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

import {
  delegatedAuthorityForKey,
  principalUserIdFor,
  EXTERNAL_ASSISTANT_MODULE_ELEMENT,
  EXTERNAL_ASSISTANT_PERMISSION_REQUIREMENT,
} from "../src/lib/server/assistants/externalAssistantDelegation";
import { EXTERNAL_ASSISTANT_MODULES } from "../src/lib/server/assistants/externalAssistantApi";
import { EXTERNAL_ASSISTANT_PERMISSIONS } from "../src/lib/server/assistants/externalAssistantKeys";
import { createAccessGrant, revokeAccessGrant } from "../src/server/accessControl";
import {
  ASSISTANT_CONTEXT_SECTIONS,
  assistantContextScopeFromCapabilities,
} from "../src/lib/server/assistants/assistantContextScope";
import { buildAssistantBusinessContext } from "../src/lib/server/assistants/assistantBusinessContext";
import { agencyElementForModule } from "../src/lib/server/portal/pluginClientElement";
import { authenticateExternalAssistant } from "../src/lib/server/assistants/externalAssistantApi";
import { createExternalAssistantApiKey } from "../src/lib/server/assistants/externalAssistantKeys";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { ensureHydrated, reset } from "../src/server/storage";

let agencyId = "";
let ownerId = "";
let staffId = "";

before(async () => {
  await ensureHydrated();
  await reset();
  agencyId = createAgency({ name: "AI binding", slug: "ai-binding" }).id;
  ownerId = createUser({ email: "owner@ai.test", password: "Smoke-pass-123!", name: "Owner", role: "agency-owner", agencyId }).id;
  staffId = createUser({ email: "staff@ai.test", password: "Smoke-pass-123!", name: "Staff", role: "agency-staff", agencyId }).id;
});

const key = (over: Partial<Parameters<typeof delegatedAuthorityForKey>[0]> = {}) => ({
  agencyId,
  createdBy: "owner@ai.test",
  createdByUserId: ownerId,
  modules: ["clients", "finance", "staff"],
  permissions: ["records:read", "context:read"],
  ...over,
});

describe("every module and permission is classified", () => {
  it("no module answers without an element behind it", () => {
    // An unmapped module would be the one that answers unchecked — which is
    // exactly the hole, reintroduced by omission rather than by design.
    for (const module of EXTERNAL_ASSISTANT_MODULES) {
      assert.ok(EXTERNAL_ASSISTANT_MODULE_ELEMENT[module],
        `${module} has no element behind it, so nothing checks whether the principal may read it`);
    }
  });

  it("no permission is exercisable without an element behind it", () => {
    for (const permission of EXTERNAL_ASSISTANT_PERMISSIONS) {
      assert.ok(EXTERNAL_ASSISTANT_PERMISSION_REQUIREMENT[permission], `${permission} has no requirement`);
    }
  });

  it("the only WRITING permission needs `use`, not `view`", () => {
    // Proposing work is doing something, even though a human accepts it after.
    assert.equal(EXTERNAL_ASSISTANT_PERMISSION_REQUIREMENT["actions:propose"].action, "use");
    for (const permission of ["records:read", "context:read", "search:read", "export:read", "advisor:read"] as const) {
      assert.equal(EXTERNAL_ASSISTANT_PERMISSION_REQUIREMENT[permission].action, "view",
        `${permission} reads, so it must not demand more than view`);
    }
  });
});

describe("who the key speaks for", () => {
  it("prefers the recorded user id", () => {
    assert.equal(principalUserIdFor({ createdBy: "someone@else.test", createdByUserId: ownerId }), ownerId,
      "the durable id lost to the email, so changing an address would kill the key");
  });

  it("falls back to the EMAIL, because that is what every existing key holds", () => {
    // The mistake that would have been an outage: `createdBy` is an email, and
    // reading it as a user id refuses every key ever minted.
    assert.equal(principalUserIdFor({ createdBy: "owner@ai.test", createdByUserId: undefined }), ownerId,
      "a key minted before 2026-08-27 no longer resolves its creator");
    assert.equal(principalUserIdFor({ createdBy: "OWNER@AI.TEST", createdByUserId: undefined }), ownerId,
      "the email lookup is case-sensitive, so a capitalised address kills the key");
  });

  it("answers empty when there is nobody", () => {
    assert.equal(principalUserIdFor({ createdBy: "ghost@nowhere.test", createdByUserId: undefined }), "");
    assert.equal(principalUserIdFor({ createdBy: "", createdByUserId: undefined }), "");
  });
});

describe("an owner's key keeps what it was granted", () => {
  it("is not narrowed by grants an owner never needed", () => {
    const authority = delegatedAuthorityForKey(key());
    assert.equal(authority.ok, true);
    assert.deepEqual(authority.modules.sort(), ["clients", "finance", "staff"]);
    assert.deepEqual(authority.removedModules, []);
    assert.equal(authority.principalUserId, ownerId);
  });
});

describe("a key is refused when its principal is gone", () => {
  it("refuses a key whose creator does not exist", () => {
    const authority = delegatedAuthorityForKey(key({ createdBy: "ghost@nowhere.test", createdByUserId: "usr_ghost" }));
    assert.equal(authority.ok, false);
    assert.equal(authority.refusal, "creator_not_found");
    assert.deepEqual(authority.permissions, [], "a refused key still handed out permissions");
  });

  it("refuses a key whose creator is not in that agency", () => {
    const otherAgency = createAgency({ name: "Elsewhere", slug: "elsewhere-ai" }).id;
    const outsider = createUser({ email: "outsider@ai.test", password: "Smoke-pass-123!", name: "Out", role: "agency-owner", agencyId: otherAgency }).id;
    const authority = delegatedAuthorityForKey(key({ createdByUserId: outsider, createdBy: "outsider@ai.test" }));
    assert.equal(authority.ok, false);
    assert.equal(authority.refusal, "creator_not_in_agency",
      "a key kept working for somebody who had left the tenant");
  });
});

describe("a non-owner's key is narrowed to what they actually hold", () => {
  it("a staffer with nothing gets a refusal, not an empty success", () => {
    // An assistant that receives 200 and no data cannot tell "there is nothing"
    // from "you may not see it" — and neither can the person reading its output.
    const authority = delegatedAuthorityForKey(key({ createdByUserId: staffId, createdBy: "staff@ai.test" }));
    assert.equal(authority.ok, false);
    assert.equal(authority.refusal, "creator_has_no_access");
  });

  it("granting ONE element gives the key exactly that module, and no other", async () => {
    await createAccessGrant({
      agencyId,
      userId: staffId,
      scope: { kind: "agency", id: agencyId },
      environment: "live",
      capabilities: [
        `element.${EXTERNAL_ASSISTANT_MODULE_ELEMENT.clients}.view`,
        `element.${EXTERNAL_ASSISTANT_PERMISSION_REQUIREMENT["records:read"].element}.view`,
      ],
      actorUserId: ownerId,
      idempotencyKey: "ai-binding-grant-1",
    });

    const authority = delegatedAuthorityForKey(key({
      createdByUserId: staffId,
      createdBy: "staff@ai.test",
      modules: ["clients", "finance", "staff"],
      permissions: ["records:read", "context:read"],
    }));
    assert.equal(authority.ok, true);
    assert.deepEqual(authority.modules, ["clients"],
      "the key kept modules its principal cannot read — this is the whole defect");
    assert.ok(authority.removedModules.includes("finance"), "finance was silently retained");
    assert.ok(authority.removedModules.includes("staff"));
    // `context:read` needs workspace.overview, which this staffer was not given.
    assert.deepEqual(authority.permissions, ["records:read"],
      "the key kept a permission its principal cannot exercise");
  });

  it("cannot exceed what the KEY was granted, however much the principal holds", () => {
    // The intersection has to hold in both directions: an owner's key is still
    // limited to the modules it was minted with. Otherwise "give the assistant
    // one module" would mean nothing.
    const authority = delegatedAuthorityForKey(key({ modules: ["clients"], permissions: ["records:read"] }));
    assert.deepEqual(authority.modules, ["clients"]);
    assert.deepEqual(authority.permissions, ["records:read"]);
  });

  it("drops a module or permission that is not in the vocabulary at all", () => {
    const authority = delegatedAuthorityForKey(key({
      modules: ["clients", "not-a-module"],
      permissions: ["records:read", "not-a-permission" as never],
    }));
    assert.deepEqual(authority.modules, ["clients"]);
    assert.deepEqual(authority.permissions, ["records:read"]);
  });
});

describe("the gateway actually uses all this — driven, not grepped", () => {
  const bearer = (token: string) => new Request("https://aqua.test/api/v1/records", {
    headers: { authorization: `Bearer ${token}` },
  });

  it("a live key authenticates with its DELEGATED reach, not its stored reach", async () => {
    const minted = createExternalAssistantApiKey({
      agencyId,
      name: "Delegated reader",
      modules: ["clients", "finance"],
      permissions: ["records:read", "context:read"],
      createdBy: "staff@ai.test",
      createdByUserId: staffId,
    });
    const auth = await authenticateExternalAssistant(bearer(minted.token));
    // The staffer holds `client.overview` only — granted above.
    assert.deepEqual(auth.modules, ["clients"],
      "the gateway handed out a module the principal cannot read");
    assert.deepEqual(auth.permissions, ["records:read"]);
    assert.equal(auth.principalUserId, staffId, "the request does not record whose authority it used");
  });

  it("narrowing the principal narrows the key on the NEXT request", async () => {
    const minted = createExternalAssistantApiKey({
      agencyId,
      name: "Soon to be narrowed",
      modules: ["clients"],
      permissions: ["records:read"],
      createdBy: "staff@ai.test",
      createdByUserId: staffId,
    });
    assert.ok((await authenticateExternalAssistant(bearer(minted.token))).modules.includes("clients"));

    // Take the access away from the PERSON. The key is untouched.
    const grants = Object.values((await import("../src/server/storage")).getState().accessGrants)
      .filter(grant => grant.userId === staffId && !grant.revokedAt);
    for (const grant of grants) {
      await revokeAccessGrant({ agencyId, grantId: grant.id, actorUserId: ownerId, reason: "binding test" });
    }

    await assert.rejects(
      () => authenticateExternalAssistant(bearer(minted.token)),
      /no longer has that access/,
      "revoking the person left their assistant working — this is the defect, and it is the sharp end of it",
    );
  });

  it("authentication delegates, and refuses when the principal is gone", () => {
    const source = readFileSync("src/lib/server/assistants/externalAssistantApi.ts", "utf-8");
    assert.match(source, /delegatedAuthorityForKey\(managedKey\)/,
      "the assistant gateway no longer binds a key to the person who created it");
    assert.match(source, /assistant_principal_revoked/,
      "a key whose principal is gone is no longer refused");
    assert.match(source, /modules: delegated\.modules/,
      "the gateway hands out the key's stored modules rather than the delegated ones");
    assert.match(source, /permissions: delegated\.permissions/);
  });

  it("the unbindable legacy environment token is refused in production", () => {
    // It predates users: no creator, nothing to intersect, and revoking somebody
    // does nothing to it. Local keeps it, because that is where it is useful and
    // there is nothing to protect.
    const source = readFileSync("src/lib/server/assistants/externalAssistantApi.ts", "utf-8");
    assert.match(source, /assistant_legacy_token_unbindable/,
      "the environment token can still act with full authority in production");
    assert.match(source, /process\.env\.NODE_ENV === "production"/);
  });

  it("a new key records the durable user id, not only the email", () => {
    const route = readFileSync("src/app/api/portal/settings/external-ai/route.ts", "utf-8");
    assert.match(route, /createdByUserId: session\.userId/,
      "a new key records only an email, so changing an address would kill it");
  });
});

describe("the IN-APP AI is told only what the person may see", () => {
  // The other half of Ed's ask. `/api/assistant` gated on ROLE and then built a
  // context with every user's email, every client, and up to 500 raw entries
  // from EVERY installed module — finance and HR pay included. A manager whose
  // element access had been narrowed could not open Finance in the UI and could
  // ask the Assistant instead.
  const capabilitiesFor = (...elements: string[]) =>
    elements.flatMap(element => [`element.${element}.view`]) as never[];

  it("an owner is told everything", () => {
    const scope = assistantContextScopeFromCapabilities([], true);
    assert.equal(scope.sections.size, Object.keys(ASSISTANT_CONTEXT_SECTIONS).length);
    assert.equal(scope.allowsModule("agency-finance"), true);
    assert.deepEqual(scope.withheld, []);
  });

  it("somebody holding ONE element is told one section", () => {
    const scope = assistantContextScopeFromCapabilities(capabilitiesFor("client.overview"), false);
    assert.deepEqual([...scope.sections].sort(), ["clients", "endCustomers"]);
    assert.ok(scope.withheld.includes("team"), "the team roster was not withheld");
    assert.equal(scope.allowsModule("agency-hr"), false, "HR data went to the model anyway");
    assert.equal(scope.allowsModule("agency-finance"), false, "finance data went to the model anyway");
  });

  it("an UNCLASSIFIED module contributes nothing, rather than everything", () => {
    // The previous behaviour was the other way round: an installed module
    // nobody had thought about had its raw data sent because nothing excluded
    // it. That default is exactly backwards for a firehose.
    const scope = assistantContextScopeFromCapabilities(capabilitiesFor("workspace.settings"), false);
    assert.equal(agencyElementForModule("a-module-nobody-classified"), null);
    assert.equal(scope.allowsModule("a-module-nobody-classified"), false);
  });

  it("the built context actually OMITS what was withheld", async () => {
    // The scope is only worth anything if the builder honours it — and a
    // scope-shaped object that nothing reads is the classic way this kind of
    // fix passes its own tests and leaks anyway.
    const storage = await import("../src/server/storage");
    await storage.ensureHydrated();

    // A real installed module with real data. Without this the
    // `businessModules` assertion is VACUOUS — it passed against a build that
    // ignored the filter entirely, because the fixture had nothing installed.
    storage.mutate(state => {
      state.pluginInstalls["inst_hr"] = {
        id: "inst_hr", pluginId: "agency-hr", agencyId, enabled: true,
        config: {}, features: {}, installedAt: 1, updatedAt: 1,
      } as never;
      state.pluginData["inst_hr"] = { "pay/records": [{ userId: "usr_x", salary: 90000 }] };
    });

    const scope = assistantContextScopeFromCapabilities(capabilitiesFor("client.overview"), false);
    const { summary } = buildAssistantBusinessContext(agencyId, scope);
    assert.deepEqual(summary.team, [], "every user's name, email and role went to the model");
    assert.deepEqual(summary.pipelines, []);
    assert.deepEqual(summary.recentActivity, []);
    assert.deepEqual(summary.businessModules, {},
      "HR pay data went to the model for somebody who only holds client.overview");

    // …and the same context DOES include it for somebody who holds staff.people.
    const hrScope = assistantContextScopeFromCapabilities(capabilitiesFor("staff.people"), false);
    const hrContext = buildAssistantBusinessContext(agencyId, hrScope);
    assert.ok(hrContext.summary.businessModules["agency-hr"],
      "the filter excludes a module even from somebody who may see it — it is not a filter, it is a wall");
    assert.ok(summary.withheld.includes("team"),
      "the context does not SAY what was left out, so the model will answer from the gap");
  });

  it("the context builder cannot be called without a scope", () => {
    // A defaulted parameter would mean any future caller that forgot it
    // silently got the firehose back — which is how this happened the first
    // time. The parameter is required, and the compiler is the guard.
    const source = readFileSync("src/lib/server/assistants/assistantBusinessContext.ts", "utf-8");
    assert.match(source, /agencyId: string, scope: AssistantContextScope/,
      "the assistant context takes an optional scope again");
    assert.doesNotMatch(source, /scope: AssistantContextScope = /,
      "the scope has a default, so forgetting it restores the firehose");
  });

  it("no in-app AI route decides on a role any more", () => {
    for (const file of [
      "src/app/api/portal/advisor/radar/route.ts",
      "src/app/api/portal/advisor/radar/evidence/route.ts",
      "src/app/api/portal/advisor/radar/sources/route.ts",
      "src/app/api/portal/advisor/skills/route.ts",
      "src/app/api/portal/custom-ais/route.ts",
    ]) {
      const source = readFileSync(file, "utf-8");
      assert.doesNotMatch(source, /requireRole\(/,
        `${file} still decides an AI surface on a role, so a narrowed person passes it`);
      if (file.endsWith("/radar/route.ts")
        || file.endsWith("/radar/sources/route.ts")
        || file.endsWith("/radar/evidence/route.ts")) {
        assert.match(source, /requireCurrentAccessActor\(\)/, `${file} has no current actor binding`);
        assert.match(source, /resolveBusinessRadarCapabilityForActor\(actor, (?:action|"view")\)/,
          `${file} does not share the Business Radar element resolver`);
      } else {
        assert.match(source, /requireAssistantElement\(/, `${file} has no element gate`);
      }
    }
  });

  it("configuring an AI needs more than reading one", () => {
    // Writing the Radar policy, editing a skill and creating a custom AI are
    // configuration; a `view` on the overview must not buy them.
    for (const file of [
      "src/app/api/portal/advisor/radar/route.ts",
      "src/app/api/portal/advisor/skills/route.ts",
      "src/app/api/portal/custom-ais/route.ts",
    ]) {
      const source = readFileSync(file, "utf-8");
      if (file.endsWith("/advisor/radar/route.ts")) {
        assert.match(source, /assertWorkspaceElementAccess\(resolveActorWorkspaceElementAccess\(actor, "staff"\), "workspace\.settings", "manage"\)/,
          `${file} lets a reader configure the AI`);
      } else {
        assert.match(source, /requireAssistantElement\("workspace\.settings", "manage"\)/,
          `${file} lets a reader configure the AI`);
      }
    }
  });
});

describe("the editor AI is bound the same way", () => {
  it("every Dev Editor AI route resolves the actor before it does anything", () => {
    // These were already bound — capability, element AND path scope — and this
    // pins it so the binding cannot be dropped while the surface grows.
    for (const [file, capability] of [
      ["src/app/api/portal/dev/editor-ai/route.ts", "project.ai"],
      ["src/app/api/portal/dev/editor-ai/reply/route.ts", "project.ai"],
      ["src/app/api/portal/dev/source-edit/route.ts", "project.code"],
      ["src/app/api/portal/dev/repo-write/route.ts", "project.code"],
      ["src/app/api/portal/dev/librarian/route.ts", "project.ai"],
    ] as const) {
      const source = readFileSync(file, "utf-8");
      assert.match(source, /requireDevProjectAccess\(/,
        `${file} no longer resolves the acting person before touching a project`);
      void capability;
    }
  });

  it("the AI's own reply path reads no repository content of its own", () => {
    // The reply is built from the conversation and the context the CLIENT sent,
    // which has already been through the path guard. If this file ever started
    // reading the repo itself it would need its own scope check, and the
    // librarian hole would be back through a different door.
    const source = readFileSync("src/engines/editor/server/editorAiReply.ts", "utf-8");
    assert.doesNotMatch(source, /readFileSync|safeRealPath|readRepoFile/,
      "the editor AI reply now reads repository content directly — it needs the path scope");
  });
});

void withSession;
