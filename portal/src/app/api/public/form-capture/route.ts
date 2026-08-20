import { NextResponse, type NextRequest } from "next/server";

import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { PUBLIC_AQUA_SITES, publicAquaSiteName } from "@/lib/public/publicSites";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingAgencyIdColumn } from "@/lib/supabase/enquiryAgencyColumn";
import { resolveAgencyByMasterSiteKey, resolveWebsiteSourceRouting } from "@/server/websiteSources";
import { upsertClientRecordLedgerEvent } from "@/lib/server/clients/clientRecordLedger";
import {
  additionalFields, derivePurpose, describeForm, type CapturedField,
} from "@/lib/enquiries/formCapture";

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
/**
 * How long after a submission the site's own POST is still the same event.
 *
 * The two requests race — the tag fires on submit, the site's fetch resolves
 * whenever it resolves — so matching cannot rely on order. Two minutes is
 * comfortably longer than any form round-trip and far shorter than somebody
 * filling the same form in twice.
 */
const MATCH_WINDOW_MS = 2 * 60 * 1_000;

function configuredOrigins(): Set<string> {
  return new Set([
    ...Object.values(PUBLIC_AQUA_SITES).flatMap(site => [...site.origins]),
    ...(process.env.PUBLIC_BRAND_ORIGINS ?? "").split(",").map(origin => origin.trim().replace(/\/$/, "")).filter(Boolean),
  ]);
}

function allowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (origin === req.nextUrl.origin) return origin;
  try {
    const parsed = new URL(origin);
    if (process.env.NODE_ENV !== "production" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) {
      return origin;
    }
  } catch { return null; }
  return configuredOrigins().has(origin.replace(/\/$/, "")) ? origin : null;
}

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
  // A preflight carries no body, so it cannot know the site key — and the site
  // key is what authorises a submission. Refusing here on the origin allowlist
  // meant a company's own registered website was blocked before the POST that
  // would have accepted it ever ran.
  //
  // Answering the preflight is not an authorisation decision: it only tells the
  // browser a POST is permitted to be attempted. The POST then requires a site
  // key that resolves to an agency, and anyone holding a site key can post from
  // anywhere with curl regardless of CORS — so the key was always the boundary,
  // never the preflight. Same shape as `api/telemetry/collect`.
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
    .filter(field => field.key && field.value)
    .slice(0, MAX_FIELDS);
}

/** The answer to a question that looks like it asked for one of these. */
function findAnswer(fields: CapturedField[], pattern: RegExp): string {
  return fields.find(field => pattern.test(field.key) || (field.label ? pattern.test(field.label) : false))?.value ?? "";
}

