// The public AquaCRM demo gate — Stage 1: the flag, the consent, the realm.
//
// WHAT THIS PINS, and why each half would have been easy to get wrong:
//
//   1. THE FLAG IS OFF BY DEFAULT AND ACTUALLY REFUSES. A flag that only
//      changes a banner is not a flag. `/for-agencies`, `/terms`, `/demo-privacy`
//      and `POST /api/public/demo-interest` are each driven with the flag off
//      and must refuse — the pages by `notFound()`, the route with 404 — and
//      must record nothing.
//   2. NOTHING DEMO EVER LANDS IN THE LIVE REALM. This is the demo plan's one
//      hard rule (`docs/development/CLOUD-RESUME.md`). A signup recorded with
//      the flag on must be readable in the `website-demo` realm and absent from
//      the live one. A store that "worked" by writing to live would pass every
//      other assertion here.
//   3. THE CONSENT RECORD IS HONEST. It names the terms version the person saw
//      AND records that the wording is a placeholder, because it is — Ed's
//      solicitor has not supplied the real text (ED-QUESTIONS Q5). A record
//      claiming consent to finished terms would be a false claim about a
//      lawful basis.
//   4. NO RETENTION PROMISE IS PUBLISHED. Q4 is explicit: no "we delete after
//      X" wording until the period is chosen and the reaper is live. Neither
//      is true, so the terms and privacy shells must not state a period.
//   5. THE RECORDS ARE ERASABLE BY CONTACT. Demo signups have no agency, so
//      the per-agency governance surface cannot see them by itself. If they
//      were not findable and erasable by contact detail, personal data would
//      survive an erasure that claimed to be complete.
//
// Every test here FAILS against the pre-change tree: none of these modules,
// routes or pages existed.

process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

// `next/link` reaches for `React.createContext`, which the react-server build
// does not export. Same shim as smoke-app-route-tenancy: it runs before the
// dynamic page imports below, which is all these tests need — they assert the
// page REFUSES, so nothing is ever rendered.
import * as React from "react";
type ReactShim = { createContext?: unknown; Component?: unknown; default?: ReactShim };
const stubContext = () => ({ Provider: null, Consumer: null, _currentValue: undefined });
class StubComponent { props: unknown; state: unknown; setState() {} render(): unknown { return null; } }
function shimReact(target: ReactShim | undefined) {
  if (!target) return;
  target.createContext ??= stubContext;
  target.Component ??= StubComponent;
  shimReact(target.default);
}
shimReact(React as unknown as ReactShim);

import { POST } from "../src/app/api/public/demo-interest/route";
import {
  WEBSITE_DEMO_REALM_ID,
  WEBSITE_DEMO_TERMS_VERSION,
  eraseWebsiteDemoSignupsForContact,
  findWebsiteDemoSignupsForContact,
  listWebsiteDemoSignups,
  recordWebsiteDemoSignup,
  websiteDemoEnabled,
} from "../src/server/websiteDemo";
import {
  LIVE_DATA_REALM_ID,
  ensureHydrated,
  getState,
  runInDataRealm,
} from "../src/server/storage";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

const FLAG = "WEBSITE_DEMO_ENABLED";

/** Every public route the demo adds, and the page file that must serve it. */
const DEMO_PAGES = [
  ["/for-agencies", "src/app/(website)/for-agencies/page.tsx"],
  ["/terms", "src/app/(website)/terms/page.tsx"],
  ["/demo-privacy", "src/app/(website)/demo-privacy/page.tsx"],
] as const;

function enableDemo() { process.env[FLAG] = "true"; }
function disableDemo() { delete process.env[FLAG]; }

/** A distinct caller per request, so the real rate limiter is not the thing
 *  under test here (its existence is swept by smoke-public-surface-rate-limits). */
let callerSeq = 0;
function post(body: unknown): Promise<Response> {
  callerSeq += 1;
  return POST(new NextRequest("http://localhost/api/public/demo-interest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `203.0.113.${callerSeq % 250}`,
    },
    body: JSON.stringify(body),
  })) as unknown as Promise<Response>;
}

