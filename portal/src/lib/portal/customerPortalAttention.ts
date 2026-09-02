import type { CustomerPortalData } from "@/app/portal/customer/_portalData";
import { customerPortalReadPhase } from "@/lib/portal/customerPortalReadState";

export interface CustomerPortalAttentionItem {
  count: number;
  label: string;
  /** A marker, never an inferred action count. */
  unavailable?: true;
}

export interface CustomerPortalAttention {
  total: number;
  state: "ready" | "unavailable";
  unavailableSections: Record<string, string>;
  sections: Record<string, CustomerPortalAttentionItem>;
  modules: Record<string, Record<string, CustomerPortalAttentionItem>>;
}

function attentionItem(count: number, singular: string, plural = `${singular}s`): CustomerPortalAttentionItem | undefined {
  if (count <= 0) return undefined;
  return { count, label: `${count} ${count === 1 ? singular : plural}` };
}

export function buildCustomerPortalAttention(data: CustomerPortalData): CustomerPortalAttention {
  const sections: Record<string, CustomerPortalAttentionItem> = {};
  const modules: CustomerPortalAttention["modules"] = {};
  const unavailableSections: CustomerPortalAttention["unavailableSections"] = {};
  const pendingApprovals = data.approvals.filter(approval => approval.status === "pending").length;
  const briefRequired = data.mode === "onboarding" && !data.brief.submittedAt ? 1 : 0;
  const projectAttention = attentionItem(pendingApprovals + briefRequired, "project item needs you", "project items need you");
  if (projectAttention) sections.project = projectAttention;

  const invoiceRead = customerPortalReadPhase(data, "invoices");
  if (invoiceRead === "ready") {
    const outstandingInvoices = data.invoices.filter(invoice => invoice.status === "sent" || invoice.status === "overdue").length;
    const billingAttention = attentionItem(outstandingInvoices, "invoice needs review", "invoices need review");
    if (billingAttention) sections.billing = billingAttention;
  } else {
    const label = "Billing status could not be checked";
    unavailableSections.billing = label;
    sections.billing = { count: 0, label, unavailable: true };
  }

  const supportReplies = data.requests.filter(request => {
    if (request.status === "closed") return false;
    const latestReply = request.replies?.at(-1);
    return latestReply?.from === "milesymedia";
  }).length;
  const supportAttention = attentionItem(supportReplies, "support reply is waiting", "support replies are waiting");
  if (supportAttention) sections.support = supportAttention;

  for (const workspace of data.workspaces) {
    const productModules: Record<string, CustomerPortalAttentionItem> = {};
    const moduleIds = new Set([
      ...workspace.decisions.filter(decision => decision.status === "pending").map(decision => decision.pageId),
      ...workspace.collections.filter(collection => collection.status === "review").map(collection => collection.pageId),
    ]);
    for (const moduleId of moduleIds) {
      const pendingDecisions = workspace.decisions.filter(decision => decision.pageId === moduleId && decision.status === "pending").length;
      const collectionsToReview = workspace.collections.filter(collection => collection.pageId === moduleId && collection.status === "review").length;
      const count = pendingDecisions + collectionsToReview;
      const item = attentionItem(count, "item needs your decision", "items need your decision");
      if (item) productModules[moduleId] = item;
    }
    if (Object.keys(productModules).length) modules[workspace.productId] = productModules;
  }

  const total = Object.values(sections).reduce((sum, item) => sum + item.count, 0)
    + Object.values(modules).flatMap(product => Object.values(product)).reduce((sum, item) => sum + item.count, 0);
  const state = Object.keys(unavailableSections).length ? "unavailable" : "ready";
  if (total > 0 || state === "unavailable") {
    sections.home = state === "unavailable"
      ? {
          count: total,
          label: total > 0
            ? `${total} confirmed ${total === 1 ? "item needs you" : "items need you"}; some status could not be checked`
            : "Some status could not be checked",
          unavailable: true,
        }
      : { count: total, label: `${total} ${total === 1 ? "item needs you" : "items need you"}` };
  }

  return { total, state, unavailableSections, sections, modules };
}
