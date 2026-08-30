// Worker profiles — the presets a hired caller's seat is cut from.
//
// Ed, 2026-08-29, on why departments and not people: *"as a freelancer one-man
// band you have to judge the departments not the person, since if you judge the
// departments you'll see if enough is allocated or not or whether expansion is
// needed. But if you judge it as a whole it may look alright."*
//
// And on how they should be enforced: *"they should only see what is configured
// access for them — everything is roles."*
//
// So these are presets over the EXISTING element RBAC, and the tests below are
// about the two ways a preset goes wrong:
//
//   • it names an element key that does not exist, so the grant silently does
//     nothing and a seat is broader or narrower than it reads;
//   • it quietly hands out more than the job needs — which matters most here,
//     because the first person to sit in the sales seat is a commission caller
//     on a trial who nobody has met.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEPARTMENT_PROFILES, departmentCapabilities, departmentProfile, departmentTemplateName,
} from "../src/lib/access/departmentProfiles";
import { ACCESS_ELEMENT_KEYS, ACCESS_CAPABILITIES } from "../src/server/types";

describe("the presets are expressed in the real vocabulary", () => {
  it("names only element keys the authority actually knows", () => {
    // A typo here is invisible at runtime: the capability is simply never
    // matched, and the seat is narrower than it reads on screen.
    const known = new Set<string>(ACCESS_ELEMENT_KEYS);
    for (const profile of DEPARTMENT_PROFILES) {
      for (const key of [...profile.use, ...profile.view]) {
        assert.ok(known.has(key), `${profile.id} names "${key}", which is not an element key`);
      }
    }
  });

  it("produces capabilities the authority will accept", () => {
    const valid = new Set<string>(ACCESS_CAPABILITIES);
    for (const profile of DEPARTMENT_PROFILES) {
      for (const capability of departmentCapabilities(profile)) {
        assert.ok(valid.has(capability), `${profile.id} produced "${capability}", which is not a capability`);
      }
    }
  });

  it("always opens the door", () => {
    // A grant of five elements without `workspace.view` is a seat nobody can
    // sit in — there is no shell to put the rest inside.
    for (const profile of DEPARTMENT_PROFILES) {
      assert.ok(departmentCapabilities(profile).includes("workspace.view"), `${profile.id} cannot open the workspace`);
    }
  });

  it("never lists one element as both use and view", () => {
    // Both would be emitted, and which one wins is then the resolver's
    // business rather than this file's stated intent.
    for (const profile of DEPARTMENT_PROFILES) {
      const overlap = profile.use.filter(key => (profile.view as string[]).includes(key));
      assert.deepEqual(overlap, [], `${profile.id} lists ${overlap.join(", ")} twice`);
    }
  });
});

describe("no preset hands out more than the job needs", () => {
  it("grants `manage` on nothing at all", () => {
    // Configuring a department is the owner's job. A preset that includes
    // `manage` widens access every time it is granted, silently, for ever.
    for (const profile of DEPARTMENT_PROFILES) {
      const managing = departmentCapabilities(profile).filter(capability => capability.endsWith(".manage"));
      assert.deepEqual(managing, [], `${profile.id} grants manage: ${managing.join(", ")}`);
    }
  });

  it("keeps pay out of every seat except finance, and read-only there", () => {
    for (const profile of DEPARTMENT_PROFILES) {
      const pay = departmentCapabilities(profile).filter(capability => capability.includes("staff.pay"));
      if (profile.id === "finance") {
        assert.deepEqual(pay, ["element.staff.pay.view"], "finance reconciles pay; it does not change it");
      } else {
        assert.deepEqual(pay, [], `${profile.id} must not reach pay and commission`);
      }
    }
  });

  it("keeps workspace settings out of every seat", () => {
    for (const profile of DEPARTMENT_PROFILES) {
      const settings = departmentCapabilities(profile).filter(capability => capability.includes("workspace.settings"));
      assert.deepEqual(settings, [], `${profile.id} must not reach workspace settings`);
    }
  });
});

describe("the sales seat specifically", () => {
  // The one being filled first, by somebody on a trial.
  const sales = departmentProfile("sales");

  it("exists and can do the job", () => {
    assert.ok(sales);
    const capabilities = departmentCapabilities(sales);
    assert.ok(capabilities.includes("element.growth.contacts.use"), "a caller needs the list");
    assert.ok(capabilities.includes("element.growth.outreach.use"), "…and the dialler");
  });

  it("cannot send campaigns — not even see them", () => {
    // Bulk sending from an agency address is a reputational action, and a new
    // caller on a trial is the last person who should reach it.
    const capabilities = departmentCapabilities(sales!);
    assert.ok(!capabilities.some(capability => capability.includes("growth.campaigns")),
      "campaigns must be absent from the sales seat entirely");
  });

  it("cannot reach client commercial or finance surfaces", () => {
    const capabilities = departmentCapabilities(sales!);
    for (const forbidden of ["client.commercial", "staff.pay", "workspace.settings", "development."]) {
      assert.ok(!capabilities.some(capability => capability.includes(forbidden)),
        `the sales seat must not reach ${forbidden}`);
    }
  });
});

describe("lookup", () => {
  it("resolves a known id and refuses anything else", () => {
    assert.equal(departmentProfile("sales")?.label, "Sales");
    assert.equal(departmentProfile("nonsense"), undefined);
    assert.equal(departmentProfile(undefined), undefined);
  });

  it("names templates so an agency can find and edit them", () => {
    // They are seeded as ORDINARY role templates — the preset is a starting
    // point, not a locked one.
    assert.equal(departmentTemplateName(departmentProfile("sales")!), "Sales — worker profile");
  });

  it("covers every department Ed asked for", () => {
    assert.deepEqual(
      DEPARTMENT_PROFILES.map(profile => profile.id).sort(),
      ["delivery", "finance", "marketing", "sales", "support"],
    );
  });
});

describe("the realm boundary a seat has to respect", () => {
  // Learned the hard way on 2026-08-29: wiring `ensureDemoSalesSeat` into
  // `seedDemoAgency` failed 24 Dev Mode tests with `actor_not_found`.
  //
  // `withAccessControlPlaneTransaction` runs every grant and template write
  // inside `runInDataRealm(LIVE_DATA_REALM_ID, …)` — the access authority is
  // ONE live-realm record however you are browsing. A seed running in a sandbox
  // realm therefore looks its actor up in a state that does not contain them.
  //
  // The rule is not "be careful", it is "the demo seed does not grant".

  it("the access plane still forces the live realm", () => {
    // If this ever stops being true the reasoning above is stale and the
    // comment in demoSeed.ts is a lie — so it is asserted, not assumed.
    const source = readFileSync("src/server/accessControl.ts", "utf8");
    assert.match(source, /function withAccessControlPlaneTransaction[\s\S]*?runInDataRealm\(LIVE_DATA_REALM_ID/,
      "grants and templates must still be written in the live realm");
  });

  it("the demo seed does not grant a seat", () => {
    const source = readFileSync("src/lib/server/seeds/demoSeed.ts", "utf8");
    const code = source.split("\n").filter(line => !line.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(code, /ensureDemoSalesSeat/,
      "provisioning a seat is a deliberate live-realm act, not a side effect of seeding demo data");
  });

  it("…and says why, where the next person will look", () => {
    const source = readFileSync("src/lib/server/seeds/demoSeed.ts", "utf8");
    assert.match(source, /LIVE_DATA_REALM_ID/,
      "the boundary must be explained at the place somebody would re-add the call");
  });
});
