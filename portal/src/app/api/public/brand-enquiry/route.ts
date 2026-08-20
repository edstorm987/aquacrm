import { NextResponse, type NextRequest } from "next/server";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { isTradingBrandSlug, tradingBrandDefinition, type TradingBrandSlug } from "@/lib/brands/tradingBrands";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { FOUNDER_AGENCY_SLUG, FOUNDER_EMAIL, seedFounder } from "@/lib/server/seeds/founderSeed";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getAgencyBySlug } from "@/server/tenants";
import { getUser } from "@/server/users";
import { ensureZimanteTradingCompanies } from "@/server/zimanteTradingCompanies";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingAgencyIdColumn } from "@/lib/supabase/enquiryAgencyColumn";
import { notifyBrandEnquiry } from "@/lib/server/email/enquiryNotifications";
import { PUBLIC_AQUA_SITES, resolvePublicAquaSite } from "@/lib/public/publicSites";
import { triggerAutomations } from "@/server/automations";
import { resolveContactIdentity, upsertIdentityResolutionReview } from "@/lib/server/identityResolution";
import { upsertClientRecordLedgerEvent } from "@/lib/server/clients/clientRecordLedger";
import { resolveWebsiteSourceRouting } from "@/server/websiteSources";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\d\s.-]{7,40}$/;
const MAX_SERVICES = 12;
const CONTACT_METHOD_ALIASES: Record<string, string> = {
  "in person": "in-person",
  "in-person": "in-person",
  call: "call",
  phone: "call",
  "phone call": "call",
  text: "text",
  "text message": "text",
  email: "email",
  whatsapp: "whatsapp",
  chat: "chat",
  chatbot: "chat",
  support: "support",
  ticket: "support",
  other: "support",
};

interface BrandEnquiryBody {
  brand?: unknown;
  channel?: unknown;
  services?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  contactMethod?: unknown;
  message?: unknown;
  sourceUrl?: unknown;
  campaign?: unknown;
  consent?: unknown;
  website?: unknown;
}

type EnquiryChannel = "form" | "chatbot" | "support";

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanServices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((service) => clean(service, 80))
      .filter(Boolean)
      .slice(0, MAX_SERVICES),
  )];
}

function normalizeContactMethod(value: unknown): string {
  return CONTACT_METHOD_ALIASES[clean(value, 30).toLowerCase()] ?? "";
}

function normalizeChannel(value: unknown, contactMethod: string, services: string[]): EnquiryChannel {
  const requested = clean(value, 30).toLowerCase();
  if (requested === "chat" || requested === "chatbot") return "chatbot";
  if (requested === "support" || requested === "ticket") return "support";
  if (requested === "form" || requested === "enquiry") return "form";
  if (contactMethod === "chat" || services.some(service => /\b(chat|chatbot)\b/i.test(service))) return "chatbot";
  if (contactMethod === "support" || services.some(service => /\b(support|ticket)\b/i.test(service))) return "support";
  return "form";
}

