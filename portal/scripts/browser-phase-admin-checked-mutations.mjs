#!/usr/bin/env node
// Agency Phase Admin — browser acceptance for the checked mutation contract
// (the separate Phase Admin portion of issue #47).
//
// Drives the REAL /portal/agency/phases surface in Playwright Chromium against
// an isolated dev server (dev-mode sign-in on a disposable file-backed state),
// at 390×844 and 1280×800. For each of the four operations — create, edit,
// delete, preview — it forces 500, 503, a rejected request, malformed JSON and
// a wrong-identity 200 through `page.route()`, then checks: an inline
// `role="alert"` appeared, typed work survived, the busy control re-enabled,
// nothing reloaded/navigated/showed "Saved.", and the same action then succeeds
// once the route is restored.
//
//   AQUA_BASE=http://127.0.0.1:3171 node scripts/browser-phase-admin-checked-mutations.mjs
//   (add AQUA_SESSION_COOKIE=lk_session_v1=<token> to attach a seeded session on
//   an isolated production build, which has no /dev sign-in)
//
// Records per viewport and story: pass/fail, document overflow, and every
// unexpected console error, page error, request failure and HTTP failure.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require("playwright-core");

const BASE = process.env.AQUA_BASE || "http://127.0.0.1:3171";
const OUT = process.env.AQUA_OUT || "";

// Playwright's APIRequestContext mis-transmits the 2.6 KB base64 Supabase SSR
// cookie from its jar, so an authenticated session is rejected on page.request
// API calls. A verbatim Cookie header round-trips (no-op on the file lane, whose
// only cookie is the small lk_session_v1). Every page.request below routes here.
async function withCookie(page) {
  try {
    const cookies = await page.context().cookies();
    return cookies.length ? { cookie: cookies.map(c => `${c.name}=${c.value}`).join("; ") } : {};
  } catch { return {}; }
}
const VIEWPORTS = [[390, 844], [1280, 800]];
const UPSERT = "/api/portal/phases/upsert";
const DELETE = "/api/portal/phases/delete";
const PREVIEW = "/api/auth/preview-as-client-at-phase";
const NAV_TIMEOUT = 120_000;

const summary = { viewports: [], unexpected: { console: [], pageErrors: [], requestFailed: [], http: [] }, intentional: 0, evidencedAborts: 0 };
// Reference-counted: consecutive forced blocks on the same path must not have
// an earlier block's delayed release revoke a later block's allowance while a
// real (cold-compiled) request is still in flight.
const allowed = new Map();
// Per-URL counts of requests this harness aborted, one ledger per event
// stream (requestfailed and console fire independently, in either order).
const abortedByUrl = new Map();
const abortedConsoleByUrl = new Map();

function isAllowed(url) {
  for (const [part, count] of allowed) if (count > 0 && url.includes(part)) return true;
  return false;
}

function instrument(page, label) {
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Only the resource a forced failure was aimed at may explain a console
    // error: the message's own location must name an allowed path or a URL
    // this harness aborted. A page-wide allowance would hide real errors.
    const resource = message.location()?.url ?? "";
    const aborted = (abortedConsoleByUrl.get(resource) ?? 0) > 0;
    if (/Failed to load resource: (net::ERR_FAILED|the server responded with a status of (4|5)\d\d)/.test(text) && (isAllowed(resource) || aborted)) {
      if (aborted) abortedConsoleByUrl.set(resource, abortedConsoleByUrl.get(resource) - 1);
      summary.intentional += 1;
      return;
    }
    summary.unexpected.console.push({ label, text: text.slice(0, 300) });
  });
  page.on("pageerror", error => summary.unexpected.pageErrors.push({ label, text: String(error).slice(0, 300) }));
  page.on("requestfailed", request => {
    const url = request.url();
    const reason = request.failure()?.errorText ?? "";
    if (isAllowed(url) || (reason === "net::ERR_FAILED" && (abortedByUrl.get(url) ?? 0) > 0)) {
      if ((abortedByUrl.get(url) ?? 0) > 0) abortedByUrl.set(url, abortedByUrl.get(url) - 1);
      summary.intentional += 1;
      return;
    }
    if (reason === "net::ERR_ABORTED") { summary.evidencedAborts += 1; return; }
    summary.unexpected.requestFailed.push({ label, url, reason });
  });
  page.on("response", response => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    if (isAllowed(url)) { summary.intentional += 1; return; }
    summary.unexpected.http.push({ label, url, status });
  });
  page.on("dialog", dialog => dialog.accept());
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return { documentOverflow: Math.max(0, doc.scrollWidth - doc.clientWidth), bodyOverflow: Math.max(0, document.body.scrollWidth - doc.clientWidth) };
  });
}

