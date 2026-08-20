// Dev Mode (demo-persona POV switcher) smoke — local/dev-only mint route.
//
// Behavioural: drives the real POST handler in-process (issueSession +
// NextRequest, per the runtime-verify convention) to prove:
//   1. the single `canUseDevMode()` gate refuses when Dev Mode is unavailable
//      (production-like env) — the #1 security contract;
//   2. enter re-mints a fenced demo-OWNER session (isDemo, demo agency,
//      devReturnAgencyId = the real agency);
//   3. exit returns to the real founder session (not demo, real agency);
//   4. a foreign origin is rejected.
// Plus source-shape pins for the account-menu toggle + chrome wiring.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

import { POST } from "../src/app/api/auth/dev-mode/route";
import { POST as previewFreelancerPOST } from "../src/app/api/auth/preview-as-freelancer/route";
import { createFreelancer, listAgencyFreelancers } from "../src/server/freelancerAdmin";
import { assertTenantScope, issueSession, verifyToken, SESSION_COOKIE_NAME } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, getAgencyBySlug } from "../src/server/tenants";
import { createUser, getUser, getUserById } from "../src/server/users";
import { getPeopleEmployeeByUserId, setPeopleFreelancerJobStatus } from "../src/server/people";
import {
  freelancerWorkspace, getFreelancerAccessConfig, saveFreelancerAccessConfig, normaliseFreelancerAccess, DEFAULT_FREELANCER_ACCESS,
  submitFreelancerJob, resolveFreelancerAccess, setFreelancerJobOverride, getFreelancerJobOverride, clearFreelancerJobOverride, listFreelancerJobsForConfig,
} from "../src/server/freelancerWorkspace";
import { DEMO_OWNER_EMAIL, DEMO_STAFF_EMAIL, DEMO_CUSTOMER_EMAIL, DEMO_FREELANCER_EMAIL, DEMO_AGENCY_SLUG, getDemoSnapshot } from "../src/lib/server/seeds/demoSeed";

process.env.PORTAL_BACKEND ??= "memory";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// Run the given fn with Dev Mode's env guards satisfied, then restore. Must
// await fn() before restoring, or the env pops back the moment the callback
// first suspends and later awaited POSTs see Dev Mode disabled.
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

function devModeRequest(token: string | undefined, body: unknown, origin = "http://localhost"): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json", origin };
  if (token) headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  return new NextRequest("http://localhost/api/auth/dev-mode", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function cookieFrom(response: Response): string | undefined {
  // NextResponse carries a typed cookie jar.
  return (response as unknown as { cookies: { get(name: string): { value: string } | undefined } })
    .cookies.get(SESSION_COOKIE_NAME)?.value;
}

async function seedRealFounder() {
  await ensureHydrated();
  const agency = createAgency({ name: "Real Co", slug: `real-co-${Math.round(process.hrtime()[1])}` });
  const owner = createUser({
    email: `owner-${agency.id}@real-co.test`,
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

describe("Dev Mode mint route — behaviour", () => {
  it("refuses (404) when Dev Mode is unavailable — the single gate", async () => {
    const { token } = await seedRealFounder();
    const savedDev = process.env.PORTAL_DEV_MODE;
    delete process.env.PORTAL_DEV_MODE;          // guard 1 fails → canUseDevMode() false
    try {
      const response = await POST(devModeRequest(token, { action: "enter" }));
      assert.equal(response.status, 404);
      const bodyJson = await response.json() as { ok?: boolean };
      assert.equal(bodyJson.ok, false);
      assert.equal(cookieFrom(response), undefined, "no session must be minted when refused");
    } finally {
      restore("PORTAL_DEV_MODE", savedDev);
    }
  });

  it("enter re-mints a fenced demo-OWNER session with devReturnAgencyId", async () => {
    const { agency, token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const response = await POST(devModeRequest(token, { action: "enter" }));
      assert.equal(response.status, 200);
      const minted = cookieFrom(response);
      assert.ok(minted, "enter must set a session cookie");
      const payload = verifyToken(minted);
      assert.ok(payload);
      assert.equal(payload!.isDemo, true, "demo session");
      assert.equal(payload!.email, DEMO_OWNER_EMAIL, "landed as the demo owner");
      assert.equal(payload!.devReturnAgencyId, agency.id, "stashes the real agency to return to");
      assert.notEqual(payload!.agencyId, agency.id, "scoped to the demo tenant, not the real one");
    });
  });

  it("exit returns to the real founder session", async () => {
    const { agency, owner, token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(token, { action: "enter" }));
      const demoToken = cookieFrom(enter);
      assert.ok(demoToken);

      const exit = await POST(devModeRequest(demoToken, { action: "exit" }));
      assert.equal(exit.status, 200);
      const realToken = cookieFrom(exit);
      assert.ok(realToken);
      const payload = verifyToken(realToken);
      assert.ok(payload);
      assert.ok(!payload!.isDemo, "back to a live (non-demo) session");
      assert.ok(!payload!.devReturnAgencyId, "return marker cleared");
      assert.equal(payload!.agencyId, agency.id, "restored to the real agency");
      assert.equal(payload!.email, owner.email, "restored as the real owner");
    });
  });

  it("rejects a foreign origin (403)", async () => {
    const { token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const response = await POST(devModeRequest(token, { action: "enter" }, "https://evil.example"));
      assert.equal(response.status, 403);
      const bodyJson = await response.json() as { error?: string };
      assert.equal(bodyJson.error, "invalid_origin");
    });
  });

  it("a non-founder session is forbidden (403)", async () => {
    const { agency } = await seedRealFounder();
    const staff = createUser({
      email: `staff-${agency.id}@real-co.test`,
      name: "Real Staff",
      role: "agency-staff",
      agencyId: agency.id,
      password: "staff-pass",
    });
    const staffToken = issueSession({
      userId: staff.id, email: staff.email, role: "agency-staff",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: staff.sessionRev ?? 0,
    });
    await withDevModeEnabled(async () => {
      const response = await POST(devModeRequest(staffToken, { action: "enter" }));
      assert.equal(response.status, 403);
    });
  });
});

