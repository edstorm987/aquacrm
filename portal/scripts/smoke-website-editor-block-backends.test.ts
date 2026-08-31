// Native website-editor blocks must not promise a visitor something the
// backend cannot deliver. Issue #29.
//
// ── Why this test re-derives instead of asserting a list ─────────────────
//
// The tempting version reads `BLOCK_BACKEND_GAPS` and checks it is non-empty,
// which passes forever and tells nobody anything. This one rebuilds the truth
// from two independent places — the endpoints each block component actually
// fetches, and the route tables each module actually declares — and compares
// that against the list.
//
// It fails BOTH ways on purpose:
//
//   - A block on the list whose backend now works fails, so the day somebody
//     builds the forms module the test says "delete this entry" instead of
//     leaving "Not connected yet" in front of clients forever.
//   - A block NOT on the list that calls an unreachable endpoint fails, so a
//     new block cannot quietly ship the same defect.
//
// The reachability rule is the dispatcher's, not an approximation of it:
// `src/app/api/portal/[module]/[...rest]/route.ts` calls `requireSession()`
// unless the resolved route declares `public: true`. A visitor to a published
// page has no session, so "reachable by a visitor" means "declared, and
// public".

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

// The repo path contains a space, so __dirname via fileURLToPath — not a
// hand-rolled slice of import.meta.url.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MODULES = path.join(ROOT, "src/built-ins/modules");
const WEBSITE_EDITOR = path.join(MODULES, "website-editor/src");
const BLOCKS_DIR = path.join(WEBSITE_EDITOR, "components/blocks");
const REGISTRY = path.join(WEBSITE_EDITOR, "components/blockRegistry.ts");

interface DeclaredRoute { path: string; public: boolean }

