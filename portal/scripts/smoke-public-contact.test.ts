import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const route = readFileSync(join(ROOT, "src/app/api/public/brand-enquiry/route.ts"), "utf8");
const legacyRoute = readFileSync(join(ROOT, "src/app/api/public/contact/route.ts"), "utf8");
const form = readFileSync(join(ROOT, "src/app/(website)/LaunchGateForm.tsx"), "utf8");
const websiteShell = readFileSync(join(ROOT, "src/app/(website)/WebsiteShell.tsx"), "utf8");
const starter = readFileSync(join(ROOT, "../github-templates/starters/luxury-service-site/index.html"), "utf8");
const inboxPage = readFileSync(join(ROOT, "src/app/portal/agency/inbox/page.tsx"), "utf8");
const inboxUi = readFileSync(join(ROOT, "src/app/portal/agency/inbox/_MasterInbox.tsx"), "utf8");
const inboxDetailCard = readFileSync(join(ROOT, "src/app/portal/agency/inbox/_EnquiryDetailCard.tsx"), "utf8");
const alerts = readFileSync(join(ROOT, "src/lib/server/inbox/operationalAlerts.ts"), "utf8");
const repairRoute = readFileSync(join(ROOT, "src/app/api/portal/website-enquiries/lead/route.ts"), "utf8");
const enquiryReader = readFileSync(join(ROOT, "src/lib/server/websiteEnquiries.ts"), "utf8");
const enquiryStatusRoute = readFileSync(join(ROOT, "src/app/api/portal/website-enquiries/status/route.ts"), "utf8");
const clientRequestRoute = readFileSync(join(ROOT, "src/app/api/tenants/client-requests/route.ts"), "utf8");
const publicSites = readFileSync(join(ROOT, "src/lib/public/publicSites.ts"), "utf8");
// The aquaoasis-web files live in a SIBLING checkout, not this repository. Read
// them only when that checkout is present, and skip their test (visibly) when it
// is not — a missing sibling must not take the eight in-repo contracts down with it.
const AQUAOASIS_ROOT = join(ROOT, "../../aquaoasis-web");
const hasAquaOasis = existsSync(join(AQUAOASIS_ROOT, "website/components/ChatBot.tsx"));
const aquaChatbot = hasAquaOasis ? readFileSync(join(AQUAOASIS_ROOT, "website/components/ChatBot.tsx"), "utf8") : "";
const aquaSupport = hasAquaOasis ? readFileSync(join(AQUAOASIS_ROOT, "website/components/SupportForm.tsx"), "utf8") : "";

test("public website enquiries are captured as unclassified intake before sales routing", () => {
  assert.match(route, /leads\.upsert\(/);
  assert.match(route, /source:\s*`website:\$\{brand\}`/);
  assert.match(route, /"website-enquiry"/);
  assert.match(route, /brandSlugs:\s*\[brand\]/);
  assert.match(route, /preferredContactMethod/);
  assert.match(route, /enquiryMessage/);
  assert.match(route, /leadId\s*=\s*result\.lead\.id/);
  assert.match(route, /enquiryClassification:\s*"unclassified"/);
  assert.match(route, /await flushPendingWrites\(\)/);
  assert.match(legacyRoute, /await flushPendingWrites\(\)/);
});

test("website enquiries appear in alerts and a first-class inbox feed", () => {
  assert.match(alerts, /lead\.tags\.includes\("website-enquiry"\)/);
  assert.match(alerts, /lead\.source\.startsWith\("website:"\)/);
  assert.match(alerts, /listWebsiteEnquiries\(\)/);
  assert.match(alerts, /website-message:\$\{enquiry\.id\}/);
  assert.match(alerts, /enquiryTitle\(enquiry/);
  assert.match(alerts, /enquiry\.channel === "support"/);
  assert.match(inboxPage, /listWebsiteEnquiries\(session\.agencyId\)/);
  assert.match(inboxUi, /label="Enquiries"/);
  assert.match(inboxUi, /label="Chatbot"/);
  assert.match(inboxUi, /label="Support"/);
  assert.match(inboxUi, /Automatic triage/);
  assert.match(inboxUi, /data-enquiry-message/);
  assert.match(inboxUi, /whitespace-pre-wrap break-words/);
  assert.match(inboxUi, /sourceLocation\(item\)/);
  assert.match(inboxDetailCard, /Campaign/);
  assert.match(inboxUi, /Create lead/);
});

test("chatbot, support, and website forms preserve exact source context", () => {
  assert.match(route, /normalizeChannel/);
  assert.match(route, /siteKey: publicSite\?\.siteKey/);
  assert.match(route, /propertyId: publicSite\?\.propertyId/);
  assert.match(route, /siteName: publicSite\?\.siteName/);
  assert.match(route, /pagePath/);
  assert.match(route, /website and brand combination is not allowed/);
  assert.match(publicSites, /resolvePublicAquaSite/);
  assert.match(enquiryReader, /inferChannel/);
  assert.match(enquiryReader, /triageWebsiteEnquiry/);
  assert.match(enquiryReader, /Outage or security/);
});

test("aquaoasis chatbot and support forms declare their channel", { skip: hasAquaOasis ? false : "aquaoasis-web sibling checkout not present" }, () => {
  assert.match(aquaChatbot, /channel: "chatbot"/);
  assert.match(aquaSupport, /channel: "support"/);
});

test("public messages and client tickets can be triaged and resolved in the inbox", () => {
  assert.match(enquiryStatusRoute, /inboxStatus: status/);
  assert.match(enquiryStatusRoute, /status === "resolved"/);
  assert.match(clientRequestRoute, /propertyId/);
  assert.match(clientRequestRoute, /siteLabel/);
  assert.match(clientRequestRoute, /triageWebsiteEnquiry/);
  assert.match(inboxUi, /Mark reviewed/);
  assert.match(inboxUi, /Resolve/);
  assert.match(inboxUi, /Close ticket/);
});

test("historical website enquiries can be safely linked to sales", () => {
  assert.match(repairRoute, /requireRole/);
  assert.match(repairRoute, /leads\.upsert\(/);
  assert.match(repairRoute, /await flushPendingWrites\(\)/);
  assert.match(repairRoute, /leadLinkedAt/);
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
