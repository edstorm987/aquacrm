import Link from "next/link";

export type SalesAcquisitionTab =
  | "journey"
  | "scouting"
  | "researching"
  | "outreach"
  | "meetings"
  | "inbox"
  | "contacts";

const TABS: Array<{
  id: SalesAcquisitionTab;
  label: string;
  detail: string;
  href: string;
}> = [
  { id: "journey", label: "Journey", detail: "Whole acquisition", href: "/portal/clients?view=journey" },
  { id: "scouting", label: "Scouting", detail: "Find and capture", href: "/portal/agency/scouting" },
  { id: "researching", label: "Researching", detail: "Optional context", href: "/portal/agency/researching" },
  { id: "outreach", label: "Outreach Command", detail: "Call, email, DM", href: "/portal/agency/prospecting" },
  { id: "meetings", label: "Meetings", detail: "Prepare and progress", href: "/portal/agency/meetings" },
  { id: "inbox", label: "Inbox", detail: "Inbound enquiries", href: "/portal/agency/inbox" },
  { id: "contacts", label: "Contacts", detail: "People and imports", href: "/portal/clients?view=contacts" },
];

/**
 * Views over one acquisition history, not mandatory gates. The same Prospect
 * can be researched and contacted in either order; Journey is the master view.
 */
export function SalesAcquisitionTabs({ active }: { active: SalesAcquisitionTab }) {
  return (
    <nav aria-label="Acquisition journey views" className="overflow-x-auto rounded-lg border border-black/10 bg-white">
      <ul className="flex min-w-max divide-x divide-black/10">
        {TABS.map(tab => {
          const current = active === tab.id;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-16 min-w-40 flex-col justify-center px-4 py-2 transition focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${current ? "bg-[#102f31] text-white focus-visible:ring-[#72d5ca]" : "text-black/75 hover:bg-black/[0.025] focus-visible:ring-[#12615c]"}`}
              >
                <strong className="text-sm font-semibold">{tab.label}</strong>
                <span className={`mt-0.5 text-xs ${current ? "text-white/80" : "text-black/65"}`}>{tab.detail}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
