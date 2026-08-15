import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildOperationalAttentionWindow,
  buildProtectedAttentionWindow,
} from "../src/lib/attentionProtection";
import type { OperationalAlertView } from "../src/lib/operationalAttention";

type Work = { id: string; source: string; urgency: number };

test("attention protection stays transparent below the overload threshold", () => {
  const items: Work[] = Array.from({ length: 7 }, (_, index) => ({ id: `work-${index}`, source: "tasks", urgency: 1 }));
  const window = buildProtectedAttentionWindow(items, {
    groupKey: item => item.source,
    urgencyRank: item => item.urgency,
  });

  assert.equal(window.protected, false);
  assert.equal(window.focus.length, 7);
  assert.equal(window.reserveCount, 0);
});

test("overload exposes five severity-first items while balancing equally urgent sources", () => {
  const items: Work[] = [
    ...Array.from({ length: 6 }, (_, index) => ({ id: `radar-${index}`, source: "radar", urgency: 0 })),
    { id: "inbox-critical", source: "inbox", urgency: 0 },
    { id: "finance-critical", source: "finance", urgency: 0 },
    { id: "advisor-warning", source: "advisor", urgency: 1 },
    { id: "crm-warning", source: "crm", urgency: 1 },
    { id: "manual-normal", source: "manual", urgency: 2 },
    { id: "delivery-normal", source: "delivery", urgency: 2 },
  ];
  const window = buildProtectedAttentionWindow(items, {
    groupKey: item => item.source,
    urgencyRank: item => item.urgency,
  });

  assert.equal(window.level, "overload");
  assert.equal(window.focus.length, 5);
  assert.equal(window.reserveCount, 7);
  assert.ok(window.focus.every(item => item.urgency === 0));
  assert.ok(window.focus.some(item => item.source === "inbox"));
  assert.ok(window.focus.some(item => item.source === "finance"));
  assert.deepEqual([...window.focus, ...window.reserve].map(item => item.id).sort(), items.map(item => item.id).sort());
});

test("operational protection retains unresolved read alerts, excludes parked alerts and groups its reserve", () => {
  const now = Date.now();
  const alerts: OperationalAlertView[] = [
    alert("critical-inbox", "critical", "/portal/agency/inbox", now),
    alert("critical-actions", "critical", "/portal/agency/actions", now + 1),
    alert("persistent-read", "warning", "/portal/agency/agency-finance", now + 2, { attention: false, state: "read", persistentUntilResolved: true }),
    alert("parked", "critical", "/portal/agency/fulfilment", now + 3, { attention: false, state: "parked", parkedUntil: now + 60_000 }),
    ...Array.from({ length: 7 }, (_, index) => alert(`notice-${index}`, "notice", index % 2 ? "/portal/agency/marketing" : "/portal/agency/actions", now + 4 + index)),
  ];
  const window = buildOperationalAttentionWindow(alerts);

  assert.equal(window.total, 10);
  assert.equal(window.focus.length, 5);
  assert.equal(window.reserveCount, 5);
  assert.ok(window.focus.some(item => item.id === "persistent-read"));
  assert.ok(![...window.focus, ...window.reserve].some(item => item.id === "parked"));
  assert.ok(window.reserveDestinations.some(group => group.count > 0 && group.href.startsWith("/portal/agency")));
});

test("operational overload remains detectable when focus protection is switched off", () => {
  const now = Date.now();
  const alerts = Array.from({ length: 12 }, (_, index) => alert(`notice-${index}`, "warning", "/portal/agency/actions", now + index));
  const window = buildOperationalAttentionWindow(alerts, { enabled: false });

  assert.equal(window.level, "overload");
  assert.equal(window.protected, false);
  assert.equal(window.focus.length, 12);
  assert.equal(window.reserveCount, 0);
});

test("clearing a focus item automatically promotes retained reserve work", () => {
  const items: Work[] = Array.from({ length: 10 }, (_, index) => ({ id: `work-${index}`, source: index % 2 ? "radar" : "crm", urgency: index < 3 ? 0 : 1 }));
  const first = buildProtectedAttentionWindow(items, { groupKey: item => item.source, urgencyRank: item => item.urgency });
  const clearedId = first.focus[0]?.id;
  const next = buildProtectedAttentionWindow(items.filter(item => item.id !== clearedId), { groupKey: item => item.source, urgencyRank: item => item.urgency });

  assert.equal(first.focus.length, 5);
  assert.equal(next.focus.length, 5);
  assert.equal(next.total, first.total - 1);
  assert.ok(next.focus.some(item => first.reserve.some(reserve => reserve.id === item.id)));
});

test("the protected window is used by notifications, sidebar attention, Actions and Day Command", () => {
  const provider = read("src/components/chrome/NotificationAttentionProvider.tsx");
  const centre = read("src/components/chrome/NotificationCentreButton.tsx");
  const sidebar = read("src/components/chrome/SidebarNavLink.tsx");
  const actions = read("src/app/portal/agency/actions/_ActionsWorkspace.tsx");
  const profile = read("src/components/chrome/ProfileMenu.tsx");
  const command = read("src/app/portal/agency/_DashboardCommandCenter.tsx");

  assert.match(provider, /buildOperationalAttentionWindow/);
  assert.match(provider, /focusProtectionEnabled/);
  assert.match(centre, /Attention shield/);
  assert.match(centre, /nothing discarded/);
  assert.match(sidebar, /pool: "reserve"/);
  assert.match(actions, /Your protected attention window/);
  assert.match(actions, /Process five, not everything/);
  assert.match(profile, /showFocusProtection/);
  assert.match(profile, /Focus protection/);
  assert.match(profile, /attentionLevel === "elevated" \|\| attentionLevel === "overload"/);
  assert.match(command, /strictWindow\.reserveCount/);
});

function alert(id: string, severity: OperationalAlertView["severity"], href: string, occurredAt: number, patch: Partial<OperationalAlertView> = {}): OperationalAlertView {
  return {
    id,
    severity,
    category: href.includes("inbox") ? "support" : href.includes("finance") ? "money" : href.includes("marketing") ? "marketing" : href.includes("fulfilment") ? "development" : "task",
    title: id,
    detail: `Exact detail for ${id}`,
    href,
    occurredAt,
    state: "unread",
    attention: true,
    ...patch,
  };
}

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
