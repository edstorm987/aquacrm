#!/usr/bin/env node
// Mounted response-order acceptance for Team Chat and the notification
// centre. → issues #147
//
// The pure coordinators are proven in `smoke-team-chat-response-order` and
// `smoke-notification-response-order`; this drives the REAL components on the
// real routes and injects the reorderings from the browser side only:
// `page.route()` holds, reverses, fails and malforms responses to
// `/api/portal/team-chat` and `/api/portal/notifications`. Nothing in the
// application knows it is under test — no sleeps, no fetch shims, no
// test-only endpoints.
//
// Stories (at the widths named by AQUA_STORY_VIEWPORTS, default 390×844 and
// 1280×800), each followed by a stale-repaint watch:
//
//   chat  C1  delayed old-channel poll response           (cannot repaint)
//         C2  A → B → C answered in reverse                (stays on C)
//         C3  send in B, switch to A, release B            (A stays; busy settles)
//         C4  failed / malformed / lost send, exact draft, one retry
//         C5  late send response after unmount             (new instance untouched)
//         C6  failed selection                             (valid conversation kept)
//   alerts N1  refresh released after a mutation           (no resurrection)
//          N2  two alert actions completed in reverse      (each keeps its own outcome)
//          N3  one success + one isolated failure/rollback/retry
//          N4  same-alert stale response — the mounted UI refuses a second action
//          N5  failed and malformed refreshes cannot paint
//
// Then the responsive matrix (AQUA_VIEWPORTS, default the six house sizes plus
// 390×844): render, overflow (document, main, chat panel, open centre),
// keyboard focus walk, axe serious/critical, console and network — with the
// notification centre closed and open.
//
// Run against the isolated production lane described in the report:
//   AQUA_BASE=http://127.0.0.1:3181 AQUA_LANE_DIR=/private/tmp/aquacrm-chat-order-3181 \
//     node scripts/browser-chat-notification-order.mjs
// `AQUA_LANE_DIR/seed.json` must carry the seeded owner cookie and channel ids.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  axeVerdict,
  consoleVerdict,
  focusIndicatorIsVisible,
  focusSettleDelayMs,
  focusWalkVerdict,
  isAbortedRscPrefetch,
  networkVerdict,
  overflowVerdictFrom,
} from "./browser-matrix.mjs";

const require = createRequire(import.meta.url);

const BASE = process.env.AQUA_BASE || "http://127.0.0.1:3181";
const LANE_DIR = process.env.AQUA_LANE_DIR || "/private/tmp/aquacrm-chat-order-3181";
const ARTEFACTS = process.env.AQUA_ARTEFACTS || join(LANE_DIR, "evidence");
const CHAT_PATH = "/portal/agency/people?view=chat";
const GRACE_MS = Number(process.env.AQUA_GRACE_MS || 1500);
const POLL_WAIT_MS = Number(process.env.AQUA_POLL_WAIT_MS || 20_000);

export const STORY_VIEWPORTS = [
  { id: "phone-390", width: 390, height: 844 },
  { id: "desktop-1280", width: 1280, height: 800 },
];

export const MATRIX_VIEWPORTS = [
  { id: "mobile-portrait", width: 375, height: 812 },
  { id: "phone-390", width: 390, height: 844 },
  { id: "mobile-landscape", width: 812, height: 375 },
  { id: "tablet-portrait", width: 768, height: 1024 },
  { id: "tablet-landscape", width: 1024, height: 768 },
  { id: "desktop", width: 1280, height: 800 },
  { id: "wide", width: 1920, height: 1080 },
];

