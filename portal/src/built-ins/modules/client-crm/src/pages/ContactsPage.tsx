// The client's contacts — and the module's landing page.
//
// Mounted at BOTH `/portal/clients/<id>/client-crm` (the module's index) and
// `.../client-crm/contacts`, so it is the first thing anyone reaching this CRM
// sees. That makes it the hub: the journey board and its automations are
// reached from here.
//
// ── Why the links here matter more than they look ────────────────────────
//
// Client-scoped plugins declare `navItems`, and **nothing renders them**. The
// chrome's sidebar builder is only ever called with `scope: "agency"` — from
// `app/portal/agency/layout.tsx` and `app/portal/clients/page.tsx` — and the
// client workspace layout builds its panel by hand instead. So a page in this
// module is reachable by URL and by whatever this module links to, and nothing
// else. Until that is settled at the host level, these links ARE the
// navigation. Do not remove them thinking the sidebar covers it.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  unsubscribed: "bg-amber-100 text-amber-800",
  bounced: "bg-rose-100 text-rose-800",
  deleted: "bg-slate-200 text-slate-600",
};

export default async function ContactsPage(props: PluginPageProps) {
  if (!props.clientId) return <p className="p-6 text-sm text-slate-600">This CRM needs a client scope.</p>;

  const container = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const [contacts, segments] = await Promise.all([container.contacts.list(), container.segments.list()]);

  // Same rule as everywhere else in this module: an absent feature key means
  // OFF, matching `app/api/portal/[module]/[...rest]/route.ts:111` and
  // `lib/chrome/sidebarLayout.ts:179`.
  const journeyOn = Boolean(props.install?.features?.["journey-pipelines"]);
  const base = `/portal/clients/${props.clientId}/client-crm`;
  const active = contacts.filter(contact => contact.status === "active").length;

  return (
    <section className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Contacts</h1>
          <p className="mt-1 text-sm text-slate-500">
            {contacts.length === 0
              ? "Everyone who enquires or signs up appears here."
              : <>{active} active of {contacts.length} · {segments.length} {segments.length === 1 ? "segment" : "segments"}</>}
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Client CRM">
          <a
            href={`${base}/segments`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Segments
          </a>
          <a
            href={`${base}/activity`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Activity
          </a>
          {journeyOn && (
            <>
              <a
                href={`${base}/automations`}
                className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Automations
              </a>
              <a
                href={`${base}/pipelines`}
                className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                Journey board
              </a>
            </>
          )}
        </nav>
      </header>

      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <h2 className="text-base font-semibold text-slate-900">No contacts yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            People arrive here when they sign up, when an order comes in, or when you import them.
            {journeyOn && " Once they are here, you can drop them on a journey board and track where they get to."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {contacts.map(contact => (
            <li key={contact.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-900">{contact.name ?? contact.email}</h2>
                  {contact.name && <p className="truncate text-xs text-slate-500">{contact.email}</p>}
                </div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[contact.status] ?? STATUS_TONE.deleted}`}>
                  {contact.status}
                </span>
              </div>
              {contact.phone && <p className="mt-1 text-xs text-slate-500">{contact.phone}</p>}
              <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
                {contact.source.replaceAll("-", " ")}{contact.endCustomerUserId ? " · has a login" : ""}
              </p>
              {contact.tags.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1">
                  {contact.tags.slice(0, 5).map(tag => (
                    <li key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{tag}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
