import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

describe("Command Center overlay theme", () => {
  it("gives Advisor, profile and notifications explicit bridge surfaces", async () => {
    const [styles, advisor, profile, notifications, dashboard, actions] = await Promise.all([
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/assistant/AssistantWorkspace.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/ProfileMenu.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/NotificationCentreButton.tsx", import.meta.url), "utf8"),
      // 2026-08-29: the radar UI moved into `_BusinessRadarDashboard.tsx` (lazily
      // loaded) to shrink the Command Centre route graph. These assertions are
      // about the SURFACE, so both files are read as one.
      Promise.all([
        readFile(new URL("../src/app/portal/agency/_DashboardCommandCenter.tsx", import.meta.url), "utf8"),
        readFile(new URL("../src/app/portal/agency/_BusinessRadarDashboard.tsx", import.meta.url), "utf8"),
      ]).then(parts => parts.join("\n")),
      readFile(new URL("../src/app/portal/agency/actions/_ActionsWorkspace.tsx", import.meta.url), "utf8"),
    ]);

    for (const className of ["mm-assistant-workspace", "mm-assistant-header", "mm-assistant-radar-bar", "mm-assistant-content", "mm-assistant-composer", "mm-assistant-panel-drawer"]) {
      assert.match(advisor, new RegExp(className));
      assert.match(styles, new RegExp(`data-portal-shell="command"[^}]*[\\s\\S]*?\\.${className}`));
    }
    assert.match(profile, /mm-profile-menu-header/);
    assert.match(styles, /data-portal-shell="command"\] \.mm-portal-topbar \.mm-profile-menu-header/);
    assert.match(notifications, /mm-notification-centre/);
    assert.match(notifications, /mm-notification-row/);
    assert.match(notifications, /mm-notification-tab-indicator/);
    assert.match(styles, /data-portal-shell="command"\] \.mm-portal-topbar \.mm-notification-centre/);
    assert.match(styles, /\.mm-portal-root :is\(\.mm-notification-centre, \.mm-radar-popover\)/);
    assert.match(styles, /max-height: min\(42rem, calc\(100dvh - 4\.5rem\)\)/);
    for (const surface of ["mm-private-sidebar", "mm-portal-topbar", "mm-profile-menu", "mm-notification-centre", "mm-radar-popover", "mm-advisor-drawer", "mm-command-center-workspace"]) {
      assert.match(styles, new RegExp(`data-color-mode="light"\\]\\[data-portal-shell="command"\\][\\s\\S]*?\\.${surface}`));
    }
    assert.match(styles, /data-color-mode="dark"\]\[data-portal-shell="command"\] \.mm-portal-topbar/);
    assert.match(styles, /data-color-mode="dark"\]\[data-portal-shell="command"\] \.mm-advisor-drawer/);
    for (const daylightStation of ["mm-command-station-nav", "mm-command-titlebar", "mm-command-telemetry", "mm-command-watch", "mm-command-radar-screen", "mm-command-sigint", "mm-command-sector-array", "mm-command-quick-orders"]) {
      assert.match(styles, new RegExp(`data-color-mode="light"\\]\\[data-portal-shell="command"\\][\\s\\S]*?\\.${daylightStation}`));
    }
    assert.match(styles, /Day bridge: a chart table inside dark naval instrument rails/);
    assert.match(styles, /\.mm-command-station-button/);
    for (const station of ["mm-command-workspace-shell", "mm-command-workspace-inline", "mm-command-workspace-header", "mm-omega-workspace-nav", "mm-omega-workspace-button", "mm-omega-actions-workspace", "mm-radar-operations-workspace", "mm-radar-operations-console", "mm-radar-coverage-matrix", "mm-day-command-workspace", "mm-command-advisor-workspace"]) {
      assert.match(styles, new RegExp(`\\.${station}`));
      assert.match(dashboard, new RegExp(station));
    }
    for (const integratedSurface of ["mm-executive-command-system", "mm-executive-day-command", "mm-direct-radar-feed", "mm-command-workspace-inline", "mm-command-advisor-workspace"]) {
      assert.match(styles, new RegExp(`\\.${integratedSurface}`));
      assert.match(dashboard, new RegExp(integratedSurface));
    }
    assert.match(dashboard, /Aqua command network · Integrated station/);
    assert.match(dashboard, /Station active/);
    assert.match(dashboard, /id="executive-operations"/);
    assert.match(dashboard, /id="executive-radar-feed"/);
    assert.match(dashboard, /Direct Radar feed/);
    assert.match(dashboard, /Accept for today/);
    assert.match(dashboard, /reconciliationSourceIds/);
    assert.match(dashboard, /commandRail/);
    assert.doesNotMatch(dashboard, /aria-label="Integrated command stations"/);
    assert.match(dashboard, /data-command-mode=/);
    assert.match(dashboard, /dashboardMode === "calendar"/);
    assert.match(dashboard, /mm-command-calendar-workspace/);
    assert.match(actions, /mm-actions-calendar/);
    assert.match(actions, /data-calendar-entry="task"/);
    assert.match(styles, /\.mm-command-calendar-workspace \.mm-actions-calendar/);
    assert.doesNotMatch(actions, /mm-command-calendar-workspace/);
    assert.match(dashboard, /dashboardMode === "advisor"/);
    assert.doesNotMatch(dashboard, /role="dialog"/);
  });
});