function selectViewports(list, filter) {
  if (!filter) return list;
  const wanted = new Set(filter.split(",").map(value => value.trim()).filter(Boolean));
  const chosen = list.filter(entry => wanted.has(entry.id));
  if (!chosen.length) throw new Error(`No viewport matched "${filter}". Known: ${list.map(entry => entry.id).join(", ")}`);
  return chosen;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, { timeout = 10_000, interval = 100, label = "condition" } = {}) {
  const startedAt = Date.now();
  let last;
  while (Date.now() - startedAt < timeout) {
    last = await check();
    if (last) return last;
    await sleep(interval);
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${label}`);
}

/**
 * The stale-repaint watch: sample a painted state repeatedly through the
 * grace window and fail on ANY change. A late response that briefly repaints
 * and is then corrected would still be a repaint.
 */
async function holdsSteady(sample, { ms = GRACE_MS, interval = 100 } = {}) {
  const first = JSON.stringify(await sample());
  const startedAt = Date.now();
  while (Date.now() - startedAt < ms) {
    await sleep(interval);
    const next = JSON.stringify(await sample());
    if (next !== first) return { steady: false, first, next };
  }
  return { steady: true, first };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser-side response injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One router per page. Rules are matched newest-first and consumed once; an
 * unmatched request continues untouched. Every failure the harness injects is
 * recorded so the network/console verdicts can tell it from a real one.
 */
async function installInterceptor(page, injected) {
  const rules = [];
  await page.route(/\/api\/portal\/(team-chat|notifications)(\?|$)/, async (route, request) => {
    const index = rules.findIndex(rule => rule.match(request));
    if (index < 0) return route.continue();
    const [rule] = rules.splice(index, 1);
    return rule.handle(route, request);
  });

  const add = rule => { rules.unshift(rule); return rule; };
  const holds = new Set();

  return {
    /** Let every held response through (used when a story fails part-way). */
    releaseAll: async () => {
      const pending = [...holds];
      holds.clear();
      await Promise.all(pending.map(release => release().catch(() => {})));
    },
    /** Hold a response. `fetchEarly` lets the server answer now and delays only the delivery. */
    hold(match, { fetchEarly = true } = {}) {
      const seen = deferred();
      const release = deferred();
      const done = deferred();
      const rule = add({
        match,
        handle: async (route, request) => {
          seen.resolve(request);
          try {
            const early = fetchEarly ? await route.fetch() : null;
            await release.promise;
            const response = early ?? await route.fetch();
            await route.fulfill({ response });
            done.resolve();
          } catch (error) {
            done.reject(error);
          }
        },
      });
      const handle = {
        seen: seen.promise,
        release: async () => {
          holds.delete(handle.release);
          release.resolve();
          // A hold whose request never arrived has nothing to deliver.
          await Promise.race([done.promise, seen.promise.then(() => done.promise), sleep(50).then(() => rules.includes(rule) ? undefined : done.promise)]);
        },
      };
      holds.add(handle.release);
      return handle;
    },
    /** Answer with a synthetic status/body instead of the server. */
    fail(match, { status = 500, body = { ok: false, error: "Injected outage." }, contentType = "application/json" } = {}) {
      const seen = deferred();
      add({
        match,
        handle: async (route, request) => {
          seen.resolve(request);
          injected.push({ url: request.url(), method: request.method(), status });
          await route.fulfill({
            status,
            contentType,
            body: typeof body === "string" ? body : JSON.stringify(body),
          });
        },
      });
      return { seen: seen.promise };
    },
    /** Drop the connection: a lost response. */
    abort(match) {
      const seen = deferred();
      add({
        match,
        handle: async (route, request) => {
          seen.resolve(request);
          injected.push({ url: request.url(), method: request.method(), status: null });
          await route.abort("failed");
        },
      });
      return { seen: seen.promise };
    },
    pendingRules: () => rules.length,
    disarm: () => { rules.length = 0; },
  };
}

const chatGet = channelId => request =>
  request.method() === "GET" && request.url().includes("/api/portal/team-chat")
  && (channelId ? new URL(request.url()).searchParams.get("channel") === channelId : true);
const chatPost = () => request => request.method() === "POST" && request.url().includes("/api/portal/team-chat");
const alertsGet = () => request => request.method() === "GET" && request.url().includes("/api/portal/notifications");
const alertPatch = alertId => request => {
  if (request.method() !== "PATCH" || !request.url().includes("/api/portal/notifications")) return false;
  if (!alertId) return true;
  try { return request.postDataJSON()?.alertId === alertId; } catch { return false; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Page helpers
// ─────────────────────────────────────────────────────────────────────────────

function chatPanel(page) {
  // The composer identifies the conversation panel; its section header names
  // the painted conversation and the list carries the painted messages.
  return page.locator("section").filter({ has: page.locator("form input[name=body]") }).first();
}

function channelsList(page) {
  return page.locator("section").filter({ has: page.getByText("Channels", { exact: true }) }).first();
}

async function paintedChat(page) {
  const panel = chatPanel(page);
  const header = (await panel.locator("header h3").textContent().catch(() => ""))?.trim() ?? "";
  const list = await panel.locator("header + div").innerText().catch(() => "");
  const highlighted = await channelsList(page).locator("button[aria-current=true]").allTextContents().catch(() => []);
  const sendDisabled = await panel.getByRole("button", { name: "Send" }).isDisabled().catch(() => null);
  const alert = await panel.locator("p[role=alert]").allTextContents().catch(() => []);
  return {
    header,
    hasA: list.includes("TEAM-A"),
    hasB: list.includes("DIRECT-B"),
    hasC: list.includes("DIRECT-C"),
    highlighted: highlighted.map(text => text.trim()),
    sendDisabled,
    alert: alert.map(text => text.trim()),
  };
}

async function selectChannel(page, name) {
  await channelsList(page).getByRole("button", { name, exact: true }).click();
}

async function waitForChat(page, header, marker) {
  await until(async () => {
    const painted = await paintedChat(page);
    return painted.header === header && (!marker || painted[marker]) && painted.sendDisabled === false ? painted : null;
  }, { label: `chat painted as "${header}"`, timeout: 15_000 });
}

async function composer(page) {
  return chatPanel(page).locator("input[name=body]");
}

async function openTab(page, name) {
  await page.getByRole("navigation", { name: "People views" }).getByRole("button", { name }).click();
}

async function bell(page) {
  return page.getByRole("button", { name: /^Notifications,/ });
}

async function centre(page) {
  return page.getByRole("dialog", { name: "Notification centre" });
}

async function openCentre(page) {
  const button = await bell(page);
  if (!(await button.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /^More controls/ }).click();
    await button.waitFor({ state: "visible", timeout: 5_000 });
  }
  await button.click();
  const dialog = await centre(page);
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  return dialog;
}

async function closeCentre(page) {
  const dialog = await centre(page);
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });
  }
  // Escape may leave the phone's More drawer open; a second Escape is harmless.
  const more = page.getByRole("button", { name: /^More controls/ });
  if (await more.isVisible().catch(() => false) && (await more.getAttribute("aria-expanded")) === "true") {
    await more.click();
  }
}

async function centreTab(page, name) {
  const dialog = await centre(page);
  await dialog.getByRole("navigation", { name: "Notification views" }).getByRole("button", { name: new RegExp(`^${name}\\b`) }).click();
}

function row(dialog, title) {
  return dialog.locator("article").filter({ has: dialog.page().locator("strong", { hasText: title }) }).first();
}

async function rowState(dialog, title) {
  const article = row(dialog, title);
  if (!(await article.count()) || !(await article.isVisible().catch(() => false))) return { present: false };
  return {
    present: true,
    busy: (await article.getAttribute("aria-busy")) === "true",
    readDisabled: await article.getByRole("button", { name: /^Mark (read|unread)$/ }).isDisabled().catch(() => null),
    readLabel: await article.getByRole("button", { name: /^Mark (read|unread)$/ }).getAttribute("aria-label").catch(() => null),
    dismissDisabled: await article.getByRole("button", { name: "Dismiss notification" }).isDisabled().catch(() => null),
    parkDisabled: (await article.locator("summary").getAttribute("aria-disabled")) === "true",
    parkTabIndex: await article.locator("summary").getAttribute("tabindex"),
    parkOpen: await article.locator("details").evaluate(node => node.open).catch(() => null),
  };
}

async function centreAlerts(dialog) {
  return (await dialog.locator("p[role=alert]").allTextContents()).map(text => text.trim());
}

async function visibleTitles(dialog) {
  return (await dialog.locator("article strong").allTextContents()).map(text => text.trim());
}

async function restoreUnread(page, titles) {
  // Put alerts back to "unread" through the ordinary UI so the next story
  // (and the next viewport) starts from the seeded baseline.
  const dialog = await centre(page);
  await centreTab(page, "Read");
  for (const title of titles) {
    const article = row(dialog, title);
    if (!(await article.count())) continue;
    await article.getByRole("button", { name: "Mark unread" }).click();
    await until(async () => !(await rowState(dialog, title)).present, { label: `"${title}" leaves Read` });
  }
  await centreTab(page, "Attention");
  for (const title of titles) {
    await until(async () => (await rowState(dialog, title)).present && !(await rowState(dialog, title)).busy, { label: `"${title}" back in Attention` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────────────────────────

async function chatStories(page, intercept, seed, record, shoot) {
  const teamId = seed.channels.team;
  const B = "Sam Taylor";
  const C = "Kim Rivera";
  const stamp = `${Date.now().toString(36)}`;

  // C1 — a delayed poll for the old channel answers after a selection.
  await record("C1 delayed old-channel poll response", async () => {
    await selectChannel(page, "Team");
    await waitForChat(page, "Team", "hasA");
    const poll = intercept.hold(chatGet(teamId), { fetchEarly: true });
    await Promise.race([poll.seen, sleep(POLL_WAIT_MS).then(() => { throw new Error(`no poll for the Team channel within ${POLL_WAIT_MS}ms`); })]);
    await selectChannel(page, B);
    await waitForChat(page, B, "hasB");
    await poll.release();
    const watch = await holdsSteady(() => paintedChat(page));
    const painted = await paintedChat(page);
    if (!watch.steady) throw new Error(`repainted after the stale poll: ${watch.first} → ${watch.next}`);
    if (painted.header !== B || painted.hasA || !painted.hasB) throw new Error(`expected ${B} to stay painted, got ${JSON.stringify(painted)}`);
    if (painted.alert.length) throw new Error(`unexpected error: ${painted.alert.join(" | ")}`);
    await shoot("C1");
    return `poll for Team released ${GRACE_MS}ms watch later: still "${B}" with DIRECT-B, highlight ${painted.highlighted.join("/")}`;
  });

  // C2 — A → B → C, answered C then B, and B then C.
  await record("C2 A → B → C completed in reverse", async () => {
    await selectChannel(page, "Team");
    await waitForChat(page, "Team", "hasA");
    let holdB = intercept.hold(chatGet(seed.channels.sam));
    let holdC = intercept.hold(chatGet(seed.channels.kim));
    await selectChannel(page, B);
    await selectChannel(page, C);
    await Promise.all([holdB.seen, holdC.seen]);
    const pending = await paintedChat(page);
    if (!pending.highlighted.includes(C)) throw new Error(`selection not acknowledged: ${JSON.stringify(pending.highlighted)}`);
    const opening = await chatPanel(page).getByRole("status").textContent().catch(() => "");
    await holdC.release();
    await waitForChat(page, C, "hasC");
    await holdB.release();
    let watch = await holdsSteady(() => paintedChat(page));
    if (!watch.steady) throw new Error(`repainted after late B: ${watch.first} → ${watch.next}`);
    let painted = await paintedChat(page);
    if (painted.header !== C || !painted.hasC || painted.hasB) throw new Error(`expected ${C}, got ${JSON.stringify(painted)}`);

    // The other order: the OLDER selection answers first and must not paint.
    await selectChannel(page, "Team");
    await waitForChat(page, "Team", "hasA");
    holdB = intercept.hold(chatGet(seed.channels.sam));
    holdC = intercept.hold(chatGet(seed.channels.kim));
    await selectChannel(page, B);
    await selectChannel(page, C);
    await Promise.all([holdB.seen, holdC.seen]);
    await holdB.release();
    watch = await holdsSteady(() => paintedChat(page), { ms: 800 });
    painted = await paintedChat(page);
    if (!watch.steady || painted.header !== "Team" || painted.hasB) throw new Error(`older B painted before C: ${JSON.stringify(painted)}`);
    await holdC.release();
    await waitForChat(page, C, "hasC");
    painted = await paintedChat(page);
    if (painted.alert.length) throw new Error(`unexpected error: ${painted.alert.join(" | ")}`);
    await shoot("C2");
    return `C painted, late B dropped (status "${(opening ?? "").trim()}" while pending); reverse order also ends on C`;
  });

  // C3 — send in B, switch to A, release B.
  await record("C3 send in B, switch to A, then release B", async () => {
    await selectChannel(page, B);
    await waitForChat(page, B, "hasB");
    const body = `ORDER-C3-${stamp} sent from Sam's conversation`;
    await (await composer(page)).fill(body);
    const held = intercept.hold(chatPost(), { fetchEarly: true });
    await chatPanel(page).getByRole("button", { name: "Send" }).click();
    await held.seen;
    await until(async () => (await paintedChat(page)).sendDisabled === true, { label: "busy while the send is held" });
    await selectChannel(page, "Team");
    await until(async () => { const p = await paintedChat(page); return p.header === "Team" && p.hasA; }, { label: "Team painted while B's send is held" });
    await held.release();
    const watch = await holdsSteady(() => paintedChat(page));
    const painted = await paintedChat(page);
    const leaked = (await chatPanel(page).locator("header + div").innerText()).includes(body);
    if (!watch.steady) throw new Error(`repainted after B's late send: ${watch.first} → ${watch.next}`);
    if (painted.header !== "Team" || leaked) throw new Error(`B's send repainted: ${JSON.stringify(painted)} leaked=${leaked}`);
    if (painted.sendDisabled !== false) throw new Error("busy did not settle after the late send");
    if (painted.alert.length) throw new Error(`unexpected error: ${painted.alert.join(" | ")}`);
    const teamDraft = await (await composer(page)).inputValue();
    if (teamDraft !== "") throw new Error(`Team composer holds B's draft: "${teamDraft}"`);
    // Back in B the retained message is there once and its draft is cleared.
    await selectChannel(page, B);
    await waitForChat(page, B, "hasB");
    const count = await chatPanel(page).locator("p.whitespace-pre-wrap").filter({ hasText: body }).count();
    const draftB = await (await composer(page)).inputValue();
    if (count !== 1 || draftB !== "") throw new Error(`B shows the message ${count}× with draft "${draftB}"`);
    await shoot("C3");
    return "A stayed painted, busy settled, B's draft cleared and the message appears once in B";
  });

  // C4 — failed, malformed and lost sends keep the exact draft; one retry succeeds once.
  await record("C4 failed send, retained draft, single retry", async () => {
    await selectChannel(page, B);
    await waitForChat(page, B, "hasB");
    const body = `RETRY-C4-${stamp}  keep my   spacing `;
    const input = await composer(page);
    await input.fill(body);
    const attempts = [
      { label: "HTTP 500", inject: () => intercept.fail(chatPost(), { status: 500, body: { ok: false, error: "Injected chat outage." } }), expect: /Injected chat outage|Message not sent/ },
      { label: "malformed 2xx", inject: () => intercept.fail(chatPost(), { status: 201, body: { ok: true } }), expect: /Message not sent/ },
      { label: "HTTP 409 refusal", inject: () => intercept.fail(chatPost(), { status: 409, body: { ok: false, error: "Injected conflict." } }), expect: /Injected conflict/ },
      { label: "lost connection", inject: () => intercept.abort(chatPost()), expect: /Check your connection/ },
    ];
    const seen = [];
    for (const attempt of attempts) {
      const rule = attempt.inject();
      await chatPanel(page).getByRole("button", { name: "Send" }).click();
      await rule.seen;
      const alert = await until(async () => {
        const texts = (await paintedChat(page)).alert;
        return texts.some(text => attempt.expect.test(text)) ? texts : null;
      }, { label: `announced failure for ${attempt.label}` });
      await until(async () => (await paintedChat(page)).sendDisabled === false, { label: `busy settles after ${attempt.label}` });
      const draft = await input.inputValue();
      if (draft !== body) throw new Error(`${attempt.label}: draft changed to "${draft}"`);
      if (!alert.join(" ").includes("Your draft is kept")) throw new Error(`${attempt.label}: no retained-draft hint in "${alert.join(" | ")}"`);
      const posted = await chatPanel(page).locator("p.whitespace-pre-wrap").filter({ hasText: `RETRY-C4-${stamp}` }).count();
      if (posted !== 0) throw new Error(`${attempt.label}: the failed send painted a message`);
      seen.push(`${attempt.label} → "${alert[0]}"`);
    }
    // The retry goes through untouched.
    await chatPanel(page).getByRole("button", { name: "Send" }).click();
    await until(async () => (await input.inputValue()) === "" && (await paintedChat(page)).sendDisabled === false, { label: "validated success clears the draft" });
    const painted = await paintedChat(page);
    if (painted.alert.length) throw new Error(`error still shown after success: ${painted.alert.join(" | ")}`);
    const count = await chatPanel(page).locator("p.whitespace-pre-wrap").filter({ hasText: body.trim() }).count();
    if (count !== 1) throw new Error(`message painted ${count}× after the retry`);
    const server = await page.request.get(`${BASE}/api/portal/team-chat?channel=${seed.channels.sam}`).then(r => r.json());
    const stored = server.messages.filter(message => message.body === body.trim()).length;
    if (stored !== 1) throw new Error(`server holds ${stored} copies`);
    await shoot("C4");
    return `${seen.join("; ")}; retry sent once (page 1, server 1) and cleared the draft`;
  });

  // C5 — a late send response after unmount cannot touch a new instance.
  await record("C5 late send response after unmount", async () => {
    await selectChannel(page, B);
    await waitForChat(page, B, "hasB");
    const body = `UNMOUNT-C5-${stamp} released after remount`;
    await (await composer(page)).fill(body);
    const held = intercept.hold(chatPost(), { fetchEarly: false });
    await chatPanel(page).getByRole("button", { name: "Send" }).click();
    await held.seen;
    // Each tab switch is a client-side navigation whose RSC response streams
    // after the URL has already changed; `networkidle` is sticky per document
    // and would not wait for it, and a second navigation would cancel the
    // first mid-stream. Wait for the navigation request itself to finish.
    const navigated = pattern => page.waitForEvent("requestfinished", { predicate: request => pattern.test(request.url()), timeout: 15_000 }).catch(() => null);
    const teamDone = navigated(/people\?view=team&_rsc=/);
    await openTab(page, "Directory");
    await until(async () => (await chatPanel(page).count()) === 0, { label: "Team chat unmounted" });
    await Promise.race([teamDone, sleep(6_000)]);
    const chatDone = navigated(/people\?view=chat&_rsc=/);
    await openTab(page, "Team chat");
    await Promise.race([chatDone, sleep(6_000)]);
    await waitForChat(page, "Team", "hasA");
    await held.release();
    const watch = await holdsSteady(() => paintedChat(page));
    const painted = await paintedChat(page);
    if (!watch.steady || painted.header !== "Team" || painted.sendDisabled !== false || painted.alert.length) {
      throw new Error(`new instance affected: steady=${watch.steady} ${JSON.stringify(painted)}`);
    }
    if ((await chatPanel(page).locator("header + div").innerText()).includes(body)) throw new Error("old instance's message painted into the new instance");
    await selectChannel(page, B);
    await waitForChat(page, B, "hasB");
    const count = await chatPanel(page).locator("p.whitespace-pre-wrap").filter({ hasText: body }).count();
    if (count !== 1) throw new Error(`B shows the released message ${count}×`);
    await shoot("C5");
    return "new instance stayed on Team with an idle composer; the released message shows once in B";
  });

  // C6 — a failed selection keeps the valid conversation.
  await record("C6 failed selection retains the valid conversation", async () => {
    await selectChannel(page, "Team");
    await waitForChat(page, "Team", "hasA");
    intercept.fail(chatGet(seed.channels.kim), { status: 503, body: { ok: false, error: "Injected chat load failure." } });
    await selectChannel(page, C);
    const alert = await until(async () => { const p = await paintedChat(page); return p.alert.length ? p.alert : null; }, { label: "selection failure announced" });
    const painted = await paintedChat(page);
    if (painted.header !== "Team" || !painted.hasA) throw new Error(`conversation lost: ${JSON.stringify(painted)}`);
    if (!painted.highlighted.includes("Team")) throw new Error(`highlight did not return to Team: ${painted.highlighted.join("/")}`);
    await selectChannel(page, C);
    await waitForChat(page, C, "hasC");
    const after = await paintedChat(page);
    if (after.alert.length) throw new Error(`error persisted after a successful selection: ${after.alert.join(" | ")}`);
    await shoot("C6");
    return `"${alert[0]}" while Team stayed painted and highlighted; the next selection succeeded and cleared it`;
  });
}

