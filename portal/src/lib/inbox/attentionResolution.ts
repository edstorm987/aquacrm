import type { OperationalAlert } from "@/lib/intelligence/operationalAttention";

export interface AttentionResolution {
  destination: string;
  action: string;
  opensInboxThread: boolean;
}

export function resolveAttentionAction(alert: OperationalAlert): AttentionResolution {
  const url = safeUrl(alert.href);
  const pathname = url?.pathname ?? alert.href;
  const tab = url?.searchParams.get("tab");

  if (pathname === "/portal/agency/inbox") {
    const view = url?.searchParams.get("view");
    return {
      destination: view === "support" ? "the support conversation" : view === "chatbot" ? "the chatbot message" : "the enquiry",
      action: view === "support" ? "Reply, record the outcome, or close the request." : "Review the message, respond, and update its status.",
      opensInboxThread: Boolean(url?.searchParams.get("thread") || url?.searchParams.get("form")),
    };
  }
  if (pathname.startsWith("/portal/agency/contacts")) {
    return resolution(
      "this person's contact card",
      "Set the relationship, confirm their company, and record what you know.",
    );
  }
  if (pathname.startsWith("/portal/agency/actions")) return resolution("the exact task", "Complete, reassign, reschedule, or edit the action.");
  if (pathname.startsWith("/portal/agency/agency-finance/invoices")) return resolution("overdue invoices", "Record payment or create the required follow-up.");
  if (pathname.startsWith("/portal/agency/agency-finance/expenses")) return resolution("the filtered expense records", "Attach evidence, approve the record, or update its status.");
  if (pathname.startsWith("/portal/agency/agency-finance/budgets")) return resolution("budget controls", "Fund the pot, amend the allocation, or reduce the commitment.");
  if (pathname.startsWith("/portal/agency/agency-finance/operations")) return resolution("finance operations", "Update the obligation, payment, renewal, or retained evidence.");
  if (pathname.startsWith("/portal/agency/company") && (url?.searchParams.get("view") === "legal" || alert.category === "compliance" || alert.category === "contract")) return resolution("the legal register", "Inspect the record and update its status, deadline, or evidence.");
  if (pathname.startsWith("/portal/agency/pipelines")) return resolution(alert.category === "meeting" ? "the meeting record" : "the relevant Journey record", alert.category === "meeting" ? "Send or record the reminder, then update the meeting." : "Record the next contact, stage, or outcome.");
  if (pathname.startsWith("/portal/agency/marketing") || tab === "marketing") return resolution("the marketing record", "Review the campaign, approval, account access, budget, or result.");
  if (pathname.startsWith("/portal/agency/fulfilment") || ["delivery", "fulfilment", "systems", "properties", "portal"].includes(tab ?? "")) return resolution("the affected delivery system", "Inspect the exact client, property, portal, or delivery record and record the correction.");
  if (pathname.startsWith("/portal/clients/")) return resolution(tab === "finance" ? "this client's finance workspace" : "the client workspace", tab === "finance" ? "Update the invoice, payment plan, contract, or payment evidence." : "Review the flagged client record and record the next action.");
  if (pathname.startsWith("/portal/agency/people")) return resolution("the staff record", "Review the person, decision, terms, training, or leave record.");
  if (pathname.startsWith("/portal/agency") && url?.searchParams.get("station") === "calendar") return resolution("Command Calendar", "Update the commitment, reminder, goal, or target.");
  return resolution("the source workspace", "Inspect the retained evidence and update the underlying record.");
}

function resolution(destination: string, action: string): AttentionResolution {
  return { destination, action, opensInboxThread: false };
}

function safeUrl(href: string): URL | null {
  try {
    return new URL(href, "https://aquacrm.local");
  } catch {
    return null;
  }
}