async function withForced(page, path, handler, fn) {
  const predicate = url => url.pathname === path;
  await page.route(predicate, handler);
  allowed.set(path, (allowed.get(path) ?? 0) + 1);
  try {
    return await fn();
  } finally {
    await page.unroute(predicate, handler);
    // Let this block's own late console/response events land, then release
    // BEFORE returning: the real request the next step makes must be judged
    // on its own, never excused by a forced block that already ended.
    await page.waitForTimeout(250);
    allowed.set(path, Math.max(0, (allowed.get(path) ?? 0) - 1));
  }
}

const fulfil = (status, body) => route => route.fulfill({ status, contentType: "application/json", body: typeof body === "string" ? body : JSON.stringify(body) });
// Let the real route answer a rewritten body: the refusal (400/404) then comes
// from the server's own validation, not from a fulfilled stub.
const rewrite = mutate => route => {
  const body = JSON.parse(route.request().postData() || "{}");
  return route.continue({ postData: JSON.stringify(mutate(body)) });
};
const reject = route => {
  const url = route.request().url();
  abortedByUrl.set(url, (abortedByUrl.get(url) ?? 0) + 1);
  abortedConsoleByUrl.set(url, (abortedConsoleByUrl.get(url) ?? 0) + 1);
  return route.abort("failed");
};
// Answers after `ms`, long enough to observe the control disabled and busy.
const slow = (status, body, ms) => async route => { await new Promise(resolve => setTimeout(resolve, ms)); return fulfil(status, body)(route); };

async function expectAlert(scope, pattern, notPattern) {
  const alert = scope.locator('[role="alert"]').first();
  await alert.waitFor({ state: "visible", timeout: 20_000 });
  const text = (await alert.textContent()) ?? "";
  if (!pattern.test(text)) throw new Error(`alert "${text}" does not match ${pattern}`);
  if (notPattern && notPattern.test(text)) throw new Error(`alert "${text}" leaked ${notPattern}`);
  return text;
}

// While a request is pending the control must be disabled, aria-busy and
// (where the component swaps it) show its busy label; `settled` alone would
// pass a control that never disabled.
async function engaged(locator, busyLabel, busyScope = locator) {
  if (!(await locator.isDisabled())) throw new Error("control was not disabled while busy");
  if ((await busyScope.getAttribute("aria-busy")) !== "true") throw new Error("control is not aria-busy while busy");
  if (busyLabel && (await locator.textContent())?.trim() !== busyLabel) throw new Error(`busy label is "${await locator.textContent()}"`);
}

async function settled(locator) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await locator.isEnabled()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("control never re-enabled");
}

async function signIn(page) {
  // An isolated production lane has no `/dev`: its seed mints the session and
  // hands the cookie over as AQUA_SESSION_COOKIE=name=value. Proven against the
  // app before any story runs, exactly like the dev-mode path below.
  // AQUA_AUTH=login: a Supabase-backed lane refuses a bare portal cookie, so
  // sign in through the real route with AQUA_LOGIN_EMAIL / AQUA_LOGIN_PASSWORD.
  if (process.env.AQUA_AUTH === "login") {
    const response = await page.request.post(`${BASE}/api/auth/login`, { data: { email: process.env.AQUA_LOGIN_EMAIL, password: process.env.AQUA_LOGIN_PASSWORD }, headers: { "content-type": "application/json" } });
    if (!response.ok()) throw new Error(`login failed: POST /api/auth/login → ${response.status()}`);
    const me = await page.request.get(`${BASE}/api/auth/me`, { headers: await withCookie(page) });
    if (me.status() !== 200) throw new Error(`/api/auth/me after login → ${me.status()}`);
    return me.json();
  }
  const cookie = process.env.AQUA_SESSION_COOKIE || "";
  if (cookie) {
    const separator = cookie.indexOf("=");
    if (separator <= 0) throw new Error("AQUA_SESSION_COOKIE must be name=value");
    await page.context().addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: BASE }]);
    const me = await page.request.get(`${BASE}/api/auth/me`, { headers: await withCookie(page) });
    if (me.status() !== 200) throw new Error(`/api/auth/me with AQUA_SESSION_COOKIE → ${me.status()}`);
    return me.json();
  }
  // The dev lane answers a redirect chain; Playwright can hand back no
  // response object for it when the goto lands mid-navigation (seen after the
  // preview handoff), so the session itself is the evidence, not the goto.
  const response = await page.goto(`${BASE}/dev`, { waitUntil: "load", timeout: NAV_TIMEOUT });
  if (response && response.status() >= 400) throw new Error(`dev sign-in failed: ${response.status()}`);
  await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => undefined);
  const me = await page.request.get(`${BASE}/api/auth/me`, { headers: await withCookie(page) });
  if (me.status() !== 200) throw new Error(`/api/auth/me after sign-in → ${me.status()}`);
  return me.json();
}

