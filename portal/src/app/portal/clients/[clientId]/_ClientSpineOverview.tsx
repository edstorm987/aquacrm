import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Clock3,
  FileUp,
  FolderKanban,
  HeartHandshake,
  Inbox,
  KeyRound,
  ListTodo,
  MessageSquareText,
  MonitorCog,
  NotebookPen,
  PanelTop,
  Phone,
  ReceiptText,
} from "lucide-react";
import type { AquaHealthState } from "@/lib/clients/clientAquaHealth";
import type { ClientOperationsBrief } from "@/lib/clients/clientOperations";
import type { ClientRadarSnapshot } from "@/engines/data/radar/businessRadar";
import { clientWorkspaceHref } from "@/lib/clients/clientWorkspace";
import { ClientOperationTaskButton } from "./_ClientOperationTaskButton";
import { ClientAdvancedControls } from "./_ClientAdvancedControls";
import { ClientOperatingPlan, type ClientAccountPlanStep, type ClientProductPlan } from "./_ClientOperatingPlan";
import { ClientOperationsControl, type ClientOperationOwnerOption } from "./_ClientOperationsControl";
import { ClientRadarPanel } from "./_ClientRadarPanel";

interface Props {
  clientId: string;
  relatedWorkspaces: Array<{
    id: string;
    name: string;
    label?: string;
    providerName: string;
    stageLabel: string;
    hasServices: boolean;
    serviceNames: string[];
    portalReady: boolean;
    openRequests: number;
    blockedMilestones: number;
    overdueMilestones: number;
    aquaHealthScore: number | null;
    aquaHealthState: AquaHealthState;
    aquaHealthConfidence: number;
    outstandingCents: number;
    currency: string;
    portalAccessState: "not-prepared" | "missing" | "ready" | "sent";
    current: boolean;
  }>;
  relationship: {
    score: number | null;
    confidence: number;
    state: AquaHealthState;
    summary: string;
    openRequests: number;
  };
  delivery: {
    progress: number | null;
    assignedProducts: number;
    openMilestones: number;
    blockedMilestones: number;
    overdueMilestones: number;
  };
  systems: {
    properties: number;
    tagsInstalled: number;
    tagsNeedingAttention: number;
    websiteConnected: boolean;
  } | null;
  hasServices: boolean;
  portalReady: boolean;
  portal: {
    accessState: "not-prepared" | "missing" | "ready" | "sent";
    pendingApprovals: number;
    sharedFiles: number;
    openRequests: number;
  };
  lastContactAt?: number;
  commercialGaps: string[];
  commercial: {
    activePlans: number;
    totalPlans: number;
    paymentState: string;
    paymentLabel: string;
    scheduledCents: number;
    paidCents: number;
    outstandingCents: number;
    currency: string;
    overdueMilestones: number;
    nextDueAt?: number;
    acceptedContracts: number;
    issuedInvoices: number;
  };
  operationsBrief: ClientOperationsBrief;
  operationOwners: ClientOperationOwnerOption[];
  acceptedOperationSourceIds: string[];
  canManageOperations: boolean;
  recentMovement: Array<{
    id: string;
    kind: "message" | "call" | "meeting" | "note" | "activity";
    title: string;
    detail?: string;
    occurredAt: number;
    href: string;
  }>;
  radar: ClientRadarSnapshot;
  productPlans: ClientProductPlan[];
  canManageProductPlans: boolean;
}

interface OperationItem {
  id: string;
  tone: "critical" | "attention" | "setup";
  title: string;
  detail: string;
  action: string;
  href: string;
}