function cleanPublicUrl(value: unknown, requestOrigin: string | null): string {
  const raw = clean(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (requestOrigin && url.origin !== requestOrigin.replace(/\/$/, "")) {
      return `${requestOrigin.replace(/\/$/, "")}/`;
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function configuredOrigins(): Set<string> {
  return new Set([
    ...Object.values(PUBLIC_AQUA_SITES).flatMap((site) => [...site.origins]),
    ...(process.env.PUBLIC_BRAND_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  ]);
}

function allowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (origin === req.nextUrl.origin) return origin;

  try {
    const parsed = new URL(origin);
    if (
      process.env.NODE_ENV !== "production"
      && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return origin;
    }
  } catch {
    return null;
  }

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

function response(
  payload: Record<string, unknown>,
  status: number,
  origin: string | null,
  retryAfter?: number,
) {
  return NextResponse.json(payload, {
    status,
    headers: {
      ...corsHeaders(origin),
      ...(retryAfter ? { "retry-after": String(retryAfter) } : {}),
    },
  });
}

export function OPTIONS(req: NextRequest) {
  const requestedOrigin = req.headers.get("origin");
  const origin = allowedOrigin(req);
  if (requestedOrigin && !origin) {
    return response({ ok: false, error: "Origin is not allowed." }, 403, null);
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// A double-submit, a retry, or the Aqua Tag racing the form must not each
// become a new enquiry. Same brand + same contact detail inside this window is
// treated as the same enquiry. The root cause (a marketing form firing several
// times) lives on the site; the fix belongs here, where every path converges.
const DEDUPE_WINDOW_MS = 2 * 60 * 1_000;

export async function POST(req: NextRequest) {
  const requestedOrigin = req.headers.get("origin");
  const origin = allowedOrigin(req);
  if (requestedOrigin && !origin) {
    return response({ ok: false, error: "This request could not be verified." }, 403, null);
  }

  let body: BrandEnquiryBody;
  try {
    body = await req.json() as BrandEnquiryBody;
  } catch {
    return response({ ok: false, error: "Please check the form and try again." }, 400, origin);
  }

  if (clean(body.website, 200)) {
    return response({ ok: true }, 200, origin);
  }

  const brand = clean(body.brand, 50);
  const services = cleanServices(body.services);
  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 40);
  const contactMethod = normalizeContactMethod(body.contactMethod);
  const channel = normalizeChannel(body.channel, contactMethod, services);
  const message = clean(body.message, 4_000);
  const sourceUrl = cleanPublicUrl(body.sourceUrl, origin);
  const campaign = clean(body.campaign, 120);
  const hasEmail = EMAIL.test(email);
  const hasPhone = PHONE.test(phone);

  if (
    !isTradingBrandSlug(brand)
    || !name
    || (!hasEmail && !hasPhone)
    || !contactMethod
    || body.consent !== true
  ) {
    return response({
      ok: false,
      error: "Please add your name, a valid email or phone number, contact preference and consent.",
    }, 400, origin);
  }

  const publicSite = resolvePublicAquaSite(brand, origin);
  if (requestedOrigin && !publicSite) {
    return response({ ok: false, error: "This website and brand combination is not allowed." }, 403, origin);
  }

  const ip = clientIpFromHeaders(req.headers);
  const ipLimit = rateLimit({ key: `brand-enquiry:${ip}`, max: 8, windowMs: 60 * 60 * 1_000 });
  if (!ipLimit.allowed) {
    return response(
      { ok: false, error: "Too many messages have been sent. Please try again later." },
      429,
      origin,
      ipLimit.retryAfterSec,
    );
  }
  const contactLimit = rateLimit({
    key: `brand-enquiry-contact:${hasEmail ? email : phone.replace(/\D/g, "")}`,
    max: 4,
    windowMs: 60 * 60 * 1_000,
  });
  if (!contactLimit.allowed) {
    return response(
      { ok: false, error: "We already have your recent messages. Please give us a little time to reply." },
      429,
      origin,
      contactLimit.retryAfterSec,
    );
  }

  try {
    await ensureHydrated();
    await seedFounder();
    ensureLeadsPipelineFoundationRegistered();

    const agency = getAgencyBySlug(FOUNDER_AGENCY_SLUG);
    const founder = getUser(FOUNDER_EMAIL);
    if (!agency || !founder) {
      return response({ ok: false, error: "Enquiries are temporarily unavailable." }, 503, origin);
    }

    const install = getInstall({ agencyId: agency.id }, "leads-pipeline");
    if (!install?.enabled) {
      return response({ ok: false, error: "Enquiries are temporarily unavailable." }, 503, origin);
    }

    const companies = ensureZimanteTradingCompanies(agency.id, founder.id);
    const company = companies[brand as TradingBrandSlug];
    const brandDefinition = tradingBrandDefinition(brand as TradingBrandSlug);
    const pagePath = sourceUrl ? new URL(sourceUrl).pathname : "/";
    // Where this site's submissions are configured to go. Absent → the agency
    // inbox, which is the old behaviour. A registered client destination makes
    // the enquiry that client's from the start, rather than piling into Ed's
    // queue and hoping identity resolution guesses right.
    const destination = (() => {
      try { return sourceUrl ? resolveWebsiteSourceRouting(agency.id, new URL(sourceUrl).host) : { kind: "inbox" as const }; }
      catch { return { kind: "inbox" as const }; }
    })();
    const routedClientId = destination.kind === "client" ? destination.clientId : undefined;
    const routedCompanyId = destination.kind === "company" ? destination.companyId : undefined;
    const capturedAt = new Date().toISOString();
    const supabase = createSupabaseAdminClient();

    // Idempotency: if an enquiry with this contact detail already landed on
    // this brand moments ago, return it rather than inserting a duplicate (and
    // creating a second lead). This is what stopped a single submission
    // becoming three.
    if (hasEmail || hasPhone) {
      const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
      const recent = supabase
        .from("brand_enquiries")
        .select("id")
        .eq("brand_slug", brand)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      const { data: existing } = hasEmail
        ? await recent.eq("email", email)
        : await recent.eq("phone", phone);
      if (existing?.[0]?.id) {
        return response({ ok: true, submissionId: existing[0].id, deduped: true }, 200, origin);
      }
    }

    // Tenant is written twice on purpose: `agency_id` is the real column RLS
    // scopes on once the agency_scope migration is applied; `metadata.agencyId`
    // is what the existing `.from` sites still route by, and what the
    // migration's backfill and trigger read for rows created before it ran.
    const enquiryRow = {
      brand_slug: brand,
      name,
      email: hasEmail ? email : null,
      phone: hasPhone ? phone : null,
      contact_method: contactMethod,
      services,
      message: message || null,
      source_url: sourceUrl || null,
      campaign: campaign || null,
      consent: true,
      agency_id: agency.id,
      metadata: {
        agencyId: agency.id,
        consentPurpose: "reply-to-enquiry",
        consentVersion: 1,
        consentCapturedAt: capturedAt,
        origin: origin || "same-origin",
        channel,
        siteKey: publicSite?.siteKey ?? null,
        propertyId: publicSite?.propertyId ?? brand,
        siteName: publicSite?.siteName ?? brandDefinition.name,
        pagePath,
        ...(routedCompanyId ? { routedCompanyId } : {}),
        inboxStatus: "open",
        enquiryClassification: "unclassified",
        notification: "pending",
      },
    };
    let { data: captured, error: captureError } = await supabase
      .from("brand_enquiries")
      .insert(enquiryRow)
      .select("id")
      .single();
    if (captureError && isMissingAgencyIdColumn(captureError)) {
      // The migration is applied by hand (Ed runs `supabase db push`), so this
      // code can be live against the old schema. A visitor's enquiry must not
      // be lost while the schema catches up — retry without the column;
      // metadata.agencyId still records the tenant for the backfill.
      const { agency_id: _pendingMigration, ...legacyRow } = enquiryRow;
      ({ data: captured, error: captureError } = await supabase
        .from("brand_enquiries")
        .insert(legacyRow)
        .select("id")
        .single());
    }
    if (captureError || !captured?.id) {
      throw new Error(`Supabase enquiry capture failed: ${captureError?.message || "no record returned"}`);
    }

    let leadId: string | undefined;
    if (hasEmail || hasPhone) {
      const { leads } = containerFor({
        agencyId: agency.id,
        storage: makePluginStorage(install.id) as never,
      });
      const result = await leads.upsert({
        email: hasEmail ? email : "",
        name,
        phone: hasPhone ? phone : undefined,
        source: `website:${brand}`,
        capturedAt: Date.parse(capturedAt),
        companyId: company.id,
        companyIds: [company.id],
        brandSlugs: [brand],
        serviceLines: services,
        tags: [
          "website-enquiry",
          `brand:${brand}`,
          `channel:${channel}`,
          `contact:${contactMethod}`,
          ...services.map((service) => `service:${service.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
        ],
        notes: message || undefined,
        customFields: {
          enquiryId: captured.id,
          preferredContactMethod: contactMethod,
          enquiryMessage: message,
          sourceUrl,
          campaign,
          consentCaptured: true,
          consentCapturedAt: capturedAt,
          publicBrand: brandDefinition.name,
          enquiryChannel: channel,
          enquiryClassification: "unclassified",
          propertyId: publicSite?.propertyId ?? brand,
          pagePath,
        },
      }, founder.id);
      leadId = result.lead.id;
    }

    const identityInput = {
      agencyId: agency.id,
      sourceType: "website-enquiry" as const,
      sourceId: captured.id,
      sourceLabel: `${brandDefinition.name} · ${name}`,
      sourceHref: `/portal/agency/inbox?view=all&thread=${encodeURIComponent(`website:${captured.id}`)}`,
      name,
      email: hasEmail ? email : undefined,
      phone: hasPhone ? phone : undefined,
      company: name,
      leadId,
    };
    const identityResolution = resolveContactIdentity(identityInput);
    upsertIdentityResolutionReview(identityInput, identityResolution);
    // The configured route wins over the identity guess: a client's own site
    // routes to them even if the visitor isn't a known contact yet. A company
    // route claims the enquiry for that company, so it is not also filed onto a
    // client via the identity guess.
    const owningClientId = routedCompanyId ? undefined : (routedClientId ?? identityResolution.clientId);
    if (owningClientId) {
      upsertClientRecordLedgerEvent(agency.id, owningClientId, {
        sourceType: "enquiry",
        sourceId: `website-enquiry:${captured.id}`,
        group: "messages",
        title: `${channel === "chatbot" ? "Chat" : channel === "support" ? "Support" : "Website"} enquiry from ${name}`,
        body: message || `Submitted via ${brandDefinition.name}.`,
        occurredAt: Date.parse(capturedAt),
        eyebrow: `${publicSite?.siteName ?? brandDefinition.name} · inbound · open`,
        visibility: "inherent",
        href: identityInput.sourceHref,
      });
    }

    logActivity({
      agencyId: agency.id,
      actorEmail: hasEmail ? email : undefined,
      category: "public-funnel",
      action: `${channel}.brand_enquiry.submitted`,
      message: `${brandDefinition.name} ${channel === "chatbot" ? "chat message" : channel === "support" ? "support request" : "enquiry"} submitted by ${name}.`,
      metadata: {
        form: "brand-enquiry",
        brand,
        companyId: company.id,
        services,
        sourceUrl,
        campaign,
        contactMethod,
        channel,
        siteKey: publicSite?.siteKey,
        propertyId: publicSite?.propertyId ?? brand,
        siteName: publicSite?.siteName ?? brandDefinition.name,
        pagePath,
        hasPhone,
        message,
        email: hasEmail ? email : undefined,
        phone: hasPhone ? phone : undefined,
        enquiryId: captured.id,
        leadCreated: Boolean(leadId),
        leadId,
        clientId: identityResolution.clientId,
        identityStatus: identityResolution.status,
      },
    });

    // Plugin leads and activity use the shared portal datastore. Persist them
    // before a serverless response can end this invocation.
    await flushPendingWrites();

    let notification = "not-configured";
    try {
      const result = await notifyBrandEnquiry({
        agencyId: agency.id,
        id: captured.id,
        brandName: brandDefinition.name,
        name,
        email: hasEmail ? email : null,
        phone: hasPhone ? phone : null,
        contactMethod,
        services,
        message: message || null,
        sourceUrl: sourceUrl || null,
        campaign: campaign || null,
      });
      notification = result.sent ? "sent" : "not-configured";
    } catch (notificationError) {
      notification = "failed";
      console.error("[brand-enquiry] notification failed", notificationError instanceof Error ? notificationError.message : "Unknown error");
    }
    await supabase
      .from("brand_enquiries")
      .update({ metadata: {
        agencyId: agency.id,
        consentPurpose: "reply-to-enquiry",
        consentVersion: 1,
        consentCapturedAt: capturedAt,
        origin: origin || "same-origin",
        channel,
        siteKey: publicSite?.siteKey ?? null,
        propertyId: publicSite?.propertyId ?? brand,
        siteName: publicSite?.siteName ?? brandDefinition.name,
        pagePath,
        inboxStatus: "open",
        enquiryClassification: "unclassified",
        notification,
        source: `website:${brand}`,
        leadId: leadId ?? null,
        leadCreated: Boolean(leadId),
        leadLinkedAt: leadId ? new Date().toISOString() : null,
        clientId: identityResolution.clientId ?? null,
        clientLinkedAt: identityResolution.clientId ? new Date(identityResolution.resolvedAt).toISOString() : null,
        identityResolution: {
          status: identityResolution.status,
          confidence: identityResolution.confidence,
          explanation: identityResolution.explanation,
          clientId: identityResolution.clientId ?? null,
          clientName: identityResolution.clientName ?? null,
          resolvedAt: new Date(identityResolution.resolvedAt).toISOString(),
        },
      } })
      .eq("id", captured.id);

    try {
      await triggerAutomations(agency.id, "website-enquiry.received", {
        enquiryId: captured.id,
        leadId: leadId ?? null,
        name,
        email: hasEmail ? email : null,
        phone: hasPhone ? phone : null,
        brand,
        brandName: brandDefinition.name,
        channel,
        service: services.join(", "),
        sourceUrl: sourceUrl || null,
        message: message || null,
        awaitingResponse: true,
      });
      await flushPendingWrites();
    } catch (automationError) {
      console.error("[brand-enquiry] automation trigger failed", automationError instanceof Error ? automationError.message : "Unknown error");
    }

    return response({ ok: true, submissionId: captured.id }, 200, origin);
  } catch (cause) {
    console.error("[brand-enquiry] failed to capture enquiry", cause);
    return response({
      ok: false,
      error: "We could not save your message. Please try again.",
    }, 500, origin);
  }
}
