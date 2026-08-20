// Operations attention rollup — regression guard.
//
// When the Operations surface collapsed to a single row, its business functions
// (Finance, Fulfilment, Marketing, Journey, Staff…) stopped rendering as sidebar
// rows — they live on a hidden, search-only panel. Their alert badges must not
// vanish: addSidebarAttention rolls the hidden functions' attention up onto the
// one visible "Operations" (operations-home) row. This pins that behaviour so a
// future refactor cannot silently drop the operator's at-a-glance signal.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildSidebar } from "../src/lib/chrome/sidebarLayout";
import { addSidebarAttention } from "../src/lib/server/sidebarAttention";
import type { OperationalAlert } from "../src/lib/intelligence/operationalAttention";

function alert(id: string, category: OperationalAlert["category"], href: string): OperationalAlert {
  return { id, severity: "warning", category, title: id, detail: id, href, occurredAt: 0 };
}

const ownerSidebar = () => buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [] });

describe("Operations attention rollup", () => {
  it("rolls the hidden functions' badges up onto the single Operations row", () => {
    const alerts: OperationalAlert[] = [
      alert("a1", "money", "/portal/agency/agency-finance"),   // -> finance
      alert("a2", "outage", "/portal/agency/fulfilment"),      // -> fulfilment
      alert("a3", "marketing", "/portal/agency/marketing"),    // -> marketing
    ];
    const panels = addSidebarAttention(ownerSidebar(), alerts);
    const main = panels.find(p => p.id === "main")!;
    const opsHome = main.items.find(i => i.id === "operations-home");
    assert.ok(opsHome, "the Operations row assembles on main");
    assert.equal(opsHome!.attentionCount, 3, "Operations row aggregates finance + fulfilment + marketing alerts");
  });

  it("does not roll inbox/actions alerts onto the Operations row (they own the Inbox row)", () => {
    const alerts: OperationalAlert[] = [
      alert("i1", "support", "/portal/agency/inbox"),                 // -> inbox
      alert("i2", "task", "/portal/agency/actions#task-x"),           // -> inbox
    ];
    const panels = addSidebarAttention(ownerSidebar(), alerts);
    const main = panels.find(p => p.id === "main")!;
    const opsHome = main.items.find(i => i.id === "operations-home");
    const inbox = main.items.find(i => i.id === "inbox");
    assert.equal(opsHome?.attentionCount ?? 0, 0, "inbox/actions alerts must not light the Operations row");
    assert.equal(inbox?.attentionCount, 2, "inbox/actions alerts land on the Inbox row");
  });
});
