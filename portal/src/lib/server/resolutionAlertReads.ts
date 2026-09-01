import "server-only";

import { readOk } from "@/lib/readAvailability";
import {
  listOperationalAlerts,
  type OperationalAlertReadOptions,
} from "@/lib/server/inbox/operationalAlerts";
import {
  getRequestWebsiteEnquiries,
  type WebsiteEnquiry,
} from "@/lib/server/websiteEnquiries";
import type { OperationalAlert } from "@/lib/intelligence/operationalAttention";

/** Alert families whose truth depends on the external website-enquiry source. */
export function isWebsiteEnquiryResolutionAlert(alertId: string): boolean {
  return alertId.startsWith("enquiry:") || alertId.startsWith("website-message:");
}

/**
 * Resolve both public-enquiry ids and the lead ids used by operational alerts.
 * `enquiry:${lead.id}` is intentionally a different identity from
 * `website-message:${enquiry.id}`; treating both suffixes as enquiry ids drops
 * the checklist for every lead-backed row.
 */
export function websiteEnquiryForResolutionAlert(
  enquiries: readonly WebsiteEnquiry[],
  alertId: string,
  linkedEnquiryIds: readonly string[] = [],
): WebsiteEnquiry | null {
  if (!isWebsiteEnquiryResolutionAlert(alertId)) return null;
  const sourceId = alertId.slice(alertId.indexOf(":") + 1);
  const direct = enquiries.find(enquiry =>
    enquiry.id === sourceId || enquiry.leadId === sourceId);
  if (direct) return direct;

  // Legacy/partial provider rows do not always carry leadId. When the alert is
  // keyed by a lead, use only enquiry ids retained on that exact lead rather
  // than guessing from mutable names or email addresses.
  for (const linkedId of linkedEnquiryIds) {
    const linked = enquiries.find(enquiry => enquiry.id === linkedId);
    if (linked) return linked;
  }
  return null;
}

export function websiteEnquiryIdsForResolutionLead(
  alertId: string,
  lead: {
    id: string;
    enquiryIds?: readonly string[];
    customFields?: Readonly<Record<string, unknown>>;
  } | null,
): string[] {
  if (!lead || !alertId.startsWith("enquiry:")) return [];
  const leadId = alertId.slice("enquiry:".length);
  if (!leadId || lead.id !== leadId) return [];

  const current = typeof lead.customFields?.enquiryId === "string"
    ? lead.customFields.enquiryId.trim()
    : "";
  return Array.from(new Set([
    ...(current ? [current] : []),
    ...[...(lead.enquiryIds ?? [])].reverse().map(id => id.trim()).filter(Boolean),
  ]));
}

export interface ResolutionOperationalAlertReaders {
  websiteEnquiries: (agencyId: string) => Promise<WebsiteEnquiry[]>;
  operationalAlerts: (
    agencyId: string,
    now: number,
    options?: OperationalAlertReadOptions,
  ) => Promise<OperationalAlert[]>;
}

const DEFAULT_READERS: ResolutionOperationalAlertReaders = {
  websiteEnquiries: getRequestWebsiteEnquiries,
  operationalAlerts: listOperationalAlerts,
};

/**
 * Load the alert list used by explanation/evidence without swallowing the
 * exact alert's required provider read.
 *
 * The general operational feed remains usable during a website outage by
 * adding a `source-unavailable` row. That is correct for the feed, but not for
 * a request asking for one exact website alert: returning a normal list with
 * that id absent would turn provider failure into confirmed `null`. Here the
 * direct read rejects first, and its confirmed rows are injected into the feed
 * so there is no second provider call that can disagree.
 */
export async function listOperationalAlertsForResolution(
  agencyId: string,
  alertId: string,
  now: number,
  readers: ResolutionOperationalAlertReaders = DEFAULT_READERS,
): Promise<OperationalAlert[]> {
  if (!isWebsiteEnquiryResolutionAlert(alertId)) {
    return readers.operationalAlerts(agencyId, now);
  }

  const enquiries = await readers.websiteEnquiries(agencyId);
  return readers.operationalAlerts(agencyId, now, {
    websiteEnquiries: readOk(enquiries),
  });
}
