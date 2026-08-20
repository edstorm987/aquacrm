import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("icon-led workspace usability", () => {
  it("gives primary workspace switchers recognizable icons", () => {
    const people = read("src/app/portal/clients/_PeopleHub.tsx");
    const marketing = read("src/app/portal/agency/marketing/page.tsx");
    const finance = read("src/built-ins/modules/agency-finance/src/components/FinanceNav.tsx");
    const inbox = read("src/app/portal/agency/inbox/_MasterInbox.tsx");
    const experience = read("src/app/portal/agency/you-deserve-it/_YouDeserveItWorkspace.tsx");
    const radar = read("src/app/portal/agency/_RadarPolicyPanel.tsx");

    for (const icon of ["Building2", "UserSearch", "Route", "UserRound", "Fingerprint", "UsersRound"]) {
      assert.match(people, new RegExp(`icon=\\{${icon}\\}`));
    }
    assert.match(people, /<HeartPulse/);
    // Marketing's five channel switchers moved from top-level tabs into the
    // consolidated Channels view (2026-08-19), where the icon is carried on a
    // config row (`icon: Target`) rather than a JSX prop (`icon={Target}`). The
    // contract is the same — every switcher still has its own recognisable icon
    // — so accept either wiring.
    for (const icon of ["Megaphone", "UserRoundSearch", "RadioTower", "Globe2", "Workflow", "Target", "MapPin", "Star", "Activity", "LockKeyhole"]) {
      assert.match(marketing, new RegExp(`icon=\\{${icon}\\}|icon: ${icon}\\b`), `${icon} is not wired to any marketing switcher`);
    }
    for (const icon of ["LayoutDashboard", "ArrowDownToLine", "ArrowUpFromLine", "FileText", "BarChart3", "WalletCards", "Landmark", "Target"]) {
      assert.match(finance, new RegExp(icon));
    }
    for (const icon of ["AlertTriangle", "Radio", "FileText", "Bot", "LifeBuoy", "MessageCircle", "Bell", "Inbox"]) {
      assert.match(inbox, new RegExp(`icon=\\{${icon}\\}`));
    }
    for (const icon of ["ShoppingBag", "PackageCheck", "Users", "HeartPulse", "Star", "CheckCircle2"]) {
      assert.match(experience, new RegExp(`icon=\\{${icon}\\}`));
    }
    for (const icon of ["Settings2", "Layers3", "Gauge", "ShieldAlert"]) {
      assert.match(radar, new RegExp(`\\["[^"]+", ${icon}\\]`));
    }
  });

  it("keeps frequent commands paired with meaningful symbols", () => {
    const actions = read("src/app/portal/agency/actions/_ActionsWorkspace.tsx");
    const people = read("src/app/portal/clients/_PeopleHub.tsx");
    const inbox = read("src/app/portal/agency/inbox/_MasterInbox.tsx");
    const sops = read("src/app/portal/agency/sop-library/_SopLibrary.tsx");

    assert.match(actions, /<Save size=\{14\} \/> Save changes/);
    assert.match(actions, /<Pencil size=\{13\} \/>/);
    assert.match(actions, /<CalendarDays size=\{13\} \/> Today/);
    assert.match(people, /<X size=\{14\} \/> Clear/);
    assert.match(people, /<Save size=\{15\} \/>\{busy \? "Saving\.\.\." : "Save notes"\}/);
    assert.match(inbox, /<Check size=\{13\} \/> Mark reviewed/);
    assert.match(inbox, /<RotateCcw size=\{13\} \/> Reopen/);
    assert.match(sops, /<FolderPlus size=\{15\} \/> Create folder/);
    assert.match(sops, /<Save size=\{15\} \/>\{busy \? "Saving\.\.\." : "Save SOP"\}/);
  });
});
