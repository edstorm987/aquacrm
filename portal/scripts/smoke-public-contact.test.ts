import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const route = readFileSync(join(ROOT, "src/app/api/public/brand-enquiry/route.ts"), "utf8");
const form = readFileSync(join(ROOT, "src/app/(website)/LaunchGateForm.tsx"), "utf8");
const websiteShell = readFileSync(join(ROOT, "src/app/(website)/WebsiteShell.tsx"), "utf8");
const starter = readFileSync(join(ROOT, "../github-templates/starters/luxury-service-site/index.html"), "utf8");

test("public website enquiries enter the real sales system", () => {
  assert.match(route, /leads\.upsert\(/);
  assert.match(route, /source:\s*`website:\$\{brand\}`/);
  assert.match(route, /"website-enquiry"/);
  assert.match(route, /brandSlugs:\s*\[brand\]/);
  assert.match(route, /preferredContactMethod/);
  assert.match(route, /enquiryMessage/);
});

test("public enquiry endpoint validates origin, fields, bots, and request volume", () => {
  assert.match(route, /configuredOrigins\(\)\.has/);
  assert.match(route, /isTradingBrandSlug\(brand\)/);
  assert.match(route, /CONTACT_METHOD_ALIASES/);
  assert.match(route, /normalizeContactMethod/);
  assert.match(route, /brand-enquiry:\$\{ip\}/);
  assert.match(route, /brand-enquiry-contact:\$\{hasEmail \? email : phone\.replace/);
  assert.match(route, /body\.website/);
});

test("website form only reports success after the API confirms the write", () => {
  assert.match(form, /fetch\("\/api\/public\/brand-enquiry"/);
  assert.match(form, /if \(!response\.ok \|\| !payload\.ok\)/);
  assert.match(form, /form\.reset\(\)/);
  assert.match(form, /Your brief is with Milesymedia/);
  assert.match(form, /role="alert"/);
});

test("generated client starter contains polished public copy", () => {
  assert.doesNotMatch(starter, /replace these|placeholder|lorem ipsum/i);
  assert.match(starter, /A selection of considered spaces, materials, and details from recent work\./);
});

test("public website shell uses a real Milesymedia contact destination", () => {
  assert.match(websiteShell, /mailto:hello@milesymedia\.co/);
  assert.doesNotMatch(websiteShell, /https:\/\/(?:www\.)?linkedin\.com\/["']/);
  assert.doesNotMatch(websiteShell, /https:\/\/(?:www\.)?instagram\.com\/["']/);
  assert.doesNotMatch(websiteShell, /https:\/\/x\.com\/["']/);
});
