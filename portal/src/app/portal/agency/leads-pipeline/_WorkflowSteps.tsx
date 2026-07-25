import Link from "next/link";

type WorkflowStepKey = "import" | "work" | "outreach";

export function WorkflowSteps({
  active,
  contactsHref = "/portal/agency/leads-pipeline/contacts",
  boardHref = "/portal/agency/pipelines/leads",
  campaignsHref = "/portal/agency/leads-pipeline/campaigns",
}: {
  active: WorkflowStepKey;
  contactsHref?: string;
  boardHref?: string;
  campaignsHref?: string;
}) {
  return (
    <section className="grid gap-2 rounded-xl border border-black/10 bg-white/70 p-3 shadow-sm md:grid-cols-3">
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
    </section>
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
      className={`rounded-lg border px-3 py-2 transition ${
        active
          ? "border-brand bg-brand/10"
          : "border-black/10 bg-white hover:bg-black/[0.03]"
      }`}
    >
      <div className={`text-xs font-semibold ${active ? "text-brand" : "text-black/70"}`}>{label}</div>
      <div className="mt-1 text-xs leading-5 text-black/50">{description}</div>
    </Link>
  );
}
