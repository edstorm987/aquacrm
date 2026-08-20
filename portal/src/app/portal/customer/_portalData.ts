import "server-only";

import { listActivity } from "@/server/activity";
import { getInstall } from "@/server/pluginInstalls";
import type { ActivityEntry, Client, ClientPortalDesignDocument } from "@/server/types";
import { getClientPortalInstance, getClientPortalTemplate, productPortalTemplateRecordId, resolveClientPortalDesign, type ClientPortalDesignScope } from "@/server/clientPortalDesigns";
import { getAgencyProduct, listAgencyProducts } from "@/server/agencyProducts";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { containerFor } from "@/built-ins/modules/agency-finance/src/server";
import type { Invoice, InvoiceLineItem, InvoiceStatus } from "@/built-ins/modules/agency-finance/src/lib/domain";
import type { ClientRequest } from "@/app/api/tenants/client-requests/route";
import { cleanClientRequests } from "@/lib/clients/clientRequests";
import type { ClientContract } from "@/lib/clients/clientContracts";
import type { CustomerProjectBrief } from "@/app/api/tenants/customer-project-brief/route";
import type { ClientApproval } from "@/app/api/tenants/client-approvals/route";
import { portalProductSelectionFromAgencyProduct, type PortalProductSelection } from "@/lib/portal/portalProducts";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { PORTAL_PROGRAMME_LIFECYCLE, portalProductLifecycle } from "@/lib/portal/portalProductModules";
import { cleanPortalProductWorkspaces, type PortalProductWorkspace } from "@/lib/portal/portalProductWorkspaces";
import { cleanClientRecordEntries, type ClientRecordEntryKind } from "@/lib/clients/clientRelationshipRecord";
import { listInboxSnapshot } from "@/lib/server/inbox/inboxStore";
import { listWebsiteEnquiries } from "@/lib/server/websiteEnquiries";
import {
  cleanClientPaymentPlans,
  customerVisiblePaymentPlans,
  reconcileClientPaymentPlan,
  type ClientPaymentPlan,
} from "@/lib/clients/clientPaymentPlans";

export type CustomerPortalMode = "onboarding" | "designing" | "developed-launch" | "maintenance";

export interface CustomerFile {
  id: string;
  name: string;
  url: string;
  category: string;
  uploadedBy?: string;
  uploadedAt?: number;
  size?: number;
  contentType?: string;
  productId?: string;
  workspacePageId?: string;
  collectionId?: string;
  recordEntryId?: string;
  customerVisible?: boolean;
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

export interface CustomerRecordEntry {
  id: string;
  kind: ClientRecordEntryKind;
  title: string;
  body?: string;
  occurredAt: number;
  channel?: string;
  url?: string;
  attachments?: CustomerFile[];
}

export interface CustomerRecordMessage {
  id: string;
  conversationId: string;
  channel: string;
  from: "customer" | "provider";
  body: string;
  occurredAt: number;
  status?: string;
}

export interface CustomerRecord {
  email?: string;
  phone?: string;
  source?: string;
  capturedAt?: number;
  nextMeetingAt?: number;
  notes: CustomerRecordNote[];
  links: CustomerRecordLink[];
  entries: CustomerRecordEntry[];
  messages: CustomerRecordMessage[];
}

export interface CustomerPortalData {
  clientId: string;
  mode: CustomerPortalMode;
  presentation: ClientPortalDesignDocument;
  presentationProductId?: string;
  productPresentations: Record<string, ClientPortalDesignDocument>;
  contactName: string;
  servicePlan: string;
  planSummary?: string;
  planIncludes: string[];
  billingCadence: string;
  agreedProjectValue?: string;
  welcomeNote?: string;
  products: PortalProductSelection[];
  workspaces: PortalProductWorkspace[];
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
  paymentPlans: ClientPaymentPlan[];
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
  providerName: string,
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
    return `Your requested changes were sent to ${providerName}.`;
  }
  if (item.action === "contract.sent") return "A new agreement is ready in Billing.";
  if (item.action === "contract.accepted") return "Your agreement was accepted.";
  if (item.action === "contract.declined") return `Your agreement query was sent to ${providerName}.`;
  if (item.action === "invoice.sent") return `${invoiceNumber ? `${invoiceNumber} is` : "A new invoice is"} ready in Billing.`;
  if (item.action === "invoice.paid") return `Payment received${invoiceNumber ? ` for ${invoiceNumber}` : ""}.`;
  if (item.action === "invoice.refunded") return `A refund was recorded${invoiceNumber ? ` for ${invoiceNumber}` : ""}.`;
  if (item.action.startsWith("client_request.") && item.action.endsWith(".opened")) {
    return `Your ${requestType} request was sent to ${providerName}.`;
  }
  if (item.action === "client_request.replied") return "Your support conversation has a new reply.";
  if (item.action === "client_request.reviewed") return `${providerName} is reviewing your ${requestType} request.`;
  if (item.action === "client_request.closed") return `Your ${requestType} request was resolved.`;
  if (item.action.startsWith("product_workspace.")) return item.message;
  if (item.category === "phase") return "Your project moved to its next stage.";
  return undefined;
}

