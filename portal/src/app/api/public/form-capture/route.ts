import { createHmac } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { clientIpFromHeaders, rateLimitBatch, refundRateLimitBatch } from "@/lib/server/rateLimit";
import { PUBLIC_AQUA_SITES, publicAquaPropertyId, publicAquaSiteName } from "@/lib/public/publicSites";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveWebsiteSourceRouting } from "@/server/websiteSources";
import { getAgencyBySlug } from "@/server/tenants";
import { FOUNDER_AGENCY_SLUG } from "@/lib/server/seeds/founderSeed";
import { upsertClientRecordLedgerEvent } from "@/lib/server/clients/clientRecordLedger";
import { withEnquirySubmissionOperation } from "@/lib/server/enquirySubmissionOperation";
import {
  additionalFields, derivePurpose, describeForm, isSafeCapturedFieldKey, type CapturedField,
} from "@/lib/enquiries/formCapture";
import { normaliseAquaSubmissionId } from "@/lib/enquiries/submissionIdentity";
import {
  AquaTagCaptureCompletionError,
  aquaTagTenantScope,
  claimAquaTagCapture,
  completeAquaTagCapture,
  releaseAquaTagCapture,
} from "@/lib/supabase/enquirySubmissionClaims";
import {
  aquaTagCaptureDigest,
  resolveAquaTagAdmissionScope,
  verifyAquaTagFormAdmission,
  type AquaTagFormFacts,
} from "@/lib/server/security/aquaTagFormAdmission";
import { ensureHydrated } from "@/server/storage";

/**
 * What a website form actually contained, sent by the Aqua Tag.
 *
 * Separate from `/api/public/brand-enquiry` on purpose. That route is the
 * website's own submission — a fixed dozen keys, everything else discarded.
 * This one carries the submission as it stood: which form, on which page, what
 * it was for, and every answer given.
 *
 * It enriches rather than duplicates. A site that posts its own enquiry keeps
 * doing so; this attaches the detail to that record. Creating a second
 * enquiry for one submission would double every count in the inbox, which is
 * worse than the thin data it replaces.
 */

const MAX_FIELDS = 60;

