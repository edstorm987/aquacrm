// MAKING AN AQUA TAG FROM INSIDE THE EDITOR.
//
//   Ed: "the aqua tag must be connected for browser to work. or anything to
//        work really other than the dev since it can just use repo files
//        directly"
//
// Before this, the editor could only CONSUME a tag somebody had created on
// another screen: `DevProject.aquaTagId` was set by no surface at all, and the
// snippet lived in four places, none of them the editor. The loop under test is
// the whole thing in one place — create/get the key, show the snippet, bind it
// to the project, verify it, and say what is true at each step.
//
// Three properties are load-bearing and each is asserted from both sides:
//
// 1. THE KEY COMES FROM THE SESSION. Never from a body. A request must not be
//    able to name a key, find some page carrying it, and call itself connected.
//    Nor may it name a tag id directly — that would be the browser gate handed
//    out on request.
// 2. ONLY A PAGE MAY CONCLUDE "TAGGED". The id is minted from the key the
//    fetched page really carried, and a check that fails never clears one that
//    a check already earned.
// 3. A CHECK IS NOT A MAP. Pressing "Check it" fetches one address; it does not
//    walk the repository, so it must leave the repository half of the last Map
//    — and the timestamp describing it — exactly as it found them.
//
// No network is used anywhere. Every address here ends in `.test`, which
// `radarSyntheticSafety` refuses before DNS is even consulted, so the failure
// path is deterministic offline; the success path injects a detector, the same
// seam `smoke-dev-project-map` uses.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// First, and statically — see the note in dev-console-request-scope.ts.
import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";

import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";

import { GET, POST } from "../src/app/api/portal/dev/projects/route";
import {
  aquaTagIdFromCheck,
  devProjectMapStatus,
  devProjectTagSentence,
  devProjectTagState,
  devProjectVisualEditorUnlocked,
  getDevProject,
  recordDevProjectMap,
  recordDevProjectTagCheck,
  saveDevProject,
} from "../src/engines/editor/server/devProjects";
import { mapProjectAquaTag } from "../src/engines/editor/server/mapProject";
import { masterTagSnippet } from "../src/server/websiteSources";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { AquaTagDetection } from "../src/lib/server/integrations/aquaTagDetection";
import type {
  DevProject,
  DevProjectMapStatus,
  DevProjectMasterTagView,
  DevProjectTagMap,
} from "../src/server/types";

const SETUP_FILE = new URL("../src/app/portal/dev-team/editor/setup/_DevEditorSetup.tsx", import.meta.url);

interface ProjectsBody {
  ok?: boolean;
  error?: string;
  project?: DevProject;
  projects?: DevProject[];
  status?: DevProjectMapStatus;
  statuses?: Record<string, DevProjectMapStatus>;
  masterTag?: DevProjectMasterTagView;
}