// A server-rendered button is visible before React hydrates it; a click that
// lands first is silently lost. React stamps `__reactProps$…` on a node once
// it owns it, so wait for that on the control the next step will click.
async function hydrated(page, buttonName) {
  await page.waitForFunction(name => {
    const button = Array.from(document.querySelectorAll("button")).find(node => node.textContent?.trim() === name);
    return !!button && Object.keys(button).some(key => key.startsWith("__reactProps"));
  }, buttonName, { timeout: NAV_TIMEOUT });
}

async function gotoPhases(page) {
  // A navigation issued while the dev sign-in redirect chain is still settling
  // is aborted by Chromium (net::ERR_ABORTED); that is the harness's timing,
  // not the page's, so settle first and retry the goto a few times.
  await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => undefined);
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.goto(`${BASE}/portal/agency/phases`, { waitUntil: "load", timeout: NAV_TIMEOUT });
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (!/ERR_ABORTED/.test(String(error?.message ?? error))) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  if (lastError) throw lastError;
  await page.getByRole("heading", { name: "Phases preview" }).waitFor({ state: "visible", timeout: NAV_TIMEOUT });
  await hydrated(page, "+ Add phase");
}

function validPhase(id, label) {
  return { id, agencyId: "agency_bare", stage: "discovery", label, description: "Desc", order: 100, pluginPreset: [], checklist: [], isDefault: false, customCss: "", customJs: "", welcomeHeading: "", welcomeBody: "", isPublicPreset: false };
}