describe("Dev Mode POV switch — behaviour", () => {
  it("switches the demo owner → staff (agency-staff, lands in team, return preserved)", async () => {
    const { agency, token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(token, { action: "enter" }));
      const res = await POST(devModeRequest(cookieFrom(enter), { action: "switch", persona: "staff" }));
      assert.equal(res.status, 200);
      const body = await res.json() as { redirect?: string };
      assert.equal(body.redirect, "/portal/team");
      const p = verifyToken(cookieFrom(res));
      assert.ok(p);
      assert.equal(p!.role, "agency-staff");
      assert.equal(p!.isDemo, true);
      assert.equal(p!.devReturnAgencyId, agency.id, "return-to-real is carried across the hop");
    });
  });

  it("switches to the customer persona (end-customer, clientId set, lands on the customer portal — NOT the agency-side client workspace)", async () => {
    const { token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(token, { action: "enter" }));
      const res = await POST(devModeRequest(cookieFrom(enter), { action: "switch", persona: "customer" }));
      assert.equal(res.status, 200);
      const p = verifyToken(cookieFrom(res));
      assert.ok(p);
      assert.equal(p!.role, "end-customer", "a client sees the portal, so the POV is the end-customer");
      assert.ok(p!.clientId, "customer persona is scoped to the demo client");
      const body = await res.json() as { redirect?: string };
      assert.equal(body.redirect, "/portal/customer", "lands on the portal, not /portal/clients/<id> (agency-side)");
    });
  });

  it("switches to the freelancer persona → their own workspace (assigned jobs only, config defaults applied)", async () => {
    const { token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(token, { action: "enter" }));
      const res = await POST(devModeRequest(cookieFrom(enter), { action: "switch", persona: "freelancer" }));
      assert.equal(res.status, 200);
      const p = verifyToken(cookieFrom(res));
      assert.ok(p);
      assert.equal(p!.role, "freelancer");
      assert.equal((await res.json() as { redirect?: string }).redirect, "/portal/freelancer", "own workspace, not the agency-side client workspace");

      // The workspace resolves only THEIR jobs, with the privacy-first config
      // DEFAULTS applied (client anonymised, fee shown, read-only).
      const demoAgency = getAgencyBySlug(DEMO_AGENCY_SLUG);
      const freelancer = getUser(DEMO_FREELANCER_EMAIL);
      assert.ok(demoAgency && freelancer);
      const ws = freelancerWorkspace(demoAgency!.id, freelancer!.id);
      assert.ok(ws && ws.jobs.length >= 1, "freelancer has their seeded job");
      const job = ws!.jobs[0]!;
      assert.equal(job.clientLabel, "Confidential client project", "client anonymised by default (not the real client name)");
      assert.ok(job.feeLabel, "fee visible by default — they're being paid");
      assert.equal(job.can.markSubmitted, false, "read-only by default");
    });
  });

  it("a non-founder demo persona (customer) can still switch back and exit", async () => {
    const { agency, token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(token, { action: "enter" }));
      const asCustomer = cookieFrom(await POST(devModeRequest(cookieFrom(enter), { action: "switch", persona: "customer" })));
      assert.ok(asCustomer);
      // end-customer is NOT a founder — the switch/exit authority is the signed
      // devReturnAgencyId, not the persona's role, so hopping back must work.
      const backToOwner = await POST(devModeRequest(asCustomer, { action: "switch", persona: "owner" }));
      assert.equal(backToOwner.status, 200);
      assert.equal(verifyToken(cookieFrom(backToOwner))!.role, "agency-owner");
      const exit = await POST(devModeRequest(asCustomer, { action: "exit" }));
      assert.equal(exit.status, 200);
      const p = verifyToken(cookieFrom(exit));
      assert.ok(p && !p.isDemo, "back to a live session");
      assert.equal(p!.agencyId, agency.id, "returned to the real agency from the customer persona");
    });
  });

  it("a real FOUNDER can start an inspection straight from their own session, and is stashed for the return", async () => {
    // Ed browses the Dev Team workspace as himself — entering it never swaps
    // identity. Identity only changes when he deliberately inspects a persona,
    // so `switch` must accept his real session and remember exactly who he is.
    const { agency, token } = await seedRealFounder();
    const before = verifyToken(token);
    await withDevModeEnabled(async () => {
      const res = await POST(devModeRequest(token, { action: "switch", persona: "staff" }));
      assert.equal(res.status, 200);
      const p = verifyToken(cookieFrom(res));
      assert.ok(p);
      assert.equal(p!.role, "agency-staff", "now inspecting the staff persona");
      assert.equal(p!.isDemo, true, "the inspection is fenced to the demo tenant");
      assert.equal(p!.devReturnAgencyId, agency.id);
      assert.equal(p!.devReturnUserId, before!.userId, "the exact founder is stashed, so exit returns HIM");
    });
  });

  it("switch is refused (409) for a non-founder real session", async () => {
    // The security half of the rule above: only the founder may step into an
    // inspection from a real session. A manager must not.
    const { agency } = await seedRealFounder();
    const manager = createUser({
      email: `mgr-switch-${agency.id}@real-co.test`,
      name: "Real Manager",
      role: "agency-manager",
      agencyId: agency.id,
      password: "mgr-pass",
    });
    const managerToken = issueSession({
      userId: manager.id, email: manager.email, role: "agency-manager",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: manager.sessionRev ?? 0,
    });
    await withDevModeEnabled(async () => {
      const res = await POST(devModeRequest(managerToken, { action: "switch", persona: "staff" }));
      assert.equal(res.status, 409, "a manager cannot mint a demo persona from their own session");
    });
  });

  it("exiting an inspection restores the EXACT person who started it", async () => {
    // The Showcase-Mode shape Ed asked for: inspect a persona → come back as
    // yourself, not as "an owner the agency lookup happened to find".
    const { agency, token } = await seedRealFounder();
    const before = verifyToken(token);
    await withDevModeEnabled(async () => {
      const inspect = await POST(devModeRequest(token, { action: "switch", persona: "customer" }));
      assert.equal(inspect.status, 200);
      const exit = await POST(devModeRequest(cookieFrom(inspect), { action: "exit" }));
      assert.equal(exit.status, 200);
      const p = verifyToken(cookieFrom(exit));
      assert.ok(p);
      assert.equal(p!.userId, before!.userId, "restored as the same person who started the inspection");
      assert.equal(p!.agencyId, agency.id, "back in the real workspace");
      assert.notEqual(p!.role, "end-customer", "no longer the inspected persona");
    });
  });

  it("switch with an unknown persona is 400", async () => {
    const { token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(token, { action: "enter" }));
      const res = await POST(devModeRequest(cookieFrom(enter), { action: "switch", persona: "wizard" as never }));
      assert.equal(res.status, 400);
    });
  });
});

