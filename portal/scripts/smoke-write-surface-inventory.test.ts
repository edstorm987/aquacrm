// Write-side-effect surface inventory (Item 4).
//
// The global/tenant write-freeze binds mutate() (all PortalState) plus every
// surface that calls the synchronous or fresh write boundary. This inventory FAILS when:
//   (a) ANY server module (not just *UploadStorage.ts) performs an object-store
//       write/delete primitive (Supabase Storage upload/remove, or Vercel Blob
//       put/del) without calling assertWritesAllowed and without an explicit
//       allowlist entry — a new unguarded object-store mutator anywhere, or
//   (b) an assertWritesAllowed surface string is used that is not in the
//       declared registry (an unclassified surface), or
//   (c) a registered surface is declared but no longer used anywhere (stale).
//
// This is the STATIC net. The BEHAVIOURAL proof that each of the four storage
// surfaces actually refuses under a freeze lives in smoke-write-boundary.test.ts
// (all four surfaces are exercised there against a real freeze). Together they
// keep the freeze coverage from silently regressing.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(p, "utf8");

// Every write-side-effect surface class that is guarded by the freeze, with a
// one-line classification. A NEW guarded surface must be added here; a removed
// one must be deleted here. (mutate() covers all PortalState writes separately
// and carries its own SecurityLockdownError guard — it is not a string surface.)
const WRITE_SURFACE_REGISTRY: Record<string, string> = {
  "database.auth-nonce": "raw Postgres authentication nonce DDL/DML",
  "database.command-scan-result": "Command Centre continuation sidecar save",
  "database.dev-workspace-files": "durable Dev Team workspace sidecar commit",
  "database.editor-ai-reply-claim": "editor AI distributed claim/complete/release",
  "database.inbox.local-file": "Master Inbox local durable fallback",
  "database.inbox.service-role": "Master Inbox service-role PostgREST/RPC client",
  "database.lead-conversion-coordination": "lead-conversion file/database claim state",
  "database.supabase.service-role": "general Supabase service-role/admin client",
  "database.website-enquiries.service-role": "website-enquiry service-role client",
  "storage.private-upload": "private object-store ingestion (storePrivateUpload)",
  "storage.private-delete": "private object-store deletion (deletePrivateUpload)",
  "storage.public-upload": "public media ingestion (storePublicUpload)",
  "storage.public-delete": "public media deletion (deleteSupabasePublicUpload)",
  "provider.email.transactional": "central Resend/SMTP delivery boundary",
  "provider.email.resend": "lowest-level Resend delivery",
  "provider.email-plugin.delivery": "Email Sender Postmark/SMTP delivery",
  "provider.twilio.message": "Twilio message creation",
  "provider.twilio.call": "Twilio call creation",
  "provider.stripe.write": "shared Stripe HTTP non-GET request",
  "provider.stripe.agency-finance": "Agency Finance checkout/refund mutation",
  "provider.stripe.ecommerce": "Ecommerce checkout/coupon/billing-portal mutation",
  "provider.stripe.memberships": "Memberships customer/subscription/price mutation",
  "provider.stripe-connect.affiliates": "Stripe Connect account/link/transfer mutation",
  "provider.github.publish": "client repository create/update/push",
  "provider.github.editor-publish": "editor branch/commit/PR/merge mutation",
  "provider.vercel.deploy": "Vercel project/deployment mutation",
  "provider.vercel.domain": "Vercel domain attach/verify/remove",
  "provider.google-calendar.connect": "Google OAuth token persistence",
  "provider.google-calendar.sync": "Google Calendar remote/local synchronization",
  "provider.google-calendar.event-create": "Google Calendar event creation",
  "provider.meta.oauth": "Meta OAuth token exchange/persistence",
  "provider.meta.webhook-subscription": "Meta webhook subscription",
  "provider.meta.message": "Meta message delivery",
  "provider.meta.attachment": "Meta attachment delivery",
  "provider.openai.generate": "paid OpenAI generation",
  "provider.automation.webhook": "automation-controlled external webhook",
  "provider.shopify.mutation": "Shopify GraphQL mutation (query POST remains a read)",
  "identity.mfa-enrollment": "Supabase authenticator enrol/abandoned-factor cleanup",
  "database.website-enquiry.status": "direct Supabase website-enquiry status update",
  "database.website-enquiry.erase": "direct Supabase website-enquiry hard delete",
  "database.website-enquiry.reply": "direct Supabase reply-receipt update (delivery is separately guarded)",
  "maintenance.retention-sweep": "explicitly activated, tenant-scoped scheduled retention deletion",
};

