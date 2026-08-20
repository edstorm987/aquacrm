import assert from "node:assert/strict";
import { test } from "node:test";

import type { MarketingCustomerProfile } from "../src/built-ins/modules/agency-marketing/src/lib/domain";
import { scopeProfiles, summariseProfileDimension } from "../src/lib/customerProfileScope";

function makeProfile(overrides: Partial<MarketingCustomerProfile>): MarketingCustomerProfile {
  return {
    companyIds: [],
    locations: [],
    segment: "",
    priority: "secondary",
    status: "active",
    evidenceConfidence: "assumption",
    ...overrides,
  } as unknown as MarketingCustomerProfile;
}

test("scopeProfiles filters to one company and always keeps group-wide profiles", () => {
  const profiles = [
    makeProfile({ companyIds: ["co-1"] }),
    makeProfile({ companyIds: ["co-2"] }),
    makeProfile({ companyIds: [] }),          // group-wide
  ];
  assert.equal(scopeProfiles(profiles, "all").length, 3);
  assert.equal(scopeProfiles(profiles, "co-1").length, 2);   // co-1 + group-wide
  assert.equal(scopeProfiles(profiles, "co-2").length, 2);   // co-2 + group-wide
});

test("summariseProfileDimension counts by dimension, array dimensions counting each value, sorted", () => {
  const profiles = [
    makeProfile({ segment: "SMB", locations: ["London", "Kent"] }),
    makeProfile({ segment: "SMB", locations: ["London"] }),
    makeProfile({ segment: "Enterprise", locations: [] }),
  ];
  assert.deepEqual(summariseProfileDimension(profiles, "segment"), [{ value: "SMB", count: 2 }, { value: "Enterprise", count: 1 }]);
  assert.deepEqual(summariseProfileDimension(profiles, "location"), [{ value: "London", count: 2 }, { value: "Kent", count: 1 }, { value: "Unspecified", count: 1 }]);
});

test("summariseProfileDimension maps company ids to names and labels group-wide", () => {
  const rows = summariseProfileDimension(
    [makeProfile({ companyIds: ["co-1"] }), makeProfile({ companyIds: [] })],
    "company",
    new Map([["co-1", "Brand Alpha"]]),
  );
  assert.deepEqual(rows, [{ value: "Brand Alpha", count: 1 }, { value: "Group-wide", count: 1 }]);
});
