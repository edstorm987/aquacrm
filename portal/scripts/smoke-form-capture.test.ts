import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  additionalFields, derivePurpose, describeForm, isCoreField,
} from "../src/lib/enquiries/formCapture.ts";

describe("working out what a form was for", () => {
  // Careers applications landing as sales enquiries is the complaint. The fix
  // is not a cleverer guess — it is preferring evidence to inference, and
  // recording which one was used.
  it("takes what the site declared over anything else", () => {
    const result = derivePurpose({
      declared: "careers", formName: "Contact us", pagePath: "/contact",
    });
    assert.equal(result.purpose, "careers");
    assert.equal(result.purposeSource, "declared");
  });

  it("takes the visitor's own answer over the form's name", () => {
    // Ed's forms often carry "I'm enquiring about…", and what somebody picked
    // is better evidence than what the page is called.
    const result = derivePurpose({
      formName: "General contact form",
      pagePath: "/contact",
      fields: [{ key: "enquiry_type", value: "Job application" }],
    });
    assert.equal(result.purpose, "careers");
    assert.equal(result.purposeSource, "field");
  });

  it("reads the label when the field key is meaningless", () => {
    const result = derivePurpose({
      fields: [{ key: "field_7", label: "What is your enquiry about?", value: "Technical support" }],
    });
    assert.equal(result.purpose, "support");
  });

  it("falls back to the form name and page", () => {
    assert.equal(derivePurpose({ formName: "Careers application" }).purpose, "careers");
    assert.equal(derivePurpose({ pagePath: "/jobs/apply" }).purposeSource, "inferred");
  });

  it("defaults to enquiry, and says that it guessed", () => {
    // The default must land in front of a human rather than in a queue nobody
    // watches — but it must never look like something the form said.
    const result = derivePurpose({ formName: "Form", pagePath: "/" });
    assert.equal(result.purpose, "enquiry");
    assert.equal(result.purposeSource, "default");
  });

  it("recognises the purposes that route somewhere different", () => {
    assert.equal(derivePurpose({ formName: "Get a quote" }).purpose, "quote");
    assert.equal(derivePurpose({ formName: "Book an appointment" }).purpose, "booking");
    assert.equal(derivePurpose({ formName: "Newsletter signup" }).purpose, "newsletter");
    assert.equal(derivePurpose({ formName: "Leave feedback" }).purpose, "feedback");
  });
});

describe("saying which form it was", () => {
  // "Website form · /" was true of every submission and told you nothing.
  it("names the form and the page it sat on", () => {
    assert.equal(describeForm({ formName: "Hero enquiry", pagePath: "/pricing" }), "Hero enquiry · /pricing");
  });

  it("drops the page when it is the homepage", () => {
    assert.equal(describeForm({ formName: "Hero enquiry", pagePath: "/" }), "Hero enquiry");
  });

  it("uses the page when the form has no name", () => {
    assert.equal(describeForm({ pagePath: "/careers" }), "Form on /careers");
  });

  it("still says something when it knows nothing", () => {
    assert.equal(describeForm({}), "Website form");
  });
});

describe("the answers that used to be thrown away", () => {
  it("keeps everything Aqua has no column for", () => {
    const kept = additionalFields([
      { key: "name", value: "Sarah" },
      { key: "budget", value: "£5,000" },
      { key: "heard_about", value: "Google" },
    ]);
    assert.deepEqual(kept.map(f => f.key), ["budget", "heard_about"]);
  });

  it("does not repeat what is already stored in its own right", () => {
    assert.ok(isCoreField("email"));
    assert.ok(isCoreField("contact_method"));
    assert.ok(isCoreField("contactMethod"));
    assert.ok(!isCoreField("company_size"));
  });

  it("drops blanks — an unanswered question is not an answer", () => {
    const kept = additionalFields([{ key: "budget", value: "   " }, { key: "size", value: "10" }]);
    assert.deepEqual(kept.map(f => f.key), ["size"]);
  });
});

describe("a capture attaches to the enquiry rather than duplicating it", () => {
  it("matches within a window rather than relying on which arrived first", () => {
    // The tag fires on submit and the site's own POST resolves whenever it
    // resolves, so order cannot be assumed. A second enquiry per submission
    // would double every count in the inbox.
    const route = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "app", "api", "public", "form-capture", "route.ts"), "utf-8");
    assert.match(route, /MATCH_WINDOW_MS/);
    assert.match(route, /attached: true/);
  });

  it("holds a capture it cannot match rather than dropping it", () => {
    const route = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "app", "api", "public", "form-capture", "route.ts"), "utf-8");
    assert.match(route, /captureOnly: true/);
  });

  it("records no contact method when the form never asked", () => {
    // The old route required one, which forced websites to invent an answer
    // and put a preference in the inbox the person never expressed.
    const route = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "app", "api", "public", "form-capture", "route.ts"), "utf-8");
    assert.match(route, /contact_method: null/);
  });

  it("says so in the inbox instead of showing a blank", () => {
    // The per-enquiry detail card is where the full submission is rendered.
    const ui = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "app", "portal", "agency", "inbox", "_EnquiryDetailCard.tsx"), "utf-8");
    assert.match(ui, /This form did not ask/);
  });
});

// ---- a company's OWN website must be able to submit --------------------------
//
// The origin allowlist is five hardcoded sites plus one env var, so it can only
// ever describe Ed's own properties. A company that registered its site IN THE
// APP was refused at the CORS layer before its site key was read — and the tag
// swallows the 403 (`.catch(() => {})`) while "prove it's live" only checks the
// script is present. So a registered site showed green, recorded telemetry, and
// dropped every enquiry silently. Found by the 2026-08-20 consistency sweep.

describe("a company's own website can submit", () => {
  it("does not refuse a preflight it cannot yet judge", async () => {
    const { OPTIONS } = await import("../src/app/api/public/form-capture/route");
    const { NextRequest } = await import("next/server");
    const res = OPTIONS(new NextRequest("https://portal.test/api/public/form-capture", {
      method: "OPTIONS",
      headers: { origin: "https://cedar-dental.com" },
    }));
    assert.equal(res.status, 204, "a preflight carries no site key, so it cannot authorise or refuse");
    assert.equal(res.headers.get("access-control-allow-origin"), "https://cedar-dental.com");
});

  it("still binds a hardcoded public site to its registered origins", async () => {
    const { POST } = await import("../src/app/api/public/form-capture/route");
    const { NextRequest } = await import("next/server");
    // Posting under Milesymedia's key from somebody else's domain must still fail,
    // or one site could file its enquiries under another's brand.
    const res = await POST(new NextRequest("https://portal.test/api/public/form-capture", {
      method: "POST",
      headers: { origin: "https://not-milesymedia.example", "content-type": "application/json" },
      body: JSON.stringify({
        siteKey: "aqua_public_milesymedia_v1",
        fields: [{ key: "email", value: "a@b.test" }],
      }),
    }));
    assert.equal(res.status, 403, "an unregistered origin must not post under a hardcoded site key");
});

  it("still refuses an unknown site key from an unknown origin", async () => {
    const { POST } = await import("../src/app/api/public/form-capture/route");
    const { NextRequest } = await import("next/server");
    const res = await POST(new NextRequest("https://portal.test/api/public/form-capture", {
      method: "POST",
      headers: { origin: "https://cedar-dental.com", "content-type": "application/json" },
      body: JSON.stringify({
        siteKey: "aqua_master_not_a_real_key",
        fields: [{ key: "email", value: "a@b.test" }],
      }),
    }));
    assert.equal(res.status, 403, "opening the origin gate must not open the endpoint");
});
});