let seq = 0;
async function founder() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Tag Co", slug: `tag-co-${Date.now()}-${seq}` });
  const user = createUser({
    email: `owner-${agency.id}@tagloop.test`,
    name: "Operator",
    role: "agency-owner",
    agencyId: agency.id,
    password: "tag-operator-pass",
  });
  return {
    agency,
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

async function list(token: string, origin = "http://localhost"): Promise<ProjectsBody> {
  const response = await withDevMode(() => withSession(token, () =>
    GET(new NextRequest(`${origin}/api/portal/dev/projects`))));
  return await response.json() as ProjectsBody;
}

/** A project belonging to `token`'s agency, created through the real endpoint. */
async function project(token: string, fields: Record<string, unknown> = {}): Promise<DevProject> {
  const created = await send(token, { action: "save", name: "Tagged project", ...fields });
  assert.equal(created.body.ok, true, created.body.error ?? "");
  return created.body.project!;
}

function detection(overrides: Partial<AquaTagDetection> = {}): AquaTagDetection {
  return {
    url: "https://shop.test/",
    finalUrl: "https://shop.test/",
    reachable: true,
    tagPresent: true,
    keyMatches: true,
    detectedSiteKey: "aqua_from_the_page",
    forms: { total: 0, capturable: 0 },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("the tag the editor is handed", () => {
  it("creates-or-gets the agency key and hands over a ready-to-paste snippet", async () => {
    const { token } = await founder();
    const body = await list(token);
    assert.equal(body.ok, true);
    const tag = body.masterTag!;
    assert.ok(tag.siteKey, "the listing call is what mints the key — there is no separate create step");
    assert.match(tag.snippet, /<script/);
    assert.match(tag.snippet, /aqua-tag\.js/);
    assert.match(tag.snippet, new RegExp(`data-site-key="${tag.siteKey}"`));
  });

  it("builds the snippet with masterTagSnippet, not a fifth format of its own", async () => {
    const { token } = await founder();
    const tag = (await list(token)).masterTag!;
    assert.equal(tag.snippet, masterTagSnippet(tag.origin, tag.siteKey));
    assert.equal(tag.scriptUrl, `${tag.origin}/aqua-tag.js`);
  });

  it("never rotates the key — it is already sitting in other people's HTML", async () => {
    const { token } = await founder();
    const first = (await list(token)).masterTag!.siteKey;
    const second = (await list(token)).masterTag!.siteKey;
    assert.equal(second, first);
  });

  it("hands each agency ITS OWN key", async () => {
    const mine = await founder();
    const theirs = await founder();
    assert.notEqual((await list(mine.token)).masterTag!.siteKey, (await list(theirs.token)).masterTag!.siteKey);
  });

  it("carries the tag's public facts and nothing that is a secret", async () => {
    const { token } = await founder();
    const tag = (await list(token)).masterTag!;
    assert.deepEqual(
      Object.keys(tag).sort(),
      ["origin", "originIsFallback", "scriptUrl", "siteKey", "snippet"],
      "the site key is public by design; a token or a provider value is not, and none may appear here",
    );
    assert.doesNotMatch(JSON.stringify(tag), /token|secret|password|bearer/i);
  });

  it("says out loud when the snippet points somewhere no visitor can reach", async () => {
    const { token } = await founder();
    const saved = process.env.NEXT_PUBLIC_PORTAL_BASE_URL;
    try {
      delete process.env.NEXT_PUBLIC_PORTAL_BASE_URL;
      const local = (await list(token, "http://localhost")).masterTag!;
      assert.equal(local.originIsFallback, true, "a localhost snippet is a dud and must be flagged");

      process.env.NEXT_PUBLIC_PORTAL_BASE_URL = "https://crm.aqua-public-test.com";
      const live = (await list(token, "http://localhost")).masterTag!;
      assert.equal(live.originIsFallback, false);
      assert.match(live.snippet, /https:\/\/crm\.aqua-public-test\.com\/aqua-tag\.js/);
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_PORTAL_BASE_URL;
      else process.env.NEXT_PUBLIC_PORTAL_BASE_URL = saved;
    }
  });

  it("still answers the no-argument call the existing listing test makes", async () => {
    const { token } = await founder();
    const response = await withDevMode(() => withSession(token, () => GET()));
    const body = await response.json() as ProjectsBody;
    assert.equal(body.ok, true);
    assert.ok(body.masterTag?.siteKey, "the request is only used for the origin, so it stays optional");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("connecting the tag to a project", () => {
  it("saves the address it was given, normalised, and checks THAT", async () => {
    const { token } = await founder();
    const created = await project(token, { name: "Address saved" });
    const result = await send(token, { action: "connect-tag", id: created.id, siteUrl: "shop.aqua-check.test" });

    assert.equal(result.status, 200);
    assert.equal(result.body.project?.siteUrl, "https://shop.aqua-check.test/", "what is checked is what is stored");
    assert.equal(result.body.project?.map?.tag?.url, "https://shop.aqua-check.test/");
  });

  it("records a failed check as a result, and leaves the project untagged", async () => {
    const { token } = await founder();
    const created = await project(token, { name: "Not installed yet" });
    const result = await send(token, { action: "connect-tag", id: created.id, siteUrl: "nothing-here.test" });

    assert.equal(result.body.project?.aquaTagId, undefined, "no page answered, so nothing is tagged");
    assert.equal(result.body.status?.browserAvailable, false, "and there is no browser");
    assert.equal(result.body.project?.map?.tag?.reachable, false);
    assert.ok(result.body.project?.map?.tag?.error, "why it failed is written down, not swallowed");
  });

  it("REFUSES a tag id sent in the body — the gate is not handed out on request", async () => {
    const { token } = await founder();
    const created = await project(token, { name: "Forged" });
    const result = await send(token, {
      action: "connect-tag",
      id: created.id,
      siteUrl: "forged.test",
      aquaTagId: "aqua_forged_by_the_caller",
      siteKey: "aqua_forged_by_the_caller",
      masterSiteKey: "aqua_forged_by_the_caller",
    });

    assert.equal(result.status, 200, "the extra fields are ignored, not an error");
    assert.equal(result.body.project?.aquaTagId, undefined, "a body cannot claim a project is tagged");
    assert.equal(getDevProject(created.agencyId, created.id)?.aquaTagId, undefined, "…and nothing was persisted either");
  });

  it("reads no key from the body at all — the route only ever asks the session's agency", async () => {
    const source = await readFile(new URL("../src/app/api/portal/dev/projects/route.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /body\.(siteKey|masterSiteKey|aquaTag(?!Id))/);
    assert.match(source, /ensureAgencyMasterSiteKey\(session\.agencyId\)/);
  });

  it("an UNREACHABLE check never clears an id an earlier check earned", async () => {
    // `.test` addresses are refused before DNS, so this check comes back
    // unreachable — the INDETERMINATE case. Revocation is reserved for a page
    // that was READ and did not carry the tag; see "revoking" below.
    const { token } = await founder();
    const created = await project(token, { name: "Briefly down" });
    // Earned the honest way: a page answered with this agency's key.
    const tagged = recordDevProjectTagCheck({
      agencyId: created.agencyId,
      id: created.id,
      actorUserId: created.updatedBy,
      tag: { url: "https://live.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_earned", checkedAt: 1_000 },
    })!;
    assert.equal(tagged.aquaTagId, "aqua_earned");

    const result = await send(token, { action: "connect-tag", id: created.id, siteUrl: "live.test" });
    assert.equal(result.body.project?.map?.tag?.reachable, false, "this case IS the unreachable one, or it proves nothing");
    assert.equal(result.body.project?.aquaTagId, "aqua_earned", "a site that is briefly down is not a site that lost its tag");
  });

  it("is a check, not a map: the repository half and its timestamp survive untouched", async () => {
    const { token } = await founder();
    const created = await project(token, { name: "Mapped already", repository: "o/r" });
    recordDevProjectMap({
      agencyId: created.agencyId,
      id: created.id,
      actorUserId: created.updatedBy,
      map: {
        lastMappedAt: 4_242,
        lastMappedBy: created.updatedBy,
        repo: { source: "github", repository: "o/r", ref: "main", fileCount: 2_914, mappableCount: 300, directories: ["src"], truncated: false, mappedAt: 4_242 },
      },
    });

    const result = await send(token, { action: "connect-tag", id: created.id, siteUrl: "check-only.test" });
    assert.equal(result.body.project?.map?.repo?.fileCount, 2_914, "the walk is not re-run and not forgotten");
    assert.equal(result.body.project?.map?.lastMappedAt, 4_242, "…and the card cannot claim the tree was just re-read");
    assert.equal(result.body.project?.map?.tag?.url, "https://check-only.test/", "only the tag half moved");
  });

  it("asks for the address rather than checking nothing", async () => {
    const { token } = await founder();
    const created = await project(token, { name: "No address" });
    const result = await send(token, { action: "connect-tag", id: created.id });
    assert.equal(result.status, 400);
    assert.match(result.body.error ?? "", /address/i);
  });

  it("refuses an address the browser could never load", async () => {
    const { token } = await founder();
    const created = await project(token, { name: "Bad scheme" });
    const result = await send(token, { action: "connect-tag", id: created.id, siteUrl: "javascript:alert(1)" });
    assert.equal(result.status, 400);
    assert.equal(getDevProject(created.agencyId, created.id)?.siteUrl, undefined, "and it is not stored either");
  });

  it("asks which project when none is named", async () => {
    const { token } = await founder();
    const result = await send(token, { action: "connect-tag", siteUrl: "somewhere.test" });
    assert.equal(result.status, 400);
  });

  it("refuses to connect a tag to ANOTHER agency's project", async () => {
    const mine = await founder();
    const theirs = await founder();
    const created = await project(theirs.token, { name: "Theirs" });
    const result = await send(mine.token, { action: "connect-tag", id: created.id, siteUrl: "elsewhere.test" });
    assert.equal(result.status, 404, "a cross-tenant id must not resolve, let alone be checked");
  });

  it("is behind the same gate as the rest of the endpoint — no Dev Mode, no check", async () => {
    const { token } = await founder();
    const created = await project(token, { name: "Gated" });
    // The same request, WITHOUT withDevMode.
    const response = await withSession(token, () => POST(new Request(
      "http://localhost/api/portal/dev/projects",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "connect-tag", id: created.id, siteUrl: "gated.test" }) },
    )));
    assert.equal(response.status, 403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("binding — what may conclude 'tagged'", () => {
  it("a page that really answers mints the id from the key IT carried, and that is the browser", async () => {
    const { token, agency } = await founder();
    const created = await project(token, { name: "Answers", siteUrl: "shop.test" });
    assert.equal(devProjectVisualEditorUnlocked(created), false, "before the check: no browser");

    const tag = await mapProjectAquaTag(
      { agencyId: agency.id, project: created, masterSiteKey: "aqua_the_real_key", actorUserId: created.updatedBy },
      { now: 6_000, detect: async () => detection({ detectedSiteKey: "aqua_the_real_key" }) },
    );
    const bound = recordDevProjectTagCheck({ agencyId: agency.id, id: created.id, tag: tag!, actorUserId: created.updatedBy })!;

    assert.equal(bound.aquaTagId, "aqua_the_real_key", "the id is what the page carried, not what anyone typed");
    assert.equal(devProjectVisualEditorUnlocked(bound), true, "after the check: browser");
    assert.equal(getDevProject(agency.id, created.id)?.aquaTagId, "aqua_the_real_key", "and it persisted");
  });

  it("somebody ELSE's tag on the page is not this project's tag", async () => {
    const { token, agency } = await founder();
    const created = await project(token, { name: "Wrong key", siteUrl: "shop.test" });
    const tag = await mapProjectAquaTag(
      { agencyId: agency.id, project: created, masterSiteKey: "aqua_ours", actorUserId: created.updatedBy },
      { detect: async () => detection({ keyMatches: false, detectedSiteKey: "aqua_someone_else" }) },
    );
    const bound = recordDevProjectTagCheck({ agencyId: agency.id, id: created.id, tag: tag!, actorUserId: created.updatedBy })!;
    assert.equal(bound.aquaTagId, undefined, "present is not the same as ours");
    assert.equal(devProjectMapStatus(bound).browserAvailable, false);
  });

  it("Map and Check it mint — and REVOKE — through ONE rule, so they cannot drift", () => {
    // THE REVOKE RULE, pinned here loudly because its predecessor pinned the
    // opposite ("a failure preserves, never revokes") and that pin held a real
    // defect in place: browserAvailable=true beside tagState="absent", the card
    // contradicting itself in two colours.
    //
    //   absent       (page read fine, snippet not there)      → REVOKE
    //   foreign      (page read fine, different site key)     → REVOKE
    //   dead-snippet (snippet there, script cannot load)      → REVOKE
    //   unreachable  (page could not be read at all)          → KEEP
    const answering: DevProjectTagMap = { url: "https://a.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_k", checkedAt: 1 };
    const foreign: DevProjectTagMap = { ...answering, detectedSiteKey: "aqua_other", keyMatches: false };
    const absent: DevProjectTagMap = { url: "https://a.test/", reachable: true, tagPresent: false, keyMatches: false, checkedAt: 1 };
    const unreachable: DevProjectTagMap = { url: "https://a.test/", reachable: false, tagPresent: false, keyMatches: false, checkedAt: 1, error: "timed out" };
    // The live client failure, 2026-08-21: right key, snippet present, src
    // pointing at localhost — installed but DEAD, and the browser genuinely
    // cannot work.
    const dead: DevProjectTagMap = { ...answering, scriptSrc: "http://localhost:3032/aqua-tag.js", scriptUnloadableReason: "The snippet loads its script from http://localhost:3032, which only exists on the machine that generated it." };

    assert.equal(aquaTagIdFromCheck(answering, undefined), "aqua_k");
    assert.equal(aquaTagIdFromCheck(foreign, undefined), undefined);
    assert.equal(aquaTagIdFromCheck(dead, undefined), undefined, "a dead snippet must not MINT: present with our key is still not a tag that runs");
    assert.equal(aquaTagIdFromCheck(absent, "aqua_earned"), undefined, "absent is a DEFINITIVE no: the page answered without the tag — revoked");
    assert.equal(aquaTagIdFromCheck(foreign, "aqua_earned"), undefined, "foreign is a DEFINITIVE no: somebody else's tag answers there — revoked");
    assert.equal(aquaTagIdFromCheck(dead, "aqua_earned"), undefined, "dead-snippet is a DEFINITIVE no: no visitor's browser can load the script — revoked");
    assert.equal(aquaTagIdFromCheck(unreachable, "aqua_earned"), "aqua_earned", "unreachable is INDETERMINATE: nothing was read, so nothing is taken away");
    assert.equal(aquaTagIdFromCheck(undefined, "aqua_earned"), "aqua_earned", "no check at all changes nothing");
  });

  it("a Map whose detection sees an unloadable src carries BOTH new fields onto the record", async () => {
    const { token, agency } = await founder();
    const created = await project(token, { name: "Localhost snippet", siteUrl: "shop.test" });
    const tag = await mapProjectAquaTag(
      { agencyId: agency.id, project: created, masterSiteKey: "aqua_ours", actorUserId: created.updatedBy },
      {
        detect: async () => detection({
          detectedSiteKey: "aqua_ours",
          scriptSrc: "http://localhost:3032/aqua-tag.js",
          scriptLoadable: { ok: false, reason: "The snippet loads its script from http://localhost:3032, which only exists on the machine that generated it. Set NEXT_PUBLIC_PORTAL_BASE_URL to the public portal address and paste a regenerated snippet." },
        }),
      },
    );
    assert.equal(tag?.scriptSrc, "http://localhost:3032/aqua-tag.js");
    assert.match(tag?.scriptUnloadableReason ?? "", /NEXT_PUBLIC_PORTAL_BASE_URL/, "the reason travels VERBATIM — it is the fix");

    const bound = recordDevProjectTagCheck({ agencyId: agency.id, id: created.id, tag: tag!, actorUserId: created.updatedBy })!;
    assert.equal(bound.aquaTagId, undefined, "present + keyMatches + dead src must not unlock the browser");
    assert.equal(devProjectTagState(bound), "dead-snippet");
  });

  it("…and a LOADABLE src leaves the record clean — ok:true is not a reason", async () => {
    const { token, agency } = await founder();
    const created = await project(token, { name: "Healthy snippet", siteUrl: "shop.test" });
    const tag = await mapProjectAquaTag(
      { agencyId: agency.id, project: created, masterSiteKey: "aqua_ours", actorUserId: created.updatedBy },
      { detect: async () => detection({ detectedSiteKey: "aqua_ours", scriptSrc: "https://crm.aqua-public.example/aqua-tag.js", scriptLoadable: { ok: true } }) },
    );
    assert.equal(tag?.scriptSrc, "https://crm.aqua-public.example/aqua-tag.js");
    assert.equal(tag?.scriptUnloadableReason, undefined);
    const bound = recordDevProjectTagCheck({ agencyId: agency.id, id: created.id, tag: tag!, actorUserId: created.updatedBy })!;
    assert.equal(bound.aquaTagId, "aqua_ours", "a loadable script changes nothing about the earn path");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("revoking — a tag that stops answering takes the browser with it", () => {
  it("a snippet removed from the site revokes the id, and the card stops contradicting itself", async () => {
    const { token, agency } = await founder();
    const created = await project(token, { name: "Snippet removed" });
    // Earned the honest way first.
    recordDevProjectTagCheck({
      agencyId: agency.id,
      id: created.id,
      actorUserId: created.updatedBy,
      tag: { url: "https://live.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_earned", checkedAt: 1_000 },
    });
    // Then the page is read fine and the snippet is gone.
    const revoked = recordDevProjectTagCheck({
      agencyId: agency.id,
      id: created.id,
      actorUserId: created.updatedBy,
      tag: { url: "https://live.test/", reachable: true, tagPresent: false, keyMatches: false, checkedAt: 2_000 },
    })!;
    assert.equal(revoked.aquaTagId, undefined, "the tag no longer answers, so the project no longer holds it");

    const status = devProjectMapStatus(revoked);
    assert.equal(status.tagState, "absent");
    assert.equal(status.browserAvailable, false, "'Browser available' in green beside 'until it answers there is no browser' was the defect");
    assert.match(status.tagSentence, /no browser/i, "…and the sentence agrees with the gate");
    assert.equal(getDevProject(agency.id, created.id)?.aquaTagId, undefined, "the revocation persisted");
  });

  it("a page taken over by somebody ELSE's tag revokes the id too", async () => {
    const { token, agency } = await founder();
    const created = await project(token, { name: "Key swapped" });
    recordDevProjectTagCheck({
      agencyId: agency.id,
      id: created.id,
      actorUserId: created.updatedBy,
      tag: { url: "https://live.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_earned", checkedAt: 1_000 },
    });
    const revoked = recordDevProjectTagCheck({
      agencyId: agency.id,
      id: created.id,
      actorUserId: created.updatedBy,
      tag: { url: "https://live.test/", reachable: true, tagPresent: true, keyMatches: false, detectedSiteKey: "aqua_someone_else", checkedAt: 2_000 },
    })!;
    assert.equal(revoked.aquaTagId, undefined, "another agency's tag answering there is worse than none");
    const status = devProjectMapStatus(revoked);
    assert.equal(status.tagState, "foreign");
    assert.equal(status.browserAvailable, false);
    assert.match(status.tagSentence, /different site key/i);
    assert.match(status.tagSentence, /no browser/i, "the foreign sentence names the consequence, not just the key");
  });

  it("a re-check that finds the snippet DEAD revokes too — installed is not running", async () => {
    // The exact live sequence: verified while the check only read HTML, then
    // the loadability half landed and saw the src no visitor can fetch. The
    // browser genuinely cannot work, so an earned id does not survive it.
    const { token, agency } = await founder();
    const created = await project(token, { name: "Dead snippet" });
    recordDevProjectTagCheck({
      agencyId: agency.id,
      id: created.id,
      actorUserId: created.updatedBy,
      tag: { url: "https://live.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_earned", checkedAt: 1_000 },
    });
    const reason = "The snippet loads its script from http://localhost:3032, which only exists on the machine that generated it. Set NEXT_PUBLIC_PORTAL_BASE_URL to the public portal address and paste a regenerated snippet.";
    const revoked = recordDevProjectTagCheck({
      agencyId: agency.id,
      id: created.id,
      actorUserId: created.updatedBy,
      tag: { url: "https://live.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_earned", scriptSrc: "http://localhost:3032/aqua-tag.js", scriptUnloadableReason: reason, checkedAt: 2_000 },
    })!;
    assert.equal(revoked.aquaTagId, undefined, "the browser cannot work, so the gate closes");

    const status = devProjectMapStatus(revoked);
    assert.equal(status.tagState, "dead-snippet");
    assert.equal(status.browserAvailable, false);
    assert.equal(status.tagVerified, false, "'verified' means the tag RUNS for a visitor — a dead snippet is not verified");
    assert.ok(status.tagSentence.includes(reason), "the loadability reason is printed VERBATIM — it already names the env fix");
    assert.match(status.tagSentence, /no browser/i);
    assert.ok(status.missing.some(line => line.includes(reason)), "the missing line names the dead snippet, not 'no tag connected'");
    assert.equal(getDevProject(agency.id, created.id)?.aquaTagId, undefined, "the revocation persisted");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("saying what is true at each step", () => {
  const base = {
    id: "devproj_words", agencyId: "agency_words", name: "Words", kind: "software" as const,
    repository: "", ref: "main", createdBy: "u", updatedBy: "u", createdAt: 0, updatedAt: 0,
  };
  const withTag = (tag: DevProjectTagMap, extra: Partial<DevProject> = {}): DevProject =>
    ({ ...base, ...extra, map: { tag, lastMappedAt: 1, lastMappedBy: "u" } });

  it("no tag at all: the browser needs one, and Dev mode does not", () => {
    const fresh: DevProject = { ...base };
    assert.equal(devProjectTagState(fresh), "none");
    const sentence = devProjectTagSentence(fresh);
    assert.match(sentence, /no browser/i);
    assert.match(sentence, /Dev mode works without one/i, "Ed's rule, told to the operator");
    assert.match(sentence, /repository files directly/i);
  });

  it("an address but no check yet says so rather than claiming absence", () => {
    const waiting: DevProject = { ...base, siteUrl: "https://shop.test/" };
    assert.equal(devProjectTagState(waiting), "unchecked");
    assert.match(devProjectTagSentence(waiting), /has not been checked yet/i);
  });

  it("snippet not installed is different from site unreachable", () => {
    const absent = withTag({ url: "https://shop.test/", reachable: true, tagPresent: false, keyMatches: false, checkedAt: 2 });
    assert.equal(devProjectTagState(absent), "absent");
    assert.match(devProjectTagSentence(absent), /snippet is not on the page/i);

    const dead = withTag({ url: "https://shop.test/", reachable: false, tagPresent: false, keyMatches: false, checkedAt: 2, error: "The site could not be reached." });
    assert.equal(devProjectTagState(dead), "unreachable");
    assert.match(devProjectTagSentence(dead), /could not be read/i);
    assert.match(devProjectTagSentence(dead), /The site could not be reached\./, "the reason is repeated, not hidden");
  });

  it("a foreign key is named as a foreign key", () => {
    const foreign = withTag({ url: "https://shop.test/", reachable: true, tagPresent: true, keyMatches: false, detectedSiteKey: "aqua_theirs", checkedAt: 2 });
    assert.equal(devProjectTagState(foreign), "foreign");
    assert.match(devProjectTagSentence(foreign), /different site key/i);
  });

  it("installed and answering says the browser is available", () => {
    const live = withTag(
      { url: "https://shop.test/", finalUrl: "https://shop.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_k", checkedAt: 2 },
      { aquaTagId: "aqua_k" },
    );
    assert.equal(devProjectTagState(live), "answering");
    assert.match(devProjectTagSentence(live), /answering at https:\/\/shop\.test\//);
    assert.match(devProjectTagSentence(live), /browser is available/i);
  });

  it("answering at a DIFFERENT address after a redirect is its own sentence", () => {
    const moved = withTag(
      { url: "https://shop.test/", finalUrl: "https://www.shop.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_k", checkedAt: 2 },
      { aquaTagId: "aqua_k" },
    );
    assert.equal(devProjectTagState(moved), "redirected");
    const sentence = devProjectTagSentence(moved);
    assert.match(sentence, /https:\/\/www\.shop\.test\//, "the address that actually answered");
    assert.match(sentence, /rather than https:\/\/shop\.test\//, "…and the one that was asked for");
  });

  it("a trailing slash is not a redirect worth reporting", () => {
    const same = withTag(
      { url: "https://shop.test", finalUrl: "https://shop.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_k", checkedAt: 2 },
      { aquaTagId: "aqua_k" },
    );
    assert.equal(devProjectTagState(same), "answering", "noise is not news");
  });

  // ── THE EIGHTH STATE ───────────────────────────────────────────────────────
  // These used to be the pinned SEVEN. "dead-snippet" joined on 2026-08-21,
  // found on the first real client run: snippet on the page, right key, src
  // pointing at localhost — no visitor's browser could load it, the tag never
  // executed, and the check still said "verified". If you are here because a
  // count changed: that is deliberate, and it must never quietly become seven
  // again.

  it("installed-but-dead is its own state, and the sentence carries the reason VERBATIM", () => {
    const reason = "The snippet loads its script from http://localhost:3032, which only exists on the machine that generated it — a visitor's browser cannot reach it. Set NEXT_PUBLIC_PORTAL_BASE_URL to the public portal address and paste a regenerated snippet.";
    const dead = withTag({ url: "https://shop.test/", finalUrl: "https://shop.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_k", scriptSrc: "http://localhost:3032/aqua-tag.js", scriptUnloadableReason: reason, checkedAt: 2 });
    assert.equal(devProjectTagState(dead), "dead-snippet");
    const sentence = devProjectTagSentence(dead);
    assert.ok(sentence.includes(reason), "verbatim — the reason already names the env fix, and paraphrase is drift");
    assert.match(sentence, /no browser/i, "the consequence is named, not implied");
    assert.match(sentence, /never runs/i, "presence is not execution, said out loud");
  });

  it("dead-snippet OUTRANKS answering AND redirected — a dead tag at a redirect is still dead", () => {
    const deadAfterRedirect = withTag({ url: "https://shop.test/", finalUrl: "https://www.shop.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_k", scriptSrc: "http://localhost:3032/aqua-tag.js", scriptUnloadableReason: "dead", checkedAt: 2 });
    assert.equal(devProjectTagState(deadAfterRedirect), "dead-snippet", "'answering somewhere else' would still be a lie — it answers nowhere");
  });

  it("an OLD record without the loadability fields is NOT dead — absent means unassessed", () => {
    // parseBlob round-trips devProjects raw, so records written before
    // scriptSrc/scriptUnloadableReason existed come back exactly as stored —
    // this is that record, straight through JSON like the state file.
    const stored = JSON.parse(JSON.stringify({ url: "https://shop.test/", finalUrl: "https://shop.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_k", checkedAt: 2 })) as DevProjectTagMap;
    assert.equal(devProjectTagState(withTag(stored, { aquaTagId: "aqua_k" })), "answering", "yesterday's verified records must not wake up dead");
    assert.equal(aquaTagIdFromCheck(stored, undefined), "aqua_k", "…and the mint rule reads them the same way");
  });

  it("there are EIGHT states now, and every one of them is reachable", () => {
    // The loud pin. Each project below is the minimal record for its state;
    // together they prove the union is fully live. Add a ninth state and this
    // test is WHERE you declare it.
    const reached: Record<string, DevProject> = {
      none: { ...base },
      unchecked: { ...base, siteUrl: "https://shop.test/" },
      unreachable: withTag({ url: "https://shop.test/", reachable: false, tagPresent: false, keyMatches: false, checkedAt: 2 }),
      absent: withTag({ url: "https://shop.test/", reachable: true, tagPresent: false, keyMatches: false, checkedAt: 2 }),
      foreign: withTag({ url: "https://shop.test/", reachable: true, tagPresent: true, keyMatches: false, detectedSiteKey: "aqua_theirs", checkedAt: 2 }),
      "dead-snippet": withTag({ url: "https://shop.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_k", scriptUnloadableReason: "dead", checkedAt: 2 }),
      redirected: withTag({ url: "https://shop.test/", finalUrl: "https://www.shop.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_k", checkedAt: 2 }),
      answering: withTag({ url: "https://shop.test/", finalUrl: "https://shop.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_k", checkedAt: 2 }),
    };
    assert.equal(Object.keys(reached).length, 8, "eight situations — SEVEN was the count before dead-snippet, and this failing means the set moved again");
    for (const [state, project] of Object.entries(reached)) {
      assert.equal(devProjectTagState(project), state, `the minimal ${state} record must land in ${state}`);
      assert.ok(devProjectTagSentence(project).length > 0, `${state} has a sentence to read straight out`);
    }
  });

  it("the status the screen is handed carries the state AND the sentence", async () => {
    const { token } = await founder();
    const created = await project(token, { name: "Statused" });
    const body = await list(token);
    const status = body.statuses![created.id]!;
    assert.equal(status.tagState, "none");
    assert.equal(status.tagSentence, devProjectTagSentence(created));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("the surface the editor renders", () => {
  let source = "";
  before(async () => { source = await readFile(SETUP_FILE, "utf8"); });

  it("shows the snippet the server built, rather than assembling a fifth one", () => {
    assert.match(source, /masterTag\.snippet/);
    assert.doesNotMatch(source, /aqua-tag\.js\?/, "no hand-rolled script URL");
    assert.doesNotMatch(source, /<script src=/, "the snippet is never re-templated in the browser");
  });

  it("has a copy control for it", () => {
    assert.match(source, /clipboard\.writeText\(masterTag\.snippet\)/);
  });

  it("binds through the endpoint, and only through the endpoint", () => {
    assert.match(source, /"connect-tag"/);
    assert.match(source, /action: "connect-tag"/);
  });

  it("no longer offers a text box for the tag id — a typed tag is not a tag", () => {
    assert.doesNotMatch(source, /set\("aquaTagId"/, "the id is set by a check, not by typing");
    assert.doesNotMatch(source, /onChange=\{event => set\("aquaTagId", event\.target\.value\)\}/);
    // The previous version of this test pinned the OPPOSITE — that a save
    // carries `aquaTagId: draft.aquaTagId` through. That made the save body a
    // spoofable browser unlock: any client able to POST a save could plant the
    // gate. The SERVER preserves the earned value now, so a save must not send
    // the field at all (the draft may still hold it, for display only).
    assert.doesNotMatch(source, /aquaTagId: draft\.aquaTagId/, "a save body must never carry the browser gate");
  });

  it("repeats Ed's rule where the operator is standing", () => {
    assert.match(source, /Dev mode never needed one/);
    assert.match(source, /reads the repository files directly/);
  });

  it("words a dead snippet in the WARNING tone — never the success green", () => {
    // The card renders `status.tagSentence` verbatim; the tone map is the one
    // piece of state-awareness it keeps, so the eighth state must be in it.
    assert.match(source, /"dead-snippet": "text-\[color:var\(--dev-warning\)\]"/);
  });

  it("never renders a secret — the site key is the only credential it touches", () => {
    // Whatever the screen reads off the tag view is what it can leak. The view
    // itself is public by design (a key that ships in page HTML, and the URLs
    // built from it), so pinning the READS to that set is what keeps a token or
    // a provider value from ever being rendered here by a later change.
    const read = new Set([...source.matchAll(/masterTag\.([A-Za-z]+)/g)].map(match => match[1]!));
    const allowed = new Set(["siteKey", "snippet", "scriptUrl", "origin", "originIsFallback"]);
    for (const field of read) {
      assert.ok(allowed.has(field), `the screen reads masterTag.${field}, which is not one of the tag's public facts`);
    }
    assert.doesNotMatch(source, /payload\.(token|secret|connection)/i, "and it never reaches for a credential on the payload");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("what a save may do to the gate — nothing", () => {
  // The gap that let the previous pass ship: the save action still read
  // `body.aquaTagId` straight into the record, so any client that could POST a
  // save could switch the browser on without a tag ever answering. Both sides
  // are pinned: a supplied value is refused out loud, and an omitted one
  // preserves what a real check earned.

  it("REFUSES a save that carries a tag id — the gate is not handed out on request", async () => {
    const { token, agency } = await founder();
    const created = await project(token, { name: "No unlock by save" });
    const result = await send(token, { action: "save", id: created.id, name: created.name, aquaTagId: "aqua_forged_by_the_caller" });
    assert.equal(result.status, 400, "refused out loud, so a caller that thinks it can set the gate finds out");
    assert.match(result.body.error ?? "", /Map or Check it/i);
    assert.equal(getDevProject(agency.id, created.id)?.aquaTagId, undefined, "and nothing was persisted");
  });

  it("a NEW project cannot be born tagged either", async () => {
    const { token } = await founder();
    const result = await send(token, { action: "save", name: "Born tagged?", aquaTagId: "aqua_forged_by_the_caller" });
    assert.equal(result.status, 400);
    assert.equal(result.body.project, undefined);
  });

  it("a save that OMITS the tag id preserves the one a check earned", async () => {
    const { token, agency } = await founder();
    const created = await project(token, { name: "Keeps its tag" });
    recordDevProjectTagCheck({
      agencyId: agency.id,
      id: created.id,
      actorUserId: created.updatedBy,
      tag: { url: "https://live.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: "aqua_earned", checkedAt: 1_000 },
    });
    const renamed = await send(token, { action: "save", id: created.id, name: "Renamed, still tagged" });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.project?.aquaTagId, "aqua_earned", "the SERVER carries the gate through a save; the client never does");
    assert.equal(renamed.body.project?.name, "Renamed, still tagged");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("the editor hears about the tag Settings just verified", () => {
  // The defect: `DevEditorSetup` is rendered inside the editor's inspector, but
  // the editor fetched `/api/portal/dev/projects` exactly once on mount — so
  // connect a tag → verify → the browser stayed off until a full page reload.
  // The fix is a refresh signal: Settings dispatches a window CustomEvent after
  // any successful mutation, and the editor listens, re-fetches, and re-derives
  // the browser from the fresh statuses.
  const EDITOR_FILE = new URL("../src/engines/editor/DevEditor.tsx", import.meta.url);
  let setup = "";
  let editor = "";
  before(async () => {
    setup = await readFile(SETUP_FILE, "utf8");
    editor = await readFile(EDITOR_FILE, "utf8");
  });

  it("Settings announces on window after any successful mutation", () => {
    assert.match(setup, /export const DEV_PROJECTS_CHANGED_EVENT = "aqua:dev-projects-changed"/);
    assert.match(setup, /window\.dispatchEvent\(new CustomEvent\(DEV_PROJECTS_CHANGED_EVENT\)\)/);
    // Save/delete, Map and Check it each announce — three mutate paths, three
    // announcements, all of them AFTER the success guard has passed.
    const announcements = [...setup.matchAll(/announceProjectsChanged\(\);/g)];
    assert.ok(announcements.length >= 3, "save, map and check-tag must each announce");
  });

  it("…including on a connect-tag / Check it success, the case the defect was about", () => {
    const start = setup.indexOf("async function checkTag");
    assert.ok(start > -1, "checkTag is where a verify lands");
    const checkTag = setup.slice(start, setup.indexOf("return (", start));
    assert.match(checkTag, /announceProjectsChanged\(\)/, "a verified tag must reach the editor around this panel");
    // Dispatched only on the success path: after the not-ok guard returns.
    assert.ok(
      checkTag.indexOf("payload.ok || !payload.project") < checkTag.indexOf("announceProjectsChanged()"),
      "the announcement sits after the failure guard, not before it",
    );
  });

  it("the editor listens, and the listener re-fetches projects AND statuses", () => {
    assert.match(editor, /window\.addEventListener\(DEV_PROJECTS_CHANGED_EVENT/);
    assert.match(editor, /window\.removeEventListener\(DEV_PROJECTS_CHANGED_EVENT/, "…and cleans up after itself");
    assert.match(editor, /const onProjectsChanged = \(\) => load\(true\)/, "the handler is the same load the mount uses");
    assert.match(editor, /setProjects\(nextProjects\)/);
    assert.match(editor, /setProjectStatuses\(nextStatuses\)/);
  });

  it("a tag that just became verified points the browser at the MAPPED address", () => {
    // `aquaTagBrowserUrl` — the finalUrl MAP recorded, with the typed siteUrl
    // only as fallback. Seeding from the typed address is the origin-trust bug
    // the bridge module documents at length.
    assert.match(editor, /setBrowserUrl\(aquaTagBrowserUrl\(openProject\)\)/);
    assert.match(editor, /wasVerified/);
    assert.match(editor, /isVerified/);
  });
});
