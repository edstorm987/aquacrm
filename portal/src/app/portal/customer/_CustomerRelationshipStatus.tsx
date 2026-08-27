import type { AgencyStatus } from "@/server/types";

export interface CustomerRelationshipStatusPresentation {
  label: string;
  detail: string;
  actionLabel: string;
}

export function customerRelationshipStatusPresentation(
  status: AgencyStatus,
  providerName: string,
): CustomerRelationshipStatusPresentation {
  if (status === "suspended") {
    return {
      label: `Service suspended with ${providerName}`,
      detail: "Your service relationship is paused. You can still review billing history and settle existing invoices.",
      actionLabel: "Discuss restarting",
    };
  }
  if (status === "archived") {
    return {
      label: `Relationship archived with ${providerName}`,
      detail: "This service relationship is closed. Its billing history remains available for your records.",
      actionLabel: "Ask about this account",
    };
  }
  return {
    label: `Active with ${providerName}`,
    detail: "Your service relationship is active. Billing history and payment options are available here.",
    actionLabel: "Get support",
  };
}

export function CustomerRelationshipStatus({
  status,
  providerName,
  supportHref,
}: {
  status: AgencyStatus;
  providerName: string;
  supportHref: string;
}) {
  const presentation = customerRelationshipStatusPresentation(status, providerName);
  return (
    <div data-relationship-status={status}>
      <p className="mt-2 text-sm font-medium">{presentation.label}</p>
      <p className="mt-1 text-xs leading-5 text-black/45">{presentation.detail}</p>
      <a
        href={supportHref}
        className="mt-2 inline-flex min-h-8 items-center text-xs font-medium text-[var(--portal-accent)] hover:underline"
      >
        {presentation.actionLabel}
      </a>
    </div>
  );
}
