import { NextResponse, type NextRequest } from "next/server";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { FOUNDER_AGENCY_SLUG, FOUNDER_EMAIL, seedFounder } from "@/lib/server/founderSeed";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getAgencyBySlug } from "@/server/tenants";
import { getUser } from "@/server/users";
import { ensureAgencyWebsite, recordAgencyWebsiteTelemetry } from "@/server/agencyWebsite";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_METHODS = new Set(["in-person", "call", "text", "email", "whatsapp"]);

interface ContactBody {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  contactMethod?: unknown;
  note?: unknown;
  website?: unknown;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function error(message: string, status: number, retryAfter?: number) {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status,
      headers: retryAfter ? { "retry-after": String(retryAfter) } : undefined,
    },
  );
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return error("This request could not be verified.", 403);
  }

  let body: ContactBody;
  try {
    body = await req.json() as ContactBody;
  } catch {
    return error("Please check the form and try again.", 400);
  }

  // Quietly accept bot submissions so the honeypot is not discoverable.
  if (clean(body.website, 200)) {
    return NextResponse.json({ ok: true });
  }

  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 40);
  const contactMethod = clean(body.contactMethod, 30);
  const note = clean(body.note, 4_000);

  if (!name || !EMAIL.test(email) || !CONTACT_METHODS.has(contactMethod)) {
    return error("Please add your name, a valid email, and your preferred contact method.", 400);
  }

  const ip = clientIpFromHeaders(req.headers);
  const ipLimit = rateLimit({ key: `public-contact:${ip}`, max: 6, windowMs: 60 * 60 * 1_000 });
  if (!ipLimit.allowed) {
    return error("Too many messages have been sent. Please try again later.", 429, ipLimit.retryAfterSec);
  }
  const emailLimit = rateLimit({ key: `public-contact-email:${email}`, max: 3, windowMs: 60 * 60 * 1_000 });
  if (!emailLimit.allowed) {
    return error("We already have your recent messages. Please give us a little time to reply.", 429, emailLimit.retryAfterSec);
  }

  try {
    await ensureHydrated();
    await seedFounder();
    ensureLeadsPipelineFoundationRegistered();

    const agency = getAgencyBySlug(FOUNDER_AGENCY_SLUG);
    const founder = getUser(FOUNDER_EMAIL);
    if (!agency || !founder) {
      return error("Milesymedia contact is temporarily unavailable. Please email hello@milesymedia.co.", 503);
    }

    const install = getInstall({ agencyId: agency.id }, "leads-pipeline");
    if (!install?.enabled) {
      return error("Milesymedia contact is temporarily unavailable. Please email hello@milesymedia.co.", 503);
    }

    const { leads } = containerFor({
      agencyId: agency.id,
      storage: makePluginStorage(install.id) as never,
    });
    await leads.upsert({
      email,
      name,
      phone: phone || undefined,
      source: "milesymedia-website",
      tags: ["website-enquiry", `contact:${contactMethod}`],
      notes: note || undefined,
      customFields: {
        preferredContactMethod: contactMethod,
        enquiryMessage: note,
      },
    }, founder.id);
    logActivity({
      agencyId: agency.id,
      actorEmail: email,
      category: "public-funnel",
      action: "form.contact.submitted",
      message: `Website contact form submitted by ${name}.`,
      metadata: {
        form: "website-contact",
        contactMethod,
        hasPhone: Boolean(phone),
        messageLength: note.length,
        source: "milesymedia-website",
      },
    });
    const website = ensureAgencyWebsite(agency.id);
    recordAgencyWebsiteTelemetry(website.telemetrySiteKey, {
      type: "form",
      formName: "Website contact",
      path: "/",
      occurredAt: Date.now(),
    }, req.headers.get("user-agent") ?? undefined);

    await flushPendingWrites();

    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error("[public-contact] failed to capture enquiry", cause);
    return error("We could not save your message. Please try again or email hello@milesymedia.co.", 500);
  }
}
