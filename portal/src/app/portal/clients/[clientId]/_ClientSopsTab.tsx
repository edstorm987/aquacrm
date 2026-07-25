"use client";

// Per-client SOPs sub-tab. Built in as a clean process checklist for
// now; durable editable SOPs can land later without this tab feeling
// broken today.

const TAG_LABELS: Record<string, string> = {
  sales:     "Sales & Discovery",
  service:   "Onboarding & Service Delivery",
  leads:     "Leads & Nurturing",
  standards: "Standards & Internal",
  mastery:   "Mastery Plan",
};

const SOP_PROMPTS: Record<string, string[]> = {
  sales: [
    "Discovery call notes captured",
    "Budget, offer, and buying reason recorded",
    "Next step and follow-up owner clear",
  ],
  service: [
    "Client portal created and checked",
    "Access details sent to the client",
    "Build milestones visible to the team",
  ],
  leads: [
    "Lead source and tags recorded",
    "Meeting or follow-up date set",
    "Conversion notes transferred to client record",
  ],
  standards: [
    "Brand assets stored",
    "Important links attached",
    "Risks, blockers, and decisions written down",
  ],
  mastery: [
    "Performance review cadence set",
    "Support owner assigned",
    "Growth opportunities logged",
  ],
};

export function ClientSopsTab({
  families,
  phaseLabel,
}: {
  families: readonly string[];
  phaseLabel: string;
}) {
  const prompts = families.flatMap(family => (
    SOP_PROMPTS[family] ?? [`Write the ${TAG_LABELS[family] ?? family} process for this client.`]
  ));

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium text-black/90">SOPs for {phaseLabel}</h2>
          <p className="mt-1 text-sm text-black/60">
            Filtered to {families.map(f => TAG_LABELS[f] ?? f).join(" · ")}.
            Read-only here; edits live on the agency SOPs shelf.
          </p>
        </div>
        <a
          href="/portal/agency/sops"
          className="rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5"
        >
          Open SOPs shelf →
        </a>
      </header>

      <div className="mt-4">
        <ul className="grid gap-2 md:grid-cols-2">
          {prompts.map(prompt => (
            <li key={prompt} className="rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-sm text-black/70">
              {prompt}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