describe("Dev Mode — isolation hardening (Phase 4)", () => {
  const DEMO_EMAILS = new Set([DEMO_OWNER_EMAIL, DEMO_STAFF_EMAIL, DEMO_CUSTOMER_EMAIL, DEMO_FREELANCER_EMAIL]);

  it("every persona mint is fenced to the demo agency (never a real tenant)", async () => {
    const { agency: realAgency, token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(token, { action: "enter" }));
      let demo = cookieFrom(enter);
      const demoAgency = getAgencyBySlug(DEMO_AGENCY_SLUG);
      assert.ok(demoAgency, "the fenced demo agency exists after seeding");
      for (const persona of ["owner", "staff", "customer", "freelancer"] as const) {
        const res = await POST(devModeRequest(demo, { action: "switch", persona }));
        const p = verifyToken(cookieFrom(res));
        assert.ok(p);
        assert.equal(p!.agencyId, demoAgency!.id, `${persona} is scoped to the demo agency`);
        assert.deepEqual(p!.agencyIds, [demoAgency!.id], `${persona} carries only the demo agency in membership`);
        assert.notEqual(p!.agencyId, realAgency.id, `${persona} is never scoped to the real agency`);
        assert.ok(DEMO_EMAILS.has(p!.email), `${persona} is one of the seeded demo users`);
        demo = cookieFrom(res)!;   // hop onward from the current persona
      }
    });
  });

  it("a demo session cannot pass tenant-scope for a real agency (no demo write reaches a real tenant)", async () => {
    const { agency: realAgency, token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(token, { action: "enter" }));
      const demo = verifyToken(cookieFrom(enter));
      assert.ok(demo);
      // The demo session's membership is only the demo agency, so the scope
      // gate every mutation runs through refuses any real tenant — a demo
      // write physically cannot land on real data.
      assert.throws(() => assertTenantScope(demo!, realAgency.id), /tenant_scope_mismatch/);
      assert.doesNotThrow(() => assertTenantScope(demo!, demo!.agencyId));
    });
  });

  it("demo sessions validate without a real identity, and demo POV shows no live enquiries", () => {
    const auth = read("src/lib/server/auth/auth.ts");
    // getSession short-circuits for isDemo → no Supabase identity cross-check,
    // so a demo persona never needs (or touches) a real account.
    assert.match(auth, /if \(session\.isDemo \|\| session\.publicShowcase\) return session;/);
    // The agency inbox never reads live website enquiries / inbox for a demo
    // session — the demo POV cannot surface real people's data.
    const inbox = read("src/app/portal/agency/inbox/page.tsx");
    assert.match(inbox, /session\.isDemo \? Promise\.resolve\(\[\]\)/);
    assert.match(inbox, /session\.isDemo \? Promise\.resolve\(\{ connections: \[\]/);
  });
});

describe("Dev Mode — Commander browser-fix regressions", () => {
  it("exit from a demo/dev origin restores an isDemo session (no /login bounce)", async () => {
    const { agency, owner } = await seedRealFounder();
    // The local `/dev` sign-in shape: a founder on an isDemo session (no
    // Supabase identity). Exit must return them to an isDemo session or
    // getSession()'s Supabase cross-check rejects it → /login.
    const devOrigin = issueSession({
      userId: owner.id, email: owner.email, role: "agency-owner",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      isDemo: true, sessionRev: owner.sessionRev ?? 0,
    });
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(devOrigin, { action: "enter" }));
      const demo = verifyToken(cookieFrom(enter));
      assert.equal(demo!.devReturnWasDemo, true, "origin demo-ness captured at enter");
      const exit = await POST(devModeRequest(cookieFrom(enter), { action: "exit" }));
      const back = verifyToken(cookieFrom(exit));
      assert.ok(back);
      assert.equal(back!.isDemo, true, "exit restores an accepted isDemo session");
      assert.equal(back!.email, owner.email, "back as the real founder");
      assert.ok(!back!.devReturnAgencyId, "no longer a dev-mode session");
    });
  });

  it("exit from a real (non-demo) origin returns a non-demo session", async () => {
    const { token } = await seedRealFounder();   // plain non-demo founder
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(token, { action: "enter" }));
      assert.ok(!verifyToken(cookieFrom(enter))!.devReturnWasDemo, "non-demo origin recorded as such");
      const exit = await POST(devModeRequest(cookieFrom(enter), { action: "exit" }));
      assert.ok(!verifyToken(cookieFrom(exit))!.isDemo, "real founder returns to a non-demo session");
    });
  });

  it("switching to the customer marks the demo customer welcome-complete (portal won't bounce to /setup)", async () => {
    const { token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(token, { action: "enter" }));
      await POST(devModeRequest(cookieFrom(enter), { action: "switch", persona: "customer" }));
      const snap = getDemoSnapshot();
      assert.ok(snap, "demo tenant seeded");
      assert.ok(snap!.customerUser.welcomeCompletedAt, "demo customer is welcome-complete → lands on /portal/customer, not /setup");
    });
  });

  it("switching to staff seeds a PeopleEmployee so /portal/team is reachable (not the account dead-end)", async () => {
    const { token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      const enter = await POST(devModeRequest(token, { action: "enter" }));
      await POST(devModeRequest(cookieFrom(enter), { action: "switch", persona: "staff" }));
      const staff = getUser(DEMO_STAFF_EMAIL);
      assert.ok(staff, "demo staff user exists");
      const demoAgency = getAgencyBySlug(DEMO_AGENCY_SLUG);
      assert.ok(demoAgency);
      assert.ok(getPeopleEmployeeByUserId(demoAgency!.id, staff!.id), "demo staff now has a PeopleEmployee");
    });
  });

  it("the load-in is fail-safe: split effects (Strict-Mode-safe dismissal) + pointer-events:none", () => {
    const loadin = read("src/components/chrome/DevModeLoadIn.tsx");
    assert.ok((loadin.match(/useEffect\(/g) || []).length >= 2, "flag-consume and dismiss timers are separate effects");
    assert.match(loadin, /setPersona/);
    // Never intercepts the switcher / Exit, even if it lingers.
    assert.match(read("src/app/globals.css"), /\.mm-command-transition\.mm-devmode-loadin\s*\{[^}]*pointer-events:\s*none/);
  });

  it("devReturnWasDemo is threaded through types + auth", () => {
    assert.match(read("src/server/types.ts"), /devReturnWasDemo\?: boolean/);
    assert.match(read("src/lib/server/auth/auth.ts"), /devReturnWasDemo: input\.devReturnWasDemo/);
  });
});

