"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, Mail, Phone, Plus, Search, UserRound, X } from "lucide-react";

import { NewClientButton, type NewClientDefaults, type NewClientProductOption } from "@/app/portal/agency/_NewClientButton";

export type ContactRole = "lead" | "customer" | "account" | "vendor" | "employee" | "other";

export interface HubClient {
  id: string;
  name: string;
  ownerEmail?: string;
  websiteUrl?: string;
  stageLabel: string;
  status: string;
  primaryColor: string;
  source: string;
  niche?: string;
  lastContactedAt?: number;
  health: "healthy" | "attention";
  healthNotes: string[];
}

export interface HubContact {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  tags: string[];
  type: ContactRole;
  source: string;
  notes?: string;
  recordKind: "contact" | "lead";
}

type View = "all" | "clients" | "health" | "contacts" | "staff";

const roleLabels: Record<ContactRole, string> = {
  lead: "Lead",
  customer: "Client contact",
  account: "Account contact",
  vendor: "Supplier",
  employee: "Employee",
  other: "Other",
};

export function PeopleHub({
  clients,
  contacts,
  initialView,
  products,
  clientDefaults,
}: {
  clients: HubClient[];
  contacts: HubContact[];
  initialView: View;
  products: NewClientProductOption[];
  clientDefaults: NewClientDefaults;
}) {
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<ContactRole | "all">("all");
  const [niche, setNiche] = useState("");
  const [clientStatus, setClientStatus] = useState<"all" | "active" | "suspended">("all");
  const [addingContact, setAddingContact] = useState(false);

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter(client => !niche || client.niche === niche)
      .filter(client => clientStatus === "all" || client.status === clientStatus)
      .filter(client => !q || `${client.name} ${client.ownerEmail ?? ""} ${client.websiteUrl ?? ""} ${client.stageLabel} ${client.source} ${client.niche ?? ""}`.toLowerCase().includes(q));
  }, [clientStatus, clients, niche, query]);

  const availableNiches = useMemo(
    () => [...new Set(clients.map(client => client.niche).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
    [clients],
  );

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter(contact => {
      if (view === "staff" && contact.type !== "employee") return false;
      if (view !== "staff" && role !== "all" && contact.type !== role) return false;
      return !q || `${contact.name ?? ""} ${contact.email} ${contact.phone ?? ""} ${contact.company ?? ""} ${contact.notes ?? ""} ${contact.tags.join(" ")}`.toLowerCase().includes(q);
    });
  }, [contacts, query, role, view]);

  const staffCount = useMemo(() => contacts.filter(contact => contact.type === "employee").length, [contacts]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">People</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Clients & contacts</h1>
          <p className="mt-1 max-w-2xl text-sm text-black/55">Every relationship in one place, from first lead to active client, supplier, or team member.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAddingContact(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-black/75 hover:bg-black/[0.03]">
            <Plus size={16} /> Add contact
          </button>
          <NewClientButton products={products} defaults={clientDefaults} />
        </div>
      </header>

      <div className="mt-6 border-b border-black/10">
        <div className="flex gap-6 overflow-x-auto" role="tablist" aria-label="People view">
          <Tab active={view === "clients"} onClick={() => setView("clients")} label="Clients" count={clients.length} />
          <Tab active={view === "health"} onClick={() => setView("health")} label="Client health" count={clients.filter(client => client.health === "attention").length} />
          <Tab active={view === "contacts"} onClick={() => setView("contacts")} label="Contacts" count={contacts.length} />
          <Tab active={view === "staff"} onClick={() => setView("staff")} label="Staff" count={staffCount} />
          <Tab active={view === "all"} onClick={() => setView("all")} label="All" count={clients.length + contacts.length} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-black/10 py-4">
        <label className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, company, email, phone, notes, or tags" className="min-h-11 w-full rounded-md border border-black/15 bg-white pl-9 pr-3 text-sm outline-none focus:border-black/35" />
        </label>
        {view !== "clients" && view !== "health" && view !== "staff" ? (
          <select value={role} onChange={event => setRole(event.target.value as ContactRole | "all")} className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm text-black/70">
            <option value="all">Every contact type</option>
            {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        ) : null}
        {(view === "clients" || view === "health" || view === "all") && availableNiches.length ? (
          <select value={niche} onChange={event => setNiche(event.target.value)} className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm text-black/70" aria-label="Filter clients by niche">
            <option value="">Every niche</option>
            {availableNiches.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : null}
        {view === "clients" || view === "health" || view === "all" ? (
          <select value={clientStatus} onChange={event => setClientStatus(event.target.value as "all" | "active" | "suspended")} className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm text-black/70" aria-label="Filter clients by status">
            <option value="all">Active and paused</option>
            <option value="active">Active only</option>
            <option value="suspended">Paused only</option>
          </select>
        ) : null}
        {(query || role !== "all" || niche || clientStatus !== "all") ? <button type="button" onClick={() => { setQuery(""); setRole("all"); setNiche(""); setClientStatus("all"); }} className="min-h-11 rounded-md border border-black/15 px-3 text-sm text-black/60">Clear</button> : null}
      </div>

      {view === "all" || view === "clients" ? (
        <PeopleSection title="Clients" count={filteredClients.length} hidden={view === "all" && filteredClients.length === 0}>
          {filteredClients.map(client => <ClientRow key={client.id} client={client} />)}
          {filteredClients.length === 0 ? <Empty text={clients.length ? "No clients match this search." : "No clients yet."} /> : null}
        </PeopleSection>
      ) : null}

      {view === "health" ? (
        <section className="mt-7">
          <div className="flex items-end justify-between border-b border-black/10 pb-3">
            <div><h2 className="text-base font-semibold text-black/80">Client health</h2><p className="mt-1 text-sm text-black/45">A quick check for missing details, stale relationships, and delivery risks.</p></div>
            <span className="text-xs text-black/40">{clients.filter(client => client.health === "attention").length} need attention</span>
          </div>
          <div className="divide-y divide-black/[0.07]">
            {filteredClients.map(client => <HealthRow key={client.id} client={client} />)}
          </div>
          {filteredClients.length === 0 ? <Empty text="No clients match this search." /> : null}
        </section>
      ) : null}

      {view === "all" || view === "contacts" || view === "staff" ? (
        <PeopleSection title={view === "staff" ? "Staff" : "Contacts"} count={filteredContacts.length} hidden={view === "all" && filteredContacts.length === 0}>
          {filteredContacts.map(contact => <ContactRow key={`${contact.recordKind}:${contact.id}`} contact={contact} />)}
          {filteredContacts.length === 0 ? (
            <Empty text={view === "staff" ? (staffCount ? "No staff match this search." : "No staff added yet.") : (contacts.length ? "No contacts match these filters." : "No contacts yet.")} />
          ) : null}
        </PeopleSection>
      ) : null}

      {view === "all" && filteredClients.length === 0 && filteredContacts.length === 0 ? <Empty text="No people match this search." /> : null}

      {addingContact ? <AddContactModal onClose={() => setAddingContact(false)} /> : null}
    </div>
  );
}

function Tab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`relative min-h-11 whitespace-nowrap text-sm font-medium ${active ? "text-black" : "text-black/45 hover:text-black/70"}`}>
      {label} <span className="ml-1 text-xs tabular-nums text-black/35">{count}</span>
      {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}
    </button>
  );
}

