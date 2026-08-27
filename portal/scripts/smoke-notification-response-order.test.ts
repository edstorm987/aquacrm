import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NOTIFICATION_ACTIVATION_REFRESH_INTERVAL_MS,
  NotificationAttentionCoordinator,
  notificationActivationRefreshDue,
  optimisticAlertUpdate,
} from "../src/lib/intelligence/notificationAttentionCoordination";
import type { OperationalAlertView } from "../src/lib/intelligence/operationalAttention";

test("only the newest notification refresh may replace the snapshot", () => {
  const coordinator = new NotificationAttentionCoordinator();
  const initial = [alert("a")];
  const older = coordinator.beginRefresh();
  const newer = coordinator.beginRefresh();
  const newestResult = coordinator.acceptRefresh(newer, initial, [alert("a", { title: "newest" })]);
  const staleResult = coordinator.acceptRefresh(older, newestResult.alerts, [alert("a", { title: "older" })]);

  assert.equal(newestResult.applied, true);
  assert.equal(staleResult.applied, false);
  assert.equal(staleResult.alerts[0].title, "newest");
});

test("a refresh started before a mutation cannot undo the mutation", () => {
  const coordinator = new NotificationAttentionCoordinator();
  const initial = [alert("a")];
  const refresh = coordinator.beginRefresh();
  const mutation = coordinator.beginMutation(initial, "a", "read");
  const settled = coordinator.acceptMutation(mutation.token, mutation.alerts, [alert("a", { state: "read", attention: false })]);
  const staleRefresh = coordinator.acceptRefresh(refresh, settled.alerts, initial);

  assert.equal(staleRefresh.applied, false);
  assert.equal(staleRefresh.alerts[0].state, "read");
});

test("a refresh begun during a pending action rebases without removing its optimistic state", () => {
  const coordinator = new NotificationAttentionCoordinator();
  const started = coordinator.beginMutation([alert("a"), alert("b")], "a", "read");
  const refresh = coordinator.beginRefresh();
  const refreshed = coordinator.acceptRefresh(refresh, started.alerts, [
    alert("a", { title: "server title" }),
    alert("b", { title: "server b" }),
  ]);

  assert.equal(refreshed.applied, true);
  assert.equal(refreshed.alerts.find(item => item.id === "a")?.state, "read");
  assert.equal(refreshed.alerts.find(item => item.id === "a")?.title, "server title");
  assert.equal(refreshed.alerts.find(item => item.id === "b")?.title, "server b");
});

test("overlapping alert actions merge and roll back only their own alert", () => {
  const coordinator = new NotificationAttentionCoordinator();
  const first = coordinator.beginMutation([alert("a"), alert("b")], "a", "read");
  const second = coordinator.beginMutation(first.alerts, "b", "dismiss");

  const secondSettled = coordinator.acceptMutation(second.token, second.alerts, [alert("a")]);
  assert.equal(secondSettled.alerts.find(item => item.id === "a")?.state, "read");
  assert.equal(secondSettled.alerts.some(item => item.id === "b"), false);
  assert.deepEqual(coordinator.pendingAlertIds(), ["a"]);

  const firstFailed = coordinator.rejectMutation(first.token, secondSettled.alerts);
  assert.equal(firstFailed.alerts.find(item => item.id === "a")?.state, "unread");
  assert.equal(firstFailed.alerts.some(item => item.id === "b"), false);
  assert.deepEqual(coordinator.pendingAlertIds(), []);
});

test("a newer same-alert intent survives an older response and rolls back to its confirmed base", () => {
  const coordinator = new NotificationAttentionCoordinator();
  const read = coordinator.beginMutation([alert("a")], "a", "read");
  const unread = coordinator.beginMutation(read.alerts, "a", "unread");
  const olderSettled = coordinator.acceptMutation(read.token, unread.alerts, [
    alert("a", { state: "read", attention: false, title: "confirmed read" }),
  ]);

  assert.equal(olderSettled.alerts[0].state, "unread");
  assert.equal(olderSettled.alerts[0].title, "confirmed read");
  assert.deepEqual(coordinator.pendingAlertIds(), ["a"]);

  const newerFailed = coordinator.rejectMutation(unread.token, olderSettled.alerts);
  assert.equal(newerFailed.exposeFailure, true);
  assert.equal(newerFailed.alerts[0].state, "read");
  assert.equal(newerFailed.alerts[0].title, "confirmed read");
});

