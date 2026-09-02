import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../src/app/portal/agency/performance/page.tsx", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../src/app/portal/agency/performance/_PerformanceWorkspace.tsx", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../src/app/portal/agency/performance/_AquaTagDashboard.tsx", import.meta.url),
  "utf8",
);
const integrationsRoute = readFileSync(
  new URL("../src/app/api/portal/settings/integrations/route.ts", import.meta.url),
  "utf8",
);

test("staff performance does not mount the owner-only Search Console connection client", () => {
  assert.match(
    integrationsRoute,
    /requireRole\(\["agency-owner", "agency-manager"\]\)/,
    "the credential catalogue must remain owner/manager-only",
  );
  assert.match(
    page,
    /const canManageSearchConsole = session\.role === "agency-owner" \|\| session\.role === "agency-manager"/,
  );
  assert.match(page, /canManageSearchConsole=\{canManageSearchConsole\}/);
  assert.match(workspace, /canManageSearchConsole=\{canManageSearchConsole\}/);
  assert.match(
    dashboard,
    /canManageSearchConsole \? <SearchConsolePanel client=\{client\} \/> : <SearchConsoleReadOnlyPanel \/>/,
  );
  assert.match(dashboard, /canManageSearchConsole \? "connect below" : "owner or manager setup"/);
  assert.match(dashboard, /An agency owner or manager can connect, sync or manage/);
});
