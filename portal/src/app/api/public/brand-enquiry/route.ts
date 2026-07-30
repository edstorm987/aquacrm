import { NextResponse, type NextRequest } from "next/server";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { isTradingBrandSlug, tradingBrandDefinition, type TradingBrandSlug } from "@/lib/tradingBrands";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { FOUNDER_AGENCY_SLUG, FOUNDER_EMAIL, seedFounder } from "@/lib/server/founderSeed";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { logActivity } from "@/server/activity";
import { ensureHydrated } from "@/server/storage";
import { getAgencyBySlug } from "@/server/tenants";
import { getUser } from "@/server/users";
import { ensureZimanteTradingCompanies } from "@/server/zimanteTradingCompanies";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_METHODS = new Set(["in-person", "call", "text", "email", "whatsapp"]);
const MAX_SERVICES = 12;

interface BrandEnquiryBody {
  brand?: unknown;
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

function configuredOrigins(): Set<string> {
  return new Set(
    (process.env.PUBLIC_BRAND_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
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
  const contactMethod = clean(body.contactMethod, 30);
  const message = clean(body.message, 4_000);
  const sourceUrl = clean(body.sourceUrl, 500);
  const campaign = clean(body.campaign, 120);

  if (
    !isTradingBrandSlug(brand)
    || !name
    || !EMAIL.test(email)
    || !CONTACT_METHODS.has(contactMethod)
    || body.consent !== true
  ) {
    return response({
      ok: false,
      error: "Please add your name, a valid email, contact preference and consent.",
    }, 400, origin);
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
  const emailLimit = rateLimit({
    key: `brand-enquiry-email:${email}`,
    max: 4,
    windowMs: 60 * 60 * 1_000,
  });
  if (!emailLimit.allowed) {
    return response(
      { ok: false, error: "We already have your recent messages. Please give us a little time to reply." },
      429,
      origin,
      emailLimit.retryAfterSec,
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
    const { leads } = containerFor({
      agencyId: agency.id,
      storage: makePluginStorage(install.id) as never,
    });

    await leads.upsert({
      email,
      name,
      phone: phone || undefined,
      source: `website:${brand}`,
      companyId: company.id,
      companyIds: [company.id],
      brandSlugs: [brand],
      serviceLines: services,
      tags: [
        "website-enquiry",
        `brand:${brand}`,
        `contact:${contactMethod}`,
        ...services.map((service) => `service:${service.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
      ],
      notes: message || undefined,
      customFields: {
        preferredContactMethod: contactMethod,
        enquiryMessage: message,
        sourceUrl,
        campaign,
        consentCaptured: true,
        consentCapturedAt: new Date().toISOString(),
        publicBrand: brandDefinition.name,
      },
    }, founder.id);

    logActivity({
      agencyId: agency.id,
      actorEmail: email,
      category: "public-funnel",
      action: "form.brand_enquiry.submitted",
      message: `${brandDefinition.name} enquiry submitted by ${name}.`,
      metadata: {
        form: "brand-enquiry",
        brand,
        companyId: company.id,
        services,
        sourceUrl,
        campaign,
        contactMethod,
        hasPhone: Boolean(phone),
      },
    });

    return response({ ok: true }, 200, origin);
  } catch (cause) {
    console.error("[brand-enquiry] failed to capture enquiry", cause);
    return response({
      ok: false,
      error: "We could not save your message. Please try again.",
    }, 500, origin);
  }
}