test("a prop snapshot rebases pending rollback while retaining the optimistic action", () => {
  const coordinator = new NotificationAttentionCoordinator();
  const mutation = coordinator.beginMutation([alert("a")], "a", "read");
  const rebased = coordinator.rebaseSnapshot([alert("a", { title: "new prop snapshot" })]);

  assert.equal(rebased[0].state, "read");
  assert.equal(rebased[0].title, "new prop snapshot");

  const failed = coordinator.rejectMutation(mutation.token, rebased);
  assert.equal(failed.alerts[0].state, "unread");
  assert.equal(failed.alerts[0].title, "new prop snapshot");
});

test("optimistic alert updates never modify unrelated alert objects", () => {
  const first = alert("a");
  const second = alert("b");
  const updated = optimisticAlertUpdate([first, second], "a", "park", 1234);

  assert.equal(updated[0].state, "parked");
  assert.equal(updated[0].parkedUntil, 1234);
  assert.equal(updated[1], second);
});

test("automatic notification refresh waits for the three-minute stale window", () => {
  const startedAt = 1_000;
  assert.equal(NOTIFICATION_ACTIVATION_REFRESH_INTERVAL_MS, 180_000);
  assert.equal(notificationActivationRefreshDue(startedAt, startedAt + 179_999), false);
  assert.equal(notificationActivationRefreshDue(startedAt, startedAt + 180_000), true);
});

test("the provider and both attention surfaces use revision coordination and per-alert busy state", () => {
  const provider = read("src/components/chrome/NotificationAttentionProvider.tsx");
  const centre = read("src/components/chrome/NotificationCentreButton.tsx");
  const inbox = read("src/app/portal/agency/inbox/_MasterInbox.tsx");

  assert.match(provider, /NotificationAttentionCoordinator/);
  assert.match(provider, /coordinator\.beginRefresh\(\)/);
  assert.match(provider, /coordinator\.acceptRefresh/);
  assert.match(provider, /refreshInFlightRef/);
  assert.match(provider, /notificationActivationRefreshDue/);
  assert.match(provider, /setInterval\(refreshWhenStaleAndActive, NOTIFICATION_ACTIVATION_REFRESH_INTERVAL_MS\)/);
  assert.doesNotMatch(provider, /setInterval\(refreshWhenActive, 30_000\)/);
  assert.match(provider, /coordinator\.beginMutation/);
  assert.match(provider, /coordinator\.rejectMutation/);
  assert.doesNotMatch(provider, /setAlerts\(previous\)/);
  assert.doesNotMatch(provider, /busyAlertId:/);
  assert.match(centre, /attention\?\.isAlertBusy\(alert\.id\)/);
  assert.match(centre, /if \(!open\) void attention\?\.refreshAlerts\(\)/);
  assert.match(inbox, /notificationAttention\?\.isAlertBusy\(alert\.id\)/);
});

test("notification storage avoids full file reloads but keeps remote snapshots fresh", () => {
  const route = read("src/app/api/portal/notifications/route.ts");
  const storage = read("src/server/storage.ts");

  assert.match(storage, /runtime\.hydrated && backend\.kind === "file" && existsSync\(dataFile\)/);
  assert.match(storage, /currentMtimeMs > runtime\.fileSnapshotMtimeMs/);
  assert.match(route, /fresh: kind === "postgres" \|\| kind === "supabase"/);
  assert.doesNotMatch(route, /ensureHydrated\(\{ fresh: true \}\)/);
});

function alert(id: string, patch: Partial<OperationalAlertView> = {}): OperationalAlertView {
  return {
    id,
    severity: "warning",
    category: "task",
    title: id,
    detail: `Detail for ${id}`,
    href: "/portal/agency/actions",
    occurredAt: 1,
    state: "unread",
    attention: true,
    ...patch,
  };
}

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
