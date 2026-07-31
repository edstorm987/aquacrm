import { NextResponse } from "next/server";

import { cleanString, isEmail, jsonError, jsonOk } from "@/lib/route-security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedBrands = new Set(["aquacrm", "aquaoasis-web", "milesymedia", "zimante-group"]);

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > 64 * 1024) {
    return jsonError("Request is too large.", 413);
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request.", 400);
  }

  if (cleanString(body.website, 200)) {
    return jsonOk({});
  }

  const brand = cleanString(body.brand, 80).toLowerCase();
  const name = cleanString(body.name, 120);
  const email = cleanString(body.email, 254).toLowerCase();
  const consent = body.consent === true;

  if (!allowedBrands.has(brand)) {
    return jsonError("Unknown brand.", 400);
  }
  if (!name || !isEmail(email)) {
    return jsonError("Name and email are required.", 400);
  }
  if (!consent) {
    return jsonError("Consent is required.", 400);
  }

  const services = Array.isArray(body.services)
    ? body.services.map(item => cleanString(item, 80)).filter(Boolean).slice(0, 12)
    : [];

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("brand_enquiries").insert({
    brand_slug: brand,
    name,
    email,
    phone: cleanString(body.phone, 40) || null,
    contact_method: cleanString(body.contactMethod, 40) || null,
    services,
    message: cleanString(body.message, 2000) || null,
    source_url: cleanString(body.sourceUrl, 500) || null,
    campaign: cleanString(body.campaign, 200) || null,
    consent,
    metadata: {
      submittedAt: new Date().toISOString(),
      userAgent: request.headers.get("user-agent"),
      origin: request.headers.get("origin"),
    },
  });

  if (error) {
    console.error("Brand enquiry insert failed", error);
    return jsonError("We could not save this enquiry right now.", 500);
  }

  return jsonOk({});
}
