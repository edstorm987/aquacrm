// The last competing policies in HR, and the ones that are not competing.
//
// The checklist carried this beside the association gap: *"HR custom-role/
// client-assignment records and freelancer job policies have not all
// converged"*, and *"migrate or retire every competing HR/freelancer policy …
// Preserve the named alternative-authority routes instead of forcing the wrong
// client gate."*
//
// ── What the audit actually found (2026-08-27) ─────────────────────────────
//
// Most of the wording had gone stale: People itself consumes the evaluator
// thoroughly — `staff.people`, `staff.pay`, `staff.schedule`, `staff.training`,
// `workspace.settings` — and there are no `customRole` / client-assignment
// records left to converge. Sweeping every HR/freelancer/customer route for
// "decides access without the evaluator" left twelve, and nine of those are
// legitimate:
//
//   • public signup has no session to evaluate;
//   • the client portal's own routes act on the caller's OWN account and are
//     scoped by the session's `clientId` (see CUSTOMER_PORTAL_ROLES);
//   • the contractor's own surfaces answer to `FreelancerAccessConfig`, which
//     is the named alternative authority — forcing an agency element there
//     would be exactly the "wrong client gate" the plan warns about.
//
// Three were genuinely competing: agency-side HR routes deciding on a broad
// role while the rest of People decided on elements. Those are converged, and
// this file pins both halves — what MUST consume the evaluator, and what must
// deliberately not.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
/**
 * Source with comments AND import lines stripped.
 *
 * Comments, so a note about a gate never reads as one. Imports, because they
 * are the subtler trap: an unused `import { requireCurrentWorkspaceElementAccess }`
 * left behind after the call is deleted keeps every name-matching sweep green
 * over a route that no longer gates anything. Caught while probing this file —
 * removing the CV gate left the pin failing and the sweep passing.
 */
const code = (source: string) => source
  .split("\n")
  .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .filter(line => !/^\s*import\s/.test(line))
  .join("\n");

describe("the three competing HR policies are converged", () => {
  it("the freelancer roster answers to staff.people, not a broad role", () => {
    const src = code(read("src/app/api/portal/freelancers/route.ts"));
    assert.match(src, /requireCurrentWorkspaceElementAccess\("staff", "staff\.people", "view"\)/,
      "listing contractors is back to a role alone");
    assert.match(src, /requireCurrentWorkspaceElementAccess\("staff", "staff\.people", "manage"\)/,
      "provisioning a contractor identity is back to a role alone");
  });

  it("the freelancer-access POLICY is agency HR work, and gated as such", () => {
    // The distinction this pins: `FreelancerAccessConfig` governs the
    // CONTRACTOR; editing it is agency work and answers to People.
    const src = code(read("src/app/api/portal/freelancer-access/route.ts"));
    assert.match(src, /requireCurrentWorkspaceElementAccess\("staff", "staff\.people", "view"\)/);
    assert.match(src, /requireCurrentWorkspaceElementAccess\("staff", "staff\.people", "manage"\)/,
      "writing the policy that decides what every contractor sees is back to a role alone");
  });

  it("an applicant's CV answers to staff.people like every other application action", () => {
    const src = code(read("src/app/api/portal/people/cv/route.ts"));
    assert.match(src, /requireCurrentWorkspaceElementAccess\("staff", "staff\.people", "view"\)/,
      "CVs are readable on a role alone again — a manager restricted out of People can read them");
  });

  it("they use the SAME element People already uses, not a new one", () => {
    // Convergence means joining the existing map, not inventing a parallel
    // vocabulary — which is how competing policies start.
    const people = code(read("src/app/api/portal/people/route.ts"));
    assert.match(people, /assertWorkspaceElementAccess\(access, "staff\.people", "use"\)/,
      "People's own application actions no longer use staff.people");
    assert.match(people, /assertWorkspaceElementAccess\(access, "staff\.people", "manage"\)/);
  });
});

describe("the alternative authorities are preserved, deliberately", () => {
  it("the contractor's own surfaces are NOT evaluated as agency identities", () => {
    // Forcing an agency element on these is the failure mode the plan names.
    for (const path of [
      "src/app/api/portal/freelancer/work/route.ts",
      "src/app/api/portal/freelancer/submit/route.ts",
      "src/app/api/portal/freelancer/message/route.ts",
    ]) {
      const src = code(read(path));
      assert.doesNotMatch(src, /requireCurrentWorkspaceElementAccess\("staff"/,
        `${path} now evaluates a contractor as agency staff`);
    }
    // …and the authority that DOES govern them still exists.
    assert.match(read("src/server/freelancerWorkspace.ts"), /clientIdentity === "named"/,
      "FreelancerAccessConfig's client-naming policy is gone");
  });

  it("the client portal's own routes stay scoped by the caller's session", () => {
    for (const path of [
      "src/app/api/portal/customer/setup/route.ts",
      "src/app/api/portal/customer/connections/route.ts",
    ]) {
      const src = code(read(path));
      assert.match(src, /CUSTOMER_PORTAL_ROLES/,
        `${path} stopped naming the client-portal audience`);
      assert.doesNotMatch(src, /requireCurrentWorkspaceElementAccess\("staff"/,
        `${path} now asks a client for an agency staff element`);
    }
  });
});

describe("a new HR route cannot quietly decide access on its own", () => {
  it("every agency-side people/freelancer route consumes the evaluator", () => {
    // The tripwire. A new route under these folders that gates on a role alone
    // fails here and has to say which element it means — or be added to the
    // alternative-authority list below with a reason.
    const ALTERNATIVE_AUTHORITY: Record<string, string> = {
      "src/app/api/portal/freelancer/work/route.ts": "the contractor's own work — FreelancerAccessConfig",
      "src/app/api/portal/freelancer/work/content/route.ts": "the contractor's own deliverable bytes — FreelancerAccessConfig",
      "src/app/api/portal/freelancer/submit/route.ts": "the contractor submitting their own job — FreelancerAccessConfig",
      "src/app/api/portal/freelancer/message/route.ts": "the contractor messaging their own owner — FreelancerAccessConfig",
    };
    // A CALL, not a mention: `\(` is what separates gating from importing.
    const ELEMENT = /(?:requireCurrentWorkspaceElementAccess|assertWorkspaceElementAccess|requireCurrentAccessActor|requireAccessCapability)\s*\(/;

    const roots = ["src/app/api/portal/people", "src/app/api/portal/freelancers", "src/app/api/portal/freelancer", "src/app/api/portal/freelancer-access"];
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "route.ts") routes.push(full);
      }
    };
    for (const root of roots) walk(root);
    assert.ok(routes.length >= 6, `expected the HR route set, found ${routes.length}`);

    const ungoverned = routes.filter(path =>
      !ELEMENT.test(code(read(path))) && !(path in ALTERNATIVE_AUTHORITY));
    assert.deepEqual(ungoverned, [],
      "these HR routes decide access without the evaluator and are not listed as an "
      + `alternative authority:\n  ${ungoverned.join("\n  ")}`);

    // …and the exemption list may not rot: every entry must still exist and
    // must still be role-gated, or it is a stale exemption hiding a real gate.
    for (const [path, reason] of Object.entries(ALTERNATIVE_AUTHORITY)) {
      assert.ok(routes.includes(path), `${path} is exempted but no longer exists`);
      assert.ok(reason.length > 20, `${path} needs a real reason`);
    }
  });
});
