"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  FileSignature,
  GitBranch,
  HeartHandshake,
  Search,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import type { ClientAquaHealth, AquaHealthState } from "@/lib/clientAquaHealth";
import type { ClientContract, ClientContractTemplate } from "@/lib/clientContracts";
import { ContractsPanel } from "./[clientId]/_ContractsPanel";
import { FinanceTabClient } from "./[clientId]/_FinanceTabClient";
import { JourneyMeetingsWorkspace, type JourneyMeetingPerson } from "./_JourneyMeetingsWorkspace";

export interface JourneyCommercialClient {
  id: string;
  name: string;
  ownerEmail?: string;
  primaryColor: string;
  stageLabel: string;
  brandName?: string;
  serviceNames: string[];
  financeInitial: {
    planTier?: "foundational" | "expansion" | "mastery";
    servicePlan?: string;
    lockInPaid?: boolean;
    stripeLink?: string;
  };
  contracts: ClientContract[];
  aquaHealth: ClientAquaHealth;
}

type JourneyDesk = "pipeline" | "meetings" | "payments" | "contracts" | "aqua-health";

const DESKS: Array<{ id: JourneyDesk; label: string; detail: string; icon: typeof GitBranch }> = [
  { id: "pipeline", label: "Pipeline", detail: "Enquiries to clients", icon: GitBranch },
  { id: "meetings", label: "Meetings", detail: "Book, run and close", icon: CalendarClock },
  { id: "payments", label: "Payments", detail: "Request and reconcile", icon: WalletCards },
  { id: "contracts", label: "Contracts", detail: "Draft, send and accept", icon: FileSignature },
  { id: "aqua-health", label: "Aqua Health", detail: "Commercial relationship", icon: HeartHandshake },
];

