import type { ReactNode } from "react";
import {
  Banknote,
  FileArchive,
  FolderKanban,
  HeartHandshake,
  Megaphone,
  MessageSquareText,
  MonitorCog,
  NotebookTabs,
  PanelTop,
  type LucideIcon,
} from "lucide-react";

import type { TabId } from "./_tabs";

type LensTab = Exclude<TabId, "overview">;

const LENS_PRESENTATION: Record<LensTab, {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}> = {
  relationship: {
    eyebrow: "Relationship desk",
    title: "Health and next contact",
    description: "Review relationship health, service progress, requests and the next move with this client.",
    icon: HeartHandshake,
  },
  delivery: {
    eyebrow: "Delivery operations",
    title: "Services, stages and fulfilment",
    description: "Run each assigned service independently, follow its process and reveal advanced controls only when needed.",
    icon: FolderKanban,
  },
  marketing: {
    eyebrow: "Client growth desk",
    title: "Social and paid media",
    description: "Plan and operate this client’s campaigns, channels, audiences, approvals and performance evidence.",
    icon: Megaphone,
  },
  systems: {
    eyebrow: "Technical estate",
    title: "Systems and performance",
    description: "Inspect websites, repositories, deployments, telemetry and technical health belonging to this client.",
    icon: MonitorCog,
  },
  finance: {
    eyebrow: "Commercial desk",
    title: "Contracts, plans and payments",
    description: "Keep the agreed scope, signatures, invoices, payment plans and commercial evidence together.",
    icon: Banknote,
  },
  communications: {
    eyebrow: "Conversation desk",
    title: "Messages and support",
    description: "Continue conversations, review requests and keep every client touchpoint attached to the relationship.",
    icon: MessageSquareText,
  },
  files: {
    eyebrow: "Evidence library",
    title: "Files and assets",
    description: "Organise working files, client uploads, recordings, brand assets and delivery evidence.",
    icon: FileArchive,
  },
  portal: {
    eyebrow: "Customer experience",
    title: "Client portal",
    description: "Configure the private experience, access, product modules and client-visible information for this workspace.",
    icon: PanelTop,
  },
  notes: {
    eyebrow: "Information archive",
    title: "Client information and history",
    description: "Keep contact details, working notes, meeting links and the complete log of calls, messages, files and commercial events together.",
    icon: NotebookTabs,
  },
};

export function ClientLensHeader({
  tab,
  clientName,
  relationshipSwitcher,
  action,
}: {
  tab: LensTab;
  clientName: string;
  relationshipSwitcher?: ReactNode;
  action?: ReactNode;
}) {
  const lens = LENS_PRESENTATION[tab];
  const Icon = lens.icon;

  return (
    <header className="mm-client-lens-header">
      <span className="mm-client-lens-header-icon" aria-hidden="true"><Icon size={20} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p>{lens.eyebrow}</p>
          <span className="mm-client-lens-client">{clientName}</span>
          {relationshipSwitcher}
        </div>
        <h1>{lens.title}</h1>
        <span>{lens.description}</span>
      </div>
      {action ? <div className="mm-client-lens-header-action">{action}</div> : null}
    </header>
  );
}