describe("Freelancer access config (Phase 2 — all configurable)", () => {
  it("save → get round-trips; normalise coerces a partial/garbage blob to a valid policy", () => {
    const agencyId = `cfg-agency-${Math.round(process.hrtime()[1])}`;
    const saved = saveFreelancerAccessConfig(agencyId, { showFee: false, clientIdentity: "named", actions: { message: true } });
    assert.equal(saved.showFee, false);
    assert.equal(saved.clientIdentity, "named");
    assert.equal(saved.actions.message, true);
    assert.equal(saved.showBrief, true, "unset fields fall back to defaults");
    assert.deepEqual(getFreelancerAccessConfig(agencyId), saved, "persisted");
    // untrusted blob → valid config out (never trust the client)
    const norm = normaliseFreelancerAccess({ showFee: "yes", clientIdentity: "wat", actions: "nope" });
    assert.equal(norm.showFee, DEFAULT_FREELANCER_ACCESS.showFee);
    assert.equal(norm.clientIdentity, "anonymised");
    assert.equal(norm.actions.message, false);
  });

  it("the policy actually drives the freelancer view — naming the client de-anonymises it", async () => {
    const { token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      await POST(devModeRequest(token, { action: "enter" }));   // seeds demo tenant + freelancer + job
      const snap = getDemoSnapshot();
      const freelancer = getUser(DEMO_FREELANCER_EMAIL);
      assert.ok(snap && freelancer);
      try {
        assert.equal(freelancerWorkspace(snap!.agency.id, freelancer!.id)!.jobs[0]!.clientLabel, "Confidential client project", "anonymised by default");
        saveFreelancerAccessConfig(snap!.agency.id, { clientIdentity: "named" });
        assert.equal(freelancerWorkspace(snap!.agency.id, freelancer!.id)!.jobs[0]!.clientLabel, snap!.client.name, "policy → real client name");
      } finally {
        saveFreelancerAccessConfig(snap!.agency.id, DEFAULT_FREELANCER_ACCESS);  // restore for other tests
      }
    });
  });

  it("the config endpoint + panel + page are wired (owner/manager gated)", () => {
    const route = read("src/app/api/portal/freelancer-access/route.ts");
    assert.match(route, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
    assert.match(route, /saveFreelancerAccessConfig/);
    assert.match(read("src/app/portal/agency/freelancer-access/_FreelancerAccessConfigPanel.tsx"), /\/api\/portal\/freelancer-access/);
    assert.match(read("src/app/portal/agency/freelancer-access/page.tsx"), /getFreelancerAccessConfig/);
    // persisted state slot wired through PortalState + storage init
    assert.match(read("src/server/types.ts"), /freelancerAccessConfig: Record<string, FreelancerAccessConfig>/);
    assert.match(read("src/server/storage.ts"), /freelancerAccessConfig: \{\}/);
    // discoverable: the agency Settings has a Freelancer access tab that links to the editor
    assert.match(read("src/app/portal/agency/settings/SettingsTabs.tsx"), /\/portal\/agency\/freelancer-access/);
  });
});