function PeopleSection({ title, count, hidden, children }: { title: string; count: number; hidden?: boolean; children: React.ReactNode }) {
  if (hidden) return null;
  return (
    <section className="mt-7">
      <div className="flex items-center justify-between border-b border-black/10 pb-2">
        <h2 className="text-sm font-semibold text-black/75">{title}</h2>
        <span className="text-xs text-black/40">{count}</span>
      </div>
      <div className="divide-y divide-black/[0.07]">{children}</div>
    </section>
  );
}

function ClientRow({ client }: { client: HubClient }) {
  const initials = client.name.split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join("") || "C";
  return (
    <div className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
      <div className="grid size-10 place-items-center rounded-md text-xs font-semibold text-white" style={{ backgroundColor: client.primaryColor }}>{initials}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-black/85">{client.name}</p><Badge>{client.stageLabel}</Badge>{client.status === "suspended" ? <PausedBadge /> : null}{client.niche ? <Badge>{client.niche}</Badge> : null}</div>
        <p className="mt-0.5 truncate text-xs text-black/45">{client.ownerEmail || "No account email"} · Source: {sourceLabel(client.source)}{client.websiteUrl ? ` · ${client.websiteUrl}` : ""}</p>
      </div>
      <Link href={`/portal/clients/${client.id}`} className="rounded-md border border-black/15 px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]">Open</Link>
    </div>
  );
}