/** Recursively collect .ts files under a dir. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

test("every assertWritesAllowed surface string is classified in the registry", () => {
  const used = new Set<string>();
  for (const file of walk(join(ROOT, "src"))) {
    const src = read(file);
    for (const m of src.matchAll(/assert(?:Fresh)?WritesAllowed\("([a-z0-9.-]+)"/g)) used.add(m[1]!);
    // Service-role factories pass a classified default through
    // `context.surface`; include those names in the same stale/unclassified
    // ratchet rather than pretending only direct calls are boundaries.
    for (const m of src.matchAll(/surface:\s*context\.surface\s*\?\?\s*"([a-z0-9.-]+)"/g)) used.add(m[1]!);
    if (src.includes("guardServiceRoleClient(")) {
      for (const m of src.matchAll(/\{\s*surface:\s*"([a-z0-9.-]+)"/g)) used.add(m[1]!);
    }
  }
  assert.ok(used.size >= 40, `write-surface scan unexpectedly matched only ${used.size}`);
  const unclassified = [...used].filter(s => !(s in WRITE_SURFACE_REGISTRY));
  assert.deepEqual(unclassified, [], `these write surfaces are used but not classified: ${unclassified.join(", ")}`);
  // And no registry entry is stale.
  const stale = Object.keys(WRITE_SURFACE_REGISTRY).filter(s => !used.has(s));
  assert.deepEqual(stale, [], `these registered surfaces are no longer used — remove them: ${stale.join(", ")}`);
});

// Files that legitimately contain an object-store write primitive WITHOUT an
// adjacent assertWritesAllowed, each with the reason it is bound elsewhere.
// Adding a file here is a deliberate, reviewed decision — the point of the net
// below is that a NEW unguarded object-store write path cannot appear silently.
const OBJECT_STORE_WRITE_ALLOWLIST: Record<string, string> = {
  // (currently empty — the private storage module guards its live primitives;
  // public remote storage has no provider primitive until its durable
  // publication/recall lifecycle exists)
};

// Object-store WRITE primitives, matched narrowly so generic look-alikes do not
// false-positive:
//   · Supabase Storage:  `.storage.from(<bucket>).upload(` / `.remove(`
//     (excludes DOM `classList.remove(` and any non-storage `.upload(` such as
//      an injected `transport.upload(` batch abstraction).
//   · Vercel Blob:       `put(` / `del(` — ONLY counted in a file that imports
//     `@vercel/blob` (excludes unrelated `del(`/`put(` identifiers).
const SUPABASE_STORAGE_WRITE = /\.storage\s*\.from\([^)]*\)\s*\.(?:upload|remove)\(/;
const IMPORTS_VERCEL_BLOB = /from\s+["']@vercel\/blob["']/;
const VERCEL_BLOB_WRITE = /\b(?:put|del)\(/;

function performsObjectStoreWrite(src: string): boolean {
  if (SUPABASE_STORAGE_WRITE.test(src)) return true;
  if (IMPORTS_VERCEL_BLOB.test(src) && VERCEL_BLOB_WRITE.test(src)) return true;
  return false;
}

test("every server module that performs an object-store write/delete calls the write boundary", () => {
  // The object stores are the write paths mutate() never sees. This scans the
  // WHOLE server tree (not just *UploadStorage.ts) so a new object-store write
  // path added anywhere fails the build unless it either calls the boundary or
  // is explicitly allowlisted above. Closes the "a mutator in a differently
  // named module escapes the net" gap the earlier filename-scoped check had.
  const offenders: string[] = [];
  const matchedFiles: string[] = [];
  for (const file of walk(join(ROOT, "src"))) {
    const rel = file.replace(ROOT + "/", "");
    const src = read(file);
    if (!performsObjectStoreWrite(src)) continue;
    matchedFiles.push(rel);
    if (rel in OBJECT_STORE_WRITE_ALLOWLIST) continue;
    if (!/assert(?:Fresh)?WritesAllowed\(/.test(src)) offenders.push(rel);
  }
  // Sanity: the net must actually be finding the known live object-store module, so
  // a future refactor that hides the primitives can't turn this test into a
  // silent no-op that passes because it matched nothing.
  assert.ok(
    matchedFiles.includes("src/lib/server/privateUploadStorage.ts"),
    `expected to match the live private upload-storage module, matched: ${matchedFiles.join(", ")}`,
  );
  assert.deepEqual(
    offenders,
    [],
    `these server modules perform an object-store write/delete but never call assertWritesAllowed — guard them (or allowlist with a reason): ${offenders.join(", ")}`,
  );
});

test("the registry documents at least the four storage surfaces", () => {
  for (const surface of ["storage.private-upload", "storage.private-delete", "storage.public-upload", "storage.public-delete"]) {
    assert.ok(surface in WRITE_SURFACE_REGISTRY, `${surface} must be registered`);
  }
});

test("direct website-enquiry effects hit the boundary before provider/database mutation", () => {
  const routes: Array<[string, string, string]> = [
    ["src/app/api/portal/website-enquiries/status/route.ts", "database.website-enquiry.status", ".update("],
    ["src/app/api/portal/website-enquiries/erase/route.ts", "database.website-enquiry.erase", ".delete("],
    ["src/app/api/portal/website-enquiries/reply/route.ts", "database.website-enquiry.reply", "sendTransactionalEmail("],
  ];
  for (const [path, surface, firstEffect] of routes) {
    const source = read(join(ROOT, path));
    const guardAt = source.indexOf(`assertWritesAllowed("${surface}"`);
    const effectAt = source.indexOf(firstEffect);
    assert.ok(guardAt >= 0, `${path} is missing ${surface}`);
    assert.ok(effectAt > guardAt, `${path} reaches ${firstEffect} before its write boundary`);
  }
});

// ─── Full direct-database/provider ratchet ────────────────────────────────

type EffectDisposition =
  | "guarded-in-file"
  | "guarded-service-role-client"
  | "guarded-production-adapter"
  | "guard-required-injection"
  | "portal-state-final-fence"
  | "incident-auth-escape"
  | "security-verdict-read"
  | "semantic-read-via-post"
  | "same-origin-http-client"
  | "capability-disabled"
  | "generated-client-site-write"
  | "control-plane-authority"
  | "known-unresolved";

type EffectClassification = { disposition: EffectDisposition; reason: string };

const deployableFiles = walk(join(ROOT, "src")).filter(file =>
  !/[\\/](?:__smoke__|__tests__|archive|archives|generated)[\\/]/.test(file)
  && !/\.(?:test|spec)\.ts$/.test(file),
);
const rel = (file: string) => file.replace(`${ROOT}/`, "");

const directSupabaseMutationPaths = new Set([
  "src/app/api/portal/website-enquiries/calls/recording/route.ts",
  "src/app/api/portal/website-enquiries/calls/route.ts",
  "src/app/api/portal/website-enquiries/classification/route.ts",
  "src/app/api/portal/website-enquiries/communications/route.ts",
  "src/app/api/portal/website-enquiries/erase/route.ts",
  "src/app/api/portal/website-enquiries/lead/route.ts",
  "src/app/api/portal/website-enquiries/reply/route.ts",
  "src/app/api/portal/website-enquiries/status/route.ts",
  "src/app/api/public/brand-enquiry/route.ts",
  "src/app/api/public/form-capture/route.ts",
  "src/app/api/telemetry/collect/route.ts",
  "src/lib/server/inbox/inboxStore.ts",
  "src/lib/server/websiteEnquiries.ts",
  "src/lib/supabase/admin.ts",
  "src/lib/supabase/enquirySubmissionClaims.ts",
  "src/server/clientErasure.ts",
]);

const rawDatabasePaths: Record<string, EffectClassification> = {
  "src/server/storageSupabase.ts": {
    disposition: "portal-state-final-fence",
    reason: "raw Supabase transport; callers must guard before effects and normal PortalState enters through mutate",
  },
  "src/server/storagePostgres.ts": {
    disposition: "portal-state-final-fence",
    reason: "raw Postgres transport; callers must guard before effects and normal PortalState enters through mutate",
  },
  "src/server/storage.ts": {
    disposition: "portal-state-final-fence",
    reason: "every durable flush takes a fresh authority snapshot and the Supabase trigger is the final database fence",
  },
  "src/lib/server/commandScanResults.ts": {
    disposition: "guarded-in-file",
    reason: "runtime issue path guards before remote sidecar save",
  },
  "src/engines/editor/server/editorAiReplyClaim.ts": {
    disposition: "guarded-in-file",
    reason: "each remote claim/complete/release guards before raw transport import",
  },
  "src/server/leadConversionCoordinator.ts": {
    disposition: "guarded-in-file",
    reason: "file and remote coordinator methods share one guard wrapper",
  },
  "src/server/productWorkspaceCoordinator.ts": {
    disposition: "guarded-in-file",
    reason: "claim and renewal require fresh typed admission; holder-only release remains available for cleanup",
  },
  "src/lib/server/auth/nonceStore.ts": {
    disposition: "guarded-in-file",
    reason: "every production Postgres DDL/DML method awaits the lazy durable nonce guard",
  },
};

const providerPaths: Record<string, EffectClassification> = {
  "src/built-ins/modules/client-crm/src/lib/journeyClient.ts": { disposition: "same-origin-http-client", reason: "browser client calls authenticated Aqua API; the server route owns the durable boundary" },
  "src/built-ins/modules/ecommerce/src/lib/admin/inventory.ts": { disposition: "same-origin-http-client", reason: "browser client calls Aqua inventory API; no direct provider credential/effect" },
  "src/built-ins/modules/agency-finance/src/lib/stripe.ts": { disposition: "guarded-in-file", reason: "checkout/refund guard before SDK client" },
  "src/built-ins/modules/ecommerce/src/lib/shopify.ts": { disposition: "guarded-in-file", reason: "GraphQL mutations guard; query POSTs are semantic reads" },
  "src/built-ins/modules/ecommerce/src/lib/stripe/server.ts": { disposition: "guarded-in-file", reason: "coupon/checkout/portal guard before SDK client" },
  "src/built-ins/modules/email-sender/src/server/drivers/postmark.ts": { disposition: "guarded-production-adapter", reason: "deployable registry wraps driver before status transition and provider call" },
  "src/built-ins/modules/email-sender/src/server/drivers/smtp.ts": { disposition: "guarded-production-adapter", reason: "deployable registry wraps driver before status transition and provider call" },
  "src/built-ins/modules/website-editor/src/lib/editorPages.ts": { disposition: "same-origin-http-client", reason: "media-lane browser client calls Aqua Website Editor API" },
  "src/built-ins/modules/website-editor/src/lib/funnels.ts": { disposition: "same-origin-http-client", reason: "media-lane browser client calls Aqua Website Editor API" },
  "src/built-ins/modules/website-editor/src/lib/gitOps.ts": { disposition: "same-origin-http-client", reason: "media-lane browser client calls Aqua Website Editor API" },
  "src/built-ins/modules/website-editor/src/lib/media.ts": { disposition: "same-origin-http-client", reason: "media-lane browser client calls Aqua Website Editor API" },
  "src/built-ins/modules/website-editor/src/lib/portalSettings.ts": { disposition: "same-origin-http-client", reason: "media-lane browser client calls Aqua Website Editor API" },
  "src/built-ins/modules/website-editor/src/lib/promote.ts": { disposition: "same-origin-http-client", reason: "media-lane browser client calls Aqua Website Editor API" },
  "src/built-ins/modules/website-editor/src/lib/splitTests.ts": { disposition: "same-origin-http-client", reason: "media-lane browser client calls Aqua Website Editor API" },
  "src/lib/server/clientForms/clientFormReader.ts": { disposition: "semantic-read-via-post", reason: "bounded server-to-server READ: POSTs an HMAC-signed request (read secret, timestamp, single-use nonce) to the client-owned aqua-form-read Edge Function to fetch ONE submission's allowlisted fields; mutates no customer/provider business data and never persists what it reads" },
  "src/built-ins/modules/website-editor/src/server/staticExport.ts": { disposition: "generated-client-site-write", reason: "code generator: emits a browser fetch into a downloadable static site that posts to the CLIENT-OWNED aqua-form-submit Edge Function, which owns all enforcement (allowlist/CAPTCHA/PAN/rate-limit/idempotency); the emitted call carries no Aqua/database credential, no table target and no secret, and a live endpoint is produced only for a server-approved, active, tested connection bound to that exact site — otherwise the form is inert" },
  "src/built-ins/runtime/foundation-adapters/_affiliatesStripeConnectAdapter.ts": { disposition: "guarded-in-file", reason: "Connect create/link/transfer methods guard" },
  "src/built-ins/runtime/foundation-adapters/_membershipsStripeAdapter.ts": { disposition: "guarded-in-file", reason: "all mutating StripePort methods guard; retrieve/verify remain reads" },
  "src/built-ins/runtime/foundation-adapters/emailSenderFoundation.ts": { disposition: "guarded-in-file", reason: "pre-transition and pre-network production driver fence" },
  "src/engines/editor/server/publish.ts": { disposition: "guarded-in-file", reason: "confirmed publish/PR/merge guard before GitHub mutation" },
  "src/lib/server/email/outboundCommunications.ts": { disposition: "guarded-in-file", reason: "Twilio call/message guard" },
  "src/lib/server/email/resendEmail.ts": { disposition: "guarded-in-file", reason: "Resend guard before credentials/network" },
  "src/lib/server/email/transactionalEmail.ts": { disposition: "guarded-in-file", reason: "orchestration guard plus provider-level recheck" },
  "src/lib/server/integrations/githubProjectPublisher.ts": { disposition: "guarded-in-file", reason: "GitHub create/update/push guard" },
  "src/lib/server/integrations/googleCalendar.ts": { disposition: "guarded-in-file", reason: "connect/sync/event provider mutations guard" },
  "src/lib/server/integrations/metaMessaging.ts": { disposition: "guarded-in-file", reason: "OAuth/subscription/message/attachment mutations guard" },
  "src/lib/server/integrations/openaiResponses.ts": { disposition: "guarded-in-file", reason: "generation guard before provider selection/network" },
  "src/lib/server/integrations/stripeHttp.ts": { disposition: "guarded-in-file", reason: "all non-GET Stripe requests guard" },
  "src/lib/server/integrations/vercelDomain.impl.ts": { disposition: "guard-required-injection", reason: "raw implementation refuses writes unless public wrapper injects guard" },
  "src/lib/server/integrations/vercelProjectDeployer.ts": { disposition: "guarded-in-file", reason: "deploy command guards before provider reconciliation" },
  "src/server/automations.ts": { disposition: "guarded-in-file", reason: "background webhook guards irrespective of HTTP verb" },
  "src/lib/server/integrations/googleSearchConsole.ts": { disposition: "semantic-read-via-post", reason: "OAuth token and Search Analytics query do not mutate remote resources" },
  "src/lib/server/integrations/oauthGoogle.ts": { disposition: "incident-auth-escape", reason: "login authorization-code exchange" },
  "src/lib/server/security/contentScannerAdapter.ts": { disposition: "security-verdict-read", reason: "protective scanner verdict does not mutate customer/provider state" },
  "src/lib/server/security/writeAdmission.ts": { disposition: "control-plane-authority", reason: "leaf no-store control RPC client is the authoritative admission plane and cannot recursively guard its own set/reconcile calls" },
  "src/components/chrome/pinnedTabsStore.ts": { disposition: "same-origin-http-client", reason: "browser client writes only through the Aqua chrome-layout API" },
  "src/components/editing/editorAiClient.ts": { disposition: "same-origin-http-client", reason: "browser client writes only through authenticated Aqua editor APIs" },
  "src/components/editing/librarianClient.ts": { disposition: "same-origin-http-client", reason: "browser client writes only through authenticated Aqua librarian API" },
  "src/engines/editor/elements/variantResolver.ts": { disposition: "same-origin-http-client", reason: "browser exposure/conversion signal goes through Aqua split-test API" },
  "src/lib/client/sandboxModeRequest.ts": { disposition: "same-origin-http-client", reason: "browser client invokes the signed Aqua realm-switch control route" },
  "src/lib/integrations/aquaTagSource.ts": { disposition: "same-origin-http-client", reason: "generated browser tag posts to the Aqua telemetry/form-capture endpoints" },
};

const userAuthPaths: Record<string, EffectClassification> = {
  "src/app/api/auth/login/route.ts": { disposition: "incident-auth-escape", reason: "operator authentication must remain available to inspect and lift containment" },
  "src/app/api/auth/logout/route.ts": { disposition: "incident-auth-escape", reason: "session termination remains available during containment" },
  "src/app/api/portal/mfa/verify/route.ts": { disposition: "incident-auth-escape", reason: "factor challenge can raise an authenticated operator session to required assurance" },
  "src/app/api/portal/mfa/enrol/route.ts": { disposition: "guarded-in-file", reason: "factor enrollment/cleanup is an identity mutation, not a blanket auth escape" },
};

test("both service-role client factories are centrally guarded", () => {
  const factories = deployableFiles
    .filter(file => readFileSync(file, "utf8").includes("@supabase/supabase-js"))
    .map(rel)
    .sort();
  assert.deepEqual(factories, ["src/lib/server/inbox/inboxStore.ts", "src/lib/supabase/admin.ts"]);
  for (const path of factories) assert.match(read(join(ROOT, path)), /guardServiceRoleClient\(/, `${path} must wrap its secret-key client`);
});

test("every direct Supabase query-builder/RPC mutation is classified behind that client", () => {
  const detected = deployableFiles.filter(file => {
    const source = readFileSync(file, "utf8");
    return /\.from\s*\([^)]*\)\s*\.(?:insert|upsert|update|delete)\s*\(/.test(source)
      || /\.rpc\s*\(/.test(source);
  }).map(rel).sort();
  assert.ok(detected.length >= 16, `direct Supabase mutation scan unexpectedly matched only ${detected.length}`);
  assert.deepEqual(detected.filter(path => !directSupabaseMutationPaths.has(path)), [], "unclassified direct Supabase mutation modules");
  assert.deepEqual([...directSupabaseMutationPaths].filter(path => !detected.includes(path)), [], "stale direct Supabase mutation classifications");
});

test("raw database transports and bypass callers are explicit with no known P1 gaps", () => {
  const rawCallers = deployableFiles.filter(file => {
    const source = readFileSync(file, "utf8");
    return /storage(?:Supabase|Postgres)/.test(source)
      && /(saveSidecarBlob|claimEditorAiReply|completeEditorAiReply|releaseEditorAiReply|claimLeadConversion|completeLeadConversion|failLeadConversion|claimProductWorkspaceLease|renewProductWorkspaceLease|releaseProductWorkspaceLease|loadBlobWithSidecars)/.test(source);
  }).map(rel).sort();
  assert.ok(rawCallers.length >= 5, `raw database caller scan unexpectedly matched only ${rawCallers.length}`);
  assert.deepEqual(rawCallers.filter(path => !(path in rawDatabasePaths)), [], "unclassified raw database callers");
  for (const path of Object.keys(rawDatabasePaths)) assert.doesNotThrow(() => read(join(ROOT, path)), `${path} classification is stale`);
  assert.deepEqual(
    Object.entries(rawDatabasePaths).filter(([, value]) => value.disposition === "known-unresolved").map(([path]) => path).sort(),
    [],
    "known P1 database gaps must stay empty",
  );
});

const liveControlFreshnessResiduals: Record<string, string> = {};

test("cold/stale LIVE-control residuals are closed by awaited no-store boundaries", () => {
  assert.deepEqual(Object.keys(liveControlFreshnessResiduals), []);
  for (const [path, reason] of Object.entries(liveControlFreshnessResiduals)) {
    assert.doesNotThrow(() => read(join(ROOT, path)), `${path} freshness classification is stale`);
    assert.ok(reason.length > 40, `${path} needs a concrete freshness blocker`);
  }
  for (const path of [
    "src/app/api/public/form-capture/route.ts",
    "src/app/api/public/brand-enquiry/route.ts",
    "src/app/api/telemetry/collect/route.ts",
  ]) assert.match(read(join(ROOT, path)), /assertFreshWriteAdmission\(/, `${path} needs a fresh durable admission read`);
  assert.match(read(join(ROOT, "src/lib/supabase/guardedServiceRoleClient.ts")), /createWriteAdmittedFetch[\s\S]*await assertFreshWriteAdmission/);
});

function likelyProviderMutation(source: string): boolean {
  const stripeSdkWrite = /stripe\.[\s\S]{0,80}?\.(?:create|update|cancel)\s*\(/.test(source);
  const directWriteRequest = /(?:fetch|fetchImpl|githubJson|brokeredFetch)\s*\([\s\S]{0,1800}?method:\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/.test(source);
  const smtpWrite = /\.sendMail\s*\(/.test(source);
  const gitPush = /(?:runGit|execFileSync)\s*\([\s\S]{0,300}?["']push["']/.test(source);
  return stripeSdkWrite || directWriteRequest || smtpWrite || gitPush;
}

test("every detected direct provider mutation has a reviewed disposition", () => {
  const detected = deployableFiles.filter(file => likelyProviderMutation(readFileSync(file, "utf8"))).map(rel).sort();
  assert.ok(detected.length >= 15, `provider-effect scan unexpectedly matched only ${detected.length}`);
  const classified = new Set([...Object.keys(providerPaths), ...Object.keys(rawDatabasePaths)]);
  assert.deepEqual(detected.filter(path => !classified.has(path)), [], "unclassified direct provider mutation modules");
  for (const path of Object.keys(providerPaths)) assert.doesNotThrow(() => read(join(ROOT, path)), `${path} provider classification is stale`);

  const foundation = read(join(ROOT, "src/built-ins/runtime/foundation-adapters/emailSenderFoundation.ts"));
  const delivery = read(join(ROOT, "src/built-ins/modules/email-sender/src/server/delivery.ts"));
  assert.match(foundation, /assertSendAllowed\(ctx\)[\s\S]*provider\.email-plugin\.delivery/);
  assert.ok(delivery.indexOf("driver.assertSendAllowed") < delivery.indexOf("this.emails.markSending"), "email freeze fence must precede queued -> sending");
  assert.match(read(join(ROOT, "src/lib/server/integrations/vercelDomain.impl.ts")), /vercel_domain_write_guard_required/);
  assert.match(read(join(ROOT, "src/lib/server/integrations/vercelDomain.ts")), /writeGuard:\s*\(\)\s*=>\s*assertFreshWritesAllowed/);
  assert.deepEqual(
    Object.entries(providerPaths).filter(([, value]) => value.disposition === "known-unresolved").map(([path]) => path),
    [],
    "known P1 provider gaps must stay empty",
  );
});

test("Supabase user-auth effects are exact incident escapes or guarded identity writes", () => {
  const detected = deployableFiles.filter(file => /\.auth\.(?:signInWithPassword|signOut)|\.auth\.mfa\.(?:enroll|unenroll|challenge|verify)/.test(readFileSync(file, "utf8"))).map(rel).sort();
  assert.ok(detected.length >= 4, `auth-effect scan unexpectedly matched only ${detected.length}`);
  assert.deepEqual(detected.filter(path => !(path in userAuthPaths)), [], "unclassified Supabase auth mutation modules");
  assert.match(read(join(ROOT, "src/app/api/portal/mfa/enrol/route.ts")), /assertFreshWritesAllowed\("identity\.mfa-enrollment"/);
  for (const [path, classification] of Object.entries(userAuthPaths)) {
    assert.ok(classification.reason.trim().length > 20, `${path} needs a concrete auth escape/guard reason`);
  }
});

test("guarded service-role client covers all current mutation families", () => {
  const source = read(join(ROOT, "src/lib/supabase/guardedServiceRoleClient.ts"));
  for (const marker of [
    "insert", "upsert", "update", "delete", "rpc", "upload", "move", "copy", "remove",
    "createBucket", "deleteBucket", "createUser", "updateUserById", "deleteUser", "invoke",
  ]) assert.ok(source.includes(`"${marker}"`), `service-role proxy is missing ${marker}`);
});