describe("Freelancer — mark-submitted action + per-job overrides (P3 + refinement)", () => {
  it("mark-submitted is gated (ownership · config · active) then moves the job to delivered", async () => {
    const { token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      await POST(devModeRequest(token, { action: "enter" }));   // seeds freelancer + an active job
      const snap = getDemoSnapshot();
      const freelancer = getUser(DEMO_FREELANCER_EMAIL);
      assert.ok(snap && freelancer);
      const jobId = listFreelancerJobsForConfig(snap!.agency.id)[0]!.id;
      try {
        assert.deepEqual(submitFreelancerJob(snap!.agency.id, freelancer!.id, jobId), { ok: false, error: "not_allowed" }, "read-only by default");
        assert.deepEqual(submitFreelancerJob(snap!.agency.id, freelancer!.id, "nope"), { ok: false, error: "not_your_job" });
        saveFreelancerAccessConfig(snap!.agency.id, { actions: { markSubmitted: true } });
        assert.deepEqual(submitFreelancerJob(snap!.agency.id, freelancer!.id, jobId), { ok: true });
        assert.equal(freelancerWorkspace(snap!.agency.id, freelancer!.id)!.jobs[0]!.status, "delivered");
        assert.deepEqual(submitFreelancerJob(snap!.agency.id, freelancer!.id, jobId), { ok: false, error: "not_active" }, "not submittable twice");
      } finally {
        saveFreelancerAccessConfig(snap!.agency.id, DEFAULT_FREELANCER_ACCESS);
        setPeopleFreelancerJobStatus({ agencyId: snap!.agency.id, jobId, status: "active", actorUserId: "test-reset" });
      }
    });
  });

  it("a per-job override wins over the agency default (and clears back)", async () => {
    const { token } = await seedRealFounder();
    await withDevModeEnabled(async () => {
      await POST(devModeRequest(token, { action: "enter" }));
      const snap = getDemoSnapshot();
      const freelancer = getUser(DEMO_FREELANCER_EMAIL);
      assert.ok(snap && freelancer);
      const jobId = listFreelancerJobsForConfig(snap!.agency.id)[0]!.id;
      try {
        assert.equal(resolveFreelancerAccess(snap!.agency.id, "e", jobId).clientIdentity, "anonymised", "agency default");
        setFreelancerJobOverride(jobId, { ...DEFAULT_FREELANCER_ACCESS, clientIdentity: "named" });
        assert.equal(resolveFreelancerAccess(snap!.agency.id, "e", jobId).clientIdentity, "named", "override wins");
        assert.equal(freelancerWorkspace(snap!.agency.id, freelancer!.id)!.jobs.find(j => j.id === jobId)!.clientLabel, snap!.client.name, "view reflects the override");
        assert.ok(getFreelancerJobOverride(jobId));
        clearFreelancerJobOverride(jobId);
        assert.equal(getFreelancerJobOverride(jobId), null, "cleared");
        assert.equal(resolveFreelancerAccess(snap!.agency.id, "e", jobId).clientIdentity, "anonymised", "back to default");
      } finally {
        clearFreelancerJobOverride(jobId);
      }
    });
  });

  it("the action route + per-job config wiring", () => {
    const submitRoute = read("src/app/api/portal/freelancer/submit/route.ts");
    assert.match(submitRoute, /submitFreelancerJob/);
    assert.match(submitRoute, /session\.role !== "freelancer"/);
    assert.match(read("src/app/portal/freelancer/_FreelancerJobActions.tsx"), /Mark submitted/);
    assert.match(read("src/app/portal/freelancer/page.tsx"), /FreelancerJobActions/);
    const accessRoute = read("src/app/api/portal/freelancer-access/route.ts");
    assert.match(accessRoute, /setFreelancerJobOverride/);
    assert.match(accessRoute, /clearFreelancerJobOverride/);
    assert.match(read("src/app/portal/agency/freelancer-access/_FreelancerAccessConfigPanel.tsx"), /Per-job overrides/);
    assert.match(read("src/server/types.ts"), /freelancerJobOverride: Record<string, FreelancerAccessConfig>/);
  });
});

describe("Dev Mode — the single gate + return field wiring", () => {
  it("canUseDevMode() is the one switch point (delegates to isDevModeEnabled today)", () => {
    const src = read("src/lib/server/dev/devModeAccess.ts");
    assert.match(src, /export function canUseDevMode/);
    assert.match(src, /isDevModeEnabled\(\)/);
  });

  it("route gates on canUseDevMode first, then founder + origin", () => {
    const src = read("src/app/api/auth/dev-mode/route.ts");
    assert.match(src, /if \(!canUseDevMode\(\)\)/);
    assert.match(src, /status: 404/);
    assert.match(src, /effectiveRole\(session\)\.isFounder/);
    assert.match(src, /invalid_origin/);
    assert.match(src, /seedDemoAgency/);
    assert.match(src, /devReturnAgencyId/);
    // switch/exit authority is the signed dev session, not founder role.
    assert.match(src, /"switch"/);
    assert.match(src, /isActiveDevSession/);
    // No scattered NODE_ENV/VERCEL_ENV checks — the gate lives behind the one fn.
    assert.doesNotMatch(src, /process\.env\.NODE_ENV/);
    assert.doesNotMatch(src, /VERCEL_ENV/);
  });

  it("session carries devReturnAgencyId, mirroring showcaseReturnAgencyId", () => {
    assert.match(read("src/server/types.ts"), /devReturnAgencyId\?: string/);
    assert.match(read("src/lib/server/auth/auth.ts"), /devReturnAgencyId: input\.devReturnAgencyId/);
  });
});

