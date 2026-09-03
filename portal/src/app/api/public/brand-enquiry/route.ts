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
import { isMissingAgencyIdColumn, isMissingAgencyIdColumnRead } from "@/lib/supabase/enquiryAgencyColumn";
import { notifyBrandEnquiry } from "@/lib/server/email/enquiryNotifications";
import { PUBLIC_AQUA_SITES, resolvePublicAquaSite } from "@/lib/public/publicSites";
import { triggerAutomations } from "@/server/automations";
import { resolveContactIdentity, upsertIdentityResolutionReview } from "@/lib/server/identityResolution";
import { upsertClientRecordLedgerEvent } from "@/lib/server/clients/clientRecordLedger";
import { resolveWebsiteSourceRouting } from "@/server/websiteSources";
import { enquiryBelongsToAgency } from "@/lib/supabase/ownedEnquiry";
import {
  enquiryIngestionComplete,
  enquirySubmissionId,
  normaliseAquaSubmissionId,
} from "@/lib/enquiries/submissionIdentity";
import { withEnquirySubmissionOperation } from "@/lib/server/enquirySubmissionOperation";
import {
  aquaTagTenantScope,
  claimAquaTagSubmissionWork,
  ingestAquaTagSubmission,
  type SubmissionClaimClient,
} from "@/lib/supabase/enquirySubmissionClaims";
import {
  completionMetadataPatch,
  deliveryOwnerId,
  deliveryStateFor,
  registerBrandEnquiryDelivery,
  runBrandEnquiryEffectsInline,
  runClaimedAquaTagSubmissionWork,
  type BrandEnquiryEffectSet,
  type BrandEnquiryWork,
  type DeliveryState,
} from "@/lib/server/enquirySubmissionDelivery";

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
  submissionId?: unknown;
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

// ─── Downstream effects ───────────────────────────────────────────────────────
//
// Everything that happens after the enquiry row is durable, as one named step
// each. They are implemented here — this is where the public funnel's contract
// is read and pinned — and registered with the delivery orchestrator, which
// runs them either under a database claim with a checkpoint after each step
// (the migrated path, issues #87) or plainly in order (the process-local
// fallback). A step reads what earlier steps recorded rather than re-deriving
// it, so a replay after a crash reports what actually happened.