async function demoRealmSignupCount(): Promise<number> {
  return runInDataRealm(WEBSITE_DEMO_REALM_ID, async () => {
    await ensureHydrated();
    return Object.keys(getState().websiteDemoSignups ?? {}).length;
  });
}

async function liveRealmSignupCount(): Promise<number> {
  return runInDataRealm(LIVE_DATA_REALM_ID, async () => {
    await ensureHydrated();
    return Object.keys(getState().websiteDemoSignups ?? {}).length;
  });
}

before(async () => {
  await ensureHydrated();
});

beforeEach(() => {
  disableDemo();
});

describe("the demo flag is off by default and refuses everything", () => {
  it("defaults to off when the environment says nothing", () => {
    assert.equal(websiteDemoEnabled(), false, "an unset flag must not open the demo");
  });

  it("only a explicit truthy value opens it", () => {
    for (const value of ["", "false", "0", "off", "no", "maybe"]) {
      process.env[FLAG] = value;
      assert.equal(websiteDemoEnabled(), false, `"${value}" must not open the demo`);
    }
    for (const value of ["1", "true", "TRUE", "on"]) {
      process.env[FLAG] = value;
      assert.equal(websiteDemoEnabled(), true, `"${value}" should open the demo`);
    }
    disableDemo();
  });

  it("the signup API answers 404 and records nothing", async () => {
    const before = await demoRealmSignupCount();
    const response = await post({
      name: "Refused While Off",
      email: "off@example.test",
      consent: true,
      termsVersion: WEBSITE_DEMO_TERMS_VERSION,
    });
    assert.equal(response.status, 404, "a closed demo must not advertise itself with a 403");
    assert.equal((await response.json()).ok, false);
    assert.equal(await demoRealmSignupCount(), before, "a refused request must store nothing");
  });

  it("the server function refuses even when called directly", async () => {
    const result = await recordWebsiteDemoSignup({
      name: "Direct Call",
      email: "direct@example.test",
      consent: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "disabled",
      "the flag must live in the server function, not only in the route");
  });

  for (const [label, relative] of DEMO_PAGES) {
    it(`${label} is not found while the flag is off`, async () => {
      const page = (await import(`../${relative}`)) as { default: () => unknown };
      assert.throws(
        () => page.default(),
        (error: unknown) => /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(
          (error as { digest?: string; message?: string }).digest
          ?? (error as Error).message,
        ),
        `${label} rendered instead of 404ing while the demo flag is off`,
      );
    });
  }
});

describe("a recorded demo request", () => {
  it("lands in the website-demo realm and never in the live one", async () => {
    enableDemo();
    const liveBefore = await liveRealmSignupCount();
    const response = await post({
      name: "Ada Agency",
      email: "Ada@Example.Test",
      note: "Show me fulfilment.",
      consent: true,
      termsVersion: WEBSITE_DEMO_TERMS_VERSION,
      sourcePath: "/for-agencies",
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { ok: boolean; recorded: boolean; consentVersion: string; nextStep: string };
    assert.equal(payload.ok, true);
    assert.equal(payload.recorded, true);
    assert.equal(payload.consentVersion, WEBSITE_DEMO_TERMS_VERSION);

    const stored = await findWebsiteDemoSignupsForContact("ada@example.test");
    assert.equal(stored.length, 1, "the signup is not readable in the demo realm");
    assert.equal(stored[0].name, "Ada Agency");
    assert.equal(stored[0].email, "ada@example.test", "the email is normalised before storage");
    assert.equal(stored[0].sourcePath, "/for-agencies");

    assert.equal(
      await liveRealmSignupCount(), liveBefore,
      "a demo signup reached the LIVE realm — the demo plan's one hard rule",
    );
  });

  it("records the consent version AND that the wording is still a placeholder", async () => {
    enableDemo();
    const result = await recordWebsiteDemoSignup({
      name: "Consent Shape",
      phone: "+44 7700 900123",
      consent: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.signup.consent.termsVersion, WEBSITE_DEMO_TERMS_VERSION);
    assert.equal(
      result.signup.consent.termsArePlaceholder, true,
      "while the terms are draft, the record must say so rather than imply real terms were agreed",
    );
    assert.ok(result.signup.consent.givenAt > 0, "consent must carry a timestamp");
  });

  it("never claims a demo workspace was opened", async () => {
    enableDemo();
    const response = await post({
      name: "No False Delivery",
      email: "nofalse@example.test",
      consent: true,
    });
    const payload = await response.json() as { nextStep?: string };
    assert.ok(payload.nextStep, "the answer must say what actually happens next");
    assert.doesNotMatch(
      payload.nextStep, /workspace|sandbox|logged in|log in now|your demo is ready/i,
      "no demo environment exists yet — the response must not imply one was created",
    );
  });
});

describe("what the gate refuses", () => {
  it("drops honeypot traffic without storing it, and without telling the bot", async () => {
    enableDemo();
    const before = await demoRealmSignupCount();
    const response = await post({
      name: "Spam Bot",
      email: "bot@example.test",
      consent: true,
      website: "http://spam.example",
    });
    assert.equal(response.status, 200, "a honeypot hit must look like success to the bot");
    assert.equal((await response.json()).ok, true);
    assert.equal(await demoRealmSignupCount(), before, "the honeypot submission was stored");
    assert.equal((await findWebsiteDemoSignupsForContact("bot@example.test")).length, 0);
  });

  it("refuses an unticked consent box", async () => {
    enableDemo();
    const before = await demoRealmSignupCount();
    const response = await post({ name: "No Consent", email: "noconsent@example.test", consent: false });
    assert.equal(response.status, 400);
    assert.equal(await demoRealmSignupCount(), before);
  });

  it("refuses a submission with no way to reply to it", async () => {
    enableDemo();
    const response = await post({ name: "No Contact", consent: true });
    assert.equal(response.status, 400);
  });

  it("refuses a stale page posting an older terms version", async () => {
    enableDemo();
    const before = await demoRealmSignupCount();
    const response = await post({
      name: "Stale Page",
      email: "stale@example.test",
      consent: true,
      termsVersion: "demo-terms-placeholder-0",
    });
    assert.equal(response.status, 409,
      "consent must name the text the person saw — a stale version cannot be silently restamped");
    assert.equal(await demoRealmSignupCount(), before);
  });
});

describe("demo signups are reachable by a data-subject request", () => {
  it("are found and erased by contact detail, and the count is the real one", async () => {
    enableDemo();
    const email = "erase-me@example.test";
    await recordWebsiteDemoSignup({ name: "Erase Me", email, consent: true });
    await recordWebsiteDemoSignup({ name: "Erase Me Again", email, consent: true });
    const keeper = await recordWebsiteDemoSignup({ name: "Keeper", email: "keeper@example.test", consent: true });
    assert.equal(keeper.ok, true);

    assert.equal((await findWebsiteDemoSignupsForContact("ERASE-ME@example.test")).length, 2,
      "lookup must not be defeated by casing");

    const { erased } = await eraseWebsiteDemoSignupsForContact(email);
    assert.equal(erased, 2, "the erasure must report what it actually deleted");
    assert.equal((await findWebsiteDemoSignupsForContact(email)).length, 0);
    assert.equal((await findWebsiteDemoSignupsForContact("keeper@example.test")).length, 1,
      "an erasure removed somebody else's record");

    assert.deepEqual(await eraseWebsiteDemoSignupsForContact(email), { erased: 0 },
      "a second erasure must not invent a deletion that did not happen");
  });

  it("finds a phone-only signup by its number regardless of formatting", async () => {
    enableDemo();
    await recordWebsiteDemoSignup({ name: "Phone Only", phone: "+44 7700 900987", consent: true });
    assert.equal((await findWebsiteDemoSignupsForContact("+447700900987")).length, 1);
    await eraseWebsiteDemoSignupsForContact("+44 (7700) 900987");
    assert.equal((await findWebsiteDemoSignupsForContact("+447700900987")).length, 0);
  });

  it("the listing is the demo realm's, not the live realm's", async () => {
    enableDemo();
    const listed = await listWebsiteDemoSignups();
    assert.ok(listed.length > 0, "the demo realm should hold the records this suite created");
    assert.equal(await liveRealmSignupCount(), 0, "the live realm must hold no demo signups at all");
  });
});

describe("every demo page is actually reachable at the path it claims", () => {
  // The bug this exists for, found in review: the demo privacy notice was
  // built at `/privacy`, which `next.config.ts` already rewrites — in
  // `beforeFiles`, evaluated AHEAD of the filesystem — to the published static
  // notice at `public/aquacrm-site/privacy/index.html`. The page could never be
  // served, so the consent line linked the visitor to a DIFFERENT document from
  // the one whose version was stamped on their record, and the flag did not
  // gate that URL at all.
  //
  // Asserting the page SOURCE says the right things proves nothing about which
  // document Next serves. This asserts the routing.
  const config = read("next.config.ts");

  /** The `source:` of every `beforeFiles` rewrite, which wins over a page. */
  function beforeFilesSources(): string[] {
    const block = config.slice(
      config.indexOf("beforeFiles:"),
      config.indexOf("afterFiles:"),
    );
    assert.ok(block.length > 0, "next.config.ts no longer has a beforeFiles rewrite block");
    return [...block.matchAll(/source:\s*"([^"]+)"/g)].map(match => match[1]);
  }

  it("no demo route is shadowed by a beforeFiles rewrite", () => {
    const shadowing = beforeFilesSources();
    for (const [route] of DEMO_PAGES) {
      for (const source of shadowing) {
        // `/assets/:path*` style prefixes shadow everything beneath them too.
        const prefix = source.replace(/\/:path\*$/, "");
        const shadowed = source === route
          || source === `${route}/`
          || (source.endsWith("/:path*") && (route === prefix || route.startsWith(`${prefix}/`)));
        assert.equal(
          shadowed, false,
          `${route} is rewritten to "${source}" before the filesystem is consulted, `
          + "so its page never renders — the flag does not gate that URL and the "
          + "consent link points at a different document.",
        );
      }
    }
  });

  it("the page file backing each demo route exists where the route says", () => {
    for (const [route, relative] of DEMO_PAGES) {
      const segment = relative.replace("src/app/(website)/", "").replace("/page.tsx", "");
      assert.equal(`/${segment}`, route, `${relative} does not serve ${route}`);
      assert.ok(read(relative).length > 0);
    }
  });

  it("the published static privacy notice is still the one at /privacy", () => {
    // The demo notice must not have quietly taken over the real one, which has
    // its own owner (`smoke-privacy-notice-truth`).
    assert.ok(
      beforeFilesSources().includes("/privacy"),
      "the static AquaCRM privacy notice lost its rewrite — check nothing replaced it",
    );
    assert.doesNotMatch(
      read("src/app/(website)/demo-privacy/page.tsx"), /aquacrm-site/,
      "the demo notice must not claim to be the published one",
    );
  });
});

describe("the published wording keeps the promises the code can keep", () => {
  const terms = () => read("src/app/(website)/terms/page.tsx");
  const privacy = () => read("src/app/(website)/demo-privacy/page.tsx");

  it("neither page publishes a retention period", () => {
    // ED-QUESTIONS Q4: no "we delete after X" until the period is chosen and
    // the reaper enforcing it is live. Neither is true today.
    const promise = /(delete[ds]?|remove[ds]?|erase[ds]?|wipe[ds]?|kept|keep|retain(?:ed)?)[^.]{0,60}\b(?:after|within|for)\b[^.]{0,20}\b(?:24|48|72)\s*(?:h|hours?)\b|\b\d+\s*(?:days?|weeks?|months?|years?)\b/i;
    for (const [label, source] of [["terms", terms()], ["privacy", privacy()]] as const) {
      assert.doesNotMatch(source, promise,
        `${label} states a retention period the reaper cannot yet enforce`);
    }
  });

  it("both pages are marked as drafts and carry the recorded version", () => {
    for (const [label, source] of [["terms", terms()], ["privacy", privacy()]] as const) {
      assert.match(source, /LegalDraftNotice/, `${label} does not show the draft notice`);
      assert.match(source, /WEBSITE_DEMO_TERMS_VERSION/,
        `${label} does not show the version that gets recorded against consent`);
    }
    assert.match(read("src/app/(website)/LegalDraftNotice.tsx"), /not yet reviewed by a solicitor/i);
  });

  it("the pricing tiers are visibly placeholders with no invented price", () => {
    const page = read("src/app/(website)/for-agencies/page.tsx");
    assert.match(page, /Placeholder tiers — no price has been set/,
      "ED-QUESTIONS Q6: the pricing page ships with placeholders, and must say so");
    assert.match(page, /Price not set/);
    assert.doesNotMatch(page, /[£$€]\s?\d/, "a made-up price reads as a real offer");
  });

  it("the demo gate links the terms it records consent against", () => {
    const form = read("src/app/(website)/DemoGateForm.tsx");
    assert.match(form, /href="\/terms"/);
    assert.match(form, /href="\/demo-privacy"/);
    assert.match(form, /termsVersion/, "the version the person saw must be posted with the consent");
    assert.match(form, /name="website"/, "the honeypot field is missing from the form");
  });

  it("the demo form is not read by the Aqua Tag into live tenant data", () => {
    // Found in review. `(website)/layout.tsx` puts `/aqua-tag.js` on every page
    // in this route group under the MILESYMEDIA agency's site key. The tag's
    // `capturableForm()` reads each field's VALUE and POSTs it to
    // `/api/public/form-capture`, the live Supabase-backed surface, with no
    // consent gate — `smoke-privacy-notice-truth` pins exactly that.
    //
    // So without `data-aqua-ignore` the visitor's name, email, phone and note
    // travel a SECOND path into live tenant data, which contradicts both the
    // demo's one hard rule and the privacy notice's "Nothing else." — and the
    // realm assertions above cannot see it, because that path never touches
    // `PortalState`.
    // Comments stripped FIRST. Prose explaining `data-aqua-ignore` satisfies a
    // naive /data-aqua-ignore/ match while the attribute itself is gone — this
    // assertion passed against a form with the attribute deleted until the
    // stripping was added.
    const form = read("src/app/(website)/DemoGateForm.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.match(
      form, /^\s*data-aqua-ignore\s*=/m,
      "the demo form must opt out of Aqua Tag field capture — its values would "
      + "otherwise be posted to the live form-capture surface",
    );

    // And the opt-out must still be honoured by the tag, ahead of the naming
    // attribute this form also carries. If that precedence ever flips, the
    // attribute above becomes decoration.
    const tag = read("src/lib/integrations/aquaTagSource.ts");
    const ignoreAt = tag.indexOf("dataset.aquaIgnore !== undefined");
    const nameAt = tag.indexOf("dataset.aquaForm !== undefined");
    assert.ok(ignoreAt > 0 && nameAt > 0, "the Aqua Tag's capture predicate changed shape — re-check this");
    assert.ok(
      ignoreAt < nameAt,
      "data-aqua-form is now checked before data-aqua-ignore, so the demo form is captured again",
    );

    // The fallback heuristic is why removing `data-aqua-form` alone would not
    // have been enough: this form has both an email and a tel input.
    assert.match(tag, /input\[type="email"\], input\[type="tel"\]/);
  });
});