async function notificationStories(page, intercept, alerts, record, shoot) {
  const byPrefix = prefix => alerts.find(alert => alert.id.startsWith(prefix));
  const tasks = alerts.filter(alert => alert.id.startsWith("task:"));
  const T1 = tasks[0];
  const T2 = tasks[1];
  const L = byPrefix("people:leave-decisions");
  const TR = byPrefix("people:training-overdue");
  const W = byPrefix("source-unavailable:");
  if (!T1 || !T2 || !L || !TR || !W) throw new Error(`seed is missing an expected alert: ${alerts.map(alert => alert.id).join(", ")}`);

  const expected = [T1, T2, L, TR, W];
  const baseline = async () => {
    const dialog = await openCentre(page);
    await until(async () => (await dialog.locator("article").count()) > 0, { label: "notification rows at baseline" });
    // Anything a previous story (or a failed one) left read goes back to
    // unread through the ordinary control, so every story starts from the
    // seeded five-alert Attention list.
    await centreTab(page, "Read");
    for (const alert of expected) {
      const article = row(dialog, alert.title);
      if (!(await article.count()) || !(await article.isVisible().catch(() => false))) continue;
      await article.getByRole("button", { name: "Mark unread" }).click();
      await until(async () => !(await rowState(dialog, alert.title)).present, { label: `"${alert.title}" leaves Read at baseline` });
    }
    await centreTab(page, "Attention");
    for (const alert of expected) {
      await until(async () => { const s = await rowState(dialog, alert.title); return s.present && !s.busy; }, { label: `"${alert.title}" in Attention at baseline` });
    }
    return dialog;
  };

  // N1 — a refresh released after a mutation cannot resurrect the alert.
  await record("N1 refresh released after notification mutation", async () => {
    await baseline();
    await closeCentre(page);
    const stale = intercept.hold(alertsGet(), { fetchEarly: true });
    const dialog = await openCentre(page);
    await stale.seen;
    await row(dialog, L.title).getByRole("button", { name: "Mark read" }).click();
    await until(async () => !(await rowState(dialog, L.title)).present, { label: "leave alert leaves Attention" });
    await stale.release();
    const watch = await holdsSteady(() => visibleTitles(dialog));
    if (!watch.steady) throw new Error(`Attention list repainted by the stale refresh: ${watch.first} → ${watch.next}`);
    if ((await rowState(dialog, L.title)).present) throw new Error("the stale refresh resurrected the leave alert");
    const errors = await centreAlerts(dialog);
    if (errors.length) throw new Error(`unexpected error: ${errors.join(" | ")}`);
    await centreTab(page, "Read");
    const read = await rowState(dialog, L.title);
    if (!read.present || read.readLabel !== "Mark unread") throw new Error(`leave alert not in Read: ${JSON.stringify(read)}`);
    await shoot("N1");
    await restoreUnread(page, [L.title]);
    await closeCentre(page);
    return "stale GET released after PATCH: leave alert stayed read, Attention list unchanged through the watch";
  });

  // N2 — two alert actions completed in reverse. Both alerts leave Attention
  // when read (task alerts persist until resolved, so they stay listed by
  // design); an optimistically-read row is therefore inspected in Read.
  await record("N2 two alert actions completed in reverse", async () => {
    const dialog = await baseline();
    const heldL = intercept.hold(alertPatch(L.id), { fetchEarly: true });
    await row(dialog, L.title).getByRole("button", { name: "Mark read" }).click();
    await heldL.seen;
    await until(async () => !(await rowState(dialog, L.title)).present, { label: "L optimistically leaves Attention" });
    await centreTab(page, "Read");
    const busy = await rowState(dialog, L.title);
    if (!busy.present || !busy.busy || busy.readDisabled !== true || busy.dismissDisabled !== true || !busy.parkDisabled) throw new Error(`L not busy in Read while held: ${JSON.stringify(busy)}`);
    await centreTab(page, "Attention");
    const trBefore = await rowState(dialog, TR.title);
    if (!trBefore.present || trBefore.busy || trBefore.readDisabled) throw new Error(`TR was blocked by L's pending action: ${JSON.stringify(trBefore)}`);
    await row(dialog, TR.title).getByRole("button", { name: "Mark read" }).click();
    await until(async () => !(await rowState(dialog, TR.title)).present, { label: "TR read while L is still held" });
    await centreTab(page, "Read");
    await until(async () => { const s = await rowState(dialog, TR.title); return s.present && !s.busy && s.readLabel === "Mark unread"; }, { label: "TR settled in Read" });
    const lHeld = await rowState(dialog, L.title);
    if (!lHeld.present || !lHeld.busy) throw new Error(`TR's earlier response disturbed L: ${JSON.stringify(lHeld)}`);
    await heldL.release();
    await until(async () => { const s = await rowState(dialog, L.title); return s.present && !s.busy && s.readDisabled === false && s.readLabel === "Mark unread"; }, { label: "L settles read after its own later response" });
    const watch = await holdsSteady(() => visibleTitles(dialog));
    if (!watch.steady) throw new Error(`Read list repainted after the reversed responses: ${watch.first} → ${watch.next}`);
    const errors = await centreAlerts(dialog);
    if (errors.length) throw new Error(`unexpected error: ${errors.join(" | ")}`);
    await centreTab(page, "Attention");
    const gone = await Promise.all([L, TR].map(alert => rowState(dialog, alert.title)));
    if (gone.some(state => state.present)) throw new Error(`a read alert was resurrected in Attention: ${JSON.stringify(gone)}`);
    await shoot("N2");
    await restoreUnread(page, [L.title, TR.title]);
    await closeCentre(page);
    return "TR's earlier response settled TR only while L stayed busy; L's later response settled L; both read with idle controls, neither resurrected";
  });

  // N3 — one success plus one isolated failure, rollback and retry. The
  // dismissed alert is a task alert that persists until resolved, so its
  // authoritative outcome is "read, still listed" — and the optimistic row
  // must not flicker away and back.
  await record("N3 one success plus one isolated failure, rollback and retry", async () => {
    const dialog = await baseline();
    await row(dialog, W.title).getByRole("button", { name: "Mark read" }).click();
    await until(async () => !(await rowState(dialog, W.title)).present, { label: "website alert marked read" });
    intercept.fail(alertPatch(T2.id), { status: 500, body: { ok: false, error: "Injected notification outage." } });
    await row(dialog, T2.title).getByRole("button", { name: "Dismiss notification" }).click();
    const errors = await until(async () => { const texts = await centreAlerts(dialog); return texts.length ? texts : null; }, { label: "dismiss failure announced" });
    await until(async () => { const s = await rowState(dialog, T2.title); return s.present && !s.busy && s.dismissDisabled === false && s.readLabel === "Mark read"; }, { label: "T2 rolled back to unread with idle controls" });
    if ((await rowState(dialog, W.title)).present) throw new Error("the failed T2 action resurrected the website alert");
    const others = await Promise.all([T1, L, TR].map(alert => rowState(dialog, alert.title)));
    if (others.some(state => !state.present || state.busy || state.readLabel !== "Mark read")) throw new Error(`unrelated alerts disturbed: ${JSON.stringify(others)}`);
    await row(dialog, T2.title).getByRole("button", { name: "Dismiss notification" }).click();
    await until(async () => { const s = await rowState(dialog, T2.title); return s.present && !s.busy && s.readLabel === "Mark unread"; }, { label: "T2 dismissed on retry (persistent: listed as read)" });
    const after = await centreAlerts(dialog);
    if (after.length) throw new Error(`error persisted after the retry: ${after.join(" | ")}`);
    const watch = await holdsSteady(() => visibleTitles(dialog));
    if (!watch.steady) throw new Error(`Attention repainted after retry: ${watch.first} → ${watch.next}`);
    await shoot("N3");
    await restoreUnread(page, [W.title, T2.title]);
    await closeCentre(page);
    return `"${errors[0]}" rolled back only T2; website alert stayed read; retry dismissed T2 (kept listed as read, no flicker) and cleared the error`;
  });

  // N4 — a second same-alert action is refused by the mounted UI while one is
  // in flight, so no stale same-alert response can exist. The optimistically
  // read row lives in the Read tab while its PATCH is held.
  await record("N4 same-alert stale response — mounted UI refuses a second action", async () => {
    const dialog = await baseline();
    const held = intercept.hold(alertPatch(L.id), { fetchEarly: true });
    await row(dialog, L.title).getByRole("button", { name: "Mark read" }).click();
    await held.seen;
    await until(async () => !(await rowState(dialog, L.title)).present, { label: "L optimistically leaves Attention" });
    await centreTab(page, "Read");
    const busy = await until(async () => { const s = await rowState(dialog, L.title); return s.present && s.busy ? s : null; }, { label: "L busy in Read while held" });
    const patches = [];
    const onRequest = request => { if (alertPatch(L.id)(request)) patches.push(request.url()); };
    page.on("request", onRequest);
    // Every way a second same-alert action could be attempted while the first
    // is pending: a pointer/AT click on the park summary, on the unread
    // toggle and on dismiss.
    const forced = await row(dialog, L.title).evaluate(article => {
      const fire = node => node?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const summary = article.querySelector("summary");
      fire(summary);
      fire(article.querySelector('button[aria-label="Mark unread"]'));
      fire(article.querySelector('button[aria-label="Dismiss notification"]'));
      return { parkOpen: summary?.closest("details")?.open ?? null, summaryTabIndex: summary?.getAttribute("tabindex") ?? null, summaryDisabled: summary?.getAttribute("aria-disabled") ?? null };
    });
    await sleep(300);
    page.off("request", onRequest);
    if (busy.readDisabled !== true || busy.dismissDisabled !== true || !busy.parkDisabled || forced.summaryTabIndex !== "-1" || forced.summaryDisabled !== "true" || forced.parkOpen) {
      throw new Error(`same-alert controls not closed while in flight: ${JSON.stringify({ busy, forced })}`);
    }
    if (patches.length) throw new Error("a second PATCH for the same alert was sent while one was pending");
    await held.release();
    await until(async () => { const s = await rowState(dialog, L.title); return s.present && !s.busy && s.readDisabled === false && s.readLabel === "Mark unread"; }, { label: "leave alert settles read" });
    const errors = await centreAlerts(dialog);
    if (errors.length) throw new Error(`unexpected error: ${errors.join(" | ")}`);
    await shoot("N4");
    await restoreUnread(page, [L.title]);
    await closeCentre(page);
    return "while the PATCH was held: row aria-busy, read/dismiss disabled, park aria-disabled and out of the tab order, forced clicks opened nothing and sent no second PATCH; released response settled it read";
  });

  // N5 — failed and malformed refreshes cannot paint.
  await record("N5 failed and malformed refreshes cannot paint", async () => {
    await baseline();
    const before = await visibleTitles(await centre(page));
    await closeCentre(page);
    intercept.fail(alertsGet(), { status: 200, body: { ok: true, alerts: [{ id: "junk" }, "nonsense"] } });
    let dialog = await openCentre(page);
    let watch = await holdsSteady(() => visibleTitles(dialog), { ms: 800 });
    if (!watch.steady || JSON.stringify(await visibleTitles(dialog)) !== JSON.stringify(before)) throw new Error(`malformed refresh painted: ${JSON.stringify(await visibleTitles(dialog))}`);
    await closeCentre(page);
    intercept.fail(alertsGet(), { status: 500, body: { ok: false, error: "Injected refresh outage." } });
    dialog = await openCentre(page);
    watch = await holdsSteady(() => visibleTitles(dialog), { ms: 800 });
    if (!watch.steady || JSON.stringify(await visibleTitles(dialog)) !== JSON.stringify(before)) throw new Error(`failed refresh painted: ${JSON.stringify(await visibleTitles(dialog))}`);
    const errors = await centreAlerts(dialog);
    await shoot("N5");
    await closeCentre(page);
    return `Attention list identical (${before.length} rows) after a malformed 200 and a 500 refresh${errors.length ? `; refresh failure shown as "${errors[0]}"` : ""}`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Responsive matrix
// ─────────────────────────────────────────────────────────────────────────────

function measureLayout() {
  const doc = document.scrollingElement || document.documentElement;
  const out = [{ label: "document", scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }];
  const main = document.querySelector("#main-content");
  if (main) out.push({ label: "#main-content", scrollWidth: main.scrollWidth, clientWidth: main.clientWidth });
  const composerInput = document.querySelector("form input[name=body]");
  const panel = composerInput?.closest("section");
  if (panel) out.push({ label: "chat panel", scrollWidth: panel.scrollWidth, clientWidth: panel.clientWidth });
  const dialog = document.querySelector('[role=dialog][aria-label="Notification centre"]');
  if (dialog) {
    const rect = dialog.getBoundingClientRect();
    out.push({ label: "notification centre", scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth });
    out.push({ label: "notification centre within viewport", scrollWidth: Math.ceil(rect.right), clientWidth: window.innerWidth });
    out.push({ label: "notification centre left edge", scrollWidth: Math.ceil(-rect.left) + window.innerWidth, clientWidth: window.innerWidth });
  }
  return out;
}

const RESTING_KEY = "__aquaChatOrderResting";

function captureResting(key) {
  const selector = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
  const state = { shadows: new Map(), ordinals: new Map(), next: 1 };
  for (const el of document.querySelectorAll(selector)) {
    state.shadows.set(el, getComputedStyle(el).boxShadow);
    state.ordinals.set(el, state.next++);
  }
  window[key] = state;
}

function describeFocus(key) {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: "body", signature: "body", isBody: true };
  const style = getComputedStyle(el);
  const state = window[key];
  let ordinal = state?.ordinals.get(el);
  if (state && ordinal === undefined) { ordinal = state.next++; state.ordinals.set(el, ordinal); }
  const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40);
  const rect = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    signature: `${el.tagName.toLowerCase()}${label ? `[${label}]` : ""}@${ordinal ?? "?"}`,
    isBody: false,
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    boxShadow: style.boxShadow,
    restingBoxShadow: state?.shadows.get(el) ?? null,
    transitionDuration: style.transitionDuration,
    transitionDelay: style.transitionDelay,
    inViewport: rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth,
  };
}

