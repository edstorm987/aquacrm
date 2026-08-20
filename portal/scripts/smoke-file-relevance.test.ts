import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PORTAL_SCOPE, WEBSITE_SCOPE, isRelevant, relevantFiles, scopeForSection,
} from "../src/lib/editing/fileRelevance.ts";

describe("narrowing the repository to what is being edited", () => {
  // Editing a client portal and being shown the marketing site, the API
  // routes and the test suite is not more power — it is the answer buried.
  it("keeps what renders a client portal", () => {
    for (const path of [
      "src/app/client-preview/[clientId]/page.tsx",
      "src/lib/clientPortalBuilder.ts",
      "src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx",
    ]) {
      assert.ok(isRelevant(path, PORTAL_SCOPE), `${path} should be portal-relevant`);
    }
  });

  it("drops what plainly is not", () => {
    for (const path of ["src/app/api/telemetry/collect/route.ts", "scripts/smoke-tasks.test.ts"]) {
      assert.equal(isRelevant(path, PORTAL_SCOPE), false, `${path} should not be portal-relevant`);
    }
  });

  it("separates the website from the portal", () => {
    assert.ok(isRelevant("src/server/agencyWebsite.ts", WEBSITE_SCOPE));
    assert.equal(isRelevant("src/server/agencyWebsite.ts", PORTAL_SCOPE), false);
  });
});

describe("narrowing further to one page", () => {
  it("prefers the section but keeps the shell that renders it", () => {
    // A filter that returns three files nobody can edit is not a filter, it
    // is a dead end.
    const scope = scopeForSection(PORTAL_SCOPE, "billing");
    assert.ok(isRelevant("src/components/portal/BillingPanel.tsx", scope));
    assert.ok(isRelevant("src/lib/clientPortalBuilder.ts", scope), "the shell must stay reachable");
    assert.equal(scope.label, "billing files");
  });

  it("is unchanged when no page is selected", () => {
    assert.equal(scopeForSection(PORTAL_SCOPE).label, PORTAL_SCOPE.label);
  });
});

describe("filtering a list", () => {
  const files = [
    { path: "src/lib/clientPortalBuilder.ts" },
    { path: "src/app/api/telemetry/collect/route.ts" },
    { path: "src/lib/chrome/brandKit.ts" },
  ];

  it("keeps only what is in scope", () => {
    assert.deepEqual(relevantFiles(files, PORTAL_SCOPE).map(f => f.path), ["src/lib/clientPortalBuilder.ts"]);
  });

  it("never hides a file that was explicitly opened", () => {
    // Locating an element through the picker and then switching to the
    // filtered view must not hide the file you were just sent to.
    const kept = relevantFiles(files, PORTAL_SCOPE, ["src/lib/chrome/brandKit.ts"]);
    assert.ok(kept.some(f => f.path === "src/lib/chrome/brandKit.ts"));
  });
});
