import { NextResponse } from "next/server";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";

import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { isTradingBrandSlug, tradingBrandDefinition } from "@/lib/brands/tradingBrands";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { createScopedSupabaseClient } from "@/lib/supabase/scoped";
import { getInstall } from "@/server/pluginInstalls";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { ensureZimanteTradingCompanies } from "@/server/zimanteTradingCompanies";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\d\s.-]{7,40}$/;

type EnquiryRow = {
  id: string;
  brand_slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_method: string | null;
  services: string[] | null;
  message: string | null;
  source_url: string | null;
  campaign: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export async function POST(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const body = await request.json().catch(() => null) as { enquiryId?: unknown } | null;
    const enquiryId = typeof body?.enquiryId === "string" ? body.enquiryId.trim() : "";
    if (!enquiryId) {
      return NextResponse.json({ ok: false, error: "Submission ID required." }, { status: 400 });
    }

    const supabase = await createScopedSupabaseClient();
    const { data, error } = await supabase
      .from("brand_enquiries")
      .select("id, brand_slug, name, email, phone, contact_method, services, message, source_url, campaign, created_at, metadata")
      .eq("id", enquiryId)
      .maybeSingle();
    if (error) throw new Error(`Could not load website enquiry: ${error.message}`);
    if (!data) {
      return NextResponse.json({ ok: false, error: "Website submission not found." }, { status: 404 });
    }

    const enquiry = data as EnquiryRow;
    const email = enquiry.email?.trim().toLowerCase() ?? "";
    const phone = enquiry.phone?.trim() ?? "";
    if ((!email || !EMAIL.test(email)) && !PHONE.test(phone)) {
      return NextResponse.json({ ok: false, error: "A valid email address or phone number is required to create a sales lead." }, { status: 400 });
    }
    if (!isTradingBrandSlug(enquiry.brand_slug)) {
      return NextResponse.json({ ok: false, error: "This submission has an unknown brand." }, { status: 400 });
    }

    ensureLeadsPipelineFoundationRegistered();
    const install = getInstall({ agencyId: session.agencyId }, "leads-pipeline");
    if (!install?.enabled) {
      return NextResponse.json({ ok: false, error: "The sales pipeline is not available." }, { status: 503 });
    }

    const companies = ensureZimanteTradingCompanies(session.agencyId, session.userId);
    const company = companies[enquiry.brand_slug];
    const brand = tradingBrandDefinition(enquiry.brand_slug);
    const source = typeof enquiry.metadata?.source === "string"
      ? enquiry.metadata.source
      : `website:${enquiry.brand_slug}`;
    const channel = typeof enquiry.metadata?.channel === "string"
      ? enquiry.metadata.channel
      : enquiry.contact_method === "chat" ? "chatbot" : enquiry.contact_method === "support" ? "support" : "form";
    const propertyId = typeof enquiry.metadata?.propertyId === "string" ? enquiry.metadata.propertyId : enquiry.brand_slug;
    const pagePath = typeof enquiry.metadata?.pagePath === "string" ? enquiry.metadata.pagePath : "/";
    const contactMethod = enquiry.contact_method || "email";
    const services = enquiry.services ?? [];
    const capturedAt = Date.parse(enquiry.created_at);
    const { leads } = containerFor({
      agencyId: session.agencyId,
      storage: makePluginStorage(install.id) as never,
    });
    const result = await leads.upsert({
      email,
      name: enquiry.name,
      phone: phone || undefined,
      source,
      capturedAt: Number.isFinite(capturedAt) ? capturedAt : undefined,
      companyId: company.id,
      companyIds: [company.id],
      brandSlugs: [enquiry.brand_slug],
      serviceLines: services,
      tags: [
        "website-enquiry",
        `brand:${enquiry.brand_slug}`,
        `channel:${channel}`,
        `contact:${contactMethod}`,
        ...services.map((service) => `service:${service.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
      ],
      notes: enquiry.message || undefined,
      customFields: {
        enquiryId: enquiry.id,
        preferredContactMethod: contactMethod,
        enquiryMessage: enquiry.message || "",
        sourceUrl: enquiry.source_url || "",
        campaign: enquiry.campaign || "",
        consentCaptured: true,
        publicBrand: brand.name,
        enquiryChannel: channel,
        enquiryClassification: "sales",
        propertyId,
        pagePath,
      },
    }, session.userId);

    await flushPendingWrites();
    const metadata = {
      ...(enquiry.metadata ?? {}),
      source,
      leadId: result.lead.id,
      leadCreated: true,
      enquiryClassification: "sales",
      enquiryClassificationAt: new Date().toISOString(),
      enquiryClassificationBy: session.userId,
      leadLinkedAt: new Date().toISOString(),
      leadLinkedBy: session.userId,
    };
    const { error: updateError } = await supabase
      .from("brand_enquiries")
      .update({ metadata })
      .eq("id", enquiry.id);
    if (updateError) throw new Error(`Could not link website enquiry: ${updateError.message}`);

    return NextResponse.json({ ok: true, leadId: result.lead.id, created: result.created });
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {
      console.error("[website-enquiries] lead reconciliation failed", error);
      return NextResponse.json({ ok: false, error: "The submission could not be linked to sales." }, { status: 500 });
    }
  }
}