export async function POST(req: NextRequest) {
  const requested = req.headers.get("origin");
  let origin = allowedOrigin(req);

  // The origin check cannot be made before the site key is read.
  //
  // `configuredOrigins()` is five hardcoded sites plus one env var, so it can
  // only ever describe ED'S OWN properties. A company that registers its site
  // IN THE APP is not in it — and refusing here meant its form submissions were
  // dropped while the tag's `.catch(() => {})` swallowed the 403 and "prove
  // it's live" still showed green. Silent data loss on a customer's website.
  //
  // So the decision moves below, next to the key: the SITE KEY is the
  // credential. For one of Ed's hardcoded public sites the origin allowlist
  // still applies exactly as before (that is what stops another site posting
  // under `aqua_public_milesymedia_v1`). For an app-registered master key the
  // key authorises itself, which is the shape `api/telemetry/collect` already
  // uses. An unrecognised key still resolves to no agency and is rejected below.
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false }, { status: 400, headers: corsHeaders(origin) }); }

  const siteKey = clean(body.siteKey, 80);
  const fields = readFields(body.fields);
  if (!siteKey || !fields.length) {
    return NextResponse.json({ ok: false }, { status: 400, headers: corsHeaders(origin) });
  }

  const isHardcodedPublicSite = Boolean(
    (PUBLIC_AQUA_SITES as Record<string, unknown>)[siteKey],
  );
  if (requested && !origin) {
    if (isHardcodedPublicSite || !resolveAgencyByMasterSiteKey(siteKey)) {
      return NextResponse.json(
        { ok: false, error: "This request could not be verified." },
        { status: 403, headers: corsHeaders(null) },
      );
    }
    // An app-registered site posting from its own domain: echo the origin back
    // so the browser accepts the response it just authorised by site key.
    origin = requested;
  }

  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `form-capture:${ip}`, max: 20, windowMs: 60 * 60 * 1_000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false }, { status: 429, headers: corsHeaders(origin) });
  }

  // Keyed by site key, so the entry is a lookup rather than a search — and a
  // key nobody configured resolves to nothing rather than to the first site
  // that happens to match, which would file one site's enquiries under another.
  const site = (PUBLIC_AQUA_SITES as Record<string, { propertyId: string } | undefined>)[siteKey];
  const siteName = publicAquaSiteName(siteKey) ?? siteKey;
  const formName = clean(body.formName, 160) || undefined;
  const pagePath = clean(body.pagePath, 300) || "/";
  const { purpose, purposeSource } = derivePurpose({
    declared: clean(body.purpose, 40),
    fields,
    formName,
    pagePath,
  });

  const identity = { formName, formId: clean(body.formId, 120) || undefined, pagePath, purpose, purposeSource };
  const capture = {
    capturedAt: new Date().toISOString(),
    siteKey,
    propertyId: clean(body.propertyId, 120) || site?.propertyId || null,
    pageUrl: clean(body.pageUrl, 500) || null,
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
  const masterAgencyId = resolveAgencyByMasterSiteKey(siteKey);
  const submissionHost = (() => {
    try { return capture.pageUrl ? new URL(capture.pageUrl).host : undefined; }
    catch { return undefined; }
  })();
  const destination = masterAgencyId ? resolveWebsiteSourceRouting(masterAgencyId, submissionHost) : { kind: "inbox" as const };
  // One home per site: a client's inbox, one of Ed's own companies, or the
  // agency inbox. A company route is recorded on the enquiry but does not fire
  // the client ledger below — a company is not a client.
  const routedClientId = destination.kind === "client" ? destination.clientId : undefined;
  const routedCompanyId = destination.kind === "company" ? destination.companyId : undefined;

  try {
    const supabase = createSupabaseAdminClient();
    const since = new Date(Date.now() - MATCH_WINDOW_MS).toISOString();
    // Match on whichever contact detail the form actually collected. A form
    // that asked for neither cannot be tied to an enquiry, and is kept on its
    // own rather than guessed onto somebody else's record.
    type EnquiryRow = { id: string; metadata: Record<string, unknown> | null };
    let match: EnquiryRow | null = null;
    if (email || phone) {
      const query = supabase
        .from("brand_enquiries")
        .select("id, metadata")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      const { data } = email
        ? await query.eq("email", email)
        : await query.eq("phone", phone);
      match = (data?.[0] as EnquiryRow | undefined) ?? null;
    }

    if (match) {
      await supabase
        .from("brand_enquiries")
        .update({ metadata: { ...(match.metadata ?? {}), formCapture: capture } })
        .eq("id", match.id);
      return NextResponse.json({ ok: true, attached: true }, { headers: corsHeaders(origin) });
    }

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
        formCapture: capture,
        // A master-tag submission is a real enquiry, not a held capture waiting
        // for the site's own POST — so it is not flagged capture-only.
        ...(masterAgencyId ? { masterTag: true, agencyId: masterAgencyId } : { captureOnly: true }),
        ...(routedClientId ? { routedClientId } : {}),
        ...(routedCompanyId ? { routedCompanyId } : {}),
      },
    };
    let { data: inserted, error: insertError } = await supabase
      .from("brand_enquiries").insert(enquiryRow).select("id").single();
    if (insertError && isMissingAgencyIdColumn(insertError)) {
      // agency_id migration not applied yet (Ed runs it by hand) — a capture
      // must not be dropped while the schema catches up.
      const { agency_id: _pendingMigration, ...legacyRow } = enquiryRow;
      ({ data: inserted, error: insertError } = await supabase
        .from("brand_enquiries").insert(legacyRow).select("id").single());
    }

    // Surface it on the client the site is routed to, so it reaches them and
    // not just the agency queue.
    if (masterAgencyId && routedClientId && inserted?.id) {
      upsertClientRecordLedgerEvent(masterAgencyId, routedClientId, {
        sourceType: "enquiry",
        sourceId: `website-enquiry:${inserted.id}`,
        group: "messages",
        title: `Website enquiry from ${enquiryName}`,
        body: enquiryMessage || `Submitted via ${siteName}.`,
        occurredAt: Date.now(),
        eyebrow: `${siteName} · inbound · open`,
        visibility: "inherent",
        href: `/portal/agency/inbox?view=all&thread=${encodeURIComponent(`website:${inserted.id}`)}`,
      });
    }
    return NextResponse.json({ ok: true, attached: false }, { headers: corsHeaders(origin) });
  } catch {
    // A capture failure must never surface on the website.
    return NextResponse.json({ ok: true }, { headers: corsHeaders(origin) });
  }
}
