import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { NextRequest } from "next/server";

import { destinationSearchItemsFor } from "../src/lib/chrome/destinations";
import {
  STAFF_WORKSPACE_NAVIGATION,
  agencyRolesForStaffWorkspaceApiPath,
  agencyRolesForStaffWorkspacePagePath,
  isStaffDelegatedAgencyPagePath,
  isStaffWorkspaceApiPath,
  isStaffWorkspacePagePath,
  isStaffWorkspaceSearchPagePath,
  staffWorkspaceCapabilitiesForApiPath,
} from "../src/lib/staffWorkspacePolicy";
import { proxy } from "../src/proxy";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function staffRequest(path: string): NextRequest {
  const payload = Buffer.from(JSON.stringify({ role: "agency-staff" })).toString("base64url");
  return new NextRequest(`http://localhost:3032${path}`, {
    headers: { cookie: `lk_session_v1=${payload}.test-signature` },
  });
}

describe("canonical staff workspace capability policy", () => {
  it("matches intended page prefixes and refuses owner/cross-workspace pages", () => {
    for (const path of [
      "/portal/team",
      "/portal/team/chat",
      "/portal/agency/people",
      "/portal/agency/fulfilment",
      "/portal/agency/portals",
      "/portal/agency/portals/editor",
      "/portal/dev-workspace/project-one",
      "/portal/account/permissions",
    ]) assert.equal(isStaffWorkspacePagePath(path), true, path);

    for (const path of [
      "/portal/agency/settings",
      "/portal/agency/inbox",
      "/portal/agency/portals/forms",
      "/portal/agency/people-private",
      "/portal/dev-team",
    ]) assert.equal(isStaffWorkspacePagePath(path), false, path);

    assert.equal(isStaffDelegatedAgencyPagePath("/portal/agency/people"), true);
    assert.equal(isStaffDelegatedAgencyPagePath("/portal/team"), false);
    assert.deepEqual(agencyRolesForStaffWorkspacePagePath("/portal/agency/settings"), ["agency-owner", "agency-manager"]);
    assert.deepEqual(agencyRolesForStaffWorkspacePagePath("/portal/agency/people"), ["agency-owner", "agency-manager", "agency-staff"]);
  });

  it("treats the Fulfilment prefix as proxy admission and requires a Technical leaf gate", () => {
    const aliases = ["toolkit", "vault", "workflow", "website", "performance"];
    for (const alias of aliases) {
      assert.equal(isStaffWorkspacePagePath(`/portal/agency/fulfilment/technical/${alias}`), true, alias);
      assert.match(
        read(`src/app/portal/agency/fulfilment/technical/${alias}/page.tsx`),
        /development\/(?:toolkit|vault|workflow|website|performance)\/page/,
      );
    }
    assert.equal(isStaffWorkspacePagePath("/portal/agency/fulfilment/technical/projects/aquacrm-platform"), true);
    assert.match(
      read("src/app/portal/agency/fulfilment/technical/projects/[projectId]/page.tsx"),
      /development\/projects\/\[projectId\]\/page/,
    );

    const leafLayout = read("src/app/portal/agency/fulfilment/technical/layout.tsx");
    assert.match(leafLayout, /requireCurrentFulfilmentTechnicalAccess\("view"\)/);
    assert.match(leafLayout, /error\.status === 403/);
    assert.match(leafLayout, /error\.message === "workspace_element_view_required"/);
    assert.match(leafLayout, /notFound\(\)/);
    const sharedLoaders = [
      "src/app/portal/agency/development/page.tsx",
      "src/app/portal/agency/development/_loadDevelopmentData.ts",
      "src/app/portal/agency/development/website/page.tsx",
      "src/app/portal/agency/development/performance/page.tsx",
      "src/app/portal/agency/development/projects/[projectId]/page.tsx",
    ];
    for (const loader of sharedLoaders) {
      assert.match(read(loader), /requireCurrentFulfilmentTechnicalAccess\("view"\)/, loader);
    }
  });

  it("owns API prefixes by capability and keeps agency-wide APIs closed", () => {
    for (const path of [
      "/api/portal/team-chat",
      "/api/portal/tasks/checklist",
      "/api/portal/people/cv",
      "/api/portal/pipelines/move-client",
      "/api/portal/development",
      "/api/portal/development/upload",
      "/api/portal/development/content",
      "/api/portal/client-portal-design",
      "/api/portal/dev/projects",
      "/api/portal/chrome/layout",
      "/api/portal/mfa/enrol",
    ]) assert.equal(isStaffWorkspaceApiPath(path), true, path);

    for (const path of [
      "/api/portal/notifications",
      "/api/portal/inbox/conversations",
      "/api/portal/settings/portal-editor",
      "/api/portal/dev-team/findings",
      "/api/portal/development/admin",
      "/api/portal/client-portal-design-private",
    ]) assert.equal(isStaffWorkspaceApiPath(path), false, path);

    assert.deepEqual(staffWorkspaceCapabilitiesForApiPath("/api/portal/tasks"), ["team", "people"]);
    assert.deepEqual(staffWorkspaceCapabilitiesForApiPath("/api/portal/development"), ["fulfilment"]);
    assert.deepEqual(agencyRolesForStaffWorkspaceApiPath("/api/portal/notifications"), ["agency-owner", "agency-manager"]);
    assert.deepEqual(agencyRolesForStaffWorkspaceApiPath("/api/portal/client-portal-design"), ["agency-owner", "agency-manager", "agency-staff"]);
  });

  it("drives shared navigation and registry search from policy-owned paths", () => {
    assert.deepEqual(STAFF_WORKSPACE_NAVIGATION.map(item => item.id), ["team", "people", "fulfilment", "account"]);
    assert.ok(STAFF_WORKSPACE_NAVIGATION.every(item => isStaffWorkspacePagePath(item.href)));

    const staffSearch = destinationSearchItemsFor("agency-staff", false);
    assert.ok(staffSearch.some(item => item.href === "/portal/team"));
    assert.ok(staffSearch.some(item => item.href === "/portal/account/permissions"));
    assert.ok(staffSearch.every(item => isStaffWorkspaceSearchPagePath(item.href)));
    assert.ok(!staffSearch.some(item => item.href === "/portal/agency/settings"));

    const basePanels = read("src/lib/server/chrome/agencyBasePanels.ts");
    assert.match(basePanels, /STAFF_WORKSPACE_NAVIGATION/);
    assert.doesNotMatch(basePanels, /href:\s*"\/portal\/agency\/(?:people|fulfilment)"/);
  });

  it("makes proxy, page layout and API leaves consume the same policy", () => {
    for (const path of [
      "/portal/agency/people",
      "/portal/agency/fulfilment?view=portals",
      "/portal/agency/fulfilment/technical/toolkit",
      "/portal/agency/portals/editor",
      "/api/portal/team-chat",
      "/api/portal/development",
      "/api/portal/client-portal-design",
    ]) assert.equal(proxy(staffRequest(path)).status, 200, path);

    for (const path of [
      "/portal/agency/settings",
      "/portal/agency/portals/forms",
    ]) assert.equal(proxy(staffRequest(path)).status, 307, path);
    for (const path of [
      "/api/portal/notifications",
      "/api/portal/settings/portal-editor",
    ]) assert.equal(proxy(staffRequest(path)).status, 403, path);

    const agencyLayout = read("src/app/portal/agency/layout.tsx");
    assert.match(agencyLayout, /agencyRolesForStaffWorkspacePagePath\(currentPath\)/);
    assert.match(agencyLayout, /x-aqua-route-path/);
    assert.match(read("src/app/api/portal/team-chat/route.ts"), /agencyRolesForStaffWorkspaceApiPath\("\/api\/portal\/team-chat"\)/);
    assert.match(read("src/app/api/portal/client-portal-design/route.ts"), /agencyRolesForStaffWorkspaceApiPath/);
    assert.match(read("src/app/api/portal/notifications/route.ts"), /agencyRolesForStaffWorkspaceApiPath\("\/api\/portal\/notifications"\)/);
    for (const path of [
      "src/app/api/portal/development/route.ts",
      "src/app/api/portal/development/upload/route.ts",
      "src/app/api/portal/development/content/route.ts",
    ]) {
      assert.match(read(path), /requireCurrentFulfilmentTechnicalAccess/, path);
    }
  });
});
