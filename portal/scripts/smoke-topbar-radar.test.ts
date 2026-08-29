import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

describe("topbar Radar quick look", () => {
  it("uses live Radar data and is available throughout agency workspaces", async () => {
    const [button, control, topbar, agencyLayout, peoplePage, clientLayout] = await Promise.all([
      readFile(new URL("../src/components/chrome/RadarQuickLookButton.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/RadarQuickLookControl.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/Topbar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/clients/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/clients/[clientId]/layout.tsx", import.meta.url), "utf8"),
    ]);

    assert.match(control, /getCachedBusinessIssueRadar/);
    assert.match(control, /radarDigest\(radar\)/);
    assert.match(topbar, /radarControl\?: ReactNode/);
    // Same gate, now an entry in the collapsible list (2026-08-29). It also
    // requires the control to exist: an absent one must not hold a pinnable id.
    assert.match(topbar, /!publicShowcase && radarControl \? \{ id: "radar", label: "Business Radar", node: <Fragment key="radar">\{radarControl\}<\/Fragment> \} : null/);
    for (const surface of [agencyLayout, peoplePage, clientLayout]) {
      assert.match(surface, /RadarQuickLookControl/);
      assert.match(surface, /radarControl=/);
    }
  });

  it("offers attention, status, incidents and a real full scan", async () => {
    const button = await readFile(new URL("../src/components/chrome/RadarQuickLookButton.tsx", import.meta.url), "utf8");
    for (const label of ["Business Radar quick look", "Current watch", "Health", "Confidence", "Readiness", "Observable", "Priority contacts", "Run full scan", "Open Radar"]) {
      assert.match(button, new RegExp(label));
    }
    assert.match(button, /critical \+ radarSnapshot\.warning/);
    assert.match(button, /fetch\("\/api\/portal\/advisor\/radar", \{ method: "POST"/);
    assert.match(button, /setRadarSnapshot\(radarDigest\(result\.radar\)\)/);
    assert.match(button, /aqua-radar:updated/);
    assert.match(button, /view=incidents&domain=/);
    assert.match(button, /role="dialog"/);
  });
});