/** Every route each module declares, with the dispatcher's public flag. */
function declaredRoutes(): Map<string, DeclaredRoute[]> {
  const out = new Map<string, DeclaredRoute[]>();
  for (const moduleId of readdirSync(MODULES)) {
    const file = path.join(MODULES, moduleId, "src/api/routes.ts");
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf8");
    const rows: DeclaredRoute[] = [];
    for (const match of src.matchAll(/\{\s*path:\s*["'`]([^"'`]+)["'`][^}]*?\}/gs)) {
      rows.push({ path: match[1], public: /public:\s*true/.test(match[0]) });
    }
    out.set(moduleId, rows);
  }
  return out;
}

/**
 * Which native block each component file backs.
 *
 * Only blocks in `BLOCK_REGISTRY` are offered by the palette unconditionally.
 * Plugin-contributed renderers in `RENDERER_REGISTRATIONS` are already gated by
 * whether their plugin is installed, so they are deliberately out of scope —
 * including them would flag membership and affiliate blocks that the plugin
 * system never offers unless the plugin is there.
 */
function nativeBlockTypes(): Map<string, string> {
  const src = readFileSync(REGISTRY, "utf8");
  // Cut the file at RENDERER_REGISTRATIONS so plugin-contributed entries below
  // it are not mistaken for native palette blocks.
  const nativeOnly = src.split("export const RENDERER_REGISTRATIONS")[0];
  const byComponent = new Map<string, string>();
  // Anchor on `Component:` and walk BACK to the nearest `type:` before it.
  // Matching forwards from `type:` instead pulls in `type: "boolean"` and
  // friends out of the `fields: [...]` PropField literals, which is how the
  // first version of this test decided "boolean" was a block.
  for (const match of nativeOnly.matchAll(/Component:\s*([A-Za-z0-9_]+)/g)) {
    const before = nativeOnly.slice(0, match.index ?? 0);
    const types = [...before.matchAll(/\btype:\s*["']([a-z0-9][a-z0-9-]*)["']/g)];
    const nearest = types[types.length - 1]?.[1];
    if (nearest) byComponent.set(match[1], nearest);
  }
  return byComponent;
}

/** The `/api/portal/...` endpoints a block component calls. */
function endpointsFor(componentName: string): string[] {
  const file = path.join(BLOCKS_DIR, `${componentName}.tsx`);
  if (!existsSync(file)) return [];
  const src = readFileSync(file, "utf8");
  const eps = new Set<string>();
  for (const m of src.matchAll(/(?:fetch\(|action=)["`](\/api\/portal\/[^"`?]+)/g)) eps.add(m[1]);
  return [...eps];
}

/** Can an anonymous visitor reach this endpoint? */
function reachableByVisitor(endpoint: string, routes: Map<string, DeclaredRoute[]>): boolean {
  const rest = endpoint.replace("/api/portal/", "");
  const moduleId = rest.split("/")[0];
  const declared = routes.get(moduleId);
  if (!declared) return false;                    // module does not exist
  const sub = rest.slice(moduleId.length + 1).replace(/\$\{[^}]*\}/g, "*").replace(/\/+$/, "");
  const match = declared.find(r => r.path.replace(/:[^/]+/g, "*").replace(/\[[^\]]+\]/g, "*") === sub);
  if (!match) return false;                       // route never declared
  return match.public;                            // declared but session-gated
}

test("every native block that a visitor cannot use is declared as such", async () => {
  const { BLOCK_BACKEND_GAPS } = await import(
    "../src/built-ins/modules/website-editor/src/lib/blockBackends.ts"
  );
  const routes = declaredRoutes();
  const native = nativeBlockTypes();

  assert.ok(native.size > 40, `expected the native registry to parse, got ${native.size} blocks`);

  const broken: string[] = [];
  for (const [component, type] of native) {
    const eps = endpointsFor(component);
    if (!eps.length) continue;
    const unreachable = eps.filter(ep => !reachableByVisitor(ep, routes));
    if (unreachable.length) broken.push(type);
  }

  const listed = Object.keys(BLOCK_BACKEND_GAPS).sort();
  const found = [...new Set(broken)].sort();

  // Two-sided. Named explicitly so a failure says WHICH block and WHICH way.
  const missing = found.filter(t => !listed.includes(t));
  const stale = listed.filter(t => !found.includes(t));

  assert.deepEqual(
    missing, [],
    `these blocks call an endpoint no visitor can reach but are not declared in BLOCK_BACKEND_GAPS: ${missing.join(", ")}`,
  );
  assert.deepEqual(
    stale, [],
    `these blocks now have a reachable backend — delete their BLOCK_BACKEND_GAPS entry so the editor stops warning about them: ${stale.join(", ")}`,
  );
});

test("the palette refuses to add a block with no visitor backend", () => {
  const sidebar = readFileSync(path.join(WEBSITE_EDITOR, "components/canvas/Sidebar.tsx"), "utf8");
  // Strip comments so this cannot pass by matching its own explanation — a
  // trap this repo has fallen into before.
  const code = sidebar.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(code, /blockBackendGap\(/, "Sidebar must consult blockBackendGap");
  // The gapped branch must render something that is NOT the add button: no
  // onClick that adds, and no draggable payload.
  const gapBranch = code.split("blockBackendGap(")[1]?.split("return (")[1]?.split("})}")[0] ?? "";
  assert.doesNotMatch(gapBranch, /onAdd\(/, "a block with no backend must not be addable");
  assert.doesNotMatch(gapBranch, /draggable/, "a block with no backend must not be draggable onto the canvas");
  assert.match(gapBranch, /Not connected yet/, "the palette must say why the block is unavailable");
});

test("contact-form is covered — the block most likely to be published", async () => {
  // Named on its own because it is the one a client will actually reach for,
  // and because its failure is silent: the visitor sees "Couldn't send. Please
  // email us directly." with no email address anywhere on the page.
  const { blockBackendGap } = await import(
    "../src/built-ins/modules/website-editor/src/lib/blockBackends.ts"
  );
  const gap = blockBackendGap("contact-form");
  assert.ok(gap, "contact-form must be declared as having no visitor backend");
  assert.ok(gap.reason.length > 20, "the reason must be a sentence a person can act on");
});

test("no page template seeds a block that cannot serve a visitor", async () => {
  // The palette gate is not enough on its own. A template builds a page
  // directly, so it walks straight past the palette — and the "Contact" and
  // brand-contact templates were doing exactly that, putting a form that could
  // never deliver on every Contact page anybody created from them.
  const { BLOCK_BACKEND_GAPS } = await import(
    "../src/built-ins/modules/website-editor/src/lib/blockBackends.ts"
  );
  const src = readFileSync(path.join(WEBSITE_EDITOR, "components/pageTemplates.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const seeded = new Set<string>();
  for (const m of code.matchAll(/\bblk\(\s*["']([a-z0-9-]+)["']/g)) seeded.add(m[1]);

  const offending = [...seeded].filter(type => type in BLOCK_BACKEND_GAPS).sort();
  assert.deepEqual(
    offending, [],
    `page templates seed blocks with no visitor backend: ${offending.join(", ")}`,
  );
});

test("no page template points a form at a route that does not exist", () => {
  // `/api/contact` and `/api/checkout` were both seeded as form actions and
  // both answer 404 — verified against a running server before this was
  // written, not assumed from the file tree.
  const src = readFileSync(path.join(WEBSITE_EDITOR, "components/pageTemplates.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const dead: string[] = [];
  for (const m of code.matchAll(/\baction:\s*["'](\/[^"']*)["']/g)) {
    const target = m[1];
    if (!target) continue;                                  // empty is the honest state
    const dir = path.join(ROOT, "src/app", target.replace(/\?.*$/, ""));
    const exists = existsSync(path.join(dir, "route.ts")) || existsSync(path.join(dir, "route.tsx"));
    if (!exists) dead.push(target);
  }
  assert.deepEqual(
    dead, [],
    `page templates post forms to routes that do not exist: ${[...new Set(dead)].join(", ")}`,
  );
});

// ── The plugin-contributed blocks ────────────────────────────────────────
//
// The derivation above deliberately stops at RENDERER_REGISTRATIONS, because
// a plugin block is only offered when its plugin is installed. That gating
// says nothing about what the block PRINTS when its backend answers badly,
// and every one of the membership/affiliate renderers used to print the same
// thing for "there is nothing" and for "we could not ask": an empty list
// behind a silent catch. Those are the contracts below.

/** Every `.ts`/`.tsx` source under `dir`, concatenated. */
function readAllSources(dir: string): string {
  if (!existsSync(dir)) return "";
  let out = "";
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out += readAllSources(full);
    else if (/\.tsx?$/.test(entry.name)) out += readFileSync(full, "utf8");
  }
  return out;
}

/** Source with comments removed, so a test cannot pass on prose. */
function codeOf(file: string): string {
  return readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("classifyBlockFetch separates an empty result from an unreachable backend", async () => {
  const { classifyBlockFetch } = await import(
    "../src/built-ins/modules/website-editor/src/lib/blockBackends.ts"
  );

  // The distinction the blocks render. A 404 is not an empty catalogue.
  assert.equal(classifyBlockFetch({ ok: true, status: 200 }), "ok");
  assert.equal(classifyBlockFetch({ ok: false, status: 404 }), "unavailable");
  assert.equal(classifyBlockFetch({ ok: false, status: 410 }), "unavailable");
  assert.equal(classifyBlockFetch({ ok: false, status: 401 }), "unauthorized");
  assert.equal(classifyBlockFetch({ ok: false, status: 403 }), "unauthorized");
  assert.equal(classifyBlockFetch({ ok: false, status: 500 }), "failed");
  assert.equal(classifyBlockFetch({ ok: false, status: 502 }), "failed");
  // A request that threw has no response at all — the caller passes nothing.
  assert.equal(classifyBlockFetch(null), "failed");
  assert.equal(classifyBlockFetch(), "failed");
});

test("a data-fetching plugin block never reports a failure as an empty result", () => {
  // These four all fetch their own data and all render an "empty" sentence.
  // Each must decide WHICH empty it is looking at, and must not swallow the
  // failure on the way — `catch(() => {})` is exactly how "No tiers available
  // right now." ended up in front of visitors of a site whose plans a visitor
  // is not allowed to read.
  const blocks = [
    "MembershipTierGridBlock",
    "MembershipSignupBlock",
    "MembershipPaywallBlock",
    "AffiliateLeaderboardBlock",
  ];
  for (const name of blocks) {
    const code = codeOf(path.join(BLOCKS_DIR, `${name}.tsx`));
    assert.match(
      code, /classifyBlockFetch\(/,
      `${name} must classify its fetch instead of folding every failure into an empty result`,
    );
    assert.doesNotMatch(
      code, /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/,
      `${name} has a silent catch — a failed fetch must reach the render, not vanish`,
    );
    assert.match(
      code, /\bunavailable\b/,
      `${name} must say something different when the backend is not installed`,
    );
  }
});

test("the affiliate signup block only promises an email something actually sends", () => {
  // Two-sided on purpose. Today `meEnrollHandler` writes one pending row and
  // sends nothing, so the block may not say an email is coming. The day the
  // affiliates module gains a sender, this stops objecting to the promise.
  const code = codeOf(path.join(BLOCKS_DIR, "AffiliateSignupBlock.tsx"));
  const affiliates = readAllSources(path.join(MODULES, "affiliates/src"));

  const sends = /sendEmail|sendMail|enqueueEmail|mailer|emailOutbox|notifyByEmail/.test(affiliates);
  const promises = /we['’]ll\s+(e-?mail|send)/i.test(code) || /email you/i.test(code);

  assert.ok(
    !promises || sends,
    "AffiliateSignupBlock tells the applicant an email is coming, but nothing in src/built-ins/modules/affiliates/src sends one",
  );
  // And the success state has to say what DID happen.
  assert.match(
    code, /enrolledStatus/,
    "the success state must report the enrolment status the server returned, not an assumed outcome",
  );

  // `enroll()` returns the EXISTING affiliate when a user re-submits matching
  // details, so the 201 body can carry any member of `AffiliateStatus` — not
  // just the `pending` a first-time applicant gets. Collapsing all of them
  // into "waiting for the site owner to approve it" tells a suspended or
  // removed affiliate they are in a queue that does not exist, which is the
  // same fabrication as the email nothing sent. Derived from the module's own
  // union so a NEW status cannot ship without its own sentence.
  const domain = readFileSync(path.join(MODULES, "affiliates/src/lib/domain.ts"), "utf8");
  const union = /export type AffiliateStatus\s*=\s*([^;]+);/.exec(domain);
  assert.ok(union, "could not read AffiliateStatus from src/built-ins/modules/affiliates/src/lib/domain.ts");
  const statuses = [...union[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  assert.ok(statuses.length >= 2, `expected several affiliate statuses, parsed ${JSON.stringify(statuses)}`);

  const table = /ENROLLED_COPY[^=]*=\s*\{[\s\S]*?\n\};/.exec(code);
  assert.ok(table, "AffiliateSignupBlock must map each enrolment status to its own success copy");
  for (const status of statuses) {
    assert.match(
      table[0], new RegExp(`\\b${status}\\s*:`),
      `the affiliate signup success state has no wording for the "${status}" enrolment status`,
    );
  }

  // The approval sentence belongs to exactly one status.
  const approvalClaims = [...code.matchAll(/waiting for the site owner to approve/g)];
  assert.equal(
    approvalClaims.length, 1,
    "only the pending status may describe the enrolment as waiting for approval",
  );
  const pendingEntry = table[0].split(/\bpending\s*:/)[1]?.split(/\n {2}\},/)[0] ?? "";
  assert.match(
    pendingEntry, /waiting for the site owner to approve/,
    "the approval sentence must sit on the pending status, not on every non-active one",
  );
});

test("the donation block offers no monthly option while checkout ignores it", () => {
  // `stripeCheckoutHandler` creates a one-off Session; the word `recurring`
  // does not occur anywhere in the ecommerce module. A visitor-facing monthly
  // toggle would therefore promise a repeating charge that never repeats.
  const code = codeOf(path.join(BLOCKS_DIR, "DonationButtonBlock.tsx"));
  const ecommerce = readAllSources(path.join(MODULES, "ecommerce/src"));
  const checkoutSupportsRecurring = /recurring|mode:\s*["']subscription["']/i.test(ecommerce);

  const body = code.split("JSON.stringify(")[1]?.split("});")[0] ?? "";
  assert.ok(body.length > 20, "could not find the donation checkout request body");

  if (!checkoutSupportsRecurring) {
    assert.doesNotMatch(
      body, /recurring|monthly/i,
      "the donation checkout body carries a monthly instruction the handler ignores",
    );
    assert.doesNotMatch(
      code, /type="checkbox"/,
      "a monthly donation checkbox must not be offered while checkout can only charge once",
    );
  }

  // A donation that did not start must SAY it did not start.
  //
  // `stripeCheckoutHandler` → `parseCheckoutRequest` takes a strict field
  // allowlist that does not contain a single key this block sends, so today
  // every click 4xxs. The block used to read `if (url) window.location.href = url`
  // and nothing else: no redirect, no message, the button just reset. A donor
  // cannot tell that from a mis-click, and may well believe they have given.
  // The rule holds whatever the handler does — a checkout response that
  // carries no redirect is never a completed donation.
  assert.match(
    code, /role="alert"/,
    "the donation block must show the visitor when checkout did not start, not silently reset the button",
  );
  assert.doesNotMatch(
    code, /if\s*\(\s*url\s*\)\s*window\.location\.href\s*=\s*url;?\s*\n?\s*\}\s*finally/,
    "the donation block swallows a failed checkout: the only branch on the response is the redirect",
  );
});

test("the donation block's recorded backend gap names the contract mismatch, not just the session", () => {
  // The gap entry used to read "its checkout requires a signed-in customer",
  // which says the block would work once a session existed. It would not:
  // `parseCheckoutRequest` rejects `lineItems` as an unknown field and requires
  // `version`, `operationId` and product-shaped `items`. A gap label that
  // understates the gap gets the wrong fix built. Derived from the handler's
  // own allowlist so this stops objecting the day the contract accepts the
  // block's request.
  const checkout = readFileSync(path.join(MODULES, "ecommerce/src/server/checkout.ts"), "utf8");
  const block = codeOf(path.join(BLOCKS_DIR, "DonationButtonBlock.tsx"));
  const sentKeys = [...(block.split("JSON.stringify(")[1]?.split("});")[0] ?? "").matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:/gm)].map(m => m[1]);
  assert.ok(sentKeys.length > 0, "could not read the donation checkout request body");

  const allowlist = /const allowed = new Set\(\[([\s\S]*?)\]\);/.exec(checkout);
  assert.ok(allowlist, "could not read parseCheckoutRequest's field allowlist");
  const accepted = new Set([...allowlist[1].matchAll(/"([^"]+)"/g)].map(m => m[1]));
  const rejected = sentKeys.filter(k => !accepted.has(k));

  const gaps = readFileSync(path.join(WEBSITE_EDITOR, "lib/blockBackends.ts"), "utf8");
  const entry = /"donation-button":\s*\{[\s\S]*?\n  \},/.exec(gaps);
  assert.ok(entry, "donation-button must stay listed in BLOCK_BACKEND_GAPS while its checkout call cannot succeed");
  const reason = /reason:\s*"([^"]+)"/.exec(entry[0]);
  assert.ok(reason, "the donation-button gap must carry a reason");

  if (rejected.length > 0) {
    assert.match(
      reason[1], /reject|cannot complete|contract/i,
      `the donation block sends ${JSON.stringify(rejected)}, which parseCheckoutRequest rejects outright — the recorded gap must say the request itself is refused, not only that a session is missing`,
    );
  }
});

test("a form with no destination refuses to submit", () => {
  // Blanking the template action alone would have moved the bug rather than
  // fixed it: an empty `action` posts to the CURRENT URL. The block has to
  // decline instead.
  const src = readFileSync(path.join(BLOCKS_DIR, "FormBlock.tsx"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(code, /const connected = action\.trim\(\)\.length > 0/, "FormBlock must decide whether it has a destination");
  assert.match(code, /action=\{connected \? action : undefined\}/, "an unconnected form must not post to the current URL");
  assert.match(code, /disabled=\{!connected\}/, "an unconnected form must disable its submit button");
});