export function ClientSpineOverview({ clientId, relatedWorkspaces, relationship, delivery, systems, hasServices, portalReady, portal, lastContactAt, commercialGaps, commercial, operationsBrief, operationOwners, acceptedOperationSourceIds, canManageOperations, recentMovement, radar, productPlans, canManageProductPlans }: Props) {
  const operations: OperationItem[] = [];
  if (!hasServices) operations.push({
    id: "services",
    tone: "critical",
    title: "Service assignment is missing",
    detail: "Choose the delivering company and purchased services before work begins.",
    action: "Assign services",
    href: `${clientWorkspaceHref(clientId, "delivery")}#service-assignment`,
  });
  if (delivery.blockedMilestones > 0) operations.push({
    id: "blocked-delivery",
    tone: "critical",
    title: `${delivery.blockedMilestones} delivery milestone${delivery.blockedMilestones === 1 ? " is" : "s are"} blocked`,
    detail: "Inspect the execution board, record the blocker and assign the next move.",
    action: "Resolve blockers",
    href: clientWorkspaceHref(clientId, "delivery"),
  });
  if (delivery.overdueMilestones > 0) operations.push({
    id: "overdue-delivery",
    tone: "critical",
    title: `${delivery.overdueMilestones} milestone${delivery.overdueMilestones === 1 ? " is" : "s are"} overdue`,
    detail: "Review the target date and update the delivery record before the client is surprised.",
    action: "Review delivery",
    href: clientWorkspaceHref(clientId, "delivery"),
  });
  if (relationship.state === "risk") operations.push({
    id: "relationship",
    tone: "critical",
    title: "Relationship health needs intervention",
    detail: relationship.summary,
    action: "Open relationship",
    href: clientWorkspaceHref(clientId, "relationship"),
  });
  if (relationship.openRequests > 0) operations.push({
    id: "requests",
    tone: "attention",
    title: `${relationship.openRequests} client request${relationship.openRequests === 1 ? " awaits" : "s await"} action`,
    detail: "Read the request, reply in context and retain the resolution on the client record.",
    action: "Open messages",
    href: clientWorkspaceHref(clientId, "communications"),
  });
  if (commercialGaps.length > 0) operations.push({
    id: "commercial",
    tone: "attention",
    title: `${commercialGaps.length} commercial record${commercialGaps.length === 1 ? " needs" : "s need"} attention`,
    detail: commercialGaps.join(" · "),
    action: "Open commercial",
    href: clientWorkspaceHref(clientId, "finance"),
  });
  if (systems?.tagsNeedingAttention) operations.push({
    id: "systems",
    tone: "attention",
    title: `${systems.tagsNeedingAttention} technical record${systems.tagsNeedingAttention === 1 ? " needs" : "s need"} attention`,
    detail: "Inspect missing or broken telemetry so client performance remains observable.",
    action: "Open systems",
    href: clientWorkspaceHref(clientId, "systems"),
  });
  if (hasServices && !portalReady) operations.push({
    id: "portal",
    tone: "setup",
    title: "Client portal is not ready",
    detail: "Prepare the shared experience before sending access to the client.",
    action: "Prepare portal",
    href: clientWorkspaceHref(clientId, "portal"),
  });
  if (portal.pendingApprovals > 0) operations.push({
    id: "portal-approvals",
    tone: "attention",
    title: `${portal.pendingApprovals} portal decision${portal.pendingApprovals === 1 ? " is" : "s are"} waiting`,
    detail: "Review the pending decision, follow up with the client and retain the outcome on the shared record.",
    action: "Open approvals",
    href: clientWorkspaceHref(clientId, "portal"),
  });
  if (portalReady && portal.accessState === "missing") operations.push({
    id: "portal-access-missing",
    tone: "attention",
    title: "Portal access cannot be sent",
    detail: "Add the correct client access email before attempting an invitation.",
    action: "Add access",
    href: clientWorkspaceHref(clientId, "portal"),
  });
  if (portalReady && portal.accessState === "ready") operations.push({
    id: "portal-invite-ready",
    tone: "setup",
    title: "Portal invitation is ready to send",
    detail: "Review the client-facing experience, then issue the prepared access invitation.",
    action: "Send access",
    href: clientWorkspaceHref(clientId, "portal"),
  });
  if (!lastContactAt) operations.push({
    id: "contact",
    tone: "setup",
    title: "No client contact has been recorded",
    detail: "Contact the client or retain the latest interaction so relationship cadence is trustworthy.",
    action: "Open messages",
    href: clientWorkspaceHref(clientId, "communications"),
  });
  const handoverGaps = [
    !operationsBrief.ownerName ? "owner" : null,
    operationsBrief.state === "unassigned" ? "account state" : null,
    !operationsBrief.currentObjective ? "current objective" : null,
    !operationsBrief.nextReviewAt ? "next review" : null,
  ].filter((gap): gap is string => Boolean(gap));
  if (handoverGaps.length) operations.push({
    id: "handover",
    tone: "setup",
    title: "Operational handover is incomplete",
    detail: `Add ${handoverGaps.join(", ")} so another operator can take over without reconstructing the account.`,
    action: "Complete brief",
    href: `${clientWorkspaceHref(clientId, "overview")}?tab=overview#operational-brief`,
  });
  if (operationsBrief.nextReviewAt && operationsBrief.nextReviewAt < Date.now()) operations.unshift({
    id: "account-review-overdue",
    tone: "critical",
    title: "Account review is overdue",
    detail: `The retained review date passed on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(operationsBrief.nextReviewAt)}. Review the account and set the next checkpoint.`,
    action: "Review account",
    href: `${clientWorkspaceHref(clientId, "overview")}?tab=overview#operational-brief`,
  });
  if (operationsBrief.state === "at-risk") operations.unshift({
    id: "account-state-risk",
    tone: "critical",
    title: "Account is explicitly marked at risk",
    detail: operationsBrief.riskSummary || "Record the risk, owner and recovery move before more work proceeds.",
    action: "Open handover",
    href: `${clientWorkspaceHref(clientId, "overview")}?tab=overview#operational-brief`,
  });
  if (operationsBrief.state === "waiting-client" || operationsBrief.state === "paused") operations.push({
    id: "account-state-waiting",
    tone: "attention",
    title: operationsBrief.state === "paused" ? "Account delivery is paused" : "Account is waiting on the client",
    detail: operationsBrief.riskSummary || "Confirm the dependency, retain the next follow-up and keep the client informed.",
    action: "Open handover",
    href: `${clientWorkspaceHref(clientId, "overview")}?tab=overview#operational-brief`,
  });
  const criticalCount = operations.filter(item => item.tone === "critical").length;
  const primaryOperation = operations[0];
  const priorityOperations = operations.slice(0, 3);
  const heldOperations = operations.slice(3);
  const portfolioAttentionCount = relatedWorkspaces.filter(workspace =>
    !workspace.hasServices
    || !workspace.portalReady
    || workspace.openRequests > 0
    || workspace.blockedMilestones > 0
    || workspace.overdueMilestones > 0
    || workspace.aquaHealthState === "risk"
    || workspace.outstandingCents > 0
    || (workspace.portalReady && workspace.portalAccessState !== "sent"),
  ).length;
  const radarAttentionCount = radar.totals.critical + radar.totals.warning + radar.totals.watch;
  const processSteps: ClientAccountPlanStep[] = [
    {
      id: "relationship",
      number: "01",
      label: "Know the client",
      title: relationship.state === "risk" ? "Relationship needs a touchpoint" : relationship.score === null ? "Build the relationship record" : "Relationship context retained",
      detail: relationship.openRequests
        ? `${relationship.openRequests} open request${relationship.openRequests === 1 ? "" : "s"} need a response.`
        : relationship.summary,
      state: relationship.state === "risk" || relationship.openRequests ? "attention" : relationship.score === null ? "setup" : "done",
      action: "Open relationship",
      href: clientWorkspaceHref(clientId, "relationship"),
    },
    {
      id: "agreement",
      number: "02",
      label: "Agree the work",
      title: !hasServices ? "Assign the company and services" : commercialGaps.length ? "Complete the commercial record" : "Scope and terms retained",
      detail: !hasServices
        ? "Choose what this client bought and which company delivers it."
        : commercialGaps.length
          ? commercialGaps.slice(0, 2).join(" · ")
          : `${delivery.assignedProducts} service${delivery.assignedProducts === 1 ? "" : "s"} · ${commercial.acceptedContracts} accepted agreement${commercial.acceptedContracts === 1 ? "" : "s"}.`,
      state: !hasServices ? "setup" : commercialGaps.length ? "attention" : "done",
      action: !hasServices ? "Assign services" : "Open commercial",
      href: !hasServices ? `${clientWorkspaceHref(clientId, "delivery")}#service-assignment` : clientWorkspaceHref(clientId, "finance"),
    },
    {
      id: "delivery",
      number: "03",
      label: "Deliver with playbooks",
      title: !hasServices ? "Delivery waits for scope" : delivery.blockedMilestones || delivery.overdueMilestones ? "Delivery needs intervention" : delivery.progress === 100 ? "Delivery is complete" : "Work the delivery plan",
      detail: !hasServices
        ? "The board and playbooks activate from the assigned services."
        : `${delivery.progress ?? 0}% complete · ${delivery.openMilestones} open milestone${delivery.openMilestones === 1 ? "" : "s"}.`,
      state: !hasServices ? "setup" : delivery.blockedMilestones || delivery.overdueMilestones ? "attention" : delivery.progress === 100 ? "done" : "active",
      action: "Open delivery",
      href: clientWorkspaceHref(clientId, "delivery"),
      secondaryAction: hasServices ? "Linked SOPs" : "Set up SOPs",
      secondaryHref: hasServices ? `${clientWorkspaceHref(clientId, "delivery")}#client-sops` : `${clientWorkspaceHref(clientId, "delivery")}#service-assignment`,
    },
    {
      id: "experience",
      number: "04",
      label: "Keep them informed",
      title: relationship.openRequests || portal.pendingApprovals ? "A client response is waiting" : !portalReady ? "Prepare the shared experience" : portal.accessState === "sent" ? "Client access is live" : "Finish portal access",
      detail: `${portal.openRequests} open request${portal.openRequests === 1 ? "" : "s"} · ${portal.pendingApprovals} decision${portal.pendingApprovals === 1 ? "" : "s"} waiting.`,
      state: relationship.openRequests || portal.pendingApprovals ? "attention" : !portalReady || portal.accessState !== "sent" ? "setup" : "done",
      action: relationship.openRequests ? "Open messages" : "Open portal",
      href: relationship.openRequests ? clientWorkspaceHref(clientId, "communications") : clientWorkspaceHref(clientId, "portal"),
    },
    {
      id: "review",
      number: "05",
      label: "Review and improve",
      title: radarAttentionCount ? `${radarAttentionCount} signal${radarAttentionCount === 1 ? "" : "s"} need review` : handoverGaps.length ? "Complete the operating brief" : "Client controls are current",
      detail: `${radar.totals.live} adaptive checks · ${radar.confidencePercent}% evidence confidence.`,
      state: radar.totals.critical || radar.totals.warning ? "attention" : handoverGaps.length ? "setup" : radarAttentionCount ? "active" : "done",
      action: "Open advanced review",
      href: `${clientWorkspaceHref(clientId, "overview")}?tab=overview#advanced-client-controls`,
    },
  ];

  return (
    <div className="grid gap-6">
      <section className={`mm-client-next-move overflow-hidden border bg-white ${primaryOperation?.tone === "critical" ? "mm-client-next-move--critical" : primaryOperation ? "mm-client-next-move--attention" : "mm-client-next-move--clear"}`}>
        <div className="mm-client-section-intro grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-start gap-4">
            <span className={`grid size-11 shrink-0 place-items-center rounded-md ${primaryOperation?.tone === "critical" ? "bg-red-50 text-red-700" : primaryOperation ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
              {primaryOperation ? <ArrowRight size={19} /> : <CheckCircle2 size={19} />}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#315b85]">Next best move</p>
              <h2 className="mt-1 text-xl font-semibold text-black/88">{primaryOperation?.title ?? "The client operation is clear"}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-black/55">{primaryOperation?.detail ?? "Continue the agreed delivery plan and retain the next client interaction."}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {criticalCount ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase text-red-700">{criticalCount} critical</span> : null}
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${operations.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{operations.length ? `${operations.length} open` : "Clear"}</span>
            <Link href={primaryOperation?.href ?? clientWorkspaceHref(clientId, "delivery")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#12385d] px-4 text-xs font-semibold text-white hover:bg-[#0d2c4a]">
              {primaryOperation?.action ?? "Open delivery"} <ArrowRight size={13} />
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-black/[0.08] sm:grid-cols-3 xl:grid-cols-6">
          <CommandAction icon={MessageSquareText} label="Message" detail="Open conversation" href={clientWorkspaceHref(clientId, "communications")} />
          <CommandAction icon={Phone} label="Call" detail="Client communications" href={clientWorkspaceHref(clientId, "communications")} />
          <CommandAction icon={NotebookPen} label="Add note" detail="Update client record" href={`${clientWorkspaceHref(clientId, "notes")}#client-record`} />
          <CommandAction icon={ListTodo} label="Review priorities" detail="Client operating plan" href={clientWorkspaceHref(clientId, "overview")} />
          <CommandAction icon={FileUp} label="Upload file" detail="Files and evidence" href={clientWorkspaceHref(clientId, "files")} />
          <CommandAction icon={ReceiptText} label="Payment" detail="Contracts and plans" href={clientWorkspaceHref(clientId, "finance")} />
        </div>
      </section>

      <section className="mm-client-process overflow-hidden border border-black/10 bg-white" aria-labelledby="client-process-heading">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-black/[0.08] px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#315b85]">Client operating plan</p>
            <h2 id="client-process-heading" className="mt-1 text-lg font-semibold text-black/82">One account process, with a bespoke playbook for every service</h2>
            <p className="mt-1 text-xs leading-5 text-black/45">Switch scope instead of loading every workflow at once. Product processes are controlled from the product editor.</p>
          </div>
          <Link href={hasServices ? `${clientWorkspaceHref(clientId, "delivery", { mode: "advanced" })}#client-sops` : `${clientWorkspaceHref(clientId, "delivery")}#service-assignment`} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]">
            <BookOpen size={14} /> {hasServices ? "Open linked SOPs" : "Assign services to link SOPs"}
          </Link>
        </header>
        <ClientOperatingPlan clientId={clientId} accountSteps={processSteps} products={productPlans} canManage={canManageProductPlans} />
      </section>

      {relatedWorkspaces.length > 1 ? (
        <section className="overflow-hidden border border-black/10 bg-white" aria-labelledby="buyer-workspaces-heading">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 px-5 py-4">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">Buyer portfolio</p><h2 id="buyer-workspaces-heading" className="mt-1 text-lg font-semibold text-black/82">{relatedWorkspaces.length} isolated client workspaces</h2><p className="mt-1 text-xs leading-5 text-black/45">Use the relationship for context; use the workspace for contracts, money, files, delivery and portal changes.</p></div>
            <div className="flex flex-wrap items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${portfolioAttentionCount ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{portfolioAttentionCount ? `${portfolioAttentionCount} workspace${portfolioAttentionCount === 1 ? "" : "s"} need attention` : "All workspaces ready"}</span><Link href={`${clientWorkspaceHref(clientId, "notes")}#client-record`} className="text-xs font-semibold text-[#087f8c]">Open relationship history <ArrowRight size={13} className="ml-1 inline" /></Link></div>
          </header>
          <div className="divide-y divide-black/[0.07]">
            {relatedWorkspaces.map(workspace => {
              const readiness = !workspace.hasServices ? "Services needed" : !workspace.portalReady ? "Portal setup" : workspace.portalAccessState === "missing" ? "Access needed" : workspace.portalAccessState === "ready" ? "Invite ready" : "Ready";
              const readinessClass = !workspace.hasServices || workspace.portalAccessState === "missing" ? "bg-red-50 text-red-700" : !workspace.portalReady || workspace.portalAccessState === "ready" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700";
              const deliveryAttention = workspace.blockedMilestones + workspace.overdueMilestones;
              const healthClass = workspace.aquaHealthState === "risk" ? "bg-red-50 text-red-700" : workspace.aquaHealthState === "watch" ? "bg-amber-50 text-amber-800" : workspace.aquaHealthState === "strong" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700";
              return <div key={workspace.id} className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-md ${workspace.current ? "bg-[#e8f4f3] text-[#087f8c]" : "bg-black/[0.045] text-black/48"}`}><Building2 size={17} /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-black/80">{workspace.name}</h3>
                      {workspace.current ? <span className="text-[10px] font-semibold uppercase text-[#087f8c]">Current</span> : null}
                      <Link href={!workspace.hasServices ? `${clientWorkspaceHref(workspace.id, "delivery")}#service-assignment` : clientWorkspaceHref(workspace.id, "portal")} title={`Open ${readiness.toLowerCase()} controls`} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold hover:brightness-95 ${readinessClass}`}>{readiness}</Link>
                    </div>
                    <p className="mt-1 truncate text-xs text-black/45">{workspace.label || "General workspace"} · {workspace.providerName} · Account: {workspace.stageLabel}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                      <Link href={`${clientWorkspaceHref(workspace.id, "delivery")}#service-assignment`} title="Open service assignment and delivery" className="rounded-full bg-black/[0.045] px-2 py-1 text-black/52 hover:bg-black/[0.075]">{workspace.serviceNames.length ? `${workspace.serviceNames.slice(0, 2).join(" · ")}${workspace.serviceNames.length > 2 ? ` +${workspace.serviceNames.length - 2}` : ""}` : "No services assigned"}</Link>
                      <Link href={clientWorkspaceHref(workspace.id, "relationship")} title={`Open Aqua Health · ${workspace.aquaHealthConfidence}% evidence confidence`} className={`rounded-full px-2 py-1 hover:brightness-95 ${healthClass}`}>Aqua Health {workspace.aquaHealthScore === null ? "learning" : `${workspace.aquaHealthScore}/100`}</Link>
                      {workspace.outstandingCents ? <Link href={clientWorkspaceHref(workspace.id, "finance")} title="Open contracts, invoices and payment plans" className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-700 hover:bg-red-100"><ReceiptText size={11} /> {formatMoney(workspace.outstandingCents, workspace.currency)} outstanding</Link> : null}
                      {workspace.openRequests ? <Link href={clientWorkspaceHref(workspace.id, "communications")} title="Open client requests and messages" className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-800 hover:bg-amber-100"><Inbox size={11} /> {workspace.openRequests} open request{workspace.openRequests === 1 ? "" : "s"}</Link> : null}
                      {deliveryAttention ? <Link href={clientWorkspaceHref(workspace.id, "delivery")} title={`${workspace.blockedMilestones} blocked · ${workspace.overdueMilestones} overdue`} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-700 hover:bg-red-100"><CircleAlert size={11} /> {deliveryAttention} delivery issue{deliveryAttention === 1 ? "" : "s"}</Link> : null}
                      {workspace.hasServices && !workspace.openRequests && !deliveryAttention && !workspace.outstandingCents ? <Link href={clientWorkspaceHref(workspace.id, "overview")} title="Open workspace operating picture" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 size={11} /> Operations clear</Link> : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">{!workspace.current ? <Link href={`/portal/clients/${encodeURIComponent(workspace.id)}`} className="inline-flex min-h-9 items-center rounded-md border border-black/12 px-3 text-xs font-semibold text-black/60">Open workspace</Link> : null}{!workspace.hasServices ? <Link href={`${clientWorkspaceHref(workspace.id, "delivery")}#service-assignment`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white"><ClipboardList size={13} /> Assign services</Link> : !workspace.portalReady ? <Link href={clientWorkspaceHref(workspace.id, "portal")} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white"><PanelTop size={13} /> Prepare portal</Link> : workspace.portalAccessState !== "sent" ? <Link href={clientWorkspaceHref(workspace.id, "portal")} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white"><KeyRound size={13} /> Manage access</Link> : <Link href={`/client-preview/${encodeURIComponent(workspace.id)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/60"><PanelTop size={13} /> View portal</Link>}</div>
              </div>;
            })}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden border border-black/10 bg-white" aria-labelledby="client-operations-heading">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/[0.04] text-black/55"><ClipboardList size={17} /></span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">Operations desk</p>
              <h2 id="client-operations-heading" className="mt-1 text-lg font-semibold text-black/82">Work the client in this order</h2>
              <p className="mt-1 text-xs leading-5 text-black/45">One queue assembled from relationship, delivery, commercial, portal and system records.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase">
            {criticalCount ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{criticalCount} critical</span> : null}
            <span className={`rounded-full px-2.5 py-1 ${operations.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
              {operations.length ? `${operations.length} open` : "Clear"}
            </span>
          </div>
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="divide-y divide-black/[0.07]">
            {priorityOperations.length ? priorityOperations.map((item, index) => <OperationRow
              key={item.id}
              item={item}
              index={index}
              clientId={clientId}
              canManageOperations={canManageOperations}
              accepted={acceptedOperationSourceIds.includes(`client:${clientId}:operation:${item.id}`)}
            />) : (
              <div className="flex min-h-40 items-center gap-4 px-5 py-6">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={19} /></span>
                <div><p className="text-sm font-semibold text-black/72">No operational blocker is recorded</p><p className="mt-1 text-xs leading-5 text-black/45">Continue the delivery plan and retain the next client interaction.</p></div>
              </div>
            )}
            {heldOperations.length ? (
              <details className="group bg-black/[0.012]">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-xs font-semibold text-black/58 hover:bg-black/[0.025]">
                  <span>{heldOperations.length} additional operational check{heldOperations.length === 1 ? "" : "s"}</span>
                  <span className="text-[10px] uppercase text-black/38 group-open:hidden">Show</span>
                  <span className="hidden text-[10px] uppercase text-black/38 group-open:inline">Hide</span>
                </summary>
                <div className="divide-y divide-black/[0.07] border-t border-black/[0.07]">
                  {heldOperations.map((item, index) => <OperationRow
                    key={item.id}
                    item={item}
                    index={index + priorityOperations.length}
                    clientId={clientId}
                    canManageOperations={canManageOperations}
                    accepted={acceptedOperationSourceIds.includes(`client:${clientId}:operation:${item.id}`)}
                  />)}
                </div>
              </details>
            ) : null}
          </div>
          <aside className="border-t border-black/10 bg-black/[0.018] lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">Client movement</p><p className="mt-1 text-xs font-semibold text-black/65">Latest retained events</p></div>
              <Link href={`${clientWorkspaceHref(clientId, "notes")}#client-record`} className="text-[10px] font-semibold uppercase text-[#087f8c]">Full record</Link>
            </div>
            <div className="divide-y divide-black/[0.06]">
              {recentMovement.length ? recentMovement.slice(0, 6).map(item => <MovementRow key={`${item.kind}:${item.id}`} item={item} />) : (
                <div className="px-4 py-8 text-center"><Clock3 size={18} className="mx-auto text-black/25" /><p className="mt-2 text-xs font-semibold text-black/52">No retained movement yet</p><p className="mt-1 text-[11px] leading-4 text-black/38">Messages, calls, notes and operational changes will appear here.</p></div>
              )}
            </div>
          </aside>
        </div>
      </section>

      <ClientAdvancedControls signalCount={radarAttentionCount} liveChecks={radar.totals.live}>
          <div id="client-radar" className="scroll-mt-24"><ClientRadarPanel initialRadar={radar} /></div>
          <section className={`mm-client-lens-grid grid gap-px overflow-hidden border border-black/10 bg-black/10 md:grid-cols-2 ${systems ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        <Lens
          icon={HeartHandshake}
          eyebrow="Relationship"
          title="Aqua Health"
          value={relationship.score === null ? "Learning" : `${relationship.score}/100`}
          detail={`${relationship.confidence}% evidence confidence · ${relationship.openRequests} open request${relationship.openRequests === 1 ? "" : "s"}`}
          summary={relationship.summary}
          tone={relationship.state === "risk" ? "risk" : relationship.state === "strong" ? "strong" : "watch"}
          href={clientWorkspaceHref(clientId, "relationship")}
        />
        <Lens
          icon={FolderKanban}
          eyebrow="Delivery"
          title="Delivery progress"
          value={delivery.progress === null ? "Not started" : `${delivery.progress}%`}
          detail={`${delivery.assignedProducts} assigned product${delivery.assignedProducts === 1 ? "" : "s"} · ${delivery.openMilestones} open milestone${delivery.openMilestones === 1 ? "" : "s"}`}
          summary={delivery.blockedMilestones || delivery.overdueMilestones
            ? `${delivery.blockedMilestones} blocked and ${delivery.overdueMilestones} overdue milestone${delivery.overdueMilestones === 1 ? "" : "s"} need attention.`
            : "No blocked or overdue delivery milestone is recorded."}
          tone={delivery.blockedMilestones || delivery.overdueMilestones ? "risk" : delivery.assignedProducts ? "strong" : "watch"}
          href={clientWorkspaceHref(clientId, "delivery")}
        />
        <Lens
          icon={ReceiptText}
          eyebrow="Commercial"
          title="Contracts & payment plan"
          value={commercial.paymentLabel}
          detail={commercial.scheduledCents
            ? `${formatMoney(commercial.paidCents, commercial.currency)} of ${formatMoney(commercial.scheduledCents, commercial.currency)} collected · ${formatMoney(commercial.outstandingCents, commercial.currency)} outstanding`
            : `${commercial.acceptedContracts} accepted agreement${commercial.acceptedContracts === 1 ? "" : "s"} · ${commercial.issuedInvoices} invoice${commercial.issuedInvoices === 1 ? "" : "s"}`}
          summary={commercial.overdueMilestones
            ? `${commercial.overdueMilestones} payment milestone${commercial.overdueMilestones === 1 ? " is" : "s are"} overdue and need an exact next action.`
            : commercial.nextDueAt
              ? `The next planned payment is due ${formatDate(commercial.nextDueAt)}.`
              : commercial.totalPlans
                ? "Every retained payment milestone is currently resolved or has no upcoming due date."
                : "Create a contract-backed payment schedule, then issue each milestone as a canonical invoice."}
          tone={commercial.paymentState === "missed-payment" || commercialGaps.length ? "risk" : commercial.paymentState === "paid-in-full" ? "strong" : "watch"}
          href={clientWorkspaceHref(clientId, "finance")}
        />
        <Lens
          icon={PanelTop}
          eyebrow="Client portal"
          title="Shared experience"
          value={portal.pendingApprovals
            ? `${portal.pendingApprovals} waiting`
            : portal.accessState === "sent"
              ? "Live"
              : portal.accessState === "ready"
                ? "Invite ready"
                : portalReady
                  ? "Access needed"
                  : "Setup"}
          detail={`${portal.sharedFiles} shared file${portal.sharedFiles === 1 ? "" : "s"} · ${portal.openRequests} open request${portal.openRequests === 1 ? "" : "s"}`}
          summary={portal.pendingApprovals
            ? `${portal.pendingApprovals} client decision${portal.pendingApprovals === 1 ? " is" : "s are"} waiting for a response.`
            : !hasServices
              ? "Assign a service before preparing a client-facing experience."
              : !portalReady
                ? "Prepare the portal from the assigned services and review it before invitation."
                : portal.accessState === "missing"
                  ? "Add a client access email before the portal can be invited."
                  : portal.accessState === "ready"
                    ? "Portal access is prepared and ready to send."
                    : "Portal access has been sent and the shared workspace is operational."}
          tone={portal.pendingApprovals || portal.accessState === "missing" ? "risk" : portal.accessState === "sent" ? "strong" : "watch"}
          href={clientWorkspaceHref(clientId, "portal")}
        />
        {systems ? <Lens
          icon={MonitorCog}
          eyebrow="Systems & performance"
          title="Technical coverage"
          value={`${systems.tagsInstalled}/${systems.properties}`}
          detail={`Aqua tags installed · ${systems.tagsNeedingAttention} tag record${systems.tagsNeedingAttention === 1 ? "" : "s"} need attention`}
          summary={systems.websiteConnected
            ? "A live website is connected to this client record. Open Systems for telemetry and deployment evidence."
            : "No live website URL is connected to this client record."}
          tone={systems.tagsNeedingAttention || !systems.websiteConnected ? "watch" : "strong"}
          href={clientWorkspaceHref(clientId, "systems")}
        /> : null}
          </section>

          <ClientOperationsControl
            clientId={clientId}
            initial={operationsBrief}
            owners={operationOwners}
            canManage={canManageOperations}
          />
      </ClientAdvancedControls>
    </div>
  );
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(Math.max(0, cents) / 100);
  } catch {
    return `${currency.toUpperCase()} ${(Math.max(0, cents) / 100).toFixed(0)}`;
  }
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(value);
}

function OperationRow({ item, index, clientId, canManageOperations, accepted }: {
  item: OperationItem;
  index: number;
  clientId: string;
  canManageOperations: boolean;
  accepted: boolean;
}) {
  const tone = item.tone === "critical"
    ? { border: "border-red-500", badge: "bg-red-50 text-red-700", icon: "text-red-600" }
    : item.tone === "attention"
      ? { border: "border-amber-400", badge: "bg-amber-50 text-amber-700", icon: "text-amber-600" }
      : { border: "border-sky-400", badge: "bg-sky-50 text-sky-700", icon: "text-sky-600" };
  return (
    <article className={`grid gap-3 border-l-2 px-5 py-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center ${tone.border}`}>
      <span className={`text-xs font-semibold tabular-nums ${tone.icon}`}>{String(index + 1).padStart(2, "0")}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-black/75">{item.title}</h3>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${tone.badge}`}>{item.tone}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-black/45">{item.detail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {item.href.endsWith("#operational-brief") ? (
          <a href={item.href} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03] hover:text-black">
            {item.action} <ArrowRight size={12} />
          </a>
        ) : (
          <Link href={item.href} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03] hover:text-black">
            {item.action} <ArrowRight size={12} />
          </Link>
        )}
        {canManageOperations ? <ClientOperationTaskButton
          clientId={clientId}
          operationId={item.id}
          title={item.title}
          detail={item.detail}
          href={item.href}
          priority={item.tone === "critical" ? "urgent" : item.tone === "attention" ? "high" : "normal"}
          initialAccepted={accepted}
        /> : null}
      </div>
    </article>
  );
}

function CommandAction({ icon: Icon, label, detail, href }: { icon: typeof Inbox; label: string; detail: string; href: string }) {
  return (
    <Link href={href} title={`${label}: ${detail}`} className="group flex min-h-14 items-center gap-2.5 border-b border-black/[0.08] px-4 py-2.5 hover:bg-[#f4f8fb] sm:border-r xl:border-b-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#edf4f8] text-[#315b85] transition-colors group-hover:bg-[#12385d] group-hover:text-white"><Icon size={15} /></span>
      <span className="min-w-0 text-xs font-semibold text-black/70">{label}<span className="sr-only">: {detail}</span></span>
      <ArrowRight size={11} className="ml-auto shrink-0 text-black/25" />
    </Link>
  );
}

function MovementRow({ item }: { item: Props["recentMovement"][number] }) {
  const Icon = item.kind === "message" ? MessageSquareText : item.kind === "call" ? Phone : item.kind === "note" ? NotebookPen : Clock3;
  return (
    <Link href={item.href} title={`${item.title} · ${formatMovementTime(item.occurredAt)}`} className="group flex gap-3 px-4 py-3 hover:bg-white">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-white text-black/40 ring-1 ring-black/[0.07] group-hover:text-[#087f8c]"><Icon size={13} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-black/65">{item.title}</span>{item.detail ? <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-black/38">{item.detail}</span> : null}<span className="mt-1 block text-[9px] font-semibold uppercase text-black/30">{item.kind} · {formatMovementTime(item.occurredAt)}</span></span>
    </Link>
  );
}

function formatMovementTime(value: number): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

function Lens({ icon: Icon, eyebrow, title, value, detail, summary, tone, href }: {
  icon: typeof HeartHandshake;
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  summary: string;
  tone: "risk" | "watch" | "strong";
  href: string;
}) {
  const toneClass = tone === "risk" ? "text-red-700" : tone === "strong" ? "text-emerald-700" : "text-amber-700";
  return (
    <article className="mm-client-lens flex min-h-64 flex-col bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 place-items-center rounded-md bg-black/[0.04] text-black/55"><Icon size={18} /></span>
        {tone !== "strong" ? <CircleAlert size={17} className={toneClass} aria-label={`${tone} state`} /> : null}
      </div>
      <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">{eyebrow}</p>
      <h3 className="mt-1 text-sm font-semibold text-black/75">{title}</h3>
      <p className={`mt-3 text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-black/45">{detail}</p>
      <p className="mt-4 flex-1 text-sm leading-6 text-black/58">{summary}</p>
      <Link href={href} className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-black/68 hover:text-black">
        Open lens <ArrowRight size={13} />
      </Link>
    </article>
  );
}