export function JourneyCommercialWorkspace({
  pipeline,
  meetingPeople,
  referenceNow,
  clients,
  contractTemplates,
  canViewFinance,
}: {
  pipeline: ReactNode;
  meetingPeople: JourneyMeetingPerson[];
  referenceNow: number;
  clients: JourneyCommercialClient[];
  contractTemplates: ClientContractTemplate[];
  canViewFinance: boolean;
}) {
  const [desk, setDesk] = useState<JourneyDesk>("pipeline");
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [service, setService] = useState("");
  const selected = clients.find(client => client.id === selectedClientId) ?? clients[0];
  const brandOptions = useMemo(() => [...new Set(clients.map(client => client.brandName).filter((value): value is string => Boolean(value)))].sort(), [clients]);
  const serviceOptions = useMemo(() => [...new Set(clients.flatMap(client => client.serviceNames))].sort(), [clients]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter(client => (!brand || client.brandName === brand)
      && (!service || client.serviceNames.includes(service))
      && (!needle || `${client.name} ${client.ownerEmail ?? ""} ${client.brandName ?? ""} ${client.serviceNames.join(" ")}`.toLowerCase().includes(needle)));
  }, [brand, clients, query, service]);
  const attention = clients.filter(client => client.aquaHealth.state === "risk" || client.aquaHealth.state === "watch").length;

  return (
    <section className="min-w-0" data-testid="journey-commercial-workspace">
      <nav aria-label="Journey workspaces" className="grid gap-px overflow-hidden rounded-lg border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {DESKS.map(item => {
          const Icon = item.icon;
          const active = item.id === desk;
          const count = item.id === "aqua-health" ? attention : item.id === "contracts" ? clients.reduce((total, client) => total + client.contracts.filter(contract => contract.status === "sent").length, 0) : undefined;
          return <button key={item.id} type="button" onClick={() => setDesk(item.id)} className={`relative flex min-h-[72px] min-w-0 items-center gap-3 px-4 text-left ${active ? "bg-black text-white" : "bg-white text-black/70 hover:bg-black/[0.025]"}`}>
            <span className={`grid size-9 shrink-0 place-items-center rounded-md ${active ? "bg-white/12 text-white" : "bg-black/[0.045] text-brand"}`}><Icon size={17} /></span>
            <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold"><span className="truncate">{item.label}</span>{count ? <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] leading-none text-white">{count}</span> : null}</span><span className={`mt-0.5 block truncate text-xs ${active ? "text-white/55" : "text-black/40"}`}>{item.detail}</span></span>
          </button>;
        })}
      </nav>

      {desk === "pipeline" ? <div className="mt-5 min-w-0">{pipeline}</div> : null}
      {desk === "meetings" ? <div className="mt-7 min-w-0"><JourneyMeetingsWorkspace people={meetingPeople} referenceNow={referenceNow} /></div> : null}

      {desk !== "pipeline" && desk !== "meetings" ? <>
        <header className="mt-7 flex flex-col gap-4 border-b border-black/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Journey · {DESKS.find(item => item.id === desk)?.label}</p>
            <h2 className="mt-1 text-2xl font-semibold text-black/88">{desk === "payments" ? "Client payment desk" : desk === "contracts" ? "Agreement desk" : "Aqua Health"}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">{desk === "payments" ? "Create, issue and reconcile payment requests without losing the client journey context." : desk === "contracts" ? "Write bespoke terms or use product templates, retain every version and send the agreement to the client portal." : "Relationship health from payment behaviour, contact cadence, support pressure and commercial commitment. Operational delivery health remains a separate view."}</p>
          </div>
          {desk === "aqua-health" ? <HealthSummary clients={clients} /> : null}
        </header>

        <div className="mt-4 flex flex-wrap gap-2 border-b border-black/10 pb-4">
          <label className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find client, brand or service" className="min-h-10 w-full rounded-md border border-black/15 bg-white pl-9 pr-3 text-sm outline-none focus:border-black/35" />
          </label>
          <select value={brand} onChange={event => setBrand(event.target.value)} className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm text-black/65"><option value="">Every brand</option>{brandOptions.map(value => <option key={value}>{value}</option>)}</select>
          <select value={service} onChange={event => setService(event.target.value)} className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm text-black/65"><option value="">Every service</option>{serviceOptions.map(value => <option key={value}>{value}</option>)}</select>
        </div>

        {desk === "aqua-health" ? <AquaHealthPortfolio clients={filtered} onSelect={client => setSelectedClientId(client.id)} /> : (
          <div className="grid min-w-0 gap-6 pt-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <ClientRail clients={filtered} selectedClientId={selected?.id} onSelect={setSelectedClientId} />
            <div className="min-w-0">
              {selected ? <SelectedClientHeader client={selected} /> : null}
              {!selected ? <EmptyClients /> : desk === "payments" ? (
                canViewFinance ? <FinanceTabClient
                  key={selected.id}
                  clientId={selected.id}
                  clientName={selected.name}
                  recipientEmail={selected.ownerEmail}
                  initial={selected.financeInitial}
                  initialContracts={selected.contracts}
                  initialContractTemplates={contractTemplates}
                  showContracts={false}
                /> : <PermissionMessage />
              ) : <ContractsPanel
                key={selected.id}
                clientId={selected.id}
                clientName={selected.name}
                recipientEmail={selected.ownerEmail}
                initialContracts={selected.contracts}
                initialTemplates={contractTemplates}
              />}
            </div>
          </div>
        )}
      </> : null}
    </section>
  );
}

function HealthSummary({ clients }: { clients: JourneyCommercialClient[] }) {
  const counts = stateCounts(clients);
  return <dl className="grid grid-cols-4 divide-x divide-black/10 border-y border-black/10 text-center text-xs">
    {(["strong", "watch", "risk", "learning"] as AquaHealthState[]).map(state => <div key={state} className="min-w-16 px-3 py-2"><dt className="capitalize text-black/40">{state}</dt><dd className={`mt-0.5 text-base font-semibold ${state === "risk" ? "text-red-700" : state === "watch" ? "text-amber-700" : state === "strong" ? "text-emerald-700" : "text-blue-700"}`}>{counts[state]}</dd></div>)}
  </dl>;
}

function ClientRail({ clients, selectedClientId, onSelect }: { clients: JourneyCommercialClient[]; selectedClientId?: string; onSelect: (id: string) => void }) {
  return <aside className="min-w-0 border-r border-black/10 pr-4"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-black/40">Choose client · {clients.length}</p><div className="max-h-[720px] divide-y divide-black/[0.07] overflow-y-auto border-y border-black/10">
    {clients.map(client => <button key={client.id} type="button" onClick={() => onSelect(client.id)} className={`flex w-full items-center gap-3 px-2 py-3 text-left ${selectedClientId === client.id ? "bg-black/[0.055]" : "hover:bg-black/[0.025]"}`}><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: client.primaryColor }} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-black/78">{client.name}</span><span className="mt-0.5 block truncate text-xs text-black/42">{client.brandName || "No brand"} · {client.stageLabel}</span></span><ArrowRight size={13} className="text-black/25" /></button>)}
    {!clients.length ? <p className="px-2 py-6 text-sm text-black/45">No clients match these filters.</p> : null}
  </div></aside>;
}