function corsHeaders(origin: string | null): HeadersInit {
  return {
    ...(origin ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export function OPTIONS(req: NextRequest) {
  // A preflight carries no body, so it cannot present the signed admission.
  // Refusing here on the first-party origin allowlist meant a company's own
  // registered website was blocked before the POST could resolve its host.
  //
  // Answering the preflight is not an authorisation decision: it only tells the
  // browser a POST is permitted to be attempted. The POST requires an exact
  // tenant/site/host/form/action admission minted moments earlier; CORS and the
  // browser-public site key are not mutation authority.
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function readFields(value: unknown): CapturedField[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(entry => {
      const field = entry as Record<string, unknown> | null;
      return {
        key: clean(field?.key, 120),
        label: clean(field?.label, 120) || undefined,
        value: clean(field?.value, 2_000),
        type: clean(field?.type, 30) || undefined,
      };
    })
    .filter(field => isSafeCapturedFieldKey(field.key) && field.value)
    .slice(0, MAX_FIELDS);
}

/** The answer to a question that looks like it asked for one of these. */
function findAnswer(fields: CapturedField[], pattern: RegExp): string {
  return fields.find(field => pattern.test(field.key) || (field.label ? pattern.test(field.label) : false))?.value ?? "";
}

/**
 * A hardcoded public site (Ed's own brands) posts its brand form to the founder
 * agency, so its tag captures must share that identity scope or the two halves
 * of one submission would never meet.
 */
function founderAgencyId(): string {
  return getAgencyBySlug(FOUNDER_AGENCY_SLUG)?.id ?? FOUNDER_AGENCY_SLUG;
}

export async function POST(req: NextRequest) {
  const requested = req.headers.get("origin");
  let origin: string | null = null;

  // The origin check cannot be made before the browser-public site key is read.
  //
  // `configuredOrigins()` is five hardcoded sites plus one env var, so it can
  // only ever describe ED'S OWN properties. A company that registers its site
  // IN THE APP is not in it — and refusing here meant its form submissions were
  // dropped while the tag's `.catch(() => {})` swallowed the 403 and "prove
  // it's live" still showed green. Silent data loss on a customer's website.
  //
  // So the decision moves below, where site key + Origin resolve a registered
  // scope and the short-lived signed admission proves the exact capture facts.
  // An unrecognised key/host or a token minted for different facts is rejected
  // before any quota or mutation.
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false }, { status: 400, headers: corsHeaders(origin) }); }

  const allowedBodyKeys = new Set([
    "admission", "siteKey", "propertyId", "formName", "formId", "purpose",
    "pageUrl", "pagePath", "submittedAt", "submissionId", "fields",
  ]);
  if (Object.keys(body).some(key => !allowedBodyKeys.has(key))) {
    return NextResponse.json({ ok: false }, { status: 400, headers: corsHeaders(origin) });
  }

  const siteKey = clean(body.siteKey, 80);
  const fields = readFields(body.fields);
  const suppliedSubmissionId = clean(body.submissionId, 120);
  const submissionId = normaliseAquaSubmissionId(suppliedSubmissionId);
  if (!siteKey) {
    return NextResponse.json({ ok: false }, { status: 400, headers: corsHeaders(origin) });
  }

  // The hardcoded entry supplies first-party metadata only; scope and mutation
  // authority come from the verified admission below.
  const site = (PUBLIC_AQUA_SITES as Record<string, { propertyId: string } | undefined>)[siteKey];
  const siteName = publicAquaSiteName(siteKey) ?? siteKey;
  const formName = clean(body.formName, 160) || undefined;
  const pagePath = clean(body.pagePath, 300) || "/";
  const formId = clean(body.formId, 120) || undefined;
  const declaredPurpose = clean(body.purpose, 40) || undefined;
  const pageUrl = clean(body.pageUrl, 500) || undefined;
  await ensureHydrated({ fresh: true });
  const admissionScope = resolveAquaTagAdmissionScope(siteKey, requested);
  if (!admissionScope) {
    return NextResponse.json(
      { ok: false, error: "This form capture could not be verified." },
      { status: 403, headers: corsHeaders(null) },
    );
  }
  const requestedPropertyId = clean(body.propertyId, 120);
  const propertyId = (
    publicAquaPropertyId(siteKey, requestedPropertyId)
    ?? admissionScope.propertyId
    ?? requestedPropertyId
  ) || undefined;
  if (!fields.length || !submissionId) {
    return NextResponse.json(
      { ok: false, error: suppliedSubmissionId ? "The submission reference is invalid." : undefined },
      { status: 400, headers: corsHeaders(requested) },
    );
  }
  const admissionFacts: AquaTagFormFacts = {
    submissionId,
    ...(formName ? { formName } : {}),
    ...(formId ? { formId } : {}),
    ...(declaredPurpose ? { purpose: declaredPurpose } : {}),
    ...(pageUrl ? { pageUrl } : {}),
    pagePath,
    ...(propertyId ? { propertyId } : {}),
    fields,
  };
  const admission = verifyAquaTagFormAdmission({
    token: body.admission,
    scope: admissionScope,
    facts: admissionFacts,
  });
  if (!admission.ok) {
    return NextResponse.json(
      { ok: false, error: "This form capture could not be verified." },
      { status: 403, headers: corsHeaders(null) },
    );
  }
  origin = requested;

  const { purpose, purposeSource } = derivePurpose({
    declared: declaredPurpose,
    fields,
    formName,
    pagePath,
  });

  const identity = { formName, formId, pagePath, purpose, purposeSource };
  const capture = {
    capturedAt: new Date().toISOString(),
    submissionId: submissionId || null,
    siteKey,
    propertyId: propertyId || site?.propertyId || null,
    pageUrl: pageUrl || null,
    form: identity,
    formLabel: describeForm(identity),
    // Every answer, as asked. This is the part that used to be thrown away.
    fields,
    additional: additionalFields(fields),
  };

  const email = findAnswer(fields, /e-?mail/i).toLowerCase();
  const phone = findAnswer(fields, /phone|mobile|tel/i);
  const enquiryName = findAnswer(fields, /^(name|full[_-]?name|your[_-]?name)$/i) || "Unknown";
  const enquiryMessage = findAnswer(fields, /message|comment|details|tell us/i) || null;

  // A master-tag submission (Ed's own site) belongs to that agency's inbox.
  // If the submitting host is registered to a client, it routes to them
  // instead — the master key is the default, not a bypass.
  const isHardcodedPublicSite = Boolean(
    (PUBLIC_AQUA_SITES as Record<string, unknown>)[siteKey],
  );
  // Hardcoded first-party captures retain their existing capture-only/brand
  // reconciliation semantics. Registered master tags use the signed tenant.
  const masterAgencyId = isHardcodedPublicSite ? undefined : admission.claims.agencyId;
  const submissionHost = (() => {
    try { return capture.pageUrl ? new URL(capture.pageUrl).host : undefined; }
    catch { return undefined; }
  })();
  const destination = masterAgencyId ? resolveWebsiteSourceRouting(masterAgencyId, submissionHost) : { kind: "inbox" as const };
  // One home per site: a client's inbox, one of Ed's own companies, or the
  // agency inbox. A company route is recorded on the enquiry but does not fire
  // the client ledger below — a company is not a client.
  const routedClientId = admission.claims.clientId
    ?? (destination.kind === "client" ? destination.clientId : undefined);
  const routedCompanyId = destination.kind === "company" ? destination.companyId : undefined;

  // Nothing to attach to yet. Held rather than dropped: the site may post
  // its enquiry a moment later, and a submission Aqua saw but cannot show
  // is the exact failure this work exists to remove.
  const enquiryRow = {
    brand_slug: site?.propertyId ?? siteKey,
    name: enquiryName,
    email: email || null,
    phone: phone || null,
    // Not asked is not the same as not answered. The old route required a
    // contact method and forced websites to invent one.
    contact_method: null,
    services: [],
    message: enquiryMessage,
    source_url: capture.pageUrl,
    consent: false,
    // The tenant column RLS scopes on (a master-tag submission belongs to
    // that agency; a capture-only hold has no owner yet and the trigger in
    // the agency_scope migration defaults it). metadata.agencyId below stays
    // as the routing key the rest of the code reads.
    agency_id: masterAgencyId ?? null,
    metadata: {
      inboxStatus: "open",
      enquiryClassification: "unclassified",
      notification: "pending",
      channel: purpose === "support" ? "support" : "form",
      pagePath,
      siteKey,
      siteName: siteName,
      propertyId: capture.propertyId,
      ...(submissionId ? { submissionId } : {}),
      formCapture: capture,
      // A master-tag submission is a real enquiry, not a held capture waiting
      // for the site's own POST — so it is not flagged capture-only.
      ...(masterAgencyId ? { masterTag: true, agencyId: masterAgencyId } : { captureOnly: true }),
      ...(routedClientId ? { routedClientId } : {}),
      ...(routedCompanyId ? { routedCompanyId } : {}),
    },
  };

  const surfaceOnRoutedClient = (enquiryId: string) => {
    // Surface it on the client the site is routed to, so it reaches them and
    // not just the agency queue.
    if (masterAgencyId && routedClientId) {
      upsertClientRecordLedgerEvent(masterAgencyId, routedClientId, {
        sourceType: "enquiry",
        sourceId: `website-enquiry:${enquiryId}`,
        group: "messages",
        title: `Website enquiry from ${enquiryName}`,
        body: enquiryMessage || `Submitted via ${siteName}.`,
        occurredAt: Date.now(),
        eyebrow: `${siteName} · inbound · open`,
        visibility: "inherent",
        href: `/portal/agency/inbox?view=all&thread=${encodeURIComponent(`website:${enquiryId}`)}`,
      });
    }
  };

  return withEnquirySubmissionOperation(submissionId, async () => {
    try {
    const supabase = createSupabaseAdminClient();
    const tenantScope = aquaTagTenantScope(
      masterAgencyId ?? (isHardcodedPublicSite ? founderAgencyId() : undefined),
      siteKey,
    );
    const captureDigest = aquaTagCaptureDigest(admissionFacts);
    let claim = await claimAquaTagCapture(supabase, {
      tenantScope,
      submissionId,
      siteKey,
      captureDigest,
    });
    // A simultaneous exact retry waits briefly for the winning transaction's
    // receipt. It never spends quotas while another owner holds the claim.
    for (let attempt = 0; claim.kind === "pending" && attempt < 20; attempt += 1) {
      const retryAfterMs = claim.retryAfterMs;
      await new Promise(resolve => setTimeout(resolve, Math.min(retryAfterMs, 50)));
      claim = await claimAquaTagCapture(supabase, {
        tenantScope,
        submissionId,
        siteKey,
        captureDigest,
      });
    }
    if (claim.kind === "conflict") {
      return NextResponse.json({ ok: false, error: claim.message }, { status: 409, headers: corsHeaders(origin) });
    }
    if (claim.kind === "unavailable") {
      // Deliberately no legacy write fallback: deploying code before the
      // additive claim migration produces a visible retryable outage, not a
      // silently weaker public mutation boundary.
      return NextResponse.json(
        { ok: false, error: "The form capture safety boundary is not ready yet." },
        { status: 503, headers: { ...corsHeaders(origin), "retry-after": "5" } },
      );
    }
    if (claim.kind === "replay") {
      return NextResponse.json(claim.receipt, { headers: corsHeaders(origin) });
    }
    if (claim.kind === "pending") {
      return NextResponse.json(
        { ok: false, error: "This form capture is still being saved. Please retry." },
        { status: 409, headers: { ...corsHeaders(origin), "retry-after": "1" } },
      );
    }

    // The database has classified this as the one NEW transition. Only now do
    // victim-derived and tenant/install budgets move. These counters remain
    // process-local until ABUSE-BASE-001 supplies a shared durable primitive.
    const ip = clientIpFromHeaders(req.headers);
    const rawAddress = findAnswer(fields, /e-?mail|phone|mobile|tel/i).trim().toLowerCase();
    const address = rawAddress.includes("@") ? rawAddress : rawAddress.replace(/\D/g, "");
    const digestSecret = (process.env.AQUA_TAG_ADMISSION_SECRET ?? process.env.PORTAL_SESSION_SECRET ?? "").trim();
    const addressDigest = createHmac("sha256", `aqua-tag-address:v1\u0000${digestSecret}`)
      .update(address || "none")
      .digest("hex");
    const budget = rateLimitBatch([
      { key: `form-capture-ip:${ip}`, max: 20, windowMs: 60 * 60 * 1_000 },
      { key: `form-capture-address:${admission.claims.agencyId}:${addressDigest}`, max: 6, windowMs: 60 * 60 * 1_000 },
      { key: `form-capture-install:${admission.claims.agencyId}:${admission.claims.siteId}`, max: 240, windowMs: 60 * 60 * 1_000 },
      { key: `form-capture-tenant:${admission.claims.agencyId}`, max: 600, windowMs: 60 * 60 * 1_000 },
    ]);
    if (!budget.allowed) {
      await releaseAquaTagCapture(supabase, { tenantScope, submissionId, claimToken: claim.claimToken });
      return NextResponse.json(
        { ok: false },
        { status: 429, headers: { ...corsHeaders(origin), "retry-after": String(budget.retryAfterSec) } },
      );
    }

    let completed;
    try {
      completed = await completeAquaTagCapture(supabase, {
        tenantScope,
        submissionId,
        siteKey,
        arrival: "tag",
        claimToken: claim.claimToken,
        facts: { captureDigest, pagePath },
        capture,
        enquiryRow,
      });
    } catch (cause) {
      // Only a PostgreSQL error response proves the completion transaction
      // rolled back. A dropped transport or malformed success body is
      // ambiguous; refunding then could undercharge a mutation that committed.
      if (cause instanceof AquaTagCaptureCompletionError && cause.rollbackConfirmed) {
        refundRateLimitBatch(budget.charges);
        await releaseAquaTagCapture(supabase, { tenantScope, submissionId, claimToken: claim.claimToken }).catch(() => undefined);
      }
      throw cause;
    }
    // The database transaction and its receipt are already committed here.
    // A derived in-app projection must never refund admission quotas or make
    // the public caller repeat the mutation if that projection has a bug.
    if (completed.ingestion.created) {
      try { surfaceOnRoutedClient(completed.ingestion.enquiryId); }
      catch (cause) { console.error("[form-capture] failed to surface routed capture", cause); }
    }
    return NextResponse.json(completed.receipt, { headers: corsHeaders(origin) });

    } catch (cause) {
      // The tag keeps this response away from the host form, but it needs a
      // truthful retryable failure so the tag can safely retry the same id.
      console.error("[form-capture] failed to persist capture", cause);
      return NextResponse.json(
        { ok: false, error: "The form capture could not be saved yet. Please retry." },
        { status: 503, headers: { ...corsHeaders(origin), "retry-after": "2" } },
      );
    }
  });
}
