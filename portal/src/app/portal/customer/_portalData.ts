import "server-only";

import { listActivity } from "@/server/activity";
import { getInstall } from "@/server/pluginInstalls";
import type { ActivityEntry, Client } from "@/server/types";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { containerFor } from "@/built-ins/modules/agency-finance/src/server";
import type { Invoice, InvoiceLineItem, InvoiceStatus } from "@/built-ins/modules/agency-finance/src/lib/domain";
import type { ClientRequest } from "@/app/api/tenants/client-requests/route";
import type { ClientContract } from "@/lib/clientContracts";
import type { CustomerProjectBrief } from "@/app/api/tenants/customer-project-brief/route";
import type { ClientApproval } from "@/app/api/tenants/client-approvals/route";
import { cleanPortalProducts, type PortalProductSelection } from "@/lib/portalProducts";

export type CustomerPortalMode = "onboarding" | "designing" | "developed-launch" | "maintenance";

export interface CustomerFile {
  id: string;
  name: string;
  url: string;
  category: string;
  uploadedBy?: string;
  uploadedAt?: number;
}

export interface CustomerProperty {
  id: string;
  label?: string;
  kind?: string;
  status?: string;
  tagStatus?: string;
  liveUrl?: string;
  previewUrl?: string;
  redirectTarget?: string;
}

export interface CustomerInvoice {
  id: string;
  number: string;
  issuedAt: number;
  dueAt: number;
  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  status: InvoiceStatus;
  paidAt?: number;
}

export interface CustomerRecordNote {
  label: string;
  value: string;
}

export interface CustomerRecordLink {
  label: string;
  url: string;
  kind: "recording" | "meeting" | "inspiration";
}

export interface CustomerRecord {
  email?: string;
  phone?: string;
  source?: string;
  capturedAt?: number;
  nextMeetingAt?: number;
  notes: CustomerRecordNote[];
  links: CustomerRecordLink[];
}

export interface CustomerPortalData {
  mode: CustomerPortalMode;
  contactName: string;
  servicePlan: string;
  planSummary?: string;
  planIncludes: string[];
  billingCadence: string;
  agreedProjectValue?: string;
  welcomeNote?: string;
  products: PortalProductSelection[];
  experienceHeadline?: string;
  logoUrl?: string;
  accentColor: string;
  builtAt?: number;
  websiteUrl?: string;
  billingUrl?: string;
  lockInPaid: boolean;
  files: CustomerFile[];
  properties: CustomerProperty[];
  requests: ClientRequest[];
  contracts: ClientContract[];
  brief: CustomerProjectBrief;
  approvals: ClientApproval[];
  invoices: CustomerInvoice[];
  record: CustomerRecord;
  support: {
    email?: string;
    phone?: string;
    whatsappUrl?: string;
  };
  activity: Array<{ id: string; ts: number; message: string; category: string }>;
}

const PLAN_LABELS: Record<string, string> = {
  foundational: "Foundational Flow",
  expansion: "Expansion Plan",
  mastery: "Mastery Plan",
};

export function portalMode(value: unknown): CustomerPortalMode {
  return value === "designing" || value === "developed-launch" || value === "maintenance"
    ? value
    : "onboarding";
}

export function customerVisibleInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.filter(invoice =>
    invoice.status === "sent"
    || invoice.status === "overdue"
    || invoice.status === "paid"
    || invoice.status === "refunded"
  );
}

function supportUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  const candidate = /^(wa\.me|chat\.whatsapp\.com)\//i.test(trimmed)
    ? `https://${trimmed}`
    : trimmed;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function customerDocumentUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith("/api/tenants/client-files/content?")) return trimmed;
  return supportUrl(trimmed);
}

