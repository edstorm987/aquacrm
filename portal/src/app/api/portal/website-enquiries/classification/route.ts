import { NextResponse } from "next/server";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";

import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import {
  classificationContactType,
  isWebsiteEnquiryClassification,
  type WebsiteEnquiryClassification,
} from "@/lib/enquiryClassification";
import { isTradingBrandSlug, tradingBrandDefinition } from "@/lib/tradingBrands";
import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getInstall } from "@/server/pluginInstalls";
import { deleteCard, getPipelineBySlug, listCards } from "@/server/pipelines";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { ensureZimanteTradingCompanies } from "@/server/zimanteTradingCompanies";

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

export async function PATCH(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const body = await request.json().catch(() => null) as { enquiryId?: unknown; classification?: unknown } | null;
    const enquiryId = typeof body?.enquiryId === "string" ? body.enquiryId.trim() : "";
    if (!enquiryId || !isWebsiteEnquiryClassification(body?.classification)) {
      return NextResponse.json({ ok: false, error: "Submission ID and a valid classification are required." }, { status: 400 });
    }
    const classification = body.classification;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("brand_enquiries")
      .select("id, brand_slug, name, email, phone, contact_method, services, message, source_url, campaign, created_at, metadata")
      .eq("id", enquiryId)
      .maybeSingle();
    if (error) throw new Error(`Could not load website enquiry: ${error.message}`);
    if (!data) return NextResponse.json({ ok: false, error: "Submission not found." }, { status: 404 });

    const enquiry = data as EnquiryRow;
    const currentMetadata = enquiry.metadata ?? {};
    const previousClassification = isWebsiteEnquiryClassification(currentMetadata.enquiryClassification)
      ? currentMetadata.enquiryClassification
      : "unclassified";
    const now = new Date().toISOString();
    const install = getInstall({ agencyId: session.agencyId }, "leads-pipeline");
    if (!install?.enabled) {
      return NextResponse.json({ ok: false, error: "The Journey data module is not available." }, { status: 503 });
    }

    ensureLeadsPipelineFoundationRegistered();
    const { leads, contacts } = containerFor({
      agencyId: session.agencyId,
      storage: makePluginStorage(install.id) as never,
    });
    const storedLeadId = typeof currentMetadata.leadId === "string"
      ? currentMetadata.leadId
      : typeof currentMetadata.archivedLeadId === "string"
        ? currentMetadata.archivedLeadId
        : undefined;
    const matchedLead = storedLeadId
      ? await leads.get(storedLeadId)
      : enquiry.email?.trim()
        ? await leads.getByEmail(enquiry.email)
        : enquiry.phone?.trim()
          ? await leads.getByPhone(enquiry.phone)
          : null;
    const existingLeadId = matchedLead?.id ?? storedLeadId;
    let leadId: string | undefined;
    let contactId = typeof currentMetadata.contactId === "string" ? currentMetadata.contactId : undefined;
    let routeNote = "Retained in the enquiry inbox.";
    const existingRoutedContact = contactId
      ? await contacts.get(contactId)
      : enquiry.email?.trim()
        ? await contacts.getByEmail(enquiry.email)
        : null;

    if (classification === "sales") {
      if (!isTradingBrandSlug(enquiry.brand_slug)) {
        return NextResponse.json({ ok: false, error: "This submission has an unknown brand." }, { status: 400 });
      }
      const companies = ensureZimanteTradingCompanies(session.agencyId, session.userId);
      const company = companies[enquiry.brand_slug];
      const brand = tradingBrandDefinition(enquiry.brand_slug);
      const source = typeof currentMetadata.source === "string" ? currentMetadata.source : `website:${enquiry.brand_slug}`;
      const existingLead = matchedLead ?? (existingLeadId ? await leads.get(existingLeadId) : null);
      const customFields = {
        ...(existingLead?.customFields ?? {}),
        enquiryId: enquiry.id,
        enquiryClassification: classification,
        preferredContactMethod: enquiry.contact_method || "email",
        enquiryMessage: enquiry.message || "",
        sourceUrl: enquiry.source_url || "",
        campaign: enquiry.campaign || "",
        publicBrand: brand.name,
      };
      const result = existingLead
        ? { lead: await leads.update(existingLead.id, { customFields }, session.userId) ?? existingLead, created: false }
        : await leads.upsert({
            email: enquiry.email?.trim().toLowerCase() ?? "",
            name: enquiry.name,
            phone: enquiry.phone?.trim() || undefined,
            source,
            capturedAt: Date.parse(enquiry.created_at),
            companyId: company.id,
            companyIds: [company.id],
            brandSlugs: [enquiry.brand_slug],
            serviceLines: enquiry.services ?? [],
            tags: [
              "website-enquiry",
              "classified:sales",
              `brand:${enquiry.brand_slug}`,
              ...((enquiry.services ?? []).map(service => `service:${service.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)),
            ],
            notes: enquiry.message || undefined,
            customFields,
          }, session.userId);
      leadId = result.lead.id;
      if (existingRoutedContact?.customFields?.enquiryId === enquiry.id) {
        await contacts.delete(existingRoutedContact.id, session.userId);
        contactId = undefined;
      }
      routeNote = result.created ? "Created a sales lead and added it to Journey." : "Kept the existing sales lead in Journey.";
    } else {
      const activeLead = matchedLead ?? (existingLeadId ? await leads.get(existingLeadId) : null);
      if (activeLead) {
        await leads.delete(activeLead.id, session.userId);
        removeLeadCards(session.agencyId, activeLead.id, activeLead.pipelineCardId);
      }
      const contactType = classificationContactType(classification);
      if (contactType && existingRoutedContact?.customFields?.enquiryId === enquiry.id) {
        const updated = await contacts.update(existingRoutedContact.id, {
          type: contactType,
          tags: Array.from(new Set([
            ...existingRoutedContact.tags.filter(tag => !tag.startsWith("classification:")),
            `classification:${classification}`,
          ])),
          customFields: {
            ...(existingRoutedContact.customFields ?? {}),
            enquiryClassification: classification,
          },
        }, session.userId);
        contactId = updated?.id;
        routeNote = "Moved the existing relationship contact to its new classification.";
      } else if (contactType && enquiry.email?.trim()) {
        const result = await contacts.upsert({
          email: enquiry.email,
          name: enquiry.name,
          phone: enquiry.phone || undefined,
          tags: Array.from(new Set([
            "website-enquiry",
            `classification:${classification}`,
            `brand:${enquiry.brand_slug}`,
          ])),
          type: contactType,
          source: typeof currentMetadata.source === "string" ? currentMetadata.source : `website:${enquiry.brand_slug}`,
          notes: enquiry.message || undefined,
          customFields: {
            enquiryId: enquiry.id,
            enquiryClassification: classification,
            preferredContactMethod: enquiry.contact_method || "email",
            sourceUrl: enquiry.source_url || "",
            campaign: enquiry.campaign || "",
          },
        }, session.userId);
        contactId = result.contact.id;
        routeNote = result.created ? "Filed as a non-sales contact." : "Updated the existing non-sales contact.";
      } else if (classification === "spam") {
        if (existingRoutedContact?.customFields?.enquiryId === enquiry.id) {
          await contacts.delete(existingRoutedContact.id, session.userId);
        }
        contactId = undefined;
        routeNote = "Removed from Journey and retained as spam for audit and search.";
      } else if (!enquiry.email?.trim()) {
        routeNote = "Removed from Journey and retained in the inbox. Add an email before creating a contact record.";
      }
    }

    await flushPendingWrites();
    const history = Array.isArray(currentMetadata.enquiryClassificationHistory)
      ? currentMetadata.enquiryClassificationHistory.slice(-99)
      : [];
    const metadata = {
      ...currentMetadata,
      enquiryClassification: classification,
      enquiryClassificationAt: now,
      enquiryClassificationBy: session.userId,
      enquiryClassificationHistory: [...history, {
        from: previousClassification,
        to: classification,
        at: now,
        by: session.userId,
      }],
      inboxStatus: currentMetadata.inboxStatus === "resolved" ? "resolved" : "reviewed",
      firstReviewedAt: typeof currentMetadata.firstReviewedAt === "string" ? currentMetadata.firstReviewedAt : now,
      lastReviewedAt: now,
      lastReviewedBy: session.userId,
      leadId: leadId ?? null,
      leadCreated: Boolean(leadId),
      leadLinkedAt: leadId ? now : null,
      archivedLeadId: !leadId && existingLeadId ? existingLeadId : currentMetadata.archivedLeadId ?? null,
      leadRoutedOutAt: !leadId && existingLeadId ? now : null,
      contactId: contactId ?? null,
      enquiryRouteNote: routeNote,
    };
    const { error: updateError } = await supabase.from("brand_enquiries").update({ metadata }).eq("id", enquiry.id);
    if (updateError) throw new Error(`Could not classify website enquiry: ${updateError.message}`);

    return NextResponse.json({ ok: true, classification, leadId, contactId, routeNote });
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {
      console.error("[website-enquiries] classification failed", error);
      return NextResponse.json({ ok: false, error: "The enquiry could not be routed." }, { status: 500 });
    }
  }
}

function removeLeadCards(agencyId: string, leadId: string, pipelineCardId?: string) {
  if (pipelineCardId) deleteCard(agencyId, pipelineCardId);
  const pipeline = getPipelineBySlug(agencyId, "leads");
  if (!pipeline) return;
  for (const card of listCards(pipeline.id)) {
    if (card.kind !== "lead") continue;
    const snapshot = card.lead as unknown as { leadId?: string };
    if (snapshot.leadId === leadId) deleteCard(agencyId, card.id);
  }
}
