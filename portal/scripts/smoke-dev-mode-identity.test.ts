// The identity model, past the single-hop happy path.
//
// `smoke-dev-mode.test.ts` proves enter → switch → exit for ONE hop from the
// real founder. Four properties Ed actually depends on were unproven, and a
// refactor of the carry-forward in `dev-mode/route.ts` would have kept the whole
// suite green:
//
//   1. exit after 2+ hops restores the EXACT person (not "an owner it finds");
//   2. the legacy fallback for a session minted before `devReturnUserId`
//      existed still behaves as documented — deliberately different from the
//      freelancer preview's fail-closed exit, and invisible until pinned;
//   3. exit clears `clientId`, so leaving the customer persona cannot leave a
//      client scope welded to a founder session;
//   4. dev-mode × preview-as-freelancer — the interaction that produced a live
//      blocker: a freelancer preview taken DURING an inspection re-minted twice
//      without carrying `devReturn*`, so the founder came out as the demo owner
//      inside the fenced demo tenant with no POV bar, `dev-mode` exit answering
//      409, and Inspector re-stashing the DEMO agency as the return target.
//      Only /logout escaped.
//
// Everything here drives the real POST handlers in-process (issueSession +
// NextRequest), so it fails against the behaviour, not the source text.

// Load-bearing FIRST import: installs the AsyncLocalStorage global that Next's
// own request store needs, before anything from `next/` is evaluated.
import { withSession } from "./dev-console-request-scope";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { POST } from "../src/app/api/auth/dev-mode/route";
import { POST as previewFreelancerPOST } from "../src/app/api/auth/preview-as-freelancer/route";
import { createFreelancer, listAgencyFreelancers } from "../src/server/freelancerAdmin";
import { issueSession, verifyToken, SESSION_COOKIE_NAME } from "../src/lib/server/auth/auth";
import { ensureHydrated, runInDataRealm } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";

process.env.PORTAL_BACKEND ??= "memory";

async function withDevModeEnabled<T>(fn: () => Promise<T>): Promise<T> {
  const saved = {
    dev: process.env.PORTAL_DEV_MODE,
    node: process.env.NODE_ENV,
    vercel: process.env.VERCEL_ENV,
  };
  process.env.PORTAL_DEV_MODE = "true";
  if (process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";
  delete process.env.VERCEL_ENV;
  try {
    return await fn();
  } finally {
    restore("PORTAL_DEV_MODE", saved.dev);
    restore("NODE_ENV", saved.node);
    restore("VERCEL_ENV", saved.vercel);
  }
}

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function request(url: string, token: string | undefined, body: unknown): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json", origin: "http://localhost" };
  if (token) headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}

const devModeRequest = (token: string | undefined, body: unknown) =>
  request("http://localhost/api/auth/dev-mode", token, body);
const previewRequest = (token: string | undefined, body: unknown) =>
  request("http://localhost/api/auth/preview-as-freelancer", token, body);

function cookieFrom(response: Response): string | undefined {
  return (response as unknown as { cookies: { get(name: string): { value: string } | undefined } })
    .cookies.get(SESSION_COOKIE_NAME)?.value;
}

let seq = 0;
async function seedRealFounder() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Ident Co", slug: `ident-co-${Date.now()}-${seq}` });
  const owner = createUser({
    email: `owner-${agency.id}@ident-co.test`,
    name: "Real Owner",
    role: "agency-owner",
    agencyId: agency.id,
    password: "real-owner-pass",
  });
  const token = issueSession({
    userId: owner.id,
    email: owner.email,
    role: "agency-owner",
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: owner.sessionRev ?? 0,
  });
  return { agency, owner, token };
}

