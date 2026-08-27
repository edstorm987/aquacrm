import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  COUNTDOWN_DEADLINE_PROP,
  COUNTDOWN_RELATIVE_TARGET_PROP,
  countdownParts,
  initialiseCountdownBlock,
  relativeCountdownDuration,
  resolveCountdownDeadline,
  stabiliseCountdownDeadlines,
} from "../src/engines/editor/elements/countdownDeadline";
import type { Block } from "../src/engines/editor/elements/block";
import type { PluginStorage } from "../src/built-ins/modules/website-editor/src/lib/aquaPluginTypes";
import { createPage, getPage, publishPage, updatePage } from "../src/built-ins/modules/website-editor/src/server/pages";
import { storageKeys } from "../src/built-ins/modules/website-editor/src/server/storage-keys";

test("documented relative units resolve once and count down to expiry", () => {
  assert.equal(relativeCountdownDuration("+1d"), 86_400_000);
  assert.equal(relativeCountdownDuration("+2h"), 7_200_000);
  assert.equal(relativeCountdownDuration("+3m"), 180_000);
  assert.equal(relativeCountdownDuration("tomorrow"), null);

  const props = initialiseCountdownBlock("countdown-timer", { target: "+1m" }, 1_000);
  assert.equal(props[COUNTDOWN_RELATIVE_TARGET_PROP], "+1m");
  assert.equal(props[COUNTDOWN_DEADLINE_PROP], 61_000);
  assert.equal(resolveCountdownDeadline("+1m", props, 50_000), 61_000);
  assert.deepEqual(countdownParts(61_000, 1_000), { expired: false, days: 0, hours: 0, mins: 1, secs: 0 });
  assert.deepEqual(countdownParts(61_000, 2_200), { expired: false, days: 0, hours: 0, mins: 0, secs: 58 });
  assert.equal(countdownParts(61_000, 61_000).expired, true);
});

test("publish stabilisation is recursive, idempotent and resets only after a target edit", () => {
  const countdown: Block = { id: "timer", type: "countdown-timer", props: { target: "+7d" } };
  const tree: Block[] = [{ id: "section", type: "section", props: {}, children: [countdown] }];
  const first = stabiliseCountdownDeadlines(tree, 10_000);
  const firstTimer = first[0]?.children?.[0];
  assert.equal(firstTimer?.props[COUNTDOWN_DEADLINE_PROP], 10_000 + 7 * 86_400_000);
  assert.equal(stabiliseCountdownDeadlines(first, 99_000), first);

  const edited: Block[] = [{
    ...first[0]!,
    children: [{ ...firstTimer!, props: { ...firstTimer!.props, target: "+1h" } }],
  }];
  const republished = stabiliseCountdownDeadlines(edited, 20_000);
  assert.equal(republished[0]?.children?.[0]?.props[COUNTDOWN_RELATIVE_TARGET_PROP], "+1h");
  assert.equal(republished[0]?.children?.[0]?.props[COUNTDOWN_DEADLINE_PROP], 3_620_000);
  const absolute = stabiliseCountdownDeadlines([{
    ...republished[0]!,
    children: [{ ...republished[0]!.children![0]!, props: { ...republished[0]!.children![0]!.props, target: "2026-09-01T12:00:00.000Z" } }],
  }], 30_000);
  assert.equal(absolute[0]?.children?.[0]?.props[COUNTDOWN_DEADLINE_PROP], undefined);
  const relativeAgain = stabiliseCountdownDeadlines([{
    ...absolute[0]!,
    children: [{ ...absolute[0]!.children![0]!, props: { ...absolute[0]!.children![0]!.props, target: "+1h" } }],
  }], 40_000);
  assert.equal(relativeAgain[0]?.children?.[0]?.props[COUNTDOWN_DEADLINE_PROP], 3_640_000);
});

test("absolute, invalid and legacy draft targets have explicit non-moving semantics", () => {
  const absolute = "2026-09-01T12:00:00.000Z";
  assert.equal(resolveCountdownDeadline(absolute, {}, 999), Date.parse(absolute));
  assert.equal(resolveCountdownDeadline("", {}, 999), null);
  assert.equal(resolveCountdownDeadline("not-a-date", {}, 999), null);
  assert.equal(resolveCountdownDeadline("+1m", {}, 5_000), 65_000);
  assert.equal(resolveCountdownDeadline("+1m", {}, 50_000), 110_000);
});

test("the mounted block hydrates from a stable placeholder and publish paths anchor deadlines", () => {
  const component = readFileSync("src/built-ins/modules/website-editor/src/components/blocks/CountdownTimerBlock.tsx", "utf8");
  const serverPages = readFileSync("src/built-ins/modules/website-editor/src/server/pages.ts", "utf8");
  const createBlock = readFileSync("src/engines/editor/elements/blockTreeOps.ts", "utf8");
  assert.match(component, /data-countdown-state="initialising"/);
  assert.match(component, /useState<\{ key: string; now: number; fallbackAnchor: number \} \| null>\(null\)/);
  assert.doesNotMatch(component, /return Date\.now\(\) \+ ms/);
  assert.match(serverPages, /stabiliseCountdownDeadlines\(blocks, now\)/);
  assert.match(createBlock, /initialiseCountdownBlock/);
});

test("page create, edit, publish and legacy reload retain one stored deadline", async () => {
  const rows = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T>(key: string) { return rows.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { rows.set(key, value); },
    async del(key: string) { rows.delete(key); },
    async list(prefix = "") { return [...rows.keys()].filter(key => key.startsWith(prefix)); },
  };
  const created = await createPage(storage, {
    agencyId: "agency",
    clientId: "client",
    siteId: "site",
    title: "Timer",
    blocks: [{ id: "timer", type: "countdown-timer", props: { target: "+1h" } }],
  });
  const createdDeadline = created.blocks[0]?.props[COUNTDOWN_DEADLINE_PROP];
  assert.equal(typeof createdDeadline, "number");

  const edited = await updatePage(storage, "agency", "client", "site", created.id, {
    blocks: [{ id: "timer", type: "countdown-timer", props: { ...created.blocks[0]!.props, target: "+1m" } }],
  });
  const editedDeadline = edited?.blocks[0]?.props[COUNTDOWN_DEADLINE_PROP];
  assert.equal(typeof editedDeadline, "number");
  assert.notEqual(editedDeadline, createdDeadline);
  const published = await publishPage(storage, "agency", "client", "site", created.id);
  assert.equal(published?.blocks[0]?.props[COUNTDOWN_DEADLINE_PROP], editedDeadline);
  assert.equal((await getPage(storage, "agency", "client", "site", created.id))?.blocks[0]?.props[COUNTDOWN_DEADLINE_PROP], editedDeadline);

  const legacy = {
    ...created,
    id: "legacy",
    status: "published" as const,
    publishedAt: 10_000,
    updatedAt: 20_000,
    blocks: [{ id: "legacy-timer", type: "countdown-timer" as const, props: { target: "+1m" } }],
  };
  await storage.set(storageKeys.page("agency", "client", "site", legacy.id), legacy);
  const firstRead = await getPage(storage, "agency", "client", "site", legacy.id);
  const secondRead = await getPage(storage, "agency", "client", "site", legacy.id);
  assert.equal(firstRead?.blocks[0]?.props[COUNTDOWN_DEADLINE_PROP], 70_000);
  assert.equal(secondRead?.blocks[0]?.props[COUNTDOWN_DEADLINE_PROP], 70_000);
});