const brandEnquiryEffects: BrandEnquiryEffectSet = {
  lead: async ({ work, enquiryId }) => {
    const { brandSlug: brand, brandName, name, email, phone, contactMethod, services, message, sourceUrl, campaign, channel, pagePath, propertyId } = work;
    if (!email && !phone) return { leadId: null };
    const { leads } = containerFor({
      agencyId: work.agencyId,
      storage: makePluginStorage(work.installId) as never,
    });
    const result = await leads.upsert({
      email: email ?? "",
      name,
      phone: phone ?? undefined,
      source: `website:${brand}`,
      capturedAt: Date.parse(work.capturedAt),
      companyId: work.companyId,
      companyIds: [work.companyId],
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
        enquiryId,
        preferredContactMethod: contactMethod,
        enquiryMessage: message,
        sourceUrl,
        campaign,
        consentCaptured: true,
        consentCapturedAt: work.capturedAt,
        publicBrand: brandName,
        enquiryChannel: channel,
        enquiryClassification: "unclassified",
        propertyId,
        pagePath,
      },
    }, work.founderUserId);
    let leadId: string | undefined;
    leadId = result.lead.id;
    return { leadId };
  },

  identity: async ({ work, enquiryId, effects }) => {
    const leadId = typeof effects.lead?.leadId === "string" ? effects.lead.leadId : undefined;
    const identityInput = {
      agencyId: work.agencyId,
      sourceType: "website-enquiry" as const,
      sourceId: enquiryId,
      sourceLabel: `${work.brandName} · ${work.name}`,
      sourceHref: `/portal/agency/inbox?view=all&thread=${encodeURIComponent(`website:${enquiryId}`)}`,
      name: work.name,
      email: work.email ?? undefined,
      phone: work.phone ?? undefined,
      company: work.name,
      leadId,
    };
    const identityResolution = resolveContactIdentity(identityInput);
    upsertIdentityResolutionReview(identityInput, identityResolution);
    return {
      resolutionStatus: identityResolution.status,
      confidence: identityResolution.confidence,
      explanation: identityResolution.explanation,
      clientId: identityResolution.clientId ?? null,
      clientName: identityResolution.clientName ?? null,
      resolvedAt: new Date(identityResolution.resolvedAt).toISOString(),
    };
  },

  ledger: async ({ work, enquiryId, effects }) => {
    const { routedClientId, routedCompanyId, channel, name, message } = work;
    const identityResolution = {
      clientId: typeof effects.identity?.clientId === "string" ? effects.identity.clientId : undefined,
    };
    // The configured route wins over the identity guess: a client's own site
    // routes to them even if the visitor isn't a known contact yet. A company
    // route claims the enquiry for that company, so it is not also filed onto a
    // client via the identity guess.
    const owningClientId = routedCompanyId ? undefined : (routedClientId ?? identityResolution.clientId);
    if (owningClientId) {
      upsertClientRecordLedgerEvent(work.agencyId, owningClientId, {
        sourceType: "enquiry",
        sourceId: `website-enquiry:${enquiryId}`,
        group: "messages",
        title: `${channel === "chatbot" ? "Chat" : channel === "support" ? "Support" : "Website"} enquiry from ${name}`,
        body: message || `Submitted via ${work.brandName}.`,
        occurredAt: Date.parse(work.capturedAt),
        eyebrow: `${work.siteName} · inbound · open`,
        visibility: "inherent",
        href: `/portal/agency/inbox?view=all&thread=${encodeURIComponent(`website:${enquiryId}`)}`,
      });
    }
    return { clientId: owningClientId ?? null };
  },

  activity: async ({ work, enquiryId, effects }) => {
    const leadId = typeof effects.lead?.leadId === "string" ? effects.lead.leadId : undefined;
    const { brandSlug: brand, channel, name } = work;
    logActivity({
      idempotencyKey: `brand-enquiry:${enquiryId}`,
      agencyId: work.agencyId,
      actorEmail: work.email ?? undefined,
      category: "public-funnel",
      action: `${channel}.brand_enquiry.submitted`,
      message: `${work.brandName} ${channel === "chatbot" ? "chat message" : channel === "support" ? "support request" : "enquiry"} submitted by ${name}.`,
      metadata: {
        form: "brand-enquiry",
        brand,
        companyId: work.companyId,
        services: work.services,
        sourceUrl: work.sourceUrl,
        campaign: work.campaign,
        contactMethod: work.contactMethod,
        channel,
        siteKey: work.siteKey ?? undefined,
        propertyId: work.propertyId,
        siteName: work.siteName,
        pagePath: work.pagePath,
        hasPhone: Boolean(work.phone),
        message: work.message,
        email: work.email ?? undefined,
        phone: work.phone ?? undefined,
        enquiryId,
        leadCreated: Boolean(leadId),
        leadId,
        clientId: typeof effects.identity?.clientId === "string" ? effects.identity.clientId : undefined,
        identityStatus: typeof effects.identity?.resolutionStatus === "string" ? effects.identity.resolutionStatus : undefined,
      },
    });
    // Plugin leads and activity use the shared portal datastore. Persist them
    // before a serverless response can end this invocation.
    await flushPendingWrites();
    return {};
  },

  notification: async ({ work, enquiryId }) => {
    const { routedClientId } = work;
    let notification = "not-configured";
    try {
      const result = await notifyBrandEnquiry({
        agencyId: work.agencyId,
        // The CONFIGURED route only — deliberately not the owning client.
        //
        // A registered site is a decision Ed made ("this domain belongs to that
        // client"), so its alert goes out through that client's own Resend
        // connection to that client's inbox, falling back to the workspace
        // connection when they have none. The identity resolution is a guess
        // about the VISITOR, not about whose site this is — routing mail on it
        // would post one client an enquiry that arrived on somebody else's
        // unregistered site, because the submitter happened to match a contact
        // of theirs. That guess is fine for the ledger entry, which stays
        // inside the portal; it is not fine for outbound mail.
        clientId: routedClientId,
        id: enquiryId,
        brandName: work.brandName,
        name: work.name,
        email: work.email,
        phone: work.phone,
        contactMethod: work.contactMethod,
        services: work.services,
        message: work.message || null,
        sourceUrl: work.sourceUrl || null,
        campaign: work.campaign || null,
      });
      notification = result.sent ? "sent" : "not-configured";
    } catch (notificationError) {
      notification = "failed";
      console.error("[brand-enquiry] notification failed", notificationError instanceof Error ? notificationError.message : "Unknown error");
    }
    return { notification };
  },

  automation: async ({ work, enquiryId, effects }) => {
    const leadId = typeof effects.lead?.leadId === "string" ? effects.lead.leadId : null;
    let automation = "not-configured";
    try {
      const runs = await triggerAutomations(work.agencyId, "website-enquiry.received", {
        enquiryId,
        leadId,
        name: work.name,
        email: work.email,
        phone: work.phone,
        brand: work.brandSlug,
        brandName: work.brandName,
        channel: work.channel,
        service: work.services.join(", "),
        sourceUrl: work.sourceUrl || null,
        message: work.message || null,
        awaitingResponse: true,
      }, { idempotencyKey: `brand-enquiry:${enquiryId}` });
      automation = runs.length
        ? (runs.some(run => run.status === "failed") ? "failed" : "triggered")
        : "not-configured";
      await flushPendingWrites();
    } catch (automationError) {
      automation = "failed";
      console.error("[brand-enquiry] automation trigger failed", automationError instanceof Error ? automationError.message : "Unknown error");
    }
    return { automation };
  },
};

