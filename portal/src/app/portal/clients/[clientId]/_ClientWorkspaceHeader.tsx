import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowUpRight,
  Building2,
  CircleAlert,
  FolderKanban,
  HeartHandshake,
  Inbox,
  PackageCheck,
  PanelTop,
  Settings2,
} from "lucide-react";

import type { AquaHealthState } from "@/lib/clientAquaHealth";
import { clientWorkspaceHref } from "@/lib/clientWorkspace";

interface Props {
  clientId: string;
  clientName: string;
  logoUrl?: string;
  primaryColor: string;
  providerName: string;
  stageLabel: string;
  sourceLabel: string;
  products: Array<{ id: string; name: string; accentColor?: string }>;
  relationship: {
    score: number | null;
    state: AquaHealthState;
    openRequests: number;
  };
  delivery: {
    progress: number | null;
    openMilestones: number;
    blockedMilestones: number;
  };
  lastContactLabel: string;
  portalReady: boolean;
  contactRow: ReactNode;
  portalAction?: ReactNode;
  relationshipSwitcher?: ReactNode;
}

export function ClientWorkspaceHeader({
  clientId,
  clientName,
  logoUrl,
  primaryColor,
  providerName,
  stageLabel,
  sourceLabel,
  products,
  relationship,
  delivery,
  lastContactLabel,
  portalReady,
  contactRow,
  portalAction,
  relationshipSwitcher,
}: Props) {
  const initials = clientName.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "C";
  const relationshipTone = relationship.state === "risk" ? "risk" : relationship.state === "strong" ? "strong" : "watch";
  const deliveryTone = delivery.blockedMilestones > 0 ? "risk" : delivery.progress === null ? "watch" : "strong";

  return (
    <header className="mm-client-context" style={{ "--client-accent": primaryColor } as CSSProperties}>
      <div className="mm-client-context-primary">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-12 shrink-0 rounded-md object-cover sm:size-14" />
          ) : (
            <span aria-hidden className="mm-client-context-mark">{initials}</span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="mm-client-context-eyebrow">Client control room</p>
              <span className="mm-client-context-provider"><Building2 size={12} /> {providerName}</span>
              {relationshipSwitcher}
            </div>
            <h1 className="truncate text-2xl font-semibold text-black/90 sm:text-3xl">{clientName}</h1>
            <div className="mt-1 min-w-0">{contactRow}</div>
          </div>
        </div>

        <div className="mm-client-context-actions">
          <Link href={`/portal/agency/inbox?view=all&thread=profile:${encodeURIComponent(clientId)}`} className="mm-client-context-button">
            <Inbox size={15} /> Contact
          </Link>
          {products.length ? <Link href={clientWorkspaceHref(clientId, "portal")} className="mm-client-context-button">
            <PanelTop size={15} /> {portalReady ? "Open portal" : "Prepare portal"}
          </Link> : null}
          <Link href={`${clientWorkspaceHref(clientId, "delivery")}#service-assignment`} className="mm-client-context-button mm-client-context-button-primary">
            <Settings2 size={15} /> Services
          </Link>
          {portalAction}
        </div>
      </div>

      <div className="mm-client-context-stats">
        <ContextStat icon={PackageCheck} label="Lifecycle" value={stageLabel} detail={`Source · ${sourceLabel}`} />
        <ContextStat
          icon={FolderKanban}
          label="Services"
          value={products.length ? `${products.length} active` : "Assignment required"}
          detail={products.length ? products.map(product => product.name).join(" · ") : "Choose company and services"}
          tone={products.length ? "strong" : "watch"}
        />
        <ContextStat
          icon={HeartHandshake}
          label="Relationship health"
          value={relationship.score === null ? "Learning" : `${relationship.score}/100`}
          detail={`${relationship.openRequests} open request${relationship.openRequests === 1 ? "" : "s"}`}
          tone={relationshipTone}
        />
        <ContextStat
          icon={FolderKanban}
          label="Delivery"
          value={delivery.progress === null ? "Not started" : `${delivery.progress}% complete`}
          detail={`${delivery.openMilestones} open · ${delivery.blockedMilestones} blocked`}
          tone={deliveryTone}
        />
        <ContextStat icon={Inbox} label="Last contact" value={lastContactLabel} detail="Relationship cadence" tone={lastContactLabel === "Not recorded" ? "watch" : undefined} />
        <ContextStat
          icon={PanelTop}
          label="Client portal"
          value={portalReady ? "Ready" : "Setup required"}
          detail={portalReady ? "Client experience configured" : "Prepare access and content"}
          tone={portalReady ? "strong" : "watch"}
        />
      </div>

      {products.length ? (
        <div className="mm-client-context-products" aria-label="Assigned services">
          <span className="text-[10px] font-semibold uppercase text-black/38">Active service architecture</span>
          {products.map(product => (
            <Link key={product.id} href={clientWorkspaceHref(clientId, "delivery", { product: product.id })} className="mm-client-product-chip">
              <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: product.accentColor || primaryColor }} />
              {product.name}
              <ArrowUpRight size={12} />
            </Link>
          ))}
        </div>
      ) : (
        <Link href={`${clientWorkspaceHref(clientId, "delivery")}#service-assignment`} className="mm-client-assignment-alert">
          <CircleAlert size={16} /> This client has no service architecture yet. Assign the delivering company and services to activate their workspace.
        </Link>
      )}
    </header>
  );
}

function ContextStat({ icon: Icon, label, value, detail, tone }: {
  icon: typeof PackageCheck;
  label: string;
  value: string;
  detail: string;
  tone?: "risk" | "watch" | "strong";
}) {
  return (
    <div className="mm-client-context-stat" data-tone={tone}>
      <div className="flex items-center gap-2">
        <Icon size={14} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small title={detail}>{detail}</small>
    </div>
  );
}