describe("Dev Mode — account-menu toggle + chrome wiring", () => {
  it("the toggle row lives in the account dropdown, built like the sibling switches", () => {
    const menu = read("src/components/chrome/ProfileMenu.tsx");
    assert.match(menu, /mm-dev-mode-toggle/);
    assert.match(menu, /Dev Mode/);
    assert.match(menu, /\/api\/auth\/dev-mode/);
    assert.match(menu, /canUseDevMode/);
    assert.match(menu, /devModeActive/);
    // Sits under Performance mode + Focus protection (same switch styling).
    assert.match(menu, /mm-performance-mode-toggle/);
    assert.match(menu, /mm-focus-protection-toggle/);
  });

  it("Topbar forwards the flags and the agency layout computes them", () => {
    const topbar = read("src/components/chrome/Topbar.tsx");
    assert.match(topbar, /canUseDevMode=\{canUseDevMode\}/);
    assert.match(topbar, /devModeActive=\{devModeActive\}/);
    const layout = read("src/app/portal/agency/layout.tsx");
    assert.match(layout, /canUseDevMode\(\) && eff\.isFounder/);
    assert.match(layout, /devModeActive=\{Boolean\(session\.devReturnAgencyId\)\}/);
  });

  it("the POV switcher offers owner/staff/customer/freelancer and is mounted once at the shared portal layout (reachable from every persona incl. the customer portal)", () => {
    const switcher = read("src/components/chrome/DevModeSwitcher.tsx");
    assert.match(switcher, /mm-dev-mode-switcher/);
    assert.match(switcher, /Owner/);
    assert.match(switcher, /Staff/);
    assert.match(switcher, /Customer/);
    assert.match(switcher, /Freelancer/);
    assert.doesNotMatch(switcher, /label: "Client"/);
    // freelancer dispatch branches BEFORE the client-role fall-through, and has its own surface
    assert.match(read("src/app/portal/page.tsx"), /role === "freelancer"\) redirect\("\/portal\/freelancer"\)/);
    assert.match(read("src/server/freelancerWorkspace.ts"), /export function freelancerWorkspace/);
    assert.match(read("src/server/freelancerWorkspace.ts"), /clientIdentity: "anonymised"/);   // privacy-first default
    assert.match(switcher, /action, persona/);          // POSTs the switch
    assert.match(switcher, /\/api\/auth\/dev-mode/);
    // Rendered at the shared /portal layout (NOT a scope Topbar) so it reaches
    // the customer portal too, which has its own chrome.
    const portalLayout = read("src/app/portal/layout.tsx");
    assert.match(portalLayout, /DevModeSwitcher role=\{session\.role\}/);
    assert.match(portalLayout, /session\.isDemo && session\.devReturnAgencyId/);
    assert.doesNotMatch(read("src/components/chrome/Topbar.tsx"), /DevModeSwitcher/);
  });

  it("the switcher is themed for light AND dark (no Tailwind darkMode config — colours live under html[data-color-mode])", () => {
    const switcher = read("src/components/chrome/DevModeSwitcher.tsx");
    // Colours moved out of the component to CSS (was a hardcoded light-cyan pill
    // that stayed bright in dark mode).
    assert.doesNotMatch(switcher, /bg-\[#ECFEFF\]|text-\[#134E4A\]/);
    const css = read("src/app/globals.css");
    assert.match(css, /\.mm-dev-mode-switcher\s*\{/);                       // base (light)
    assert.match(css, /html\[data-color-mode="dark"\] \.mm-dev-mode-switcher/); // dark override
  });
});

describe("Dev Mode — cinematic load-in (Phase 3)", () => {
  it("reuses the command-transition CSS system and respects performance mode", () => {
    const loadin = read("src/components/chrome/DevModeLoadIn.tsx");
    assert.match(loadin, /mm-command-transition mm-devmode-loadin/);   // reuse, not a bespoke overlay
    assert.match(loadin, /performanceModeEnabled\(\)/);                 // "Skip cinematic loading screens"
    assert.match(loadin, /reducedMotionPreferred/);
    assert.match(loadin, /DEV_MODE_LOADIN_KEY/);
    // the z-index bump sits it above the native command/client transitions
    assert.match(read("src/app/globals.css"), /\.mm-devmode-loadin\s*\{[^}]*z-index:\s*10002/);
  });

  it("is mounted in the shared portal layout, gated — never for everyone", () => {
    const layout = read("src/app/portal/layout.tsx");
    assert.match(layout, /DevModeLoadIn/);
    // TWO journeys play through this overlay and both are gated:
    //   • a demo session — a persona hop (identity changes);
    //   • a founder in Dev Mode routing into the Dev Console workspace
    //     (plain navigation, identity unchanged).
    // `devDocsAccessible` is `canUseDevMode() && isFounder`, and canUseDevMode()
    // is false in anything production-like — so outside dev this collapses back
    // to exactly `session.isDemo`. It cannot widen who sees the overlay.
    assert.match(layout, /session\.isDemo \|\| devDocsAccessible\(session\) \? <DevModeLoadIn \/> : null/);
    assert.match(layout, /import \{ devDocsAccessible \} from "@\/lib\/server\/dev\/devDocs"/);
    // The property that actually matters: it is never mounted unconditionally.
    assert.doesNotMatch(layout, /^\s*<DevModeLoadIn \/>\s*$/m, "must stay behind a gate");
  });

  it("the workspace journey does not borrow the persona copy", () => {
    // The persona overlay says "demo tenant linked · fenced from live data".
    // Opening the workspace keeps Ed on his REAL data as himself, so reusing
    // that copy would make the overlay lie about identity every time.
    const loadin = read("src/components/chrome/DevModeLoadIn.tsx");
    assert.match(loadin, /DEV_MODE_LOADIN_WORKSPACE/);
    assert.match(loadin, /Still signed in as you/);
    assert.match(loadin, /Your real data/);
    assert.match(loadin, /Opening the workspace/);
    // …and the persona journey keeps its own, unchanged.
    assert.match(loadin, /Demo tenant linked/);
    assert.match(loadin, /Fenced from live data/);
    assert.match(loadin, /Entering Dev Mode/);
    assert.match(read("src/lib/chrome/devModeLoadIn.ts"), /export const DEV_MODE_LOADIN_WORKSPACE/);
  });

  it("the persona switcher arms the load-in before navigating", () => {
    // The cinematic belongs to an IDENTITY CHANGE — i.e. inspecting a persona.
    // The account row no longer arms it: opening the Dev Team workspace is now
    // plain navigation that keeps you signed in as yourself, so there is no
    // persona swap to animate.
    const switcher = read("src/components/chrome/DevModeSwitcher.tsx");
    assert.match(switcher, /sessionStorage\.setItem\(DEV_MODE_LOADIN_KEY, persona\)/);
    // shared key, no magic-string drift
    assert.match(read("src/lib/chrome/devModeLoadIn.ts"), /export const DEV_MODE_LOADIN_KEY/);
  });

  it("opening the Dev Team workspace does not swap identity", () => {
    // The contract Ed asked for: he goes into the workspace as himself, on his
    // real account — the account row navigates, it does not mint a persona.
    const menu = read("src/components/chrome/ProfileMenu.tsx");
    assert.match(menu, /window\.location\.assign\("\/portal\/dev-team"\)/, "entering is navigation");
    assert.doesNotMatch(menu, /action:\s*devModeActive\s*\?\s*"exit"\s*:\s*"enter"/, "no longer mints on entry");
  });
});

// The REAL freelancer-management system: agencies create freelancers, manage
// them, and PREVIEW their workspace (mint an isDemo session as the freelancer,
// then exit back — like previewing a client portal). Unlike Dev Mode this is
// NOT dev-gated; it's a live owner/manager capability, so the tests drive the
// preview route directly (no withDevModeEnabled wrapper).
describe("Freelancer management — create + preview (real system)", () => {
  it("createFreelancer makes a role:freelancer login + a freelancer employee; validates; idempotent on email", async () => {
    const { agency, owner } = await seedRealFounder();

    // validation
    assert.equal(createFreelancer(agency.id, owner.id, { name: "", email: "a@b.co" }).error, "name_required");
    assert.equal(createFreelancer(agency.id, owner.id, { name: "Sky", email: "not-an-email" }).error, "email_invalid");

    // create
    const made = createFreelancer(agency.id, owner.id, { name: "Sky Blue", email: "Sky@Ext.test", title: "Illustrator" });
    assert.ok(made.ok && made.employeeId && made.userId, "returns the new employee + login ids");
    const user = getUserById(made.userId!);
    assert.equal(user!.role, "freelancer", "the login is a freelancer role");
    assert.equal(user!.email, "sky@ext.test", "email normalised to lower-case");
    assert.equal(user!.agencyId, agency.id, "scoped to the creating agency");
    const employee = getPeopleEmployeeByUserId(agency.id, made.userId!);
    assert.equal(employee!.employmentType, "freelancer", "the people record is a freelancer");
    assert.equal(employee!.title, "Illustrator");

    // idempotent on email — no duplicate login or employee
    const again = createFreelancer(agency.id, owner.id, { name: "Sky Blue", email: "sky@ext.test" });
    assert.equal(again.employeeId, made.employeeId, "same employee");
    assert.equal(again.userId, made.userId, "same login");

    // listed on the management surface, with any jobs
    const rows = listAgencyFreelancers(agency.id);
    const row = rows.find(r => r.employeeId === made.employeeId);
    assert.ok(row, "appears in listAgencyFreelancers");
    assert.equal(row!.email, "sky@ext.test");
    assert.ok(Array.isArray(row!.jobs), "carries its job list");
  });

  it("an email already owned by another agency is refused (email_in_use)", async () => {
    const a = await seedRealFounder();
    const b = await seedRealFounder();
    const first = createFreelancer(a.agency.id, a.owner.id, { name: "Shared", email: "shared@ext.test" });
    assert.ok(first.ok);
    const clash = createFreelancer(b.agency.id, b.owner.id, { name: "Shared", email: "shared@ext.test" });
    assert.deepEqual(clash, { ok: false, error: "email_in_use" }, "can't steal another agency's user");
  });

  it("owner previews a freelancer (isDemo, previewReturn set) then exits back to the owner", async () => {
    const { agency, owner, token } = await seedRealFounder();
    const made = createFreelancer(agency.id, owner.id, { name: "Pixel", email: "pixel@ext.test" });
    assert.ok(made.ok);

    // enter preview — the owner sees the freelancer's own surface
    const enter = await previewFreelancerPOST(devModeRequest(token, { employeeId: made.employeeId }));
    assert.equal(enter.status, 200);
    assert.equal((await enter.json() as { redirect?: string }).redirect, "/portal/freelancer");
    const previewToken = cookieFrom(enter);
    assert.ok(previewToken, "preview mints a session cookie");
    const preview = verifyToken(previewToken);
    assert.equal(preview!.role, "freelancer", "acting as the freelancer");
    assert.equal(preview!.email, "pixel@ext.test");
    assert.equal(preview!.isDemo, true, "isDemo bypasses the Supabase check for a never-logged-in freelancer");
    assert.equal(preview!.previewReturnAgencyId, agency.id, "stashes the agency to return to");
    assert.ok(!preview!.previewReturnWasDemo, "the real owner wasn't a demo session (falsy — the true case round-trips in the test below)");
    assert.ok(!preview!.devReturnAgencyId, "NOT a Dev Mode session — the switcher must not show here");

    // exit — back to the real owner, markers cleared
    const exit = await previewFreelancerPOST(devModeRequest(previewToken, { action: "exit" }));
    assert.equal(exit.status, 200);
    assert.equal((await exit.json() as { redirect?: string }).redirect, "/portal/agency/freelancers");
    const back = verifyToken(cookieFrom(exit)!);
    assert.equal(back!.role, "agency-owner", "restored the owner role");
    assert.equal(back!.email, owner.email);
    assert.equal(back!.agencyId, agency.id);
    assert.ok(!back!.isDemo, "back to a live session");
    assert.ok(!back!.previewReturnAgencyId, "preview marker cleared");
  });

  it("a MANAGER who previews a freelancer is restored to the MANAGER on exit — NOT the owner (privilege-escalation regression)", async () => {
    // The escalation: `enter` admits managers, but the old `exit` re-minted
    // "an agency-owner in the return agency" regardless of who entered — so a
    // manager could enter → exit and hold a full OWNER session (2 requests).
    // Fix: exit restores the exact enterer stashed at enter. See audits.md
    // 2026-08-19 (Freelancer preview: MANAGER → OWNER).
    const { agency, owner } = await seedRealFounder();       // owner exists in the agency
    const made = createFreelancer(agency.id, owner.id, { name: "Mgr Pixel", email: "mgr-pixel@ext.test" });
    assert.ok(made.ok);

    // A real agency-MANAGER (not the owner) drives the preview.
    const manager = createUser({
      email: `manager-prev-${agency.id}@real-co.test`, name: "Real Manager", role: "agency-manager",
      agencyId: agency.id, password: "manager-pass",
    });
    const managerToken = issueSession({
      userId: manager.id, email: manager.email, role: "agency-manager",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id, sessionRev: manager.sessionRev ?? 0,
    });

    // enter — the manager is authorised to preview the freelancer…
    const enter = await previewFreelancerPOST(devModeRequest(managerToken, { employeeId: made.employeeId }));
    assert.equal(enter.status, 200, "manager may enter the preview");
    const previewToken = cookieFrom(enter);
    assert.ok(previewToken);
    const preview = verifyToken(previewToken);
    assert.equal(preview!.role, "freelancer", "acting as the freelancer");
    assert.equal(preview!.previewReturnUserId, manager.id, "stashes the EXACT enterer (the manager), not an owner");

    // …exit — and must return as the MANAGER, never the owner.
    const exit = await previewFreelancerPOST(devModeRequest(previewToken, { action: "exit" }));
    assert.equal(exit.status, 200);
    const back = verifyToken(cookieFrom(exit)!);
    assert.equal(back!.role, "agency-manager", "restored to the manager role — the escalation is closed");
    assert.equal(back!.email, manager.email, "restored as the manager who entered");
    assert.notEqual(back!.role, "agency-owner", "must NOT be re-minted as an owner");
    assert.notEqual(back!.email, owner.email, "must NOT be re-minted as the agency owner");
    assert.equal(back!.agencyId, agency.id, "back in their real agency");
    assert.ok(!back!.isDemo, "back to a live session");
    assert.ok(!back!.previewReturnAgencyId, "preview marker cleared");
  });

  it("a real demo (Dev Mode) owner previewing a freelancer returns to a demo owner on exit", async () => {
    // Guards the previewReturnWasDemo round-trip: if the owner was already an
    // isDemo session (e.g. inside Dev Mode), exit must re-mint isDemo — else the
    // local /dev founder fails getSession's Supabase identity check → /login.
    const { agency, owner } = await seedRealFounder();
    const made = createFreelancer(agency.id, owner.id, { name: "Demo", email: "demo-preview@ext.test" });
    const demoOwnerToken = issueSession({
      userId: owner.id, email: owner.email, role: "agency-owner",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      isDemo: true, sessionRev: owner.sessionRev ?? 0,
    });
    const enter = await previewFreelancerPOST(devModeRequest(demoOwnerToken, { employeeId: made.employeeId }));
    assert.equal(verifyToken(cookieFrom(enter)!)!.previewReturnWasDemo, true, "remembers the owner was demo");
    const exit = await previewFreelancerPOST(devModeRequest(cookieFrom(enter), { action: "exit" }));
    assert.equal(verifyToken(cookieFrom(exit)!)!.isDemo, true, "restored a demo owner session");
  });

  it("only an owner/manager may preview — staff is forbidden (403)", async () => {
    const { agency, owner } = await seedRealFounder();
    const made = createFreelancer(agency.id, owner.id, { name: "Nope", email: "nope@ext.test" });
    const staff = createUser({
      email: `staff-prev-${agency.id}@real-co.test`, name: "Staff", role: "agency-staff",
      agencyId: agency.id, password: "staff-pass",
    });
    const staffToken = issueSession({
      userId: staff.id, email: staff.email, role: "agency-staff",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id, sessionRev: staff.sessionRev ?? 0,
    });
    const res = await previewFreelancerPOST(devModeRequest(staffToken, { employeeId: made.employeeId }));
    assert.equal(res.status, 403);
    assert.equal(cookieFrom(res), undefined, "no session minted when forbidden");
  });

  it("previewing an unknown employee 404s; exit without a preview marker 409s", async () => {
    const { token } = await seedRealFounder();
    const missing = await previewFreelancerPOST(devModeRequest(token, { employeeId: "no-such-employee" }));
    assert.equal(missing.status, 404);
    const staleExit = await previewFreelancerPOST(devModeRequest(token, { action: "exit" }));
    assert.equal(staleExit.status, 409, "a normal session has no previewReturnAgencyId");
  });

  it("the management + preview wiring (page · manager · routes · sidebar · exit)", () => {
    // server page lists via the admin read model + links to the access policy
    const page = read("src/app/portal/agency/freelancers/page.tsx");
    assert.match(page, /listAgencyFreelancers/);
    assert.match(page, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);
    assert.match(page, /\/portal\/agency\/freelancer-access/);
    // client manager: create + preview
    const manager = read("src/app/portal/agency/freelancers/_FreelancerManager.tsx");
    assert.match(manager, /\/api\/portal\/freelancers/);        // create
    assert.match(manager, /\/api\/auth\/preview-as-freelancer/); // preview
    assert.match(manager, /Preview workspace/);
    // create route: owner/manager only
    const createRoute = read("src/app/api/portal/freelancers/route.ts");
    assert.match(createRoute, /createFreelancer/);
    assert.match(createRoute, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
    // preview route: getSessionFromRequest + owner/manager gate + isDemo mint
    const previewRoute = read("src/app/api/auth/preview-as-freelancer/route.ts");
    assert.match(previewRoute, /previewReturnAgencyId: session\.agencyId/);
    assert.match(previewRoute, /isDemo: true/);
    assert.match(previewRoute, /status: 403/);
    // sidebar entry for agency owner/manager
    assert.match(read("src/lib/chrome/sidebarLayout.ts"), /href: "\/portal\/agency\/freelancers"/);
    // freelancer layout swaps Sign out for Exit preview while previewing
    const flLayout = read("src/app/portal/freelancer/layout.tsx");
    assert.match(flLayout, /previewReturnAgencyId/);
    assert.match(flLayout, /ExitPreview/);
    // session type carries the preview-return markers
    assert.match(read("src/server/types.ts"), /previewReturnAgencyId\?: string/);
    assert.match(read("src/lib/server/auth/auth.ts"), /previewReturnAgencyId: input\.previewReturnAgencyId/);
  });
});