describe("Dev Mode identity — multi-hop, and the way out", () => {
  it("three hops later, exit still returns the EXACT founder", async () => {
    const { agency, owner, token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      // Every hop must carry the stash forward. Dropping the carry-forward
      // (`session.devReturnUserId ?? …`) passes every single-hop test and
      // returns "an owner it finds" in real use.
      let current = token;
      for (const persona of ["staff", "customer", "owner"] as const) {
        const hop = await POST(devModeRequest(current, { action: "switch", persona }));
        assert.equal(hop.status, 200, `hop to ${persona} succeeded`);
        current = cookieFrom(hop)!;
        const payload = verifyToken(current);
        // The stash moved into the signed sandbox envelope when Dev Mode began
        // entering through `enterSandboxEnvironment` (26 Aug consolidation).
        // The PROPERTY is unchanged and is what the exit below actually proves;
        // these two lines pin the mechanism that carries it.
        assert.equal(payload!.sandbox?.returnUserId, owner.id, `the ${persona} hop still knows who to return to`);
        assert.equal(payload!.sandbox?.returnAgencyId, agency.id, `the ${persona} hop still knows where to return to`);
      }

      const exit = await POST(devModeRequest(current, { action: "exit" }));
      assert.equal(exit.status, 200);
      const back = verifyToken(cookieFrom(exit)!);
      assert.equal(back!.userId, owner.id, "restored the exact person who started the inspection");
      assert.equal(back!.email, owner.email);
      assert.equal(back!.agencyId, agency.id);
      assert.ok(!back!.isDemo, "back on a live session");
    });
  });

  it("exiting the customer persona leaves NO client scope behind", async () => {
    const { agency, owner, token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const asCustomer = cookieFrom(await POST(devModeRequest(token, { action: "switch", persona: "customer" })))!;
      assert.ok(verifyToken(asCustomer)!.clientId, "the customer persona really is client-scoped");

      const exit = await POST(devModeRequest(asCustomer, { action: "exit" }));
      assert.equal(exit.status, 200);
      const back = verifyToken(cookieFrom(exit)!);
      // A founder session carrying a leftover clientId is a founder fenced into
      // one client by `assertTenantScope`.
      assert.equal(back!.clientId, undefined, "the inspected client's scope does not survive the exit");
      assert.equal(back!.userId, owner.id);
      assert.equal(back!.agencyId, agency.id);
    });
  });

  it("a legacy session with no devReturnUserId still exits — to an owner of the return agency", async () => {
    // Deliberately DIFFERENT from the freelancer preview, which fails closed.
    // Cookies minted before `devReturnUserId` existed must not be stranded, so
    // exit falls back to the old owner lookup. Pinned because the difference
    // between the two siblings is otherwise invisible, and someone tidying them
    // into agreement would strand or escalate without a single test moving.
    const { agency, owner } = await seedRealFounder();
    // In the real flow this persona user is seeded by Dev Mode; the central
    // fresh-session boundary (issue #22) refuses a subject that never existed.
    const persona = createUser({
      email: `legacy-persona-${agency.id}@demo.test`,
      password: "Legacy-persona-1!",
      role: "agency-staff",
      agencyId: "demo-agency",
    });
    const legacy = issueSession({
      userId: persona.id,
      email: persona.email,
      role: "agency-staff",
      agencyId: "demo-agency",
      agencyIds: ["demo-agency"],
      activeAgencyId: "demo-agency",
      isDemo: true,
      devReturnAgencyId: agency.id,
      // devReturnUserId deliberately absent — this is the legacy shape.
      sessionRev: 0,
    });
    await withDevModeEnabled(async () => {
      const exit = await POST(devModeRequest(legacy, { action: "exit" }));
      assert.equal(exit.status, 200, "a legacy cookie is not stranded");
      const back = verifyToken(cookieFrom(exit)!);
      assert.equal(back!.agencyId, agency.id);
      assert.equal(back!.role, "agency-owner", "the documented fallback: an owner of the return agency");
      assert.equal(back!.userId, owner.id);
    });
  });
});