// The scheduled inbox sweep recovers claims whose owner died by importing this
// module; the client factory is the one service-role site this route already
// documents, handed over by reference rather than called again.
registerBrandEnquiryDelivery({
  effects: brandEnquiryEffects,
  adminClient: createSupabaseAdminClient as unknown as () => SubmissionClaimClient,
});

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
  const suppliedSubmissionId = clean(body.submissionId, 120);
  const submissionId = normaliseAquaSubmissionId(suppliedSubmissionId);
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
  if (suppliedSubmissionId && !submissionId) {
    return response({ ok: false, error: "The submission reference is invalid." }, 400, origin);
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

  return withEnquirySubmissionOperation(submissionId, async () => {
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

    // Tenant is written twice on purpose: `agency_id` is the real column RLS
    // scopes on once the agency_scope migration is applied; `metadata.agencyId`
    // is what the existing `.from` sites still route by, and what the
    // migration's backfill and trigger read for rows created before it ran.
    const baseMetadata: Record<string, unknown> = {
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
      ...(submissionId ? { submissionId } : {}),
      ...(routedCompanyId ? { routedCompanyId } : {}),
      inboxStatus: "open",
      enquiryClassification: "unclassified",
      notification: "pending",
      ingestionState: "processing",
    };
    const enquiryRowWith = (metadata: Record<string, unknown>) => ({
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
      metadata,
    });

    // Everything the downstream steps need, as plain data: it is persisted with
    // the submission so a replay in another process can finish the delivery.
    const work: BrandEnquiryWork = {
      agencyId: agency.id,
      founderUserId: founder.id,
      installId: install.id,
      companyId: company.id,
      brandSlug: brand,
      brandName: brandDefinition.name,
      siteKey: publicSite?.siteKey ?? null,
      siteName: publicSite?.siteName ?? brandDefinition.name,
      propertyId: publicSite?.propertyId ?? brand,
      name,
      email: hasEmail ? email : null,
      phone: hasPhone ? phone : null,
      contactMethod,
      services,
      message,
      sourceUrl,
      campaign,
      channel,
      pagePath,
      routedClientId,
      routedCompanyId,
      capturedAt,
    };

    // ── The durable boundary (issues #87) ──────────────────────────────────
    //
    // With a stable submission id the identity, the canonical row and the
    // downstream work are committed in ONE database transaction, keyed by
    // (agency, submission id). A tag-first hold row is promoted in place; a
    // replay with equal facts changes nothing; a different contact under the
    // same id is refused. The downstream work then runs under an owner/token
    // lease with a checkpoint per step, so a crash after a step and before its
    // acknowledgement is finished by the scheduled sweep without repeating
    // what cannot be repeated. The receipt says the enquiry is durable and
    // says separately whether the delivery finished — never that it succeeded
    // when it is still pending.
    if (submissionId) {
      const tenantScope = aquaTagTenantScope(agency.id, publicSite?.siteKey ?? brand);
      const ingest = await ingestAquaTagSubmission(supabase, {
        tenantScope,
        submissionId,
        siteKey: publicSite?.siteKey ?? `brand:${brand}`,
        arrival: "brand",
        facts: {
          brandSlug: brand,
          contactKey: hasEmail ? `email:${email}` : `phone:${phone.replace(/\D/g, "")}`,
        },
        brand: work as unknown as Record<string, unknown>,
        enquiryRow: enquiryRowWith(baseMetadata),
      });
      if (ingest.kind === "conflict") {
        return response({ ok: false, error: ingest.message }, 409, origin);
      }
      if (ingest.kind === "ingested") {
        const receipt = ingest.receipt;
        let delivery: DeliveryState = deliveryStateFor(receipt.workStatus);
        if (receipt.workStatus === "pending" || receipt.workStatus === "processing") {
          try {
            const claims = await claimAquaTagSubmissionWork(supabase, {
              owner: deliveryOwnerId(),
              leaseMs: 90_000,
              tenantScope,
              submissionId,
              limit: 1,
            });
            const claim = claims?.[0];
            if (claim) delivery = (await runClaimedAquaTagSubmissionWork(supabase, claim, brandEnquiryEffects)).delivery;
          } catch (deliveryError) {
            // The enquiry is already durable and the claim stays leased; the
            // inbox sweep finishes it after the lease expires.
            console.error("[brand-enquiry] downstream delivery interrupted; the claim will be recovered", deliveryError instanceof Error ? deliveryError.message : "Unknown error");
            delivery = "pending";
          }
        }
        return response({
          ok: true,
          enquiryId: receipt.enquiryId,
          submissionId,
          boundary: "database",
          delivery,
          ...(receipt.replay ? { deduped: true } : {}),
        }, 200, origin);
      }
      // `unavailable`: the migration is not applied on this database. Fall
      // through to the older path below, which says so in its receipt.
    }

    // ── Process-local fallback ─────────────────────────────────────────────
    //
    // The pre-migration path. Identity is only `metadata.submissionId` with no
    // unique constraint, the tag/host race is serialised per process, and the
    // downstream steps run inline with no checkpoints — a crash mid-way replays
    // all of them on the next retry. The receipt reports
    // `boundary: "process-local"` so this is never mistaken for the database
    // guarantee above.
    type ExistingEnquiry = {
      id: string;
      agency_id?: string | null;
      metadata: Record<string, unknown> | null;
    };
    let existingEnquiry: ExistingEnquiry | undefined;

    // Stable-id reconciliation comes first. Contact-window matching remains a
    // compatibility fallback for forms that have not picked up the new hidden
    // id yet, but it can only claim an un-keyed capture-only row. A DIFFERENT
    // stable id is always a different submission even when the contact repeats.
    if (hasEmail || hasPhone) {
      const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
      const loadRecent = (withAgencyColumn: boolean) => {
        const recent = supabase
          .from("brand_enquiries")
          .select(withAgencyColumn ? "id, agency_id, metadata" : "id, metadata")
          .eq("brand_slug", brand)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(10);
        return hasEmail ? recent.eq("email", email) : recent.eq("phone", phone);
      };
      let { data: recentRows, error: recentError } = await loadRecent(true);
      if (recentError && isMissingAgencyIdColumnRead(recentError)) {
        ({ data: recentRows, error: recentError } = await loadRecent(false));
      }
      if (recentError) throw new Error(`Could not reconcile recent enquiry: ${recentError.message}`);

      const ownedRows = ((recentRows ?? []) as unknown as ExistingEnquiry[])
        .filter(row => enquiryBelongsToAgency(row, agency.id)
          || (row.metadata?.captureOnly === true
            && !row.agency_id
            && !row.metadata?.agencyId
            && row.metadata?.siteKey === publicSite?.siteKey));
      if (submissionId) {
        existingEnquiry = ownedRows.find(row => enquirySubmissionId(row.metadata) === submissionId)
          ?? ownedRows.find(row => row.metadata?.captureOnly === true && !enquirySubmissionId(row.metadata));
      } else {
        existingEnquiry = ownedRows[0];
      }

      if (existingEnquiry && (!submissionId || enquiryIngestionComplete(existingEnquiry.metadata))) {
        return response({
          ok: true,
          enquiryId: existingEnquiry.id,
          submissionId: submissionId || existingEnquiry.id,
          boundary: "process-local",
          delivery: "complete",
          deduped: true,
        }, 200, origin);
      }
    }

    const initialMetadata: Record<string, unknown> = {
      ...(existingEnquiry?.metadata ?? {}),
      ...baseMetadata,
    };
    delete initialMetadata.captureOnly;

    const enquiryRow = enquiryRowWith(initialMetadata);
    const persistEnquiry = (row: typeof enquiryRow, existingId?: string) => existingId
      ? supabase.from("brand_enquiries").update(row).eq("id", existingId).select("id").single()
      : supabase.from("brand_enquiries").insert(row).select("id").single();
    let { data: captured, error: captureError } = await persistEnquiry(enquiryRow, existingEnquiry?.id);
    if (captureError && isMissingAgencyIdColumn(captureError)) {
      // The migration is applied by hand (Ed runs `supabase db push`), so this
      // code can be live against the old schema. A visitor's enquiry must not
      // be lost while the schema catches up — retry without the column;
      // metadata.agencyId still records the tenant for the backfill.
      const { agency_id: _pendingMigration, ...legacyRow } = enquiryRow;
      ({ data: captured, error: captureError } = await persistEnquiry(legacyRow as typeof enquiryRow, existingEnquiry?.id));
    }
    if (captureError || !captured?.id) {
      throw new Error(`Supabase enquiry capture failed: ${captureError?.message || "no record returned"}`);
    }

    const effects = await runBrandEnquiryEffectsInline(brandEnquiryEffects, { work, enquiryId: captured.id });

    // Re-read immediately before completion so a form-capture request handled
    // by another process cannot have its richer fields erased by a stale
    // whole-metadata replacement.
    const { data: latest, error: latestError } = await supabase
      .from("brand_enquiries")
      .select("metadata")
      .eq("id", captured.id)
      .maybeSingle();
    if (latestError) throw new Error(`Could not reload enquiry metadata: ${latestError.message}`);
    const latestMetadata = (latest?.metadata ?? {}) as Record<string, unknown>;
    const completedAt = new Date().toISOString();
    const { error: completionError } = await supabase
      .from("brand_enquiries")
      .update({ metadata: {
        ...latestMetadata,
        ...initialMetadata,
        ...completionMetadataPatch(work, effects, completedAt),
        deliveryState: "complete",
      } })
      .eq("id", captured.id);
    if (completionError) throw new Error(`Could not complete enquiry ingestion: ${completionError.message}`);

    return response({
      ok: true,
      enquiryId: captured.id,
      submissionId: submissionId || captured.id,
      boundary: "process-local",
      delivery: "complete",
    }, 200, origin);
  } catch (cause) {
    console.error("[brand-enquiry] failed to capture enquiry", cause);
    return response({
      ok: false,
      error: "We could not save your message. Please try again.",
    }, 503, origin, 2);
  }
  });
}