export async function loadCustomerPortalData(
  client: Client,
  fallbackName: string,
  providerName = "Milesymedia",
  options: {
    scope?: ClientPortalDesignScope;
    templateId?: string;
    productIds?: string[];
    draft?: boolean;
    audience?: "customer" | "agency";
  } = {},
): Promise<CustomerPortalData> {
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
    portalProductWorkspaces?: Record<string, unknown>;
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
    clientRecordEntries?: unknown;
    clientPaymentPlans?: unknown;
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
  const reconciledPaymentPlans = cleanClientPaymentPlans(meta.clientPaymentPlans)
    .map(plan => reconcileClientPaymentPlan(plan, invoices));
  const safePaymentPlans = options.audience === "agency"
    ? reconciledPaymentPlans
    : customerVisiblePaymentPlans(reconciledPaymentPlans);
  const activity = listActivity({
    agencyId: client.agencyId,
    clientId: client.id,
    limit: 100,
  })
    .flatMap(item => {
      const message = customerActivityMessage(item, invoiceNumberById, providerName);
      return message ? [{ id: item.id, ts: item.ts, message, category: item.category }] : [];
    })
    .slice(0, 20);

  const planKey = typeof meta.planTier === "string" ? meta.planTier : "";
  const customerEmails = new Set(
    [meta.portalLoginEmail, meta.clientEmail, client.ownerEmail]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      .map(value => value.trim().toLowerCase()),
  );
  const customerPhones = new Set([meta.phone, meta.contactPhone]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map(value => value.replace(/\D/g, ""))
    .filter(Boolean));
  const actorLabel = (value?: string, customerFallback = "Customer") =>
    value && customerEmails.has(value.trim().toLowerCase()) ? "Customer" : value ? providerName : customerFallback;
  const safeFiles: CustomerFile[] = (Array.isArray(meta.files) ? meta.files : [])
    .filter(file => options.audience === "agency"
      || file.customerVisible === true
      || Boolean(file.uploadedBy && customerEmails.has(file.uploadedBy.trim().toLowerCase())))
    .map(file => ({
    id: file.id,
    name: file.name,
    url: file.url,
    category: file.category,
    uploadedBy: actorLabel(file.uploadedBy),
    uploadedAt: file.uploadedAt,
    size: file.size,
    contentType: file.contentType,
    productId: file.productId,
    workspacePageId: file.workspacePageId,
    collectionId: file.collectionId,
    recordEntryId: file.recordEntryId,
    customerVisible: file.customerVisible,
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
  const safeRequests: ClientRequest[] = cleanClientRequests(meta.clientRequests).map(request => ({
    id: request.id,
    type: request.type,
    message: request.message,
    link: supportUrl(request.link),
    propertyId: request.propertyId,
    siteLabel: request.siteLabel,
    siteUrl: supportUrl(request.siteUrl),
    siteKind: request.siteKind,
    priority: request.priority,
    topic: request.topic,
    suggestedAction: request.suggestedAction,
    status: request.status,
    submittedBy: actorLabel(request.submittedBy),
    submittedAt: request.submittedAt,
    reviewedBy: request.reviewedBy ? providerName : undefined,
    reviewedAt: request.reviewedAt,
    closedBy: request.closedBy ? providerName : undefined,
    closedAt: request.closedAt,
    replies: Array.isArray(request.replies)
      ? request.replies.map(reply => ({
          id: reply.id,
          message: reply.message,
          from: reply.from,
          createdAt: reply.createdAt,
          attachments: Array.isArray(reply.attachments) ? reply.attachments : [],
        }))
      : [],
  }));
  const requestRecordMessages: CustomerRecordMessage[] = safeRequests.flatMap(request => [
    {
      id: request.id,
      conversationId: request.id,
      channel: "Client portal",
      from: request.submittedBy === "Customer" ? "customer" as const : "provider" as const,
      body: request.message,
      occurredAt: request.submittedAt,
      status: request.status,
    },
    ...(request.replies ?? []).map(reply => ({
      id: reply.id,
      conversationId: request.id,
      channel: "Client portal",
      from: reply.from === "customer" ? "customer" as const : "provider" as const,
      body: reply.message,
      occurredAt: reply.createdAt,
      status: request.status,
    })),
  ]);
  const [inboxSnapshot, websiteEnquiries] = await Promise.all([
    listInboxSnapshot(client.agencyId).catch(() => ({ connections: [], conversations: [], generatedAt: Date.now() })),
    listWebsiteEnquiries(500).catch(() => []),
  ]);
  const socialRecordMessages: CustomerRecordMessage[] = inboxSnapshot.conversations
    .filter(conversation => conversation.identity.clientId === client.id)
    .flatMap(conversation => conversation.messages
      .filter(message => message.direction !== "internal")
      .map(message => ({
        id: message.id,
        conversationId: conversation.id,
        channel: conversation.connection.displayName,
        from: message.direction === "inbound" ? "customer" as const : "provider" as const,
        body: message.text?.trim() || (message.attachments.length ? `${message.attachments.length} attachment${message.attachments.length === 1 ? "" : "s"}` : "Message"),
        occurredAt: message.sentAt,
        status: message.status,
      })));
  const matchedEnquiries = websiteEnquiries.filter(enquiry =>
    Boolean(enquiry.email && customerEmails.has(enquiry.email.trim().toLowerCase()))
    || Boolean(enquiry.phone && customerPhones.has(enquiry.phone.replace(/\D/g, ""))));
  const enquiryRecordMessages: CustomerRecordMessage[] = matchedEnquiries.flatMap(enquiry => [
    ...(enquiry.message ? [{
      id: enquiry.id,
      conversationId: enquiry.id,
      channel: enquiry.siteName,
      from: "customer" as const,
      body: enquiry.message,
      occurredAt: enquiry.submittedAt,
      status: enquiry.status,
    }] : []),
    ...enquiry.replies.map(reply => ({
      id: reply.id,
      conversationId: enquiry.id,
      channel: reply.senderLabel || reply.channel,
      from: "provider" as const,
      body: reply.message,
      occurredAt: reply.sentAt,
      status: reply.status,
    })),
  ]);
  const enquiryCallEntries: CustomerRecordEntry[] = matchedEnquiries.flatMap(enquiry => enquiry.calls.map(call => ({
    id: call.id,
    kind: "call" as const,
    title: `Call · ${call.outcome?.replaceAll("-", " ") || call.status}`,
    body: call.notes?.trim() || (call.durationSeconds ? `${call.durationSeconds} seconds` : undefined),
    occurredAt: call.startedAt,
    channel: call.senderLabel,
    url: call.recording?.consentConfirmed ? call.recording.url : undefined,
  })));
  const recordMessages = [...requestRecordMessages, ...socialRecordMessages, ...enquiryRecordMessages]
    .sort((left, right) => left.occurredAt - right.occurredAt);
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
    requestedBy: providerName,
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
    ["Additional project brief", sourceBrief.additionalNotes],
  ];
  const seenNotes = new Set<string>();
  const recordNotes: CustomerRecordNote[] = noteCandidates.flatMap(([label, value]) => {
    if (typeof value !== "string" || !value.trim()) return [];
    const clean = value.trim();
    if (seenNotes.has(clean)) return [];
    seenNotes.add(clean);
    return [{ label, value: clean }];
  });
  const recordEntries: CustomerRecordEntry[] = [
    ...cleanClientRecordEntries(meta.clientRecordEntries)
      .filter(entry => entry.visibility === "client")
      .map(entry => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      occurredAt: entry.occurredAt,
      channel: entry.channel,
      url: entry.url,
      attachments: safeFiles.filter(file => file.recordEntryId === entry.id),
      })),
    ...enquiryCallEntries,
  ].sort((left, right) => right.occurredAt - left.occurredAt);
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
  const presentation = resolveClientPortalDesign({
    agencyId: client.agencyId,
    clientId: client.id,
    scope: options.scope,
    templateId: options.templateId,
    draft: options.draft,
    fallbackAccentColor: meta.portalAccentColor,
  });
  const configuredProducts = resolvePortalProductAssignment(meta, listAgencyProducts(client.agencyId, true)).products;
  const previewTemplate = options.scope === "template" && options.templateId
    ? getClientPortalTemplate(client.agencyId, options.templateId)
    : null;
  const previewProduct = previewTemplate?.productId
    ? getAgencyProduct(client.agencyId, previewTemplate.productId)
    : null;
  const compositionProducts = (options.productIds ?? [])
    .slice(0, 8)
    .flatMap(productId => {
      const product = getAgencyProduct(client.agencyId, productId);
      return product ? [portalProductSelectionFromAgencyProduct(product)] : [];
    });
  const products = compositionProducts.length
    ? compositionProducts
    : previewProduct
      ? [portalProductSelectionFromAgencyProduct(previewProduct)]
      : configuredProducts;
  const presentationInstance = options.scope === "template" ? null : getClientPortalInstance(client.agencyId, client.id);
  const presentationTemplate = previewTemplate
    ?? (presentationInstance ? getClientPortalTemplate(client.agencyId, presentationInstance.templateId) : null);
  const productPresentations = Object.fromEntries(products.flatMap(product => {
    if (presentationTemplate?.productId === product.id) return [[product.id, presentation]];
    const productTemplate = getClientPortalTemplate(client.agencyId, productPortalTemplateRecordId(client.agencyId, product.id));
    return productTemplate ? [[product.id, productTemplate.published]] : [];
  }));

  const mode = portalMode(meta.portalMode);
  const workspaces = cleanPortalProductWorkspaces(meta.portalProductWorkspaces, products, mode).map(workspace => options.audience === "agency"
    ? workspace
    : {
        ...workspace,
        collections: workspace.collections.filter(collection => collection.status !== "draft" && collection.status !== "archived"),
      });

  return {
    clientId: client.id,
    mode,
    presentation,
    presentationProductId: presentationTemplate?.productId,
    productPresentations,
    contactName: meta.portalContactName?.trim() || fallbackName,
    servicePlan: meta.portalServicePlan?.trim() || PLAN_LABELS[planKey] || planKey || `${providerName} custom plan`,
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
    products,
    workspaces,
    experienceHeadline: meta.portalExperienceHeadline?.trim() || undefined,
    logoUrl: supportUrl(meta.portalLogoUrl),
    accentColor: presentation.theme.accentColor,
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
    paymentPlans: safePaymentPlans,
    record: {
      email: meta.portalLoginEmail?.trim() || meta.clientEmail?.trim() || client.ownerEmail?.trim() || undefined,
      phone: meta.phone?.trim() || meta.contactPhone?.trim() || undefined,
      source: meta.source?.trim() || meta.buyingJourney?.source?.trim() || undefined,
      capturedAt: typeof meta.capturedAt === "number" ? meta.capturedAt : meta.buyingJourney?.capturedAt,
      nextMeetingAt: typeof meta.nextMeetingAt === "number" ? meta.nextMeetingAt : meta.buyingJourney?.meetingAt,
      notes: recordNotes,
      links: recordLinks,
      entries: recordEntries,
      messages: recordMessages,
    },
    support: {
      email: meta.portalSupportEmail?.trim()
        || (providerName === "Milesymedia"
          ? process.env.MILESYMEDIA_SUPPORT_EMAIL?.trim()
            || process.env.MILESYMEDIA_REPLY_TO?.trim()
            || process.env.MILESYMEDIA_FROM_EMAIL?.trim()
            || "hello@milesymedia.co"
          : undefined),
      phone: meta.portalSupportPhone?.trim()
        || (providerName === "Milesymedia"
          ? process.env.MILESYMEDIA_SUPPORT_PHONE?.trim() || "+44 7707 020250"
          : undefined),
      whatsappUrl: supportUrl(meta.portalSupportWhatsappUrl)
        || supportUrl(meta.whatsappLink)
        || (providerName === "Milesymedia"
          ? supportUrl(process.env.MILESYMEDIA_SUPPORT_WHATSAPP_URL) || "https://wa.me/447707020250"
          : undefined),
    },
    activity,
  };
}

export function customerPortalModeLabel(data: CustomerPortalData): string {
  const stage = data.products.length === 1 ? data.workspaces[0]?.stage ?? data.mode : data.mode;
  const shellLabel = data.presentation.stages[stage].label;
  if (data.products.length > 1) return PORTAL_PROGRAMME_LIFECYCLE[data.mode].label;
  const product = data.products[0];
  if (!product || data.presentationProductId === product.id) return shellLabel;
  return portalProductLifecycle(product)[stage].label;
}
