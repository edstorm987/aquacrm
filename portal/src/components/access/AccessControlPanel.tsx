"use client";

import {
  Check,
  ChevronRight,
  Clock3,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRoundCog,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";

import {
  BASE_CAPABILITIES,
  dateTimeLocalValue,
  ELEMENT_CAPABILITIES,
  ELEMENT_LEVELS,
  elementAvailableForExactScope,
  elementAccessLevel,
  narrowCapabilitiesToExactScope,
  parseExpiry,
  requestStatus,
  sameScope,
  scopeLabel,
  setElementAccessLevel,
  visibleAccessRequestsForScopes,
  type AccessEnvironment,
  type AccessGrant,
  type AccessPerson,
  type AccessRequest,
  type AccessRoleTemplate,
  type AccessScope,
  type AccessScopeKind,
  type ElementAccessLevel,
  type NamedAccessScope,
} from "./accessModel";

type PanelView = "people" | "roles" | "requests" | "mine";
type HttpMethod = "POST" | "PATCH" | "DELETE";

interface AccessControlPanelProps {
  scope: NamedAccessScope;
  scopeOptions?: readonly NamedAccessScope[];
  people?: readonly AccessPerson[];
  canManage?: boolean;
  title?: string;
  description?: string;
  compact?: boolean;
  currentEnvironment?: AccessEnvironment;
}

const VIEW_META: Array<{ id: PanelView; label: string; icon: typeof UsersRound; managerOnly?: boolean }> = [
  { id: "people", label: "People", icon: UsersRound, managerOnly: true },
  { id: "roles", label: "Role templates", icon: SlidersHorizontal, managerOnly: true },
  { id: "requests", label: "Requests", icon: ShieldCheck },
  { id: "mine", label: "My access", icon: KeyRound },
];

const EMPTY_PEOPLE: readonly AccessPerson[] = [];

export function AccessControlPanel({
  scope,
  scopeOptions,
  people = EMPTY_PEOPLE,
  canManage = false,
  title = "Access control",
  description = "Give each person only the workspaces, projects and individual elements they need.",
  compact = false,
  currentEnvironment = "live",
}: AccessControlPanelProps) {
  const choices = useMemo(() => uniqueScopes(scopeOptions?.length ? scopeOptions : [scope]), [scope, scopeOptions]);
  const [activeScope, setActiveScope] = useState<NamedAccessScope>(scope);
  const [environment, setEnvironment] = useState<AccessEnvironment>(currentEnvironment);
  const [view, setView] = useState<PanelView>(canManage ? "people" : "mine");
  const [templates, setTemplates] = useState<AccessRoleTemplate[]>([]);
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal, quiet = false, cancelled?: () => boolean) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const requestUrl = canManage ? "/api/portal/access/requests?all=1" : "/api/portal/access/requests";
      const [templateResult, grantResult, requestResult] = await Promise.all([
        readCollection<AccessRoleTemplate>("/api/portal/access/templates", "templates", signal),
        readCollection<AccessGrant>(canManage ? "/api/portal/access/grants" : "/api/portal/access/grants?self=1", "grants", signal),
        readCollection<AccessRequest>(requestUrl, "requests", signal),
      ]);
      if (signal?.aborted || cancelled?.()) return;
      setTemplates(templateResult);
      setGrants(grantResult);
      setRequests(requestResult.map(normaliseRequest));
    } catch (cause) {
      if (signal?.aborted || cancelled?.()) return;
      setError(cause instanceof Error ? cause.message : "Access control could not be loaded.");
    } finally {
      if (!signal?.aborted && !cancelled?.()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [canManage]);

  useEffect(() => {
    // These three local GETs are short-lived. Mark their result stale on
    // unmount instead of aborting fetch mid-body: Chromium can otherwise emit
    // an unhandled AbortError while the access panel is being navigated away.
    let cancelled = false;
    void load(undefined, false, () => cancelled);
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    if (!canManage && (view === "people" || view === "roles")) setView("mine");
  }, [canManage, view]);

  useEffect(() => {
    setEnvironment(currentEnvironment);
  }, [currentEnvironment]);

  const mutate = useCallback(async (url: string, method: HttpMethod, body: Record<string, unknown> | undefined, success: string) => {
    setError("");
    setNotice("");
    const response = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; message?: string } | null;
    if (!response.ok || !result?.ok) {
      const message = result?.message || result?.error || "The access change could not be saved.";
      setError(message);
      throw new Error(message);
    }
    setNotice(success);
    await load(undefined, true);
  }, [load]);

  const scopedGrants = grants.filter(grant => sameScope(grant.scope, activeScope) && grant.environment === environment);
  const scopedRequests = requests.filter(request => sameScope(request.scope, activeScope) && request.environment === environment);
  const queueRequests = visibleAccessRequestsForScopes(requests, environment, choices, activeScope, canManage);
  const visibleViews = VIEW_META.filter(item => canManage || !item.managerOnly);

  return (
    <section className={compact ? "space-y-4" : "space-y-5"} data-testid="access-control-panel">
      <header className="flex flex-col gap-4 border-b border-black/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800"><ShieldCheck size={15} aria-hidden /> Governed access</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black/90 sm:text-3xl">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-black/55">{description}</p>
          <p className="mt-2 text-xs leading-5 text-black/42">Navigation visibility follows these grants, but every protected API must still enforce the same capability server-side.</p>
        </div>
        <button type="button" onClick={() => void load(undefined, true)} disabled={refreshing} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-semibold text-black/65 outline-none hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60 sm:w-fit">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      <div className="grid gap-3 rounded-lg border border-black/10 bg-white/75 p-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-semibold text-black/55">
          Exact scope
          <select value={scopeKey(activeScope)} onChange={event => setActiveScope(choices.find(choice => scopeKey(choice) === event.target.value) ?? scope)} className={controlClass}>
            {choices.map(choice => <option key={scopeKey(choice)} value={scopeKey(choice)}>{choice.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-black/55">
          Current data environment
          <select
            value={environment}
            disabled={!canManage}
            onChange={event => setEnvironment(event.target.value as AccessEnvironment)}
            className={controlClass}
          >
            <option value="live">Live data</option>
            <option value="sandbox">Sandbox data</option>
          </select>
          <span className="font-normal leading-4 text-black/38">{canManage ? "Configure live or sandbox authority here without changing the data currently open." : "Your grants are shown for the data environment currently open."}</span>
        </label>
      </div>

      <label className="grid gap-1.5 text-xs font-semibold text-black/50 sm:hidden">
        Access section
        <select value={view} onChange={event => setView(event.target.value as PanelView)} className={controlClass}>
          {visibleViews.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <nav aria-label="Access control sections" role="tablist" className="hidden gap-1 overflow-x-auto border-b border-black/10 sm:flex">
        {visibleViews.map(item => {
          const Icon = item.icon;
          const selected = view === item.id;
          return (
            <button key={item.id} type="button" role="tab" aria-selected={selected} onClick={() => setView(item.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-inset ${selected ? "border-emerald-800 text-emerald-900" : "border-transparent text-black/48 hover:text-black/75"}`}>
              <Icon size={15} /> {item.label}
              {item.id === "requests" && queueRequests.some(request => request.status === "pending") ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">{queueRequests.filter(request => request.status === "pending").length}</span> : null}
            </button>
          );
        })}
      </nav>

      {notice ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">{error}</p> : null}

      {loading ? <LoadingPanel /> : null}
      {!loading && view === "people" && canManage ? <PeopleGrants people={people} templates={templates} grants={scopedGrants} scope={activeScope} environment={environment} mutate={mutate} /> : null}
      {!loading && view === "roles" && canManage ? <RoleTemplates templates={templates} scopeKind={activeScope.kind} mutate={mutate} /> : null}
      {!loading && view === "requests" ? <AccessRequests requests={queueRequests} canManage={canManage} people={people} scope={activeScope} scopeChoices={choices} onSelectScope={setActiveScope} environment={environment} mutate={mutate} /> : null}
      {!loading && view === "mine" ? <MyAccess grants={scopedGrants} requests={scopedRequests} templates={templates} choices={choices} /> : null}
    </section>
  );
}

function PeopleGrants({
  people,
  templates,
  grants,
  scope,
  environment,
  mutate,
}: {
  people: readonly AccessPerson[];
  templates: AccessRoleTemplate[];
  grants: AccessGrant[];
  scope: NamedAccessScope;
  environment: AccessEnvironment;
  mutate: Mutation;
}) {
  const [userId, setUserId] = useState(people[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [allowedPaths, setAllowedPaths] = useState("");
  const [busy, setBusy] = useState("");
  const activePeople = people.filter(person => person.id);
  const eligibleTemplates = templates.filter(template => !template.archivedAt && template.allowedScopeKinds.includes(scope.kind) && template.allowedEnvironments.includes(environment));
  const selected = activePeople.find(person => person.id === userId);
  const scopedCapabilities = narrowCapabilitiesToExactScope(capabilities, scope);
  const exactScopeIdentity = scopeKey(scope);

  useEffect(() => {
    if (!activePeople.some(person => person.id === userId)) setUserId(activePeople[0]?.id ?? "");
  }, [activePeople, userId]);

  useEffect(() => {
    setCapabilities(current => {
      const next = narrowCapabilitiesToExactScope(current, scope);
      return next.length === current.length ? current : next;
    });
  }, [exactScopeIdentity, scope]);

  async function createGrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedCapabilities = narrowCapabilitiesToExactScope(capabilities, scope);
    if (!userId || (!templateId && !submittedCapabilities.length)) return;
    setBusy("create");
    try {
      await mutate("/api/portal/access/grants", "POST", {
        userId,
        scope: stripLabel(scope),
        environment,
        templateId: templateId || undefined,
        capabilities: submittedCapabilities,
        expiresAt: parseExpiry(expiresAt),
        reason: reason || undefined,
        // Only meaningful on a PROJECT scope — the other scopes have no files.
        // Sent as an array; empty means "the whole scope", which is what every
        // grant without a narrowing already is.
        allowedPaths: scope.kind === "project"
          ? allowedPaths.split("\n").map(line => line.trim()).filter(Boolean)
          : undefined,
        idempotencyKey: crypto.randomUUID(),
      }, `Access assigned to ${selected?.name ?? "the selected person"}.`);
      setReason("");
      setExpiresAt("");
      setAllowedPaths("");
      setCapabilities([]);
    } finally {
      setBusy("");
    }
  }

  async function revoke(grant: AccessGrant) {
    setBusy(grant.id);
    try {
      await mutate(`/api/portal/access/grants/${encodeURIComponent(grant.id)}`, "PATCH", { action: "revoke", reason: "Revoked from access control" }, "Access revoked immediately.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
      <form onSubmit={createGrant} className="rounded-lg border border-black/10 bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-800"><UserRoundCog size={18} /></span>
          <div><h3 className="text-base font-semibold text-black/85">Assign exact access</h3><p className="mt-1 text-xs leading-5 text-black/45">Choose a reusable role, direct capabilities, or both. A direct grant can add access but cannot silently subtract access already supplied by a role.</p></div>
        </div>
        {!activePeople.length ? <p className="mt-5 rounded-md bg-amber-50 p-3 text-sm text-amber-900">No portal-enabled people are available in this workspace yet.</p> : (
          <div className="mt-5 grid gap-4">
            <label className={labelClass}>Person<select required value={userId} onChange={event => setUserId(event.target.value)} className={controlClass}>{activePeople.map(person => <option key={person.id} value={person.id}>{person.name}{person.email ? ` · ${person.email}` : ""}</option>)}</select></label>
            <label className={labelClass}>Role template<select value={templateId} onChange={event => setTemplateId(event.target.value)} className={controlClass}><option value="">Custom capabilities only</option>{eligibleTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
            <fieldset className="grid gap-2"><legend className="text-xs font-semibold text-black/55">Grant lifetime</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Permanent", ""], ["7 days", daysFromNow(7)], ["30 days", daysFromNow(30)], ["90 days", daysFromNow(90)]].map(([label, value]) => <button key={label} type="button" onClick={() => setExpiresAt(value!)} aria-pressed={expiresAt === value} className={`min-h-10 rounded-md border px-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${expiresAt === value ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-black/10 bg-white text-black/55"}`}>{label}</button>)}</div><input type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} aria-label="Custom access expiry" className={controlClass} /></fieldset>
            {scope.kind === "project" ? (
              <label className={labelClass}>
                Limit to these files <span className="font-normal text-black/38">(optional)</span>
                <textarea
                  rows={3}
                  value={allowedPaths}
                  onChange={event => setAllowedPaths(event.target.value)}
                  spellCheck={false}
                  placeholder={"src/app/portal\nsrc/lib/portal"}
                  className={`${controlClass} py-2 font-mono`}
                />
                <span className="mt-1 block text-[11px] font-normal leading-5 text-black/45">
                  {allowedPaths.trim()
                    ? "This person sees and edits only these paths — narrowed further by whatever the project itself exposes."
                    : "Blank gives them everything the project exposes. One path per line, relative to the project root."}
                </span>
              </label>
            ) : null}
            <label className={labelClass}>Assignment reason <span className="font-normal text-black/38">(optional)</span><textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} className={`${controlClass} py-2`} /></label>
            <CapabilityComposer capabilities={scopedCapabilities} onChange={setCapabilities} scope={scope} idPrefix="direct" compact />
            <button disabled={busy === "create" || (!templateId && !scopedCapabilities.length)} className={primaryButtonClass}><Save size={14} /> {busy === "create" ? "Assigning…" : "Assign access"}</button>
          </div>
        )}
      </form>

      <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
        <header className="border-b border-black/10 px-4 py-4 sm:px-5"><h3 className="font-semibold text-black/85">Active assignments</h3><p className="mt-1 text-xs text-black/45">Revoke a grant here; the server invalidates authority independently of hidden navigation.</p></header>
        <div className="divide-y divide-black/10">
          {grants.filter(grant => !grant.revokedAt).length ? grants.filter(grant => !grant.revokedAt).map(grant => {
            const person = people.find(item => item.id === grant.userId);
            const template = templates.find(item => item.id === grant.templateId);
            return (
              <article key={grant.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><h4 className="truncate text-sm font-semibold text-black/85">{person?.name ?? grant.userId}</h4><p className="mt-1 text-xs text-black/45">{template?.name ?? "Custom grant"} · {grant.capabilities.length} direct capabilities</p><GrantExpiry expiresAt={grant.expiresAt} /></div>
                  <button type="button" onClick={() => void revoke(grant)} disabled={busy === grant.id} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 sm:w-fit"><Trash2 size={13} /> {busy === grant.id ? "Revoking…" : "Revoke"}</button>
                </div>
                {grant.reason ? <p className="mt-3 rounded-md bg-black/[0.025] px-3 py-2 text-xs leading-5 text-black/50">{grant.reason}</p> : null}
              </article>
            );
          }) : <EmptyPanel title="No active assignments" detail="Assign a role or custom set of capabilities for this exact scope and environment." />}
        </div>
      </section>
    </div>
  );
}

function RoleTemplates({ templates, scopeKind, mutate }: { templates: AccessRoleTemplate[]; scopeKind: AccessScopeKind; mutate: Mutation }) {
  const liveTemplates = templates.filter(template => !template.archivedAt);
  const [selectedId, setSelectedId] = useState(liveTemplates[0]?.id ?? "new");
  const selected = liveTemplates.find(template => template.id === selectedId);
  const [name, setName] = useState(selected?.name ?? "");
  const [description, setDescription] = useState(selected?.description ?? "");
  const [capabilities, setCapabilities] = useState<string[]>(selected?.capabilities ?? ["workspace.view", "access.request"]);
  const [scopeKinds, setScopeKinds] = useState<AccessScopeKind[]>(selected?.allowedScopeKinds ?? [scopeKind]);
  const [environments, setEnvironments] = useState<AccessEnvironment[]>(selected?.allowedEnvironments ?? ["live"]);
  const [busy, setBusy] = useState("");

  function choose(id: string) {
    const template = liveTemplates.find(item => item.id === id);
    setSelectedId(id);
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setCapabilities(template?.capabilities ?? ["workspace.view", "access.request"]);
    setScopeKinds(template?.allowedScopeKinds ?? [scopeKind]);
    setEnvironments(template?.allowedEnvironments ?? ["live"]);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    try {
      const body = { name, description: description || undefined, capabilities, allowedScopeKinds: scopeKinds, allowedEnvironments: environments, idempotencyKey: selected ? undefined : crypto.randomUUID() };
      await mutate(selected ? `/api/portal/access/templates/${encodeURIComponent(selected.id)}` : "/api/portal/access/templates", selected ? "PATCH" : "POST", body, selected ? "Role template updated." : "Role template created.");
      if (!selected) choose("new");
    } finally {
      setBusy("");
    }
  }

  async function archive() {
    if (!selected) return;
    setBusy("archive");
    try {
      await mutate(`/api/portal/access/templates/${encodeURIComponent(selected.id)}`, "DELETE", undefined, "Role template archived. Existing grant history is retained.");
      choose("new");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="h-fit rounded-lg border border-black/10 bg-white p-3">
        <div className="flex items-center justify-between px-2 py-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-black/40">Reusable roles</h3><button type="button" onClick={() => choose("new")} className="inline-flex size-8 items-center justify-center rounded-md border border-black/10 text-black/60 outline-none hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-emerald-700" aria-label="Create role template"><Plus size={14} /></button></div>
        <button type="button" onClick={() => choose("new")} aria-current={selectedId === "new" ? "true" : undefined} className={`flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm font-semibold ${selectedId === "new" ? "bg-emerald-50 text-emerald-900" : "text-black/60 hover:bg-black/[0.03]"}`}>New role <Plus size={14} /></button>
        {liveTemplates.map(template => <button key={template.id} type="button" onClick={() => choose(template.id)} aria-current={selectedId === template.id ? "true" : undefined} className={`mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-sm font-semibold ${selectedId === template.id ? "bg-emerald-50 text-emerald-900" : "text-black/60 hover:bg-black/[0.03]"}`}><span className="truncate">{template.name}</span><ChevronRight size={14} /></button>)}
      </aside>
      <form onSubmit={save} className="rounded-lg border border-black/10 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 border-b border-black/10 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase text-emerald-800">{selected ? "Edit role" : "New role"}</p><h3 className="mt-1 text-xl font-semibold text-black/88">{selected?.name ?? "Reusable access template"}</h3></div>{selected ? <button type="button" onClick={() => void archive()} disabled={busy === "archive"} className="inline-flex min-h-9 w-full items-center justify-center gap-1 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 sm:w-fit"><Trash2 size={13} /> Archive</button> : null}</div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Role name<input required minLength={2} value={name} onChange={event => setName(event.target.value)} className={controlClass} placeholder="Project developer" /></label>
          <label className={`${labelClass} sm:col-span-2`}>Description<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} className={`${controlClass} py-2`} placeholder="What this role is for and who should receive it." /></label>
          <CheckboxGroup legend="Allowed scope types" values={["agency", "workspace", "client", "project"] as AccessScopeKind[]} selected={scopeKinds} onChange={setScopeKinds} />
          <CheckboxGroup legend="Allowed environments" values={["live", "sandbox"] as AccessEnvironment[]} selected={environments} onChange={setEnvironments} />
        </div>
        <div className="mt-6"><CapabilityComposer capabilities={capabilities} onChange={setCapabilities} scopeKind={scopeKind} idPrefix={`template-${selectedId}`} /></div>
        <button disabled={busy === "save" || !name.trim() || !scopeKinds.length || !environments.length || !capabilities.length} className={`${primaryButtonClass} mt-5 w-full sm:w-fit`}><Save size={14} /> {busy === "save" ? "Saving…" : selected ? "Save role" : "Create role"}</button>
      </form>
    </div>
  );
}

export function AccessRequests({ requests, canManage, people, scope, scopeChoices, onSelectScope, environment, mutate }: { requests: AccessRequest[]; canManage: boolean; people: readonly AccessPerson[]; scope: NamedAccessScope; scopeChoices: readonly NamedAccessScope[]; onSelectScope: (scope: NamedAccessScope) => void; environment: AccessEnvironment; mutate: Mutation }) {
  const [capabilities, setCapabilities] = useState<string[]>(["access.request"]);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState("");
  const [reviewCaps, setReviewCaps] = useState<Record<string, string[]>>({});
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const pending = requests.filter(request => request.status === "pending");
  const scopedCapabilities = narrowCapabilitiesToExactScope(capabilities, scope);
  const exactScopeIdentity = scopeKey(scope);

  useEffect(() => {
    setCapabilities(current => {
      const next = narrowCapabilitiesToExactScope(current, scope);
      return next.length === current.length ? current : next;
    });
  }, [exactScopeIdentity, scope]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedCapabilities = narrowCapabilitiesToExactScope(capabilities, scope);
    if (!submittedCapabilities.length) return;
    setBusy("request");
    try {
      await mutate("/api/portal/access/requests", "POST", { scope: stripLabel(scope), environment, capabilities: submittedCapabilities, reason, expiresAt: parseExpiry(expiresAt), idempotencyKey: crypto.randomUUID() }, "Access request sent for review.");
      setReason("");
      setExpiresAt("");
      setCapabilities(["access.request"]);
    } finally {
      setBusy("");
    }
  }

  async function decide(request: AccessRequest, action: "approve" | "deny" | "cancel") {
    setBusy(request.id);
    try {
      const reviewed = narrowCapabilitiesToExactScope(reviewCaps[request.id] ?? request.requestedCapabilities, request.scope)
        .filter(capability => capabilityAllowedByRequest(capability, request.requestedCapabilities));
      await mutate(`/api/portal/access/requests/${encodeURIComponent(request.id)}`, "PATCH", {
        action,
        capabilities: action === "approve" ? reviewed : undefined,
        expiresAt: action === "approve" ? request.requestedExpiresAt : undefined,
        reason: decisionNotes[request.id] || undefined,
      }, action === "approve" ? "Request approved with the displayed scope." : action === "deny" ? "Request denied." : "Request cancelled.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(22rem,0.82fr)_minmax(0,1.18fr)]">
      <form onSubmit={submit} className="h-fit rounded-lg border border-black/10 bg-white p-4 sm:p-5">
        <Send className="text-emerald-800" size={18} /><h3 className="mt-3 text-lg font-semibold text-black/85">Request exact access</h3><p className="mt-1 text-xs leading-5 text-black/45">Ask only for the elements required for this task. The reviewer may approve a narrower subset and add an expiry.</p><p className="mt-2 rounded-md bg-black/[0.025] px-3 py-2 text-xs font-medium text-black/55">Exact scope: {scope.label}</p>
        <div className="mt-5 grid gap-4">
          <CapabilityComposer capabilities={scopedCapabilities} onChange={setCapabilities} scope={scope} idPrefix="request" compact />
          <label className={labelClass}>Reason<textarea required minLength={8} rows={3} value={reason} onChange={event => setReason(event.target.value)} className={`${controlClass} py-2`} placeholder="What are you doing, and why is this access needed?" /></label>
          <label className={labelClass}>Requested end date <span className="font-normal text-black/38">(optional)</span><input type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} className={controlClass} /></label>
          <button disabled={busy === "request" || !scopedCapabilities.length || reason.trim().length < 8} className={primaryButtonClass}><Send size={14} /> {busy === "request" ? "Sending…" : "Send request"}</button>
        </div>
      </form>

      <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
        <header className="border-b border-black/10 px-4 py-4 sm:px-5"><h3 className="font-semibold text-black/85">{canManage ? "Review queue" : "Your requests"}</h3><p className="mt-1 text-xs text-black/45">{pending.length} pending · {canManage ? "all disclosed exact scopes in this environment" : "this exact scope"} · decisions and reasons remain attributable.</p></header>
        <div className="divide-y divide-black/10">
          {requests.length ? requests.map(request => {
            const person = people.find(item => item.id === request.requesterUserId);
            const review = narrowCapabilitiesToExactScope(reviewCaps[request.id] ?? request.requestedCapabilities, request.scope)
              .filter(capability => capabilityAllowedByRequest(capability, request.requestedCapabilities));
            const requestScope = scopeChoices.find(choice => sameScope(choice, request.scope));
            return (
              <article key={request.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-sm font-semibold text-black/85">{person?.name ?? request.requesterName ?? "Access request"}</h4><p className="mt-1 text-xs text-black/45">{request.requestedCapabilities.length} capabilities · {formatTimestamp(request.createdAt)}</p></div><StatusPill status={request.status} /></div>
                <div className="mt-3 flex flex-col gap-2 rounded-md border border-black/[0.07] bg-black/[0.018] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-black/38">Exact scope</p><p className="truncate text-xs font-semibold text-black/65">{scopeLabel(request.scope, scopeChoices)}</p></div>
                  {canManage && requestScope ? <button type="button" onClick={() => onSelectScope(requestScope)} aria-label={`Select exact scope: ${requestScope.label}`} className="inline-flex min-h-9 w-full shrink-0 items-center justify-center gap-1 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/60 outline-none hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-emerald-700 sm:w-fit">Select exact scope <ChevronRight size={13} /></button> : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-black/58">{request.reason}</p>
                <CapabilitySummary capabilities={request.requestedCapabilities} />
                {request.status === "pending" && canManage ? (
                  <details className="mt-4 rounded-md border border-black/10 bg-black/[0.018] p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-black/65 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">Review and narrow access</summary>
                    <div className="mt-4"><CapabilityComposer capabilities={review} onChange={next => setReviewCaps(current => ({ ...current, [request.id]: next.filter(capability => capabilityAllowedByRequest(capability, request.requestedCapabilities)) }))} scope={request.scope} allowedCapabilities={request.requestedCapabilities} idPrefix={`review-${request.id}`} compact /></div>
                    <label className={`${labelClass} mt-3`}>Decision note <span className="font-normal text-black/38">(optional)</span><input value={decisionNotes[request.id] ?? ""} onChange={event => setDecisionNotes(current => ({ ...current, [request.id]: event.target.value }))} className={controlClass} /></label>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" onClick={() => void decide(request, "approve")} disabled={busy === request.id || !review.length} className={primaryButtonClass}><Check size={14} /> Approve displayed access</button><button type="button" onClick={() => void decide(request, "deny")} disabled={busy === request.id} className={secondaryDangerButtonClass}><X size={14} /> Deny</button></div>
                  </details>
                ) : null}
                {request.status === "pending" && !canManage ? <button type="button" onClick={() => void decide(request, "cancel")} disabled={busy === request.id} className="mt-4 inline-flex min-h-9 w-full items-center justify-center rounded-md border border-black/10 px-3 text-xs font-semibold text-black/55 hover:bg-black/[0.03] sm:w-fit">Cancel request</button> : null}
                {request.decisionReason ? <p className="mt-3 rounded-md bg-black/[0.025] px-3 py-2 text-xs text-black/50">Decision: {request.decisionReason}</p> : null}
              </article>
            );
          }) : <EmptyPanel title="No access requests" detail={canManage ? "New requests for disclosed scopes in this environment will appear here." : "New requests for this exact scope and environment will appear here."} />}
        </div>
      </section>
    </div>
  );
}

function MyAccess({ grants, requests, templates, choices }: { grants: AccessGrant[]; requests: AccessRequest[]; templates: AccessRoleTemplate[]; choices: readonly NamedAccessScope[] }) {
  const active = grants.filter(grant => !grant.revokedAt);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="overflow-hidden rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-4 sm:p-5"><h3 className="font-semibold text-black/85">Current grants</h3><p className="mt-1 text-xs text-black/45">What this session can use in the selected scope.</p></header><div className="divide-y divide-black/10">{active.length ? active.map(grant => <article key={grant.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-black/80">{templates.find(template => template.id === grant.templateId)?.name ?? "Custom access"}</h4><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-800">Active</span></div><p className="mt-2 text-xs text-black/45">{scopeLabel(grant.scope, choices)} · {grant.environment}</p><GrantExpiry expiresAt={grant.expiresAt} /><CapabilitySummary capabilities={grant.capabilities} /></article>) : <EmptyPanel title="No direct grants shown" detail="Your baseline authority may come from an owner role. Request an exact capability from the Requests section when something is gated." />}</div></section>
      <section className="overflow-hidden rounded-lg border border-black/10 bg-white"><header className="border-b border-black/10 p-4 sm:p-5"><h3 className="font-semibold text-black/85">Recent decisions</h3><p className="mt-1 text-xs text-black/45">Pending, approved, denied and cancelled requests.</p></header><div className="divide-y divide-black/10">{requests.length ? requests.slice().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).map(request => <article key={request.id} className="p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold text-black/75">{request.reason}</p><StatusPill status={request.status} /></div><p className="mt-2 text-xs text-black/42">{request.requestedCapabilities.length} capabilities · {formatTimestamp(request.createdAt)}</p></article>) : <EmptyPanel title="No request history" detail="Requests you send for this scope will be tracked here." />}</div></section>
    </div>
  );
}

type CapabilityComposerProps = {
  capabilities: string[];
  onChange: (next: string[]) => void;
  idPrefix: string;
  compact?: boolean;
  allowedCapabilities?: readonly string[];
} & ({ scope: AccessScope; scopeKind?: never } | { scope?: never; scopeKind: AccessScopeKind });

export function CapabilityComposer({ capabilities, onChange, scope, scopeKind, idPrefix, compact = false, allowedCapabilities }: CapabilityComposerProps) {
  const activeScopeKind: AccessScopeKind = scope?.kind ?? scopeKind!;
  const base = BASE_CAPABILITIES.filter(item => item.scopeKinds.includes(activeScopeKind) && (!allowedCapabilities || capabilityAllowedByRequest(item.key, allowedCapabilities)));
  const elements = ELEMENT_CAPABILITIES.filter(item => item.scopeKinds.includes(activeScopeKind)
    && (!scope || elementAvailableForExactScope(item, scope))
    && (!allowedCapabilities || ["view", "use", "manage"].some(level => capabilityAllowedByRequest(`element.${item.key}.${level}`, allowedCapabilities))));
  const [expanded, setExpanded] = useState(!compact);
  return (
    <fieldset className="rounded-lg border border-black/10 bg-[#fbfbf8] p-3 sm:p-4">
      <legend className="px-1 text-xs font-semibold text-black/60">Capabilities and workspace elements</legend>
      <div className="flex items-center justify-between gap-3"><p className="text-xs leading-5 text-black/42">Hidden means the role grants no access to that element. Use and Manage automatically include View.</p>{compact ? <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="shrink-0 rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-black/55">{expanded ? "Collapse" : "Configure"}</button> : null}</div>
      {expanded ? <div className="mt-4 space-y-5">
        {base.length ? <div><h4 className="text-[10px] font-semibold uppercase tracking-wide text-black/38">Core authority</h4><div className="mt-2 grid gap-2 sm:grid-cols-2">{base.map(item => <label key={item.key} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border border-black/10 bg-white px-3 py-2.5 text-xs"><input type="checkbox" checked={capabilities.includes(item.key)} onChange={() => onChange(toggleValue(capabilities, item.key))} className="mt-0.5" /><span><strong className="block font-semibold text-black/70">{item.label}</strong><span className="mt-0.5 block leading-4 text-black/40">{item.detail}</span></span></label>)}</div></div> : null}
        {(["Workspace", "Staff", "Fulfilment", "Client", "Development", "Project"] as const).map(group => {
          const items = elements.filter(item => item.group === group);
          if (!items.length) return null;
          return <div key={group}><h4 className="text-[10px] font-semibold uppercase tracking-wide text-black/38">{group} elements</h4><div className="mt-2 divide-y divide-black/[0.07] overflow-hidden rounded-md border border-black/10 bg-white">{items.map(item => <ElementLevelControl key={item.key} definition={item} value={elementAccessLevel(capabilities, item.key)} onChange={level => onChange(setElementAccessLevel(capabilities, item.key, level))} idPrefix={idPrefix} allowedCapabilities={allowedCapabilities} />)}</div></div>;
        })}
      </div> : <CapabilitySummary capabilities={capabilities} />}
    </fieldset>
  );
}

function ElementLevelControl({ definition, value, onChange, idPrefix, allowedCapabilities }: { definition: (typeof ELEMENT_CAPABILITIES)[number]; value: ElementAccessLevel; onChange: (level: ElementAccessLevel) => void; idPrefix: string; allowedCapabilities?: readonly string[] }) {
  const legendId = `${idPrefix}-${definition.key.replaceAll(".", "-")}`;
  const allowedLevels = ELEMENT_LEVELS.filter(level => level === "hidden" || !allowedCapabilities || capabilityAllowedByRequest(`element.${definition.key}.${level}`, allowedCapabilities));
  return (
    <div className="grid gap-3 p-3 xl:grid-cols-[minmax(10rem,1fr)_auto] xl:items-center">
      <div id={legendId}><div className="text-xs font-semibold text-black/72">{definition.label}</div><div className="mt-0.5 text-[11px] leading-4 text-black/40">{definition.detail}<span className="sr-only"> Stable key: {definition.key}</span></div></div>
      <div role="radiogroup" aria-labelledby={legendId} data-element-key={definition.key} className="grid grid-cols-2 overflow-hidden rounded-md border border-black/10 bg-black/[0.025] p-0.5 sm:grid-cols-4">
        {allowedLevels.map(level => (
          <label key={level} htmlFor={`${legendId}-${level}`} className={`grid min-h-11 min-w-0 cursor-pointer place-items-center rounded px-1.5 text-[10px] font-semibold capitalize outline-none focus-within:ring-2 focus-within:ring-emerald-700 sm:px-2 sm:text-xs ${value === level ? level === "hidden" ? "bg-black text-white shadow-sm" : "bg-emerald-800 text-white shadow-sm" : "text-black/42 hover:bg-white"}`}>
            <input id={`${legendId}-${level}`} type="radio" name={legendId} value={level} checked={value === level} onChange={() => onChange(level)} onKeyDown={event => moveElementLevel(event, allowedLevels, level, onChange)} aria-label={`${definition.label}: ${level}`} className="sr-only" />
            <span>{level}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function CheckboxGroup<T extends string>({ legend, values, selected, onChange }: { legend: string; values: readonly T[]; selected: T[]; onChange: (next: T[]) => void }) {
  return <fieldset className="grid gap-2"><legend className="text-xs font-semibold text-black/55">{legend}</legend><div className="flex flex-wrap gap-2">{values.map(value => <label key={value} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold capitalize text-black/60"><input type="checkbox" checked={selected.includes(value)} onChange={() => onChange(selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value])} />{value}</label>)}</div></fieldset>;
}

function CapabilitySummary({ capabilities }: { capabilities: readonly string[] }) {
  if (!capabilities.length) return <p className="mt-3 text-xs italic text-black/38">No capabilities selected.</p>;
  return <div className="mt-3 flex flex-wrap gap-1.5">{capabilities.slice(0, 12).map(capability => <span key={capability} title={capability} className="max-w-full truncate rounded-full bg-black/[0.05] px-2 py-1 text-[10px] font-medium text-black/55">{capabilityLabel(capability)}</span>)}{capabilities.length > 12 ? <span className="rounded-full bg-black/[0.05] px-2 py-1 text-[10px] font-medium text-black/55">+{capabilities.length - 12} more</span> : null}</div>;
}

function StatusPill({ status }: { status: AccessRequest["status"] }) {
  const tone = status === "approved" ? "bg-emerald-50 text-emerald-800" : status === "pending" ? "bg-amber-50 text-amber-900" : status === "denied" ? "bg-red-50 text-red-700" : "bg-black/[0.05] text-black/50";
  return <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${tone}`}>{status}</span>;
}

function GrantExpiry({ expiresAt }: { expiresAt?: number }) {
  return <p className="mt-2 inline-flex items-center gap-1 text-xs text-black/42"><Clock3 size={12} /> {expiresAt ? `Expires ${formatTimestamp(expiresAt)}` : "No expiry"}</p>;
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return <div className="p-6 text-center"><ShieldCheck className="mx-auto text-black/20" size={22} /><h4 className="mt-3 text-sm font-semibold text-black/65">{title}</h4><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-black/40">{detail}</p></div>;
}

function LoadingPanel() {
  return <div role="status" className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-black/10 bg-white text-sm text-black/48"><LoaderCircle className="animate-spin" size={17} /> Loading governed access…</div>;
}

type Mutation = (url: string, method: HttpMethod, body: Record<string, unknown> | undefined, success: string) => Promise<void>;

async function readCollection<T>(url: string, key: string, signal?: AbortSignal): Promise<T[]> {
  const response = await fetch(url, { cache: "no-store", signal });
  const result = await response.json().catch(() => null) as ({ ok?: boolean; error?: string; message?: string } & Record<string, unknown>) | null;
  if (response.status === 403) return [];
  if (!response.ok || !result?.ok) throw new Error(result?.message || result?.error || "Access control could not be loaded.");
  return Array.isArray(result[key]) ? result[key] as T[] : [];
}

function normaliseRequest(request: AccessRequest & { userId?: string; capabilities?: string[]; expiresAt?: number }): AccessRequest {
  return {
    ...request,
    requesterUserId: request.requesterUserId ?? request.userId ?? "",
    requestedCapabilities: request.requestedCapabilities ?? request.capabilities ?? [],
    requestedExpiresAt: request.requestedExpiresAt ?? request.expiresAt,
    status: requestStatus(request.status),
  };
}

function capabilityLabel(capability: string): string {
  const base = BASE_CAPABILITIES.find(item => item.key === capability);
  if (base) return base.label;
  const match = /^element\.(.+)\.(view|use|manage)$/.exec(capability);
  if (!match) return capability;
  const element = ELEMENT_CAPABILITIES.find(item => item.key === match[1]);
  return `${element?.label ?? match[1]} · ${match[2]}`;
}

function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value].sort();
}

function moveElementLevel(event: React.KeyboardEvent<HTMLInputElement>, levels: readonly ElementAccessLevel[], current: ElementAccessLevel, onChange: (level: ElementAccessLevel) => void) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = Math.max(0, levels.indexOf(current));
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? levels.length - 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? (currentIndex - 1 + levels.length) % levels.length
        : (currentIndex + 1) % levels.length;
  const next = levels[nextIndex]!;
  const group = event.currentTarget.closest('[role="radiogroup"]');
  onChange(next);
  requestAnimationFrame(() => {
    group?.querySelector<HTMLInputElement>(`input[value="${next}"]`)?.focus();
  });
}

function capabilityAllowedByRequest(capability: string, requested: readonly string[]): boolean {
  if (requested.includes(capability)) return true;
  const match = /^element\.(.+)\.(view|use|manage)$/.exec(capability);
  if (!match) return false;
  const rank = { view: 1, use: 2, manage: 3 } as const;
  return (["view", "use", "manage"] as const).some(level =>
    rank[level] >= rank[match[2] as keyof typeof rank]
    && requested.includes(`element.${match[1]}.${level}`)
  );
}

function daysFromNow(days: number): string {
  return dateTimeLocalValue(Date.now() + days * 86_400_000);
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(timestamp);
}

function stripLabel(scope: NamedAccessScope) {
  const { label: _label, ...plainScope } = scope;
  return plainScope;
}

function scopeKey(scope: NamedAccessScope): string {
  return [scope.kind, scope.id, scope.clientId ?? "", scope.projectId ?? ""].join(":");
}

function uniqueScopes(scopes: readonly NamedAccessScope[]): NamedAccessScope[] {
  return scopes.filter((scope, index) => scopes.findIndex(candidate => scopeKey(candidate) === scopeKey(scope)) === index);
}

const controlClass = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/80 outline-none focus-visible:border-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-700/20 disabled:opacity-60";
const labelClass = "grid gap-1.5 text-xs font-semibold text-black/55";
const primaryButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white outline-none hover:bg-black/85 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45";
const secondaryDangerButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-45";