function HealthRow({ client }: { client: HubClient }) {
  return <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-black/80">{client.name}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${client.health === "healthy" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{client.health === "healthy" ? "Healthy" : "Needs attention"}</span></div><p className="mt-1 text-xs text-black/45">Source: {sourceLabel(client.source)} · {client.stageLabel}</p></div>
    <div className="text-xs leading-5 text-black/55">{client.healthNotes.length ? client.healthNotes.join(" · ") : "Details are complete and contact is current."}</div>
    <Link href={`/portal/clients/${client.id}`} className="w-fit rounded-md border border-black/15 px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]">Review</Link>
  </div>;
}

function PausedBadge() {
  return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Paused</span>;
}

function sourceLabel(source: string): string {
  if (!source || source === "Unknown") return "Unknown";
  return source.replace(/^csv:/, "CSV · ").replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function ContactRow({ contact }: { contact: HubContact }) {
  return (
    <div className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
      <div className="grid size-10 place-items-center rounded-md bg-black/[0.04] text-black/45"><UserRound size={18} /></div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-black/85">{contact.name || contact.company || contact.email}</p>
          <Badge>{roleLabels[contact.type]}</Badge>
          {contact.company && contact.name ? <span className="truncate text-xs text-black/40">{contact.company}</span> : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-black/45">{contact.email}{contact.phone ? ` · ${contact.phone}` : ""}{contact.tags.length ? ` · ${contact.tags.join(", ")}` : ""}</p>
      </div>
      <div className="flex items-center gap-1">
        {contact.phone ? <a href={`tel:${contact.phone}`} title="Call" aria-label={`Call ${contact.name || contact.email}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]"><Phone size={15} /></a> : null}
        <a href={`mailto:${contact.email}`} title="Email" aria-label={`Email ${contact.name || contact.email}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]"><Mail size={15} /></a>
        <Link href="/portal/agency/leads-pipeline/contacts" className="rounded-md border border-black/15 px-3 py-2 text-xs font-medium text-black/70 hover:bg-black/[0.03]">Manage</Link>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-black/50">{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="py-12 text-center"><Building2 className="mx-auto text-black/20" size={24} /><p className="mt-2 text-sm text-black/45">{text}</p></div>;
}

function AddContactModal({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="fixed inset-0 z-[80] grid items-end bg-black/40 sm:items-center sm:p-6">
      <button type="button" aria-label="Close contact form" className="absolute inset-0" onClick={onClose} />
      <form
        className="relative mx-auto w-full max-w-xl bg-white p-5 shadow-2xl sm:rounded-lg sm:p-6"
        onSubmit={async event => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const form = event.currentTarget;
          const data = new FormData(form);
          try {
            const response = await fetch("/api/portal/leads-pipeline/contacts", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name: String(data.get("name") ?? "").trim() || undefined,
                email: String(data.get("email") ?? "").trim(),
                phone: String(data.get("phone") ?? "").trim() || undefined,
                company: String(data.get("company") ?? "").trim() || undefined,
                type: String(data.get("type") ?? "other"),
                source: "people-hub",
                tags: [],
              }),
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
              setError(result.error ?? "Could not save the contact.");
              return;
            }
            window.location.assign("/portal/clients?view=contacts");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">New relationship</p><h2 className="mt-1 text-xl font-semibold">Add contact</h2></div><button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-md border border-black/10"><X size={16} /></button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Input label="Name" name="name" placeholder="Jane Smith" />
          <Input label="Email" name="email" type="email" placeholder="jane@company.com" required />
          <Input label="Phone" name="phone" placeholder="+44..." />
          <Input label="Company" name="company" placeholder="Company Ltd" />
          <label className="grid gap-1 text-xs font-medium text-black/55 sm:col-span-2">Relationship
            <select name="type" defaultValue="lead" className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm">
              {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-md border border-black/15 px-4 text-sm">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save contact"}</button></div>
      </form>
    </div>
  );
}

function Input({ label, name, type = "text", placeholder, required }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean }) {
  return <label className="grid gap-1 text-xs font-medium text-black/55">{label}<input name={name} type={type} placeholder={placeholder} required={required} className="min-h-11 rounded-md border border-black/15 px-3 text-sm" /></label>;
}