async function runViewport(browser, width, height) {
  const tag = `${width}x${height}`;
  const record = { viewport: tag, stories: [] };
  summary.viewports.push(record);
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  instrument(page, tag);

  async function story(name, fn) {
    const started = Date.now();
    try {
      await fn();
      const flow = await overflow(page);
      record.stories.push({ name, ok: flow.documentOverflow === 0 && flow.bodyOverflow === 0, ms: Date.now() - started, overflow: flow });
    } catch (error) {
      // A story may declare itself not applicable to THIS target (never silently):
      // it is recorded green with its reason, and the reason is printed.
      if (error?.notApplicable) {
        record.stories.push({ name, ok: true, notApplicable: String(error.notApplicable).slice(0, 500), ms: Date.now() - started });
        return;
      }
      record.stories.push({ name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error).slice(0, 500) });
    }
  }
  const notApplicable = reason => Object.assign(new Error(reason), { notApplicable: reason });

  // Unique per run: the disposable state persists across harness runs on one server.
  const name = `Custom ${tag} ${Date.now().toString(36)}`;
  const editedName = `${name} edited`;
  let phaseId = "";

  await story("sign in through the dev-mode lane and open Phase Admin", async () => {
    const me = await signIn(page);
    // /api/auth/me answers { ok, user: { role, email, ... } }.
    if (!/agency-owner/.test(String(me?.user?.role))) throw new Error(`unexpected dev session: ${JSON.stringify(me)}`);
    await gotoPhases(page);
  });

  await story("create: 500/503/rejected/malformed/wrong-identity/real-400 keep the typed values and re-enable Save; then success reloads with the new card", async () => {
    await page.getByRole("button", { name: "+ Add phase" }).click();
    const form = page.locator("form", { has: page.locator('input[name="name"]') });
    await form.locator('input[name="name"]').fill(name);
    await form.locator('textarea[name="description"]').fill("Desc");
    const save = form.getByRole("button", { name: /^(Save phase|Saving…)$/ });
    await withForced(page, UPSERT, slow(500, { ok: false, error: "private database detail" }, 1500), async () => {
      await save.click();
      await engaged(save, "Saving…", form);
      await expectAlert(form, /The phase could not be saved\. \(HTTP 500\)\./, /private database detail/);
      await settled(save);
    });
    await withForced(page, UPSERT, fulfil(503, { error: "private provider detail" }), async () => {
      await save.click();
      await expectAlert(form, /The phase could not be saved\. \(HTTP 503\)\./, /private provider detail/);
      await settled(save);
    });
    await withForced(page, UPSERT, reject, async () => {
      await save.click();
      await expectAlert(form, /Check your connection and try again/);
      await settled(save);
    });
    await withForced(page, UPSERT, fulfil(200, "<html>gateway</html>"), async () => {
      await save.click();
      await expectAlert(form, /unreadable response/);
      await settled(save);
    });
    await withForced(page, UPSERT, fulfil(200, { ok: true, phase: validPhase("phase_wrong", "Someone else") }), async () => {
      await save.click();
      await expectAlert(form, /^The phase could not be saved\.$/);
      await settled(save);
    });
    await withForced(page, UPSERT, rewrite(body => ({ ...body, name: "n".repeat(161) })), async () => {
      await save.click();
      await expectAlert(form, /A phase name must be 160 characters or fewer\./);
      await settled(save);
    });
    if ((await form.locator('input[name="name"]').inputValue()) !== name) throw new Error("typed name was lost on refusal");
    if ((await form.locator('textarea[name="description"]').inputValue()) !== "Desc") throw new Error("typed description was lost on refusal");
    if (await page.locator("li[data-phase-id]", { hasText: name }).count()) throw new Error("a refused create produced a card");
    const loaded = page.waitForEvent("load", { timeout: NAV_TIMEOUT });
    const answered = page.waitForResponse(response => response.url().endsWith(UPSERT) && response.request().method() === "POST", { timeout: NAV_TIMEOUT });
    await save.click();
    if ((await answered).status() !== 200) throw new Error("the live create did not answer 200");
    await loaded;
    const card = page.locator("li[data-phase-id]", { hasText: name });
    await card.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
    phaseId = await card.getAttribute("data-phase-id");
    if (!phaseId) throw new Error("created card has no phase id");
  });

  await story("edit: refusals never show Saved and keep the edit; success shows Saved and survives reload", async () => {
    await page.goto(`${BASE}/portal/agency/phases/${encodeURIComponent(phaseId)}`, { waitUntil: "load", timeout: NAV_TIMEOUT });
    const form = page.locator("form", { has: page.locator('input[name="name"]') });
    await form.locator('input[name="name"]').waitFor({ state: "visible", timeout: NAV_TIMEOUT });
    await hydrated(page, "Save changes");
    await form.locator('input[name="name"]').fill(editedName);
    const save = form.getByRole("button", { name: /^(Save changes|Saving…)$/ });
    const noSaved = async () => { if (await form.getByText("Saved.", { exact: true }).count()) throw new Error("Saved. shown after a refusal"); };
    await withForced(page, UPSERT, slow(500, { ok: false, error: "private database detail" }, 1500), async () => {
      await save.click();
      await engaged(save, "Saving…", form);
      await expectAlert(form, /The changes could not be saved\. \(HTTP 500\)\./, /private/);
      await settled(save); await noSaved();
    });
    await withForced(page, UPSERT, fulfil(409, { ok: false, error: "That phase changed in another tab." }), async () => {
      await save.click();
      await expectAlert(form, /That phase changed in another tab\./);
      await settled(save); await noSaved();
    });
    await withForced(page, UPSERT, reject, async () => {
      await save.click();
      await expectAlert(form, /Check your connection/);
      await settled(save); await noSaved();
    });
    await withForced(page, UPSERT, fulfil(200, "not json"), async () => {
      await save.click();
      await expectAlert(form, /unreadable response/);
      await settled(save); await noSaved();
    });
    await withForced(page, UPSERT, fulfil(200, { ok: true, phase: validPhase("phase_other", editedName) }), async () => {
      await save.click();
      await expectAlert(form, /^The changes could not be saved\.$/);
      await settled(save); await noSaved();
    });
    await withForced(page, UPSERT, rewrite(body => ({ ...body, phaseId: "phase_missing" })), async () => {
      await save.click();
      await expectAlert(form, /That phase no longer exists in this agency\./);
      await settled(save); await noSaved();
    });
    if ((await form.locator('input[name="name"]').inputValue()) !== editedName) throw new Error("the edit was lost on refusal");
    const answered = page.waitForResponse(response => response.url().endsWith(UPSERT) && response.request().method() === "POST", { timeout: NAV_TIMEOUT });
    await save.click();
    if ((await answered).status() !== 200) throw new Error("the live edit did not answer 200");
    await form.getByText("Saved.", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
    await page.reload({ waitUntil: "load", timeout: NAV_TIMEOUT });
    const after = await page.locator('input[name="name"]').inputValue();
    if (after !== editedName) throw new Error(`reload shows "${after}"`);
  });

  await story("preview: refusals never navigate or change the session; success navigates to the demo client at this phase", async () => {
    // "Preview as demo client" re-issues the caller as the SEEDED demo tenant, so
    // the route hangs off the dev-mode switch and answers 404 "Not available." on
    // a production build by design. Prove that refusal, then stop: the story's
    // demo-client navigation only exists on a Dev Mode lane.
    const availability = await page.request.post(`${BASE}${PREVIEW}`, { data: { phaseId }, headers: { "content-type": "application/json", ...(await withCookie(page)) } });
    if (availability.status() === 404 && /Not available/.test(await availability.text())) {
      throw notApplicable("production build: preview-as-demo-client is refused 404 \"Not available.\" by the dev-mode switch (canUseDevMode); the demo-client navigation is proven on the Dev Mode lane only");
    }
    await gotoPhases(page);
    const card = page.locator(`li[data-phase-id="${phaseId}"]`);
    const preview = card.getByRole("button", { name: /^(Preview as demo client|Starting preview…)$/ });
    await page.evaluate(() => { window.__phaseAdminStay = "stay"; });
    const before = await (await page.request.get(`${BASE}/api/auth/me`, { headers: await withCookie(page) })).json();
    const stayed = async () => {
      if (!page.url().includes("/portal/agency/phases")) throw new Error(`navigated to ${page.url()}`);
      if ((await page.evaluate(() => window.__phaseAdminStay)) !== "stay") throw new Error("the page reloaded");
      const me = await (await page.request.get(`${BASE}/api/auth/me`, { headers: await withCookie(page) })).json();
      if (me?.user?.role !== before?.user?.role || me?.user?.email !== before?.user?.email) throw new Error("the session changed on a refusal");
    };
    await withForced(page, PREVIEW, slow(500, { ok: false, error: "private seed detail" }, 1500), async () => {
      await preview.click();
      await engaged(preview, "Starting preview…");
      await expectAlert(card, /Preview could not start\. \(HTTP 500\)\./, /private/);
      await settled(preview); await stayed();
    });
    await withForced(page, PREVIEW, fulfil(503, { error: "private detail" }), async () => {
      await preview.click();
      await expectAlert(card, /Preview could not start\. \(HTTP 503\)\./, /private/);
      await settled(preview); await stayed();
    });
    await withForced(page, PREVIEW, reject, async () => {
      await preview.click();
      await expectAlert(card, /Check your connection/);
      await settled(preview); await stayed();
    });
    await withForced(page, PREVIEW, fulfil(200, "{not json"), async () => {
      await preview.click();
      await expectAlert(card, /unreadable response/);
      await settled(preview); await stayed();
    });
    await withForced(page, PREVIEW, fulfil(200, { ok: true, phaseId: "phase_other", redirect: `/portal/clients/luv-and-ker-demo?previewPhase=phase_other` }), async () => {
      await preview.click();
      await expectAlert(card, /^Preview could not start\.$/);
      await settled(preview); await stayed();
    });
    await withForced(page, PREVIEW, fulfil(200, { ok: true, phaseId, redirect: `https://evil.example/portal/clients/luv-and-ker-demo?previewPhase=${encodeURIComponent(phaseId)}` }), async () => {
      await preview.click();
      await expectAlert(card, /^Preview could not start\.$/);
      await settled(preview); await stayed();
    });
    await withForced(page, PREVIEW, rewrite(() => ({ phaseId: "phase_missing" })), async () => {
      await preview.click();
      await expectAlert(card, /That phase no longer exists in this agency\./);
      await settled(preview); await stayed();
    });
    const answered = page.waitForResponse(response => response.url().endsWith(PREVIEW) && response.request().method() === "POST", { timeout: NAV_TIMEOUT });
    await preview.click();
    if ((await answered).status() !== 200) throw new Error("the live preview did not answer 200");
    await page.waitForURL(url => url.pathname === "/portal/clients/luv-and-ker-demo" && url.searchParams.get("previewPhase") === phaseId, { timeout: NAV_TIMEOUT });
    const demo = await (await page.request.get(`${BASE}/api/auth/me`, { headers: await withCookie(page) })).json();
    if (!/client/.test(String(demo?.user?.role))) throw new Error(`preview did not switch to the demo client: ${JSON.stringify(demo)}`);
    // Back to the operator for the delete story; let the redirect chain settle.
    await signIn(page);
    await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => undefined);
  });

  await story("delete: refusals keep the card and never reload; success reloads without it", async () => {
    await gotoPhases(page);
    const card = page.locator(`li[data-phase-id="${phaseId}"]`);
    const remove = card.getByRole("button", { name: /^(Delete|Deleting…)$/ });
    await page.evaluate(() => { window.__phaseAdminStay = "stay"; });
    const kept = async () => {
      if ((await page.evaluate(() => window.__phaseAdminStay)) !== "stay") throw new Error("the page reloaded on a refusal");
      if (!(await card.count())) throw new Error("the card vanished on a refusal");
    };
    await withForced(page, DELETE, slow(500, { ok: false, error: "private storage detail" }, 1500), async () => {
      await remove.click();
      await engaged(remove, "Deleting…");
      await expectAlert(card, /The phase could not be deleted\. \(HTTP 500\)\./, /private/);
      await settled(remove); await kept();
    });
    await withForced(page, DELETE, fulfil(409, { ok: false, error: "default_phase_protected: a default phase cannot be deleted." }), async () => {
      await remove.click();
      await expectAlert(card, /default_phase_protected/);
      await settled(remove); await kept();
    });
    await withForced(page, DELETE, reject, async () => {
      await remove.click();
      await expectAlert(card, /Check your connection/);
      await settled(remove); await kept();
    });
    await withForced(page, DELETE, fulfil(200, "<html>"), async () => {
      await remove.click();
      await expectAlert(card, /unreadable response/);
      await settled(remove); await kept();
    });
    await withForced(page, DELETE, fulfil(200, { ok: true, phaseId: "phase_other" }), async () => {
      await remove.click();
      await expectAlert(card, /^The phase could not be deleted\.$/);
      await settled(remove); await kept();
    });
    await withForced(page, DELETE, rewrite(() => ({ phaseId: "phase_missing" })), async () => {
      await remove.click();
      await expectAlert(card, /That phase no longer exists in this agency\./);
      await settled(remove); await kept();
    });
    const loaded = page.waitForEvent("load", { timeout: NAV_TIMEOUT });
    const answered = page.waitForResponse(response => response.url().endsWith(DELETE) && response.request().method() === "POST", { timeout: NAV_TIMEOUT });
    await remove.click();
    if ((await answered).status() !== 200) throw new Error("the live delete did not answer 200");
    await loaded;
    await page.getByRole("heading", { name: "Phases preview" }).waitFor({ state: "visible", timeout: NAV_TIMEOUT });
    if (await page.locator(`li[data-phase-id="${phaseId}"]`).count()) throw new Error("the phase is still listed after a validated delete");
  });

  await context.close();
  return record;
}