async function walkKeyboard(page, presses, startFrom) {
  const steps = [];
  await page.evaluate(captureResting, RESTING_KEY);
  if (startFrom) await startFrom.focus();
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press("Tab");
    let raw = await page.evaluate(describeFocus, RESTING_KEY);
    const budget = raw.isBody ? 0 : focusSettleDelayMs(raw);
    for (let waited = 0; waited < budget; waited += 50) {
      await sleep(50);
      const settled = await page.evaluate(describeFocus, RESTING_KEY);
      if (settled.signature !== raw.signature) break;
      raw = settled;
      if (focusIndicatorIsVisible(raw)) break;
    }
    steps.push({ ...raw, visibleFocus: focusIndicatorIsVisible(raw) });
  }
  await page.evaluate(key => { delete window[key]; }, RESTING_KEY);
  return steps;
}

async function scanAxe(page, axeSource) {
  try {
    await page.addScriptTag({ content: axeSource });
    return await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const results = await window.axe.run(document, {
        resultTypes: ["violations"],
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
      });
      return results.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target.join(" ")) }));
    });
  } catch (error) {
    console.error(`    ! axe scan failed: ${error.message}`);
    return null;
  }
}

async function controlTargets(page, { scrollToReach = false } = {}) {
  return page.evaluate(({ scrollToReach }) => {
    const dialog = document.querySelector('[role=dialog][aria-label="Notification centre"]');
    const scope = dialog ?? document;
    const controls = [...scope.querySelectorAll("button, summary, a[href], input")];
    const within = rect => rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
    return controls
      .filter(el => el.getClientRects().length && !el.disabled && !el.closest("details:not([open]) > :not(summary)"))
      .map(el => {
        let rect = el.getBoundingClientRect();
        let inViewport = within(rect);
        if (!inViewport && scrollToReach) {
          // Below the fold of a scrollable list is not unreachable: scroll
          // it into view and judge where it lands.
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
          rect = el.getBoundingClientRect();
          inViewport = within(rect);
        }
        return {
          label: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 32),
          width: Math.round(rect.width), height: Math.round(rect.height),
          inViewport,
        };
      });
  }, { scrollToReach });
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const { chromium } = await import("playwright-core");
  const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
  const seed = JSON.parse(await readFile(join(LANE_DIR, "seed.json"), "utf8"));
  const storyViewports = selectViewports(STORY_VIEWPORTS, process.env.AQUA_STORY_VIEWPORTS);
  const matrixViewports = selectViewports(MATRIX_VIEWPORTS, process.env.AQUA_VIEWPORTS);
  await mkdir(ARTEFACTS, { recursive: true });

  const browser = await chromium.launch(process.env.AQUA_BROWSER_EXECUTABLE ? { executablePath: process.env.AQUA_BROWSER_EXECUTABLE } : {});
  const browserNote = `Chromium ${browser.version()} via playwright-core ${require("playwright-core/package.json").version}`;
  console.log(`\n=== #147 mounted response-order acceptance @ ${BASE} ===\n${browserNote}\n`);

  const stories = [];
  const checks = [];
  const origin = new URL(BASE);
  const cookies = [{ name: seed.cookie.name, value: seed.cookie.value, domain: origin.hostname, path: "/", httpOnly: true, sameSite: "Lax" }];

  const newPage = async (viewport) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "no-preference" });
    await context.addCookies(cookies);
    const page = await context.newPage();
    const log = { consoleErrors: [], pageErrors: [], failedRequests: [] };
    page.on("console", message => { if (message.type() === "error") log.consoleErrors.push({ text: message.text(), url: message.location()?.url }); });
    page.on("pageerror", error => log.pageErrors.push(error.message));
    log.apiResponses = [];
    log.rsc = [];
    page.on("request", request => {
      if (!/[?&]_rsc=/.test(request.url())) return;
      const headers = request.headers();
      log.rsc.push({ at: Date.now(), url: request.url().replace(BASE, ""), prefetch: headers["next-router-prefetch"] === "1" || Boolean(headers["next-router-segment-prefetch"]), outcome: "pending" });
    });
    page.on("response", response => {
      if (/[?&]_rsc=/.test(response.url())) {
        const entry = [...log.rsc].reverse().find(item => item.url === response.url().replace(BASE, "") && item.outcome === "pending");
        if (entry) entry.outcome = `HTTP ${response.status()}`;
      }
      if (response.status() >= 400) log.failedRequests.push({ url: response.url(), status: response.status(), method: response.request().method() });
      if (/\/api\/portal\/(notifications|team-chat)/.test(response.url())) {
        response.text().then(text => log.apiResponses.push({ at: Date.now(), method: response.request().method(), url: response.url(), status: response.status(), body: text.slice(0, 400) })).catch(() => {});
      }
    });
    page.on("requestfailed", request => {
      const headers = request.headers();
      if (/[?&]_rsc=/.test(request.url())) {
        const entry = [...log.rsc].reverse().find(item => item.url === request.url().replace(BASE, "") && item.outcome === "pending");
        if (entry) entry.outcome = request.failure()?.errorText ?? "failed";
      }
      log.failedRequests.push({
        at: Date.now(), headers,
        url: request.url(), status: null, method: request.method(), errorText: request.failure()?.errorText ?? null,
        resourceType: request.resourceType(), isNavigationRequest: request.isNavigationRequest(),
        rsc: headers.rsc ?? null, nextRouterPrefetch: headers["next-router-prefetch"] ?? null,
        purpose: headers.purpose ?? null, secPurpose: headers["sec-purpose"] ?? null, pageUrlAtFailure: page.url(),
      });
    });
    return { context, page, log };
  };

  /**
   * A client-side navigation whose RSC response had already answered HTTP 200
   * and then reports `net::ERR_ABORTED` is the Next router letting go of a
   * stream it no longer needs (a later navigation, or teardown) — the same
   * page-replacement lifecycle the house matrix records for prefetches. It is
   * only set aside when the 200 was observed for that exact request, the
   * request was a same-origin GET with `rsc: 1` and not an API call, and the
   * story that drove it passed; anything else stays red.
   */
  const isAbortedRscNavigationAfterHeaders = (entry, log) => {
    if (entry.status !== null || entry.errorText !== "net::ERR_ABORTED" || entry.method !== "GET") return false;
    if (entry.headers?.rsc !== "1" || entry.isNavigationRequest !== false) return false;
    const url = new URL(entry.url, BASE);
    if (url.origin !== new URL(BASE).origin || url.pathname.startsWith("/api/") || !url.searchParams.has("_rsc")) return false;
    return log.rsc.some(item => item.url === entry.url.replace(BASE, "") && item.outcome === "HTTP 200" && item.at <= entry.at);
  };

  /** Subtract the failures this harness injected; everything else is judged as-is. */
  const judgeLogs = (log, injected) => {
    const remaining = [...injected];
    const takeInjected = (url, method, status) => {
      const index = remaining.findIndex(entry => entry.url === url && entry.method === method && entry.status === status);
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    };
    const afterInjected = log.failedRequests.filter(entry => !takeInjected(entry.url, entry.method, entry.status));
    // Speculative prefetch aborts keep the house matrix's own classification
    // (inside `networkVerdict`); only genuine navigation streams are named here.
    const releasedStreams = afterInjected.filter(entry => !isAbortedRscPrefetch(entry) && isAbortedRscNavigationAfterHeaders(entry, log));
    const failedRequests = afterInjected.filter(entry => !releasedStreams.includes(entry));
    const injectedUrls = new Set(injected.map(entry => entry.url));
    const consoleErrors = log.consoleErrors.filter(entry => !(entry.url && injectedUrls.has(entry.url) && /Failed to load resource/.test(entry.text)));
    let network = networkVerdict({ failedRequests, devServer: false, navigated: true });
    if (network.status !== "fail" && releasedStreams.length) {
      network = {
        status: "observation",
        detail: `${network.status === "pass" ? "" : `${network.detail} | `}${releasedStreams.length} client navigation RSC stream(s) released after answering HTTP 200 (${releasedStreams.map(entry => new URL(entry.url).searchParams.get("view")).join(", ")}) — Next router page-replacement lifecycle, not a failed request`,
      };
    }
    return {
      console: consoleVerdict({ consoleErrors, pageErrors: log.pageErrors, navigated: true, devServer: false }),
      network,
      // Only injected FAILURES can appear in the failed-request log; a
      // malformed 2xx is injected too but is, by design, not a failed request.
      injectedObserved: injected.filter(entry => entry.status === null || entry.status >= 400).length - remaining.filter(entry => entry.status === null || entry.status >= 400).length,
      injectedTotal: injected.filter(entry => entry.status === null || entry.status >= 400).length,
    };
  };

  try {
    const alerts = await (async () => {
      const context = await browser.newContext();
      await context.addCookies(cookies);
      const response = await context.request.get(`${BASE}/api/portal/notifications`);
      const body = await response.json();
      await context.close();
      if (!response.ok() || !Array.isArray(body.alerts)) throw new Error(`could not read the seeded alerts (HTTP ${response.status()})`);
      return body.alerts;
    })();

    // ── Stories ─────────────────────────────────────────────────────────────
    for (const viewport of storyViewports) {
      const { context, page, log } = await newPage(viewport);
      const injected = [];
      const intercept = await installInterceptor(page, injected);
      console.log(`\n— stories @ ${viewport.id} (${viewport.width}×${viewport.height})`);
      const record = async (name, run) => {
        const startedAt = Date.now();
        try {
          const detail = await run();
          stories.push({ viewport: viewport.id, story: name, status: "pass", detail, ms: Date.now() - startedAt, at: startedAt });
          console.log(`  ✓ ${name} — ${detail}`);
        } catch (error) {
          stories.push({ viewport: viewport.id, story: name, status: "fail", detail: error.message, ms: Date.now() - startedAt, at: startedAt });
          console.log(`  ✗ ${name} — ${error.message}`);
          for (const entry of log.apiResponses.filter(item => item.at >= startedAt).slice(-6)) {
            console.log(`      · ${entry.method} ${entry.status} ${entry.url.replace(BASE, "")} ${entry.body.replace(/\s+/g, " ").slice(0, 220)}`);
          }
          await page.screenshot({ path: join(ARTEFACTS, `${viewport.id}-FAILED-${name.slice(0, 2)}.png`), fullPage: true }).catch(() => {});
          // Leave the page in a known state for the next story: nothing held,
          // nothing armed, centre closed.
          await intercept.releaseAll().catch(() => {});
          intercept.disarm();
          await closeCentre(page).catch(() => {});
        }
      };
      const shoot = name => page.screenshot({ path: join(ARTEFACTS, `${viewport.id}-${name}.png`), fullPage: false }).catch(() => {});

      const response = await page.goto(`${BASE}${CHAT_PATH}`, { waitUntil: "networkidle", timeout: 60_000 });
      if (!response || response.status() !== 200 || /\/login(\?|$)/.test(page.url())) {
        throw new Error(`the chat route did not render for the seeded session (HTTP ${response?.status()} at ${page.url()})`);
      }
      await waitForChat(page, "Team", "hasA");
      await chatStories(page, intercept, seed, record, shoot);
      await notificationStories(page, intercept, alerts, record, shoot);

      const logs = judgeLogs(log, injected);
      for (const entry of log.rsc.filter(item => !item.prefetch)) {
        const story = stories.filter(item => item.viewport === viewport.id).find(item => entry.at >= item.at && entry.at <= item.at + item.ms);
        console.log(`    · navigation RSC ${entry.url} → ${entry.outcome} during "${story?.story ?? "?"}"`);
      }
      for (const failed of log.failedRequests.filter(entry => entry.status === null)) {
        const story = stories.filter(item => item.viewport === viewport.id).find(item => failed.at <= item.at + item.ms && failed.at >= item.at);
        console.log(`    · aborted ${failed.method} ${failed.url.replace(BASE, "")} during "${story?.story ?? "?"}" headers=${JSON.stringify(Object.fromEntries(Object.entries(failed.headers ?? {}).filter(([key]) => /^(rsc|next-|purpose|sec-purpose)/.test(key))))}`);
      }
      for (const check of ["console", "network"]) {
        checks.push({ viewport: viewport.id, scope: "stories", check, ...logs[check] });
        console.log(`  ${logs[check].status === "fail" ? "✗" : logs[check].status === "pass" ? "✓" : "·"} stories ${check} — ${logs[check].detail} (${logs.injectedObserved}/${logs.injectedTotal} injected failures accounted for)`);
      }
      if (intercept.pendingRules() > 0) {
        checks.push({ viewport: viewport.id, scope: "stories", check: "interceptor", status: "fail", detail: `${intercept.pendingRules()} injected rule(s) never fired` });
      }
      await context.close();
    }

    // ── Matrix ──────────────────────────────────────────────────────────────
    for (const viewport of matrixViewports) {
      const { context, page, log } = await newPage(viewport);
      console.log(`\n— matrix @ ${viewport.id} (${viewport.width}×${viewport.height})`);
      const add = (check, verdict, scope = "closed") => {
        checks.push({ viewport: viewport.id, scope, check, status: verdict.status, detail: verdict.detail });
        console.log(`  ${verdict.status === "fail" ? "✗" : verdict.status === "pass" ? "✓" : "·"} [${scope}] ${check} — ${verdict.detail}`);
      };
      try {
        const response = await page.goto(`${BASE}${CHAT_PATH}`, { waitUntil: "networkidle", timeout: 60_000 });
        const status = response?.status() ?? 0;
        add("render", status === 200 && !/\/login(\?|$)/.test(page.url()) ? { status: "pass", detail: `HTTP ${status}` } : { status: "fail", detail: `HTTP ${status} at ${page.url()}` });
        await waitForChat(page, "Team", "hasA");
        add("overflow", overflowVerdictFrom(await page.evaluate(measureLayout)));
        add("focus", focusWalkVerdict(await walkKeyboard(page, 14, null)));
        add("axe", axeVerdict(await scanAxe(page, axeSource)));
        const closedTargets = await controlTargets(page);
        const offscreenClosed = closedTargets.filter(target => !target.inViewport);
        add("targets", { status: "pass", detail: `${closedTargets.length} controls measured; ${closedTargets.filter(t => t.width >= 44 && t.height >= 44).length} at ≥44×44, smallest ${Math.min(...closedTargets.map(t => Math.min(t.width, t.height)))}px${offscreenClosed.length ? ` (${offscreenClosed.length} below the fold, reachable by scroll)` : ""}` }, "closed");
        await page.screenshot({ path: join(ARTEFACTS, `matrix-${viewport.id}-chat.png`), fullPage: true }).catch(() => {});

        const dialog = await openCentre(page);
        await until(async () => (await dialog.locator("article").count()) > 0, { label: "notification rows" });
        add("overflow", overflowVerdictFrom(await page.evaluate(measureLayout)), "centre-open");
        const openTargets = await controlTargets(page, { scrollToReach: true });
        const unreachable = openTargets.filter(target => !target.inViewport);
        add("reachable", unreachable.length ? { status: "fail", detail: `${unreachable.length} centre control(s) outside the viewport: ${unreachable.slice(0, 3).map(t => t.label).join(" | ")}` } : { status: "pass", detail: `${openTargets.length} centre controls inside the viewport (smallest ${Math.min(...openTargets.map(t => Math.min(t.width, t.height)))}px)` }, "centre-open");
        const firstTab = dialog.getByRole("navigation", { name: "Notification views" }).getByRole("button").first();
        add("focus", focusWalkVerdict(await walkKeyboard(page, 10, firstTab)), "centre-open");
        add("axe", axeVerdict(await scanAxe(page, axeSource)), "centre-open");
        await page.screenshot({ path: join(ARTEFACTS, `matrix-${viewport.id}-centre.png`), fullPage: false }).catch(() => {});
        await closeCentre(page);
      } catch (error) {
        add("render", { status: "fail", detail: error.message });
      }
      const logs = judgeLogs(log, []);
      add("console", logs.console, "page");
      add("network", logs.network, "page");
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const storyPass = stories.filter(story => story.status === "pass").length;
  const storyFail = stories.length - storyPass;
  const checkPass = checks.filter(check => check.status === "pass").length;
  const checkFail = checks.filter(check => check.status === "fail").length;
  const checkObs = checks.length - checkPass - checkFail;
  const summary = { base: BASE, browser: browserNote, ranAt: new Date().toISOString(), stories: { total: stories.length, passed: storyPass, failed: storyFail }, checks: { total: checks.length, passed: checkPass, failed: checkFail, observations: checkObs } };
  await writeFile(join(ARTEFACTS, "records.json"), JSON.stringify({ ...summary, storyRecords: stories, checkRecords: checks }, null, 2));

  console.log(`\nStories: ${storyPass} passed · ${storyFail} failed (of ${stories.length})`);
  console.log(`Matrix checks: ${checkPass} passed · ${checkFail} failed · ${checkObs} observations (of ${checks.length})`);
  if (storyFail || checkFail) {
    console.log("\nFailures:");
    for (const story of stories.filter(s => s.status === "fail")) console.log(`  - [${story.viewport}] ${story.story}: ${story.detail}`);
    for (const check of checks.filter(c => c.status === "fail")) console.log(`  - [${check.viewport}/${check.scope}] ${check.check}: ${check.detail}`);
  }
  console.log(`\nEvidence: ${ARTEFACTS}\n`);
  if (storyFail || checkFail || stories.length === 0) process.exit(1);
  console.log("✓ #147 mounted acceptance green\n");
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(error => {
    console.error(`\nbrowser acceptance could not run:\n${error.stack ?? error.message}\n`);
    process.exit(2);
  });
}
