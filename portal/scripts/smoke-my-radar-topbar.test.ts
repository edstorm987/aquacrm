// My Radar in shared chrome: the signed-in person's operating picture.
//
// This file pins the separation that matters: My Radar stays person-scoped
// even for an owner, while Business Radar keeps its own id, icon and route.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { TOPBAR_CONTROL_IDS } from "../src/lib/chrome/topbarControls";

const read = (path: string) => readFileSync(path, "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const BUTTON = "src/components/chrome/MyRadarButton.tsx";
const CONTROL = "src/components/chrome/MyRadarControl.tsx";
const PANEL = "src/components/chrome/MyRadarQuickLookPanel.tsx";
const ROUTE = "src/app/api/portal/intelligence/my-radar/route.ts";
const ACTIONS = "src/lib/server/intelligence/personalRadarActions.ts";

describe("the registered control", () => {
  it("keeps personal and business Radar as separate topbar controls", () => {
    const ids = TOPBAR_CONTROL_IDS as readonly string[];
    assert.equal(ids.indexOf("my-radar"), ids.indexOf("department") + 1);
    assert.ok(ids.includes("radar"));
    assert.notEqual(ids.indexOf("my-radar"), ids.indexOf("radar"));
  });

  it("mounts My Radar for agency people without broadening showcase chrome", () => {
    const topbar = stripComments(read("src/components/chrome/Topbar.tsx"));
    const block = topbar.split("const collapsible")[1]?.split("const pinnedControls")[0] ?? "";
    const gate = /!publicShowcase && !showcaseMode && isAgencyRole\(role\)/g;
    assert.equal([...block.matchAll(gate)].length, 2);
    assert.match(block, /isAgencyRole\(role\) && navHrefs\.has\("\/portal\/agency\/my-radar"\)[\s\S]*id: "my-radar", label: "My Radar"/,
      "the actor-resolved nav must earn the shared control; role alone is not authority");
    assert.match(block, /<MyRadarControl key="my-radar" activeDepartment=\{activeDepartment\} staffWorkspace=\{role === "agency-staff"\} businessRadarAvailable=\{businessRadarAvailable\}/,
      "personal and business visibility decisions must be passed independently");
  });
});

describe("the lazy server wrapper", () => {
  const source = stripComments(read(CONTROL));

  it("does not scan personal data on every shared-shell render", () => {
    assert.match(source, /return <MyRadarButton/);
    assert.doesNotMatch(source, /readPersonalRadar|readPersonalRadarActions|resolvePersonalRadarAccess|ensureHydrated|getSession|requireCurrentAccessActor|requireCurrentWorkspaceElementAccess/,
      "the layout already made the authorization decision; data is fetched only when the popover opens");
    const button = stripComments(read(BUTTON));
    assert.match(button, /dynamic\([\s\S]*MyRadarQuickLookPanel[\s\S]*ssr:\s*false/,
      "the personal station chunk must remain off the first-load shared shell");
  });

  it("never writes on the shared render path", () => {
    assert.doesNotMatch(source, /flushPendingWrites|setUserChromeLayout|mutate\(/);
  });
});

describe("the fresh-read route", () => {
  const route = stripComments(read(ROUTE));
  const actions = stripComments(read(ACTIONS));

  it("retains the overview envelope and the independent Actions element gate", () => {
    assert.match(route, /getSessionFromRequest/);
    assert.match(route, /session\.role !== "agency-owner"[\s\S]*requireCurrentWorkspaceElementAccess\("staff", "staff\.overview", "view"\)[\s\S]*requireCurrentAccessActor/,
      "staff and narrowed managers must pass staff.overview while the owner keeps the owner baseline");
    assert.match(route, /resolvePersonalRadarAccessForActor\(actor\)/);
    assert.match(route, /readPersonalRadarActions\(session, now, actor\)/,
      "the one actor projection must be reused by every personal slice");
    assert.match(actions, /assertWorkspaceElementAccess\([\s\S]*resolveActorWorkspaceElementAccess\(actor, "staff"\)[\s\S]*"workspace\.actions",[\s\S]*"view"/);
    assert.match(actions, /available: false, actions: \[\]/,
      "losing Actions access hides only that slice, not wellbeing or goals");
  });

  it("uses the actor's resource tenant and the session person, and remains read-only", () => {
    assert.match(route, /agencyId: actor\.resourceAgencyId,[\s\S]*userId: session\.userId/,
      "sandbox reads must follow the resource tenant without ever accepting a user id from the request");
    assert.doesNotMatch(route, /flushPendingWrites|export async function (POST|PATCH|PUT|DELETE)/);
    assert.doesNotMatch(route, /searchParams|request\.json\(/);
    assert.match(route, /error instanceof AccessControlError[\s\S]*accessErrorResponse\(error\)/,
      "a capability refusal must stay a 403 rather than becoming a generic failure");
  });

  it("filters personal actions through assignment and client visibility", () => {
    assert.match(actions, /taskBelongsOnMyRadar\(task, session\.userId\)/);
    assert.match(actions, /association\.canReadClientAssociation\(actor, "agency-task", clientId\)/);
    assert.match(actions, /canReadAssociatedClient\(task\.clientId\)/);
  });
});

describe("the button", () => {
  const source = stripComments(read(BUTTON));

  it("badges only urgent or overdue personal items with accessible words", () => {
    assert.match(source, /personalRadarAttentionCount/);
    assert.match(source, /personal .*item needs/);
    assert.match(source, /personal overview ready/);
    assert.match(source, /mm-attention-badge/);
  });

  it("is visually and technically distinct from Business Radar", () => {
    const lucideImport = /import \{([^}]*)\} from "lucide-react"/.exec(source)?.[1] ?? "";
    assert.ok(lucideImport.includes("Gauge"));
    assert.ok(!/\bRadar\b/.test(lucideImport));
    assert.doesNotMatch(source, /fetch\(/);
  });

  it("keeps the newest safe snapshot across popover closes", () => {
    assert.match(source, /initial\.generatedAt >= snapshot\.generatedAt/);
    assert.match(source, /data-chrome-surface/);
  });
});

describe("the quick look", () => {
  const source = stripComments(read(PANEL));

  it("refreshes one composed personal projection without a client waterfall", () => {
    assert.match(source, /fetch\("\/api\/portal\/intelligence\/my-radar"/);
    assert.doesNotMatch(source, /fetch\("\/api\/portal\/dashboard-planning"/);
    assert.match(source, /<PersonalRadarPanel/);
    assert.match(source, /variant="popover"/);
  });

  it("answers revoked overview access with a closed door", () => {
    assert.match(source, /response\.status === 403/);
    assert.match(source, /staff overview access is turned off/i);
  });

  it("sends staff to personal destinations and gates Business Radar independently", () => {
    assert.match(source, /staffWorkspace \? "\/portal\/team\/actions" : "\/portal\/agency\/actions"/);
    assert.match(source, /goalsHref="\/portal\/agency\/calendar"/,
      "the exact staff-admitted Command Calendar is where personal goals live");
    assert.match(source, /businessRadarHref=\{businessRadarAvailable \? "\/portal\/agency\/radar" : null\}/);
    assert.match(source, /\{businessRadarAvailable \? \([\s\S]*href="\/portal\/agency\/radar"/,
      "the footer must consume the same actor-resolved Business Radar decision as the panel");
    assert.doesNotMatch(source, /\/portal\/team\/calendar/);
  });
});