const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of VIEWPORTS) {
    const record = await runViewport(browser, width, height);
    const failed = record.stories.filter(story => !story.ok);
    for (const story of record.stories.filter(entry => entry.notApplicable)) console.log(`${record.viewport}: N/A — ${story.name} :: ${story.notApplicable}`);
    console.log(`${record.viewport}: ${record.stories.length - failed.length}/${record.stories.length} stories${failed.length ? ` — FAILED: ${failed.map(story => `${story.name} :: ${story.error ?? JSON.stringify(story.overflow)}`).join(" || ")}` : ""}`);
  }
} finally {
  await browser.close();
}
if (OUT) writeFileSync(OUT, JSON.stringify(summary, null, 2));
const total = summary.viewports.reduce((sum, viewport) => sum + viewport.stories.length, 0);
const passed = summary.viewports.reduce((sum, viewport) => sum + viewport.stories.filter(story => story.ok).length, 0);
const unexpectedCount = Object.values(summary.unexpected).reduce((sum, list) => sum + list.length, 0);
console.log(JSON.stringify({ total, passed, unexpected: Object.fromEntries(Object.entries(summary.unexpected).map(([key, list]) => [key, list.length])), intentional: summary.intentional, evidencedAborts: summary.evidencedAborts }));
if (unexpectedCount) console.log(JSON.stringify(summary.unexpected, null, 2));
process.exit(passed === total && unexpectedCount === 0 ? 0 : 1);