function SelectedClientHeader({ client }: { client: JourneyCommercialClient }) {
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4"><div><div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: client.primaryColor }} /><h3 className="text-base font-semibold text-black/82">{client.name}</h3></div><p className="mt-1 text-xs text-black/45">{client.ownerEmail || "Client email missing"} · {client.serviceNames.join(" · ") || "No service assigned"}</p></div><Link href={`/portal/clients/${client.id}?tab=relationship`} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/15 px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">Open relationship <ArrowRight size={13} /></Link></div>;
}

function AquaHealthPortfolio({ clients, onSelect }: { clients: JourneyCommercialClient[]; onSelect: (client: JourneyCommercialClient) => void }) {
  return <div className="divide-y divide-black/[0.08] border-y border-black/10">
    {clients.map(client => <article key={client.id} className="grid gap-4 py-5 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-center">
      <button type="button" onClick={() => onSelect(client)} className="min-w-0 text-left"><div className="flex items-center gap-2"><HealthSignal state={client.aquaHealth.state} /><h3 className="truncate text-sm font-semibold text-black/82">{client.name}</h3></div><p className="mt-1 truncate text-xs text-black/42">{client.brandName || "No brand"} · {client.serviceNames.join(", ") || "No service"}</p></button>
      <div className="min-w-0"><div className="flex flex-wrap gap-2">{client.aquaHealth.factors.map(factor => <span key={factor.id} title={`${factor.detail} ${factor.evidence.join(" · ")}`} className={`rounded-full px-2 py-1 text-[10px] font-semibold ${stateClass(factor.state)}`}>{factor.label}: {factor.score === null ? "Learning" : factor.score}</span>)}</div><p className="mt-2 text-xs leading-5 text-black/50">{client.aquaHealth.summary}</p></div>
      <div className="flex items-center gap-4 lg:justify-end"><div className="text-right"><p className={`text-2xl font-semibold tabular-nums ${client.aquaHealth.state === "risk" ? "text-red-700" : "text-black/80"}`}>{client.aquaHealth.score ?? "—"}<span className="text-xs font-normal text-black/35">/100</span></p><p className="text-[10px] text-black/40">{client.aquaHealth.confidence}% evidence</p></div><Link href={`/portal/clients/${client.id}?tab=relationship`} title="Open relationship" className="grid size-9 place-items-center rounded-md border border-black/15 text-black/55"><ArrowRight size={14} /></Link></div>
    </article>)}
    {!clients.length ? <EmptyClients /> : null}
  </div>;
}

function HealthSignal({ state }: { state: AquaHealthState }) {
  return state === "strong" ? <ShieldCheck size={16} className="text-emerald-600" /> : <CircleAlert size={16} className={state === "risk" ? "text-red-600" : state === "watch" ? "text-amber-600" : "text-blue-600"} />;
}

function stateCounts(clients: JourneyCommercialClient[]): Record<AquaHealthState, number> {
  return clients.reduce((counts, client) => ({ ...counts, [client.aquaHealth.state]: counts[client.aquaHealth.state] + 1 }), { strong: 0, watch: 0, risk: 0, learning: 0 });
}

function stateClass(state: AquaHealthState): string {
  return state === "strong" ? "bg-emerald-50 text-emerald-700" : state === "risk" ? "bg-red-50 text-red-700" : state === "watch" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
}

function EmptyClients() {
  return <div className="py-12 text-center"><p className="text-sm font-semibold text-black/65">No client selected.</p><p className="mt-1 text-xs text-black/42">Add a client or change the filters to open this desk.</p></div>;
}

function PermissionMessage() {
  return <div className="border-y border-red-200 bg-red-50 px-4 py-6 text-sm text-red-800"><p className="font-semibold">Finance permission required</p><p className="mt-1 text-xs">Payments are visible only to roles with <code>finance.view</code>.</p></div>;
}
