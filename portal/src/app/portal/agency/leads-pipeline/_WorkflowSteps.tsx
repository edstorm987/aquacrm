import Link from "next/link";

type WorkflowStepKey = "import" | "work" | "outreach";

export function WorkflowSteps({
  active,
  contactsHref = "/portal/agency/leads-pipeline/contacts",
  boardHref = "/portal/agency/pipelines/leads",
  campaignsHref = "/portal/agency/marketing",
}: {
  active: WorkflowStepKey;
  contactsHref?: string;
  boardHref?: string;
  campaignsHref?: string;
}) {
  return (
    <nav aria-label="Sales workflow" className="grid border-y border-black/10 md:grid-cols-3 md:divide-x md:divide-black/10">
      <WorkflowStep
        active={active === "import"}
        href={contactsHref}
        label="1. Import"
        description="Upload sheets or add contacts."
      />
      <WorkflowStep
        active={active === "work"}
        href={boardHref}
        label="2. Work the board"
        description="Call, email, book meetings, update status."
      />
      <WorkflowStep
        active={active === "outreach"}
        href={campaignsHref}
        label="3. Outreach"
        description="Send campaigns to the right leads."
      />
    </nav>
  );
}

function WorkflowStep({
  active,
  href,
  label,
  description,
}: {
  active: boolean;
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-3 transition ${
        active
          ? "bg-brand/[0.07]"
          : "hover:bg-black/[0.025]"
      }`}
    >
      <div className={`text-xs font-semibold ${active ? "text-brand" : "text-black/70"}`}>{label}</div>
      <div className="mt-0.5 text-xs leading-5 text-black/45">{description}</div>
    </Link>
  );
}
