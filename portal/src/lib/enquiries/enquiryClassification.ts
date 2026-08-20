export const WEBSITE_ENQUIRY_CLASSIFICATIONS = [
  "unclassified",
  "sales",
  "existing-client",
  "supplier",
  "partnership",
  "marketer",
  "recruitment",
  "spam",
  "other",
] as const;

export type WebsiteEnquiryClassification = typeof WEBSITE_ENQUIRY_CLASSIFICATIONS[number];

export const WEBSITE_ENQUIRY_CLASSIFICATION_LABELS: Record<WebsiteEnquiryClassification, string> = {
  unclassified: "Needs classification",
  sales: "Sales opportunity",
  "existing-client": "Existing client",
  supplier: "Supplier",
  partnership: "Partnership",
  marketer: "Marketer / sales pitch",
  recruitment: "Recruitment / applicant",
  spam: "Spam",
  other: "Other relationship",
};

export function isWebsiteEnquiryClassification(value: unknown): value is WebsiteEnquiryClassification {
  return typeof value === "string" && (WEBSITE_ENQUIRY_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function isSalesClassification(value: WebsiteEnquiryClassification): boolean {
  return value === "sales";
}

export function isLeadJourneyEligible(lead: {
  source: string;
  tags?: string[];
  convertedAt?: number;
  convertedClientId?: string;
  customFields?: Record<string, unknown>;
}): boolean {
  if (lead.convertedAt || lead.convertedClientId || lead.tags?.includes("converted")) return true;
  const cameFromWebsite = lead.source.startsWith("website:")
    || lead.tags?.includes("website-enquiry")
    || typeof lead.customFields?.enquiryId === "string";
  if (!cameFromWebsite) return true;
  return lead.customFields?.enquiryClassification === "sales";
}

export function classificationContactType(classification: WebsiteEnquiryClassification): "account" | "vendor" | "other" | null {
  if (classification === "existing-client") return "account";
  if (classification === "supplier") return "vendor";
  if (["partnership", "marketer", "recruitment", "other"].includes(classification)) return "other";
  return null;
}