describe("Dev Mode × freelancer preview — the way out must survive both", () => {
  it("a preview taken DURING an inspection keeps the Dev Mode return path, and exit still lands on the real founder", async () => {
    const { agency, owner, token } = await seedRealFounder();

    await withDevModeEnabled(async () => {
      // 1. Ed inspects the owner persona — he is now in the demo tenant, with
      //    his real agency + himself stashed as the way back.
      const inspect = await POST(devModeRequest(token, { action: "switch", persona: "owner" }));
      assert.equal(inspect.status, 200);
      const inspecting = cookieFrom(inspect)!;
      const demoAgencyId = verifyToken(inspecting)!.agencyId;
      assert.notEqual(demoAgencyId, agency.id, "the inspection really is fenced to the demo tenant");
      // The inspection's way back now travels in the signed sandbox envelope.
      assert.equal(verifyToken(inspecting)!.sandbox?.returnAgencyId, agency.id);
      assert.equal(verifyToken(inspecting)!.sandbox?.returnUserId, owner.id);

      // 2. …and previews the demo tenant's own seeded freelancer from
      //    /portal/agency/freelancers while inside it. Two mints happen here,
      //    and BOTH used to drop the dev markers.
      // The demo tenant lives in its own data realm since the 26 Aug
      // consolidation, so read it through the realm the app's own cookie names.
      const demoRealmId = verifyToken(inspecting)!.sandbox?.realmId;
      assert.ok(demoRealmId, "the inspection carries its sandbox realm");
      const demoFreelancer = await runInDataRealm(demoRealmId!, async () => {
        await ensureHydrated({ preserveExplicitRealm: true });
        return listAgencyFreelancers(demoAgencyId)[0];
      });
      assert.ok(demoFreelancer, "the demo tenant seeds a freelancer to preview");
      // The preview handler resolves its data realm from the REQUEST STORE, so
      // calling it bare leaves it on the live realm and it cannot see the demo
      // tenant it is being asked about. A real browser request always has one.
      const enter = await withSession(inspecting, () => previewFreelancerPOST(
        previewRequest(inspecting, { employeeId: demoFreelancer.employeeId }),
      ));
      assert.equal(enter.status, 200);
      const previewing = verifyToken(cookieFrom(enter)!)!;
      assert.equal(previewing.role, "freelancer");
      // THE regression this file exists for: a preview taken mid-inspection must
      // not drop the way out. It used to carry `devReturn*` faithfully while the
      // envelope fell on the floor — the same blocker in a new coat.
      assert.equal(previewing.sandbox?.returnAgencyId, agency.id, "the inspection's return agency survives the preview mint");
      assert.equal(previewing.previewReturnAgencyId, demoAgencyId, "…alongside the preview's own return pointer");
      assert.equal(previewing.sandbox?.returnUserId, owner.id, "…and so does the person to return to");

      // 3. Exit the preview: back to the inspection, still knowing the way out.
      const previewExit = await withSession(cookieFrom(enter)!, () => previewFreelancerPOST(
        previewRequest(cookieFrom(enter), { action: "exit" }),
      ));
      assert.equal(previewExit.status, 200);
      const afterPreview = verifyToken(cookieFrom(previewExit)!)!;
      assert.equal(afterPreview.sandbox?.returnAgencyId, agency.id, "the Dev Mode return path is not destroyed by the round trip");
      assert.equal(afterPreview.sandbox?.returnUserId, owner.id);
      // The founder's visible way home. `/portal/layout.tsx:64-68` branches:
      // a session carrying a sandbox envelope gets `<SandboxModeSwitcher>`, and
      // only a legacy `isDemo && devReturnAgencyId` session gets the old
      // `<DevModeSwitcher>`. Either way SOMETHING must render, or the founder is
      // welded into the demo tenant with only a logout to escape — which is the
      // blocker this whole test exists for.
      assert.ok(
        afterPreview.sandbox || (afterPreview.isDemo && afterPreview.devReturnAgencyId),
        "a way home renders after the round trip",
      );

      // 4. And the way out actually works — no 409, and it is Ed who comes back.
      const devExit = await POST(devModeRequest(cookieFrom(previewExit), { action: "exit" }));
      assert.equal(devExit.status, 200, "dev-mode exit is still available after the preview round trip");
      const home = verifyToken(cookieFrom(devExit)!)!;
      assert.equal(home.userId, owner.id, "recovered to the real founder");
      assert.equal(home.agencyId, agency.id, "…in his real workspace, not the demo tenant");
      assert.ok(!home.isDemo);
    });
  });

  it("an ordinary preview (no inspection in progress) still carries no dev markers", async () => {
    // The carry-forward must be a carry, not an invention: a plain owner
    // previewing a freelancer has no Dev Mode return path, and stamping one on
    // would hand a non-inspecting session a dev-mode exit it never earned.
    const { agency, owner, token } = await seedRealFounder();
    const made = createFreelancer(agency.id, owner.id, {
      name: "Plain Freelancer",
      email: `plain-${agency.id}@ext.test`,
    });
    assert.ok(made.ok);

    const enter = await previewFreelancerPOST(previewRequest(token, { employeeId: made.employeeId }));
    assert.equal(enter.status, 200);
    const previewing = verifyToken(cookieFrom(enter)!)!;
    assert.equal(previewing.devReturnAgencyId, undefined, "no inspection, no dev return path");
    assert.equal(previewing.devReturnUserId, undefined);

    const exit = await previewFreelancerPOST(previewRequest(cookieFrom(enter), { action: "exit" }));
    assert.equal(exit.status, 200);
    const back = verifyToken(cookieFrom(exit)!)!;
    assert.equal(back.userId, owner.id);
    assert.equal(back.devReturnAgencyId, undefined, "…and none is invented on the way out");
  });
});