function customerActivityMessage(
  item: ActivityEntry,
  invoiceNumberById: Map<string, string>,
): string | undefined {
  const requestType = typeof item.metadata?.requestType === "string"
    ? item.metadata.requestType.replaceAll("-", " ")
    : "support";
  const invoiceId = typeof item.metadata?.invoiceId === "string" ? item.metadata.invoiceId : "";
  const invoiceNumber = invoiceNumberById.get(invoiceId);

  if (item.action === "customer_brief.updated") return "Your project brief was updated.";
  if (item.action === "customer_portal.built") return "Your private client portal was prepared.";
  if (item.action.startsWith("client_file.") && item.action !== "client_file.removed") {
    return "A new item was added to your project files.";
  }
  if (item.action.startsWith("client_approval.") && item.action.endsWith(".requested")) {
    return "A new decision is ready for your review.";
  }
  if (item.action.startsWith("client_approval.") && item.action.endsWith(".approved")) {
    return "You approved the latest project decision.";
  }
  if (item.action.startsWith("client_approval.") && item.action.endsWith(".changes-requested")) {
    return "Your requested changes were sent to Milesymedia.";
  }
  if (item.action === "contract.sent") return "A new agreement is ready in Billing.";
  if (item.action === "contract.accepted") return "Your agreement was accepted.";
  if (item.action === "contract.declined") return "Your agreement query was sent to Milesymedia.";
  if (item.action === "invoice.sent") return `${invoiceNumber ? `${invoiceNumber} is` : "A new invoice is"} ready in Billing.`;
  if (item.action === "invoice.paid") return `Payment received${invoiceNumber ? ` for ${invoiceNumber}` : ""}.`;
  if (item.action === "invoice.refunded") return `A refund was recorded${invoiceNumber ? ` for ${invoiceNumber}` : ""}.`;
  if (item.action.startsWith("client_request.") && item.action.endsWith(".opened")) {
    return `Your ${requestType} request was sent to Milesymedia.`;
  }
  if (item.action === "client_request.replied") return "Your support conversation has a new reply.";
  if (item.action === "client_request.reviewed") return `Milesymedia is reviewing your ${requestType} request.`;
  if (item.action === "client_request.closed") return `Your ${requestType} request was resolved.`;
  if (item.category === "phase") return "Your project moved to its next stage.";
  return undefined;
}

export async function loadCustomerPortalData(client: Client, fallbackName: string): Promise<CustomerPortalData> {
  const meta = (client.metadata ?? {}) as {
    portalMode?: CustomerPortalMode;
    portalContactName?: string;
    portalServicePlan?: string;
    portalPlanSummary?: string;
    portalPlanIncludes?: string[];
    portalBillingCadence?: string;
    agreedProjectValue?: string;
    portalWelcomeNote?: string;
    portalProducts?: PortalProductSelection[];
    portalExperienceHeadline?: string;
    portalBuiltAt?: number;
    planTier?: string;
    stripeLink?: string;
    lockInPaid?: boolean;
    files?: CustomerFile[];
    properties?: CustomerProperty[];
    clientRequests?: ClientRequest[];
    contracts?: ClientContract[];
    portalBrief?: CustomerProjectBrief;
    portalApprovals?: ClientApproval[];
    whatsappLink?: string;
    portalSupportEmail?: string;
    portalSupportPhone?: string;
    portalSupportWhatsappUrl?: string;
    portalLogoUrl?: string;
    portalAccentColor?: string;
    portalLoginEmail?: string;
    clientEmail?: string;
    phone?: string;
    contactPhone?: string;
    source?: string;
    capturedAt?: number;
    notes?: string;
    nextMeetingAt?: number;
    meetingLink?: string;
    meetingNotes?: string;
    callRecordingUrl?: string;
    sessionNotes?: string;
    inspirationLinks?: string[];
    potentialProblems?: string;
    potentialSolutions?: string;
    pricePoints?: string;
    budgetRange?: string;
    designFeedback?: string;
    supportNotes?: string;
    buyingJourney?: {
      source?: string;
      capturedAt?: number;
      meetingAt?: number;
      meetingLink?: string;
      callRecordingUrl?: string;
      sessionNotes?: string;
      inspirationLinks?: string[];
      potentialProblems?: string;
      potentialSolutions?: string;
      pricePoints?: string;
      budgetRange?: string;
      notes?: string;
    };
  };

  let invoices: Invoice[] = [];
  const financeInstall = getInstall({ agencyId: client.agencyId }, "agency-finance");
  if (financeInstall?.enabled) {
    try {
      invoices = await containerFor({
        agencyId: client.agencyId,
        storage: makePluginStorage(financeInstall.id),
        install: financeInstall,
      }).invoices.list({ clientId: client.id });
      invoices = customerVisibleInvoices(invoices);
    } catch {
      invoices = [];
    }
  }

  const invoiceNumberById = new Map(invoices.map(invoice => [invoice.id, invoice.number]));
  const activity = listActivity({
    agencyId: client.agencyId,
    clientId: client.id,
    limit: 100,
  })
    .flatMap(item => {
      const message = customerActivityMessage(item, invoiceNumberById);
      return message ? [{ id: item.id, ts: item.ts, message, category: item.category }] : [];
    })
    .slice(0, 20);

  const planKey = typeof meta.planTier === "string" ? meta.planTier : "";
  const customerEmails = new Set(
    [meta.portalLoginEmail, client.ownerEmail]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      .map(value => value.trim().toLowerCase()),
  );
  const actorLabel = (value?: string, customerFallback = "Customer") =>
    value && customerEmails.has(value.trim().toLowerCase()) ? "Customer" : value ? "Milesymedia" : customerFallback;
  const safeFiles: CustomerFile[] = (Array.isArray(meta.files) ? meta.files : []).map(file => ({
    id: file.id,
    name: file.name,
    url: file.url,
    category: file.category,
    uploadedBy: actorLabel(file.uploadedBy),
    uploadedAt: file.uploadedAt,
  }));
  const safeProperties: CustomerProperty[] = (Array.isArray(meta.properties) ? meta.properties : []).map(property => ({
    id: property.id,
    label: property.label,
    kind: property.kind,
    status: property.status,
    tagStatus: property.tagStatus,
    liveUrl: supportUrl(property.liveUrl),
    previewUrl: supportUrl(property.previewUrl),
    redirectTarget: supportUrl(property.redirectTarget),
  }));
  const safeRequests: ClientRequest[] = (Array.isArray(meta.clientRequests) ? meta.clientRequests : []).map(request => ({
    id: request.id,
    type: request.type,
    message: request.message,
    link: supportUrl(request.link),
    status: request.status,
    submittedBy: actorLabel(request.submittedBy),
    submittedAt: request.submittedAt,
    reviewedBy: request.reviewedBy ? "Milesymedia" : undefined,
    reviewedAt: request.reviewedAt,
    closedBy: request.closedBy ? "Milesymedia" : undefined,
    closedAt: request.closedAt,
    replies: Array.isArray(request.replies)
      ? request.replies.map(reply => ({
          id: reply.id,
          message: reply.message,
          from: reply.from,
          createdAt: reply.createdAt,
        }))
      : [],
  }));
  const safeContracts: ClientContract[] = (Array.isArray(meta.contracts) ? meta.contracts : []).map(contract => ({
    id: contract.id,
    title: contract.title,
    summary: contract.summary,
    body: contract.body,
    documentUrl: customerDocumentUrl(contract.documentUrl),
    documentName: contract.documentName,
    templateId: contract.templateId,
    version: contract.version ?? 1,
    revisions: Array.isArray(contract.revisions)
      ? contract.revisions.map(revision => ({
          version: revision.version,
          title: revision.title,
          summary: revision.summary,
          body: revision.body,
          documentUrl: customerDocumentUrl(revision.documentUrl),
          documentName: revision.documentName,
          templateId: revision.templateId,
          note: revision.note,
          createdAt: revision.createdAt,
        }))
      : [],
    status: contract.status,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
    issuedAt: contract.issuedAt,
    acceptedAt: contract.acceptedAt,
    acceptedBy: contract.acceptedBy ? "Customer" : undefined,
    declinedAt: contract.declinedAt,
    declinedBy: contract.declinedBy ? "Customer" : undefined,
  }));
  const sourceBrief = meta.portalBrief ?? {};
  const safeBrief: CustomerProjectBrief = {
    businessOverview: sourceBrief.businessOverview,
    primaryGoal: sourceBrief.primaryGoal,
    idealCustomer: sourceBrief.idealCustomer,
    mustHaves: sourceBrief.mustHaves,
    launchTiming: sourceBrief.launchTiming,
    additionalNotes: sourceBrief.additionalNotes,
    submittedAt: sourceBrief.submittedAt,
    submittedBy: sourceBrief.submittedBy ? "Customer" : undefined,
  };
  const safeApprovals: ClientApproval[] = (Array.isArray(meta.portalApprovals) ? meta.portalApprovals : []).map(approval => ({
    id: approval.id,
    type: approval.type,
    title: approval.title,
    detail: approval.detail,
    status: approval.status,
    requestedAt: approval.requestedAt,
    requestedBy: "Milesymedia",
    respondedAt: approval.respondedAt,
    respondedBy: approval.respondedBy ? "Customer" : undefined,
    responseNote: approval.responseNote,
  }));
  const safeInvoices: CustomerInvoice[] = invoices.map(invoice => ({
    id: invoice.id,
    number: invoice.number,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    lineItems: invoice.lineItems.map(lineItem => ({
      description: lineItem.description,
      quantity: lineItem.quantity,
      unitCents: lineItem.unitCents,
      totalCents: lineItem.totalCents,
    })),
    subtotalCents: invoice.subtotalCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    currency: invoice.currency,
    status: invoice.status,
    paidAt: invoice.paidAt,
  }));
  const depositPaid = meta.lockInPaid === true || safeInvoices.some(invoice =>
    invoice.status === "paid"
    && invoice.lineItems.some(item => /\b(deposit|lock[\s-]?in)\b/i.test(item.description)),
  );
  const noteCandidates: Array<[string, unknown]> = [
    ["Session notes", meta.sessionNotes ?? meta.buyingJourney?.sessionNotes],
    ["Meeting notes", meta.meetingNotes],
    ["Additional notes", meta.notes ?? meta.buyingJourney?.notes],
    ["Problems discussed", meta.potentialProblems ?? meta.buyingJourney?.potentialProblems],
    ["Potential solutions", meta.potentialSolutions ?? meta.buyingJourney?.potentialSolutions],
    ["Budget discussed", meta.budgetRange ?? meta.buyingJourney?.budgetRange],
    ["Price points discussed", meta.pricePoints ?? meta.buyingJourney?.pricePoints],
    ["Design feedback", meta.designFeedback],
    ["Support notes", meta.supportNotes],
  ];
  const seenNotes = new Set<string>();
  const recordNotes: CustomerRecordNote[] = noteCandidates.flatMap(([label, value]) => {
    if (typeof value !== "string" || !value.trim()) return [];
    const clean = value.trim();
    if (seenNotes.has(clean)) return [];
    seenNotes.add(clean);
    return [{ label, value: clean }];
  });
  const linkCandidates: Array<[string, unknown, CustomerRecordLink["kind"]]> = [
    ["Discovery call recording", meta.callRecordingUrl ?? meta.buyingJourney?.callRecordingUrl, "recording"],
    ["Next meeting", meta.meetingLink ?? meta.buyingJourney?.meetingLink, "meeting"],
    ...(meta.inspirationLinks ?? meta.buyingJourney?.inspirationLinks ?? []).map((url, index) =>
      [`Inspiration ${index + 1}`, url, "inspiration"] as [string, unknown, CustomerRecordLink["kind"]]
    ),
  ];
  const seenLinks = new Set<string>();
  const recordLinks: CustomerRecordLink[] = linkCandidates.flatMap(([label, value, kind]) => {
    const url = supportUrl(value);
    if (!url || seenLinks.has(url)) return [];
    seenLinks.add(url);
    return [{ label, url, kind }];
  });

  return {
    mode: portalMode(meta.portalMode),
    contactName: meta.portalContactName?.trim() || fallbackName,
    servicePlan: meta.portalServicePlan?.trim() || PLAN_LABELS[planKey] || planKey || "Milesymedia custom plan",
    planSummary: meta.portalPlanSummary?.trim() || undefined,
    planIncludes: Array.isArray(meta.portalPlanIncludes)
      ? meta.portalPlanIncludes
          .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          .map(item => item.trim())
          .slice(0, 12)
      : [],
    billingCadence: meta.portalBillingCadence?.trim() || "As agreed",
    agreedProjectValue: meta.agreedProjectValue?.trim() || undefined,
    welcomeNote: meta.portalWelcomeNote?.trim() || undefined,
    products: cleanPortalProducts(meta.portalProducts),
    experienceHeadline: meta.portalExperienceHeadline?.trim() || undefined,
    logoUrl: supportUrl(meta.portalLogoUrl),
    accentColor: /^#[0-9a-f]{6}$/i.test(meta.portalAccentColor ?? "")
      ? meta.portalAccentColor!
      : "#8b6c33",
    builtAt: meta.portalBuiltAt,
    websiteUrl: supportUrl(client.websiteUrl),
    billingUrl: supportUrl(meta.stripeLink),
    lockInPaid: depositPaid,
    files: safeFiles,
    properties: safeProperties,
    requests: safeRequests,
    contracts: safeContracts,
    brief: safeBrief,
    approvals: safeApprovals,
    invoices: safeInvoices,
    record: {
      email: meta.portalLoginEmail?.trim() || meta.clientEmail?.trim() || client.ownerEmail?.trim() || undefined,
      phone: meta.phone?.trim() || meta.contactPhone?.trim() || undefined,
      source: meta.source?.trim() || meta.buyingJourney?.source?.trim() || undefined,
      capturedAt: typeof meta.capturedAt === "number" ? meta.capturedAt : meta.buyingJourney?.capturedAt,
      nextMeetingAt: typeof meta.nextMeetingAt === "number" ? meta.nextMeetingAt : meta.buyingJourney?.meetingAt,
      notes: recordNotes,
      links: recordLinks,
    },
    support: {
      email: meta.portalSupportEmail?.trim()
        || process.env.MILESYMEDIA_SUPPORT_EMAIL?.trim()
        || process.env.MILESYMEDIA_REPLY_TO?.trim()
        || process.env.MILESYMEDIA_FROM_EMAIL?.trim()
        || "hello@milesymedia.co",
      phone: meta.portalSupportPhone?.trim()
        || process.env.MILESYMEDIA_SUPPORT_PHONE?.trim()
        || "+44 7707 020250",
      whatsappUrl: supportUrl(meta.portalSupportWhatsappUrl)
        || supportUrl(meta.whatsappLink)
        || supportUrl(process.env.MILESYMEDIA_SUPPORT_WHATSAPP_URL)
        || "https://wa.me/447707020250",
    },
    activity,
  };
}
