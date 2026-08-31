"use client";

import {
  BookOpen, Check, ChevronRight, Copy, ExternalLink, Eye, EyeOff, FileUp,
  FolderGit2, KeyRound, Link2, LockKeyhole, PackageOpen, Pencil, Plus,
  Search, Sparkles, Trash2, Upload, Wrench, X,
} from "lucide-react";
import { useEffect, useMemo, useState, useRef } from "react";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import type {
  DevelopmentResourceKind,
  DevelopmentWorkflow,
  Role,
} from "@/server/types";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

type PublicResource = {
  id: string;
  kind: DevelopmentResourceKind;
  title: string;
  description?: string;
  category?: string;
  url?: string;
  localPath?: string;
  framework?: string;
  codeSnippet?: string;
  tags: string[];
  workflowStageIds: string[];
  sopIds: string[];
  visibility: "team" | "private";
  file?: { fileName: string; contentType: string; size: number };
  credential?: {
    loginUrl?: string;
    username?: string;
    passwordManagerUrl?: string;
    accessRoles: Role[];
    notes?: string;
    hasPassword: boolean;
  };
  createdBy: string;
  updatedAt: number;
};

type SopOption = { id: string; title: string; category?: string };
type Mode = "toolkit" | "workflow" | "vault";

const KINDS: Array<{ id: DevelopmentResourceKind; label: string; group: Mode }> = [
  { id: "tool", label: "Tool", group: "toolkit" },
  { id: "app", label: "App", group: "toolkit" },
  { id: "design-inspiration", label: "Design inspiration", group: "toolkit" },
  { id: "saved-page", label: "Saved page", group: "toolkit" },
  { id: "template", label: "Template", group: "toolkit" },
  { id: "git-template", label: "Git template", group: "toolkit" },
  { id: "component", label: "Component", group: "toolkit" },
  { id: "seo-tool", label: "SEO tool", group: "toolkit" },
  { id: "canva-template", label: "Canva template", group: "toolkit" },
  { id: "inspiration-pack", label: "Inspiration pack", group: "toolkit" },
  { id: "course", label: "Course", group: "vault" },
  { id: "knowledge", label: "Knowledge", group: "vault" },
  { id: "credential", label: "Shared login", group: "vault" },
  { id: "sop", label: "SOP link", group: "vault" },
];

const EMPTY = {
  id: "",
  kind: "tool" as DevelopmentResourceKind,
  title: "",
  description: "",
  category: "",
  url: "",
  localPath: "",
  framework: "",
  codeSnippet: "",
  tags: "",
  workflowStageIds: [] as string[],
  sopIds: [] as string[],
  visibility: "team" as "team" | "private",
  loginUrl: "",
  username: "",
  password: "",
  passwordManagerUrl: "",
  accessRoles: ["agency-owner"] as Role[],
  credentialNotes: "",
};

export function DevelopmentToolkitWorkspace({
  mode,
  initialResources,
  initialTotal,
  initialCategories,
  initialWorkflows,
  sops,
  role,
}: {
  mode: Mode;
  initialResources: PublicResource[];
  initialTotal: number;
  initialCategories: string[];
  initialWorkflows: DevelopmentWorkflow[];
  sops: SopOption[];
  role: Role;
}) {
  const [resources, setResources] = useState(initialResources);
  const [total, setTotal] = useState(initialTotal);
  const [categories, setCategories] = useState(initialCategories);
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DevelopmentResourceKind | "all">("all");
  const [category, setCategory] = useState("all");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(initialWorkflows[0]?.id ?? "");
  const [selectedStageId, setSelectedStageId] = useState(initialWorkflows[0]?.stages[0]?.id ?? "");
  const [draft, setDraft] = useState<typeof EMPTY | null>(null);
  const [uploading, setUploading] = useState(false);
  const [workflowDraft, setWorkflowDraft] = useState<DevelopmentWorkflow | "new" | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const [resourceRetry, setResourceRetry] = useState<"search" | "more">("search");
  const [resourceReloadToken, setResourceReloadToken] = useState(0);
  const canManage = role === "agency-owner" || role === "agency-manager";

  const modeKinds = KINDS.filter(item => mode === "vault" ? item.group === "vault" : item.group === "toolkit").map(item => item.id);
  const baseResources = mode === "vault"
    ? resources.filter(resource => ["course", "knowledge", "credential", "sop"].includes(resource.kind))
    : resources.filter(resource => !["course", "knowledge", "credential", "sop"].includes(resource.kind));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return baseResources.filter(resource =>
      (kind === "all" || resource.kind === kind) &&
      (category === "all" || resource.category === category) &&
      (!q || `${resource.title} ${resource.description ?? ""} ${resource.category ?? ""} ${resource.tags.join(" ")} ${resource.localPath ?? ""} ${resource.framework ?? ""} ${resource.codeSnippet ?? ""}`.toLowerCase().includes(q)),
    );
  }, [baseResources, category, kind, query]);
  const displayed = filtered;

  const activeWorkflow = workflows.find(workflow => workflow.id === selectedWorkflowId) ?? workflows[0];
  const activeStageRef = activeWorkflow && selectedStageId ? stageRef(activeWorkflow.id, selectedStageId) : "";
  const isLegacyDefaultFlow = activeWorkflow?.id === workflows[0]?.id;
  const flowResources = selectedStageId
    ? resources.filter(resource =>
      resource.workflowStageIds.includes(activeStageRef) ||
      (isLegacyDefaultFlow && resource.workflowStageIds.includes(selectedStageId)),
    )
    : resources;

  useEffect(() => {
    if (mode === "workflow") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingResources(true);
      setResourceError("");
      setResourceRetry("search");
      const params = new URLSearchParams({ mode, limit: "36", offset: "0" });
      if (query.trim()) params.set("q", query.trim());
      if (kind !== "all") params.set("kind", kind);
      if (category !== "all") params.set("category", category);
      try {
        const result = await checkedJsonMutation<{ ok?: boolean; resources?: PublicResource[]; total?: number }>(
          `/api/portal/development?${params}`,
          { method: "GET", signal: controller.signal },
          {
            fallback: "Development resources could not be loaded.",
            validate: payload => Array.isArray(payload.resources),
          },
        );
        if (controller.signal.aborted) return;
        const nextResources = result.resources ?? [];
        setResources(nextResources);
        setTotal(result.total ?? nextResources.length);
      } catch (nextError) {
        if (!controller.signal.aborted) {
          setResourceError(mutationErrorMessage(nextError, "Development resources could not be loaded."));
        }
      } finally {
        if (!controller.signal.aborted) setLoadingResources(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [category, kind, mode, query, resourceReloadToken]);

  async function loadMore() {
    setLoadingResources(true);
    setResourceError("");
    setResourceRetry("more");
    try {
      const params = new URLSearchParams({ mode, limit: "36", offset: String(resources.length) });
      if (query.trim()) params.set("q", query.trim());
      if (kind !== "all") params.set("kind", kind);
      if (category !== "all") params.set("category", category);
      const result = await checkedJsonMutation<{ ok?: boolean; resources?: PublicResource[]; total?: number }>(
        `/api/portal/development?${params}`,
        { method: "GET" },
        {
          fallback: "More development resources could not be loaded.",
          validate: payload => Array.isArray(payload.resources),
        },
      );
      const nextResources = result.resources ?? [];
      setResources(current => [...current, ...nextResources.filter((item: PublicResource) => !current.some(existing => existing.id === item.id))]);
      setTotal(result.total ?? total);
    } catch (nextError) {
      setResourceError(mutationErrorMessage(nextError, "More development resources could not be loaded."));
    } finally {
      setLoadingResources(false);
    }
  }

  function editResource(resource: PublicResource) {
    setDraft({
      ...EMPTY,
      id: resource.id,
      kind: resource.kind,
      title: resource.title,
      description: resource.description ?? "",
      category: resource.category ?? "",
      url: resource.url ?? "",
      localPath: resource.localPath ?? "",
      framework: resource.framework ?? "",
      codeSnippet: resource.codeSnippet ?? "",
      tags: resource.tags.join(", "),
      workflowStageIds: resource.workflowStageIds,
      sopIds: resource.sopIds,
      visibility: resource.visibility,
      loginUrl: resource.credential?.loginUrl ?? "",
      username: resource.credential?.username ?? "",
      passwordManagerUrl: resource.credential?.passwordManagerUrl ?? "",
      accessRoles: resource.credential?.accessRoles ?? ["agency-owner"],
      credentialNotes: resource.credential?.notes ?? "",
      password: "",
    });
  }

  async function saveResource(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy("resource");
    const input = {
      kind: draft.kind,
      title: draft.title,
      description: draft.description,
      category: draft.category,
      url: draft.url,
      localPath: draft.localPath,
      framework: draft.framework,
      codeSnippet: draft.codeSnippet,
      tags: split(draft.tags),
      workflowStageIds: draft.workflowStageIds,
      sopIds: draft.sopIds,
      visibility: draft.visibility,
      credential: draft.kind === "credential" || draft.kind === "course" ? {
        loginUrl: draft.loginUrl,
        username: draft.username,
        password: draft.password || undefined,
        passwordManagerUrl: draft.passwordManagerUrl,
        accessRoles: draft.accessRoles,
        notes: draft.credentialNotes,
      } : undefined,
    };
    const response = await fetch("/api/portal/development", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft.id
        ? { action: "resource:update", resourceId: draft.id, input }
        : { action: "resource:create", input }),
    });
    const result = await response.json().catch(() => null);
    setBusy("");
    if (!response.ok || !result?.resource) return setNotice(result?.error ?? "Resource could not be saved.");
    setResources(current => current.some(item => item.id === result.resource.id)
      ? current.map(item => item.id === result.resource.id ? result.resource : item)
      : [result.resource, ...current]);
    if (!draft.id) setTotal(value => value + 1);
    if (result.resource.category) {
      setCategories(current => Array.from(new Set([...current, result.resource.category])).sort());
    }
    setDraft(null);
    setNotice("Resource saved.");
  }

  async function removeResource(resource: PublicResource) {
    if (!window.confirm(`Delete "${resource.title}" from the technical delivery library?`)) return;
    const response = await fetch("/api/portal/development", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "resource:delete", resourceId: resource.id }),
    });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !result?.ok) {
      // A refused storage delete keeps the resource on purpose. Saying nothing
      // would read as "nothing happened" while the file is still stored.
      setNotice(result?.error ?? "The resource could not be deleted.");
      return;
    }
    setResources(current => current.filter(item => item.id !== resource.id));
    setTotal(value => Math.max(0, value - 1));
    setNotice(`“${resource.title}” was deleted.`);
  }

  async function importWorkspace() {
    setBusy("catalogue"); setNotice("");
    const response = await fetch("/api/portal/development", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "catalogue:workspace" }),
    });
    const result = await response.json().catch(() => null);
    setBusy("");
    if (!response.ok) return setNotice(result?.error ?? "Workspace could not be catalogued.");
    setResources(current => [...(result.imported ?? []), ...current]);
    setTotal(value => value + (result.imported?.length ?? 0));
    setCategories(current => Array.from(new Set([
      ...current,
      ...(result.imported ?? []).map((resource: PublicResource) => resource.category).filter(Boolean),
    ])).sort());
    setNotice(`${result.imported?.length ?? 0} useful items catalogued${result.skipped ? ` · ${result.skipped} already present` : ""}.`);
  }

  async function saveWorkflow(input: { id?: string; name: string; description: string; productCategory: string; stageLines: string }) {
    setBusy("workflow");
    const stages = input.stageLines.split("\n").map((line, order) => {
      const [name, ...detail] = line.split("|");
      return { id: slug(name || `stage-${order + 1}`), name: name?.trim(), description: detail.join("|").trim(), order };
    }).filter(stage => stage.name);
    const response = await fetch("/api/portal/development", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.id
        ? { action: "workflow:update", workflowId: input.id, input: { ...input, stages } }
        : { action: "workflow:create", input: { ...input, stages } }),
    });
    const result = await response.json().catch(() => null);
    setBusy("");
    if (!response.ok || !result?.workflow) return setNotice(result?.error ?? "Workflow could not be saved.");
    setWorkflows(current => current.some(item => item.id === result.workflow.id)
      ? current.map(item => item.id === result.workflow.id ? result.workflow : item)
      : [...current, result.workflow]);
    setSelectedWorkflowId(result.workflow.id);
    setSelectedStageId(result.workflow.stages[0]?.id ?? "");
    setWorkflowDraft(null);
  }

  if (mode === "workflow") {
    return (
      <div className="space-y-7">
        <Header eyebrow="Build flow" title="Your development conveyor belt." detail="Choose a delivery system, move stage by stage, and keep the exact tools, references, components and SOPs needed at each point." actions={<>{activeWorkflow ? <select value={activeWorkflow.id} onChange={event => { setSelectedWorkflowId(event.target.value); const next = workflows.find(item => item.id === event.target.value); setSelectedStageId(next?.stages[0]?.id ?? ""); }} className={control}>{workflows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : null}{canManage ? <button onClick={() => setWorkflowDraft(activeWorkflow ?? "new")} className={secondary}><Pencil size={15} />Edit flow</button> : null}{canManage ? <button onClick={() => setWorkflowDraft("new")} className={primary}><Plus size={15} />New flow</button> : null}</>} />
        {activeWorkflow ? <>
          <div className="overflow-x-auto border-y border-black/10 py-5">
            <div className="flex min-w-max items-stretch">
              {activeWorkflow.stages.map((stage, index) => {
                const ref = stageRef(activeWorkflow.id, stage.id);
                const count = resources.filter(resource =>
                  resource.workflowStageIds.includes(ref) ||
                  (isLegacyDefaultFlow && resource.workflowStageIds.includes(stage.id)),
                ).length;
                return <div key={stage.id} className="flex items-center"><button onClick={() => setSelectedStageId(stage.id)} className={`w-44 border px-4 py-4 text-left ${selectedStageId === stage.id ? "border-brand bg-brand/[0.06]" : "border-black/10 bg-white hover:bg-black/[0.02]"}`}><span className="text-[10px] font-semibold text-black/35">{String(index + 1).padStart(2, "0")}</span><strong className="mt-2 block text-sm text-black/80">{stage.name}</strong><span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-black/45">{stage.description || "No description"}</span><span className="mt-3 block text-[10px] font-medium text-brand">{count} resource{count === 1 ? "" : "s"}</span></button>{index < activeWorkflow.stages.length - 1 ? <ChevronRight size={18} className="mx-2 shrink-0 text-black/20" /> : null}</div>;
              })}
            </div>
          </div>
          <section>
            <div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-black/85">{activeWorkflow.stages.find(stage => stage.id === selectedStageId)?.name ?? "All stages"}</h2><p className="mt-1 text-sm text-black/45">Everything ready for this part of the job.</p></div><button onClick={() => setDraft({ ...EMPTY, workflowStageIds: activeStageRef ? [activeStageRef] : [] })} className={secondary}><Plus size={15} />Attach resource</button></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{flowResources.map(resource => <ResourceCard key={resource.id} resource={resource} onEdit={() => editResource(resource)} onDelete={() => void removeResource(resource)} />)}{!flowResources.length ? <Empty title="Nothing attached yet" detail="Attach the tools, templates, components, inspiration and SOPs used at this stage." /> : null}</div>
          </section>
        </> : <Empty title="No build flow yet" detail="Create the first reusable delivery process." />}
        {draft ? <ResourceDialog draft={draft} setDraft={setDraft} workflows={workflows} sops={sops} busy={busy === "resource"} onClose={() => setDraft(null)} onSubmit={saveResource} /> : null}
        {workflowDraft ? <WorkflowDialog workflow={workflowDraft === "new" ? null : workflowDraft} busy={busy === "workflow"} onClose={() => setWorkflowDraft(null)} onSave={saveWorkflow} /> : null}
        {notice ? <Status text={notice} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <Header
        eyebrow={mode === "vault" ? "Knowledge vault" : "Technical delivery toolkit"}
        title={mode === "vault" ? "What the team knows and can access." : "Everything you reach for, ready."}
        detail={mode === "vault"
          ? "Courses, notes, procedures and controlled shared logins. Passwords are encrypted and only revealed to permitted roles."
          : "Apps, SEO tools, saved pages, Canva designs, reusable code, components and inspiration without hunting through folders."}
        actions={<>{mode === "toolkit" && canManage ? <button onClick={() => void importWorkspace()} disabled={busy === "catalogue"} className={secondary}><FolderGit2 size={15} />{busy === "catalogue" ? "Cataloguing..." : "Catalogue workspace"}</button> : null}<button onClick={() => setUploading(true)} className={secondary}><Upload size={15} />Upload</button><button onClick={() => setDraft({ ...EMPTY, kind: mode === "vault" ? "knowledge" : "tool" })} className={primary}><Plus size={15} />Add {mode === "vault" ? "vault item" : "resource"}</button></>}
      />

      <div className="grid gap-3 border-y border-black/10 py-4 lg:grid-cols-[minmax(240px,1fr)_190px_190px]">
        <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35" /><input value={query} onChange={event => setQuery(event.target.value)} className={`${control} pl-9`} placeholder={mode === "vault" ? "Search knowledge, courses and logins" : "Search tools, templates, links and components"} /></label>
        <select value={kind} onChange={event => setKind(event.target.value as DevelopmentResourceKind | "all")} className={control}><option value="all">All types</option>{KINDS.filter(item => modeKinds.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <select value={category} onChange={event => setCategory(event.target.value)} className={control}><option value="all">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/50">{total} item{total === 1 ? "" : "s"} · {categories.length} categor{categories.length === 1 ? "y" : "ies"}{loadingResources ? " · Searching..." : ""}</p>
        {notice ? <Status text={notice} /> : null}
      </div>

      {resourceError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>{resourceError}</span>
          <button
            type="button"
            disabled={loadingResources}
            onClick={() => resourceRetry === "more" ? void loadMore() : setResourceReloadToken(value => value + 1)}
            className="rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-800 disabled:opacity-50"
          >
            {resourceRetry === "more" ? "Retry more" : "Retry resources"}
          </button>
        </div>
      ) : null}

      {filtered.length ? <>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{displayed.map(resource => <ResourceCard key={resource.id} resource={resource} onEdit={() => editResource(resource)} onDelete={() => void removeResource(resource)} />)}</div>
        {displayed.length < total ? <div className="flex justify-center border-t border-black/10 pt-5"><button onClick={() => void loadMore()} disabled={loadingResources} className={secondary}>{loadingResources ? "Loading..." : `Show 36 more · ${total - displayed.length} remaining`}</button></div> : null}
      </> : <Empty title={query || kind !== "all" || category !== "all" ? "Nothing matches" : "Start your library"} detail={mode === "vault" ? "Add a course, useful note, SOP connection or controlled shared login." : "Save the first tool, link, component, template or inspiration pack you want ready next time."} />}

      {draft ? <ResourceDialog draft={draft} setDraft={setDraft} workflows={workflows} sops={sops} busy={busy === "resource"} onClose={() => setDraft(null)} onSubmit={saveResource} /> : null}
      {uploading ? <UploadDialog mode={mode} workflows={workflows} onClose={() => setUploading(false)} onUploaded={resource => {
        setResources(current => [resource, ...current]);
        setTotal(value => value + 1);
        if (resource.category) setCategories(current => Array.from(new Set([...current, resource.category!])).sort());
        setUploading(false);
      }} /> : null}
    </div>
  );
}

function ResourceCard({ resource, onEdit, onDelete }: { resource: PublicResource; onEdit: () => void; onDelete: () => void }) {
  const [password, setPassword] = useState("");
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState("");
  const Icon = resource.kind === "credential" ? KeyRound : resource.kind === "course" || resource.kind === "knowledge" ? BookOpen : resource.kind.includes("template") || resource.kind === "component" ? PackageOpen : resource.kind.includes("inspiration") ? Sparkles : Wrench;
  async function reveal() {
    if (password) {
      setPassword("");
      setRevealError("");
      return;
    }
    setRevealing(true);
    setRevealError("");
    try {
      const result = await checkedJsonMutation<{ ok?: boolean; password?: string }>(
        "/api/portal/development",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "credential:reveal", resourceId: resource.id }) },
        {
          fallback: "The shared password could not be revealed.",
          validate: payload => typeof payload.password === "string" && payload.password.length > 0,
        },
      );
      setPassword(result.password ?? "");
    } catch (nextError) {
      setRevealError(mutationErrorMessage(nextError, "The shared password could not be revealed."));
    } finally {
      setRevealing(false);
    }
  }
  const openUrl = resource.kind === "credential" ? resource.credential?.loginUrl : resource.url;
  const hasImagePreview = Boolean(
    resource.file?.contentType.startsWith("image/") ||
    (resource.kind === "design-inspiration" && resource.localPath?.match(/\.(png|jpe?g|webp|gif)$/i)),
  );
  return (
    <article className="group flex min-h-56 flex-col border border-black/10 bg-white p-4 shadow-sm">
      {hasImagePreview ? <a href={`/api/portal/development/content?id=${encodeURIComponent(resource.id)}`} target="_blank" className="-m-4 mb-4 block aspect-[16/9] overflow-hidden border-b border-black/10 bg-black/[0.025]"><img src={`/api/portal/development/content?id=${encodeURIComponent(resource.id)}`} alt={resource.title} className="h-full w-full object-cover" loading="lazy" /></a> : null}
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/[0.045] text-black/55"><Icon size={17} /></span>
        <div className="flex opacity-60 transition group-hover:opacity-100"><button onClick={onEdit} aria-label={`Edit ${resource.title}`} className="grid size-8 place-items-center rounded-md hover:bg-black/[0.04]"><Pencil size={14} /></button><button onClick={onDelete} aria-label={`Delete ${resource.title}`} className="grid size-8 place-items-center rounded-md text-black/40 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /></button></div>
      </div>
      <div className="mt-4 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase text-brand">{kindLabel(resource.kind)}</span>{resource.visibility === "private" ? <LockKeyhole size={12} className="text-black/35" /> : null}</div>
        <h3 className="mt-1 font-semibold text-black/85">{resource.title}</h3>
        {resource.description ? <p className="mt-2 line-clamp-3 text-xs leading-5 text-black/50">{resource.description}</p> : null}
        {resource.kind === "component" && resource.framework ? <p className="mt-2 text-[10px] font-semibold uppercase text-black/40">{resource.framework}</p> : null}
        {resource.kind === "component" && resource.codeSnippet ? <pre className="mt-3 max-h-24 overflow-hidden rounded-md bg-black/[0.035] p-2 font-mono text-[10px] leading-4 text-black/55"><code>{resource.codeSnippet}</code></pre> : null}
        {resource.credential?.username ? (
          <div className="mt-3 rounded-md bg-black/[0.025] p-2.5 text-xs">
            <p className="text-black/40">Username</p>
            <p className="mt-0.5 break-all font-medium text-black/70">{resource.credential.username}</p>
            {resource.credential.hasPassword ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-black/60">{password || "••••••••••••"}</code>
                  <button
                    type="button"
                    onClick={() => void reveal()}
                    disabled={revealing}
                    aria-label={`${password ? "Hide" : "Reveal"} ${resource.title} password`}
                    className="grid size-7 place-items-center rounded-md border border-black/10 disabled:opacity-50"
                  >
                    {password ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  {password ? <button type="button" onClick={() => void navigator.clipboard.writeText(password)} className="grid size-7 place-items-center rounded-md border border-black/10" aria-label={`Copy ${resource.title} password`}><Copy size={13} /></button> : null}
                </div>
                {revealing ? <p className="mt-2 text-black/45">Revealing password…</p> : null}
                {revealError ? <p role="alert" className="mt-2 text-red-700">{revealError} Retry with the reveal button.</p> : null}
              </>
            ) : null}
          </div>
        ) : null}
        {resource.localPath ? <p className="mt-3 break-all font-mono text-[10px] leading-4 text-black/40">{resource.localPath}</p> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/8 pt-3">
        {resource.category ? <span className="rounded-full bg-black/[0.045] px-2 py-1 text-[10px] text-black/50">{resource.category}</span> : null}
        {resource.tags.slice(0, 3).map(tag => <span key={tag} className="text-[10px] text-black/35">#{tag}</span>)}
        <span className="flex-1" />
        {resource.file ? <a href={`/api/portal/development/content?id=${encodeURIComponent(resource.id)}`} target="_blank" className="grid size-8 place-items-center rounded-md border border-black/10 text-black/50" aria-label={`Open ${resource.file.fileName}`}><FileUp size={14} /></a> : null}
        {resource.codeSnippet ? <button onClick={() => void navigator.clipboard.writeText(resource.codeSnippet ?? "")} className="grid size-8 place-items-center rounded-md border border-black/10 text-black/50" aria-label={`Copy ${resource.title} code`}><Copy size={14} /></button> : null}
        {resource.credential?.passwordManagerUrl ? <a href={resource.credential.passwordManagerUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-md border border-black/10 text-black/50" aria-label="Open password manager"><LockKeyhole size={14} /></a> : null}
        {openUrl ? <a href={openUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-md bg-black text-white" aria-label={`Open ${resource.title}`}><ExternalLink size={14} /></a> : null}
      </div>
    </article>
  );
}

function ResourceDialog({ draft, setDraft, workflows, sops, busy, onClose, onSubmit }: { draft: typeof EMPTY; setDraft: React.Dispatch<React.SetStateAction<typeof EMPTY | null>>; workflows: DevelopmentWorkflow[]; sops: SopOption[]; busy: boolean; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  const stages = workflows.flatMap(workflow => workflow.stages.map(stage => ({ ...stage, workflowId: workflow.id, workflowName: workflow.name, ref: stageRef(workflow.id, stage.id) })));
  const toggle = (field: "workflowStageIds" | "sopIds" | "accessRoles", value: string) => setDraft(current => current ? ({ ...current, [field]: current[field].includes(value as never) ? current[field].filter(item => item !== value) : [...current[field], value] }) : current);
  const toggleStage = (workflowId: string, stageId: string) => setDraft(current => {
    if (!current) return current;
    const ref = stageRef(workflowId, stageId);
    const legacyRef = workflowId === workflows[0]?.id ? stageId : "";
    const selected = current.workflowStageIds.includes(ref) || Boolean(legacyRef && current.workflowStageIds.includes(legacyRef));
    const withoutStage = current.workflowStageIds.filter(item => item !== ref && item !== legacyRef);
    return { ...current, workflowStageIds: selected ? withoutStage : [...withoutStage, ref] };
  });
  return <Modal title={draft.id ? "Edit resource" : "Add resource"} onClose={onClose}><form onSubmit={onSubmit} className="grid gap-4">
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Type"><select value={draft.kind} onChange={event => setDraft(current => current ? { ...current, kind: event.target.value as DevelopmentResourceKind } : current)} className={control}>{KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="Category"><input value={draft.category} onChange={event => setDraft(current => current ? { ...current, category: event.target.value } : current)} className={control} placeholder="Design, SEO, deployment..." /></Field></div>
    <Field label="Title"><input required value={draft.title} onChange={event => setDraft(current => current ? { ...current, title: event.target.value } : current)} className={control} /></Field>
    <Field label="What it is useful for"><textarea rows={3} value={draft.description} onChange={event => setDraft(current => current ? { ...current, description: event.target.value } : current)} className={`${control} py-2`} /></Field>
    {draft.kind === "credential" || draft.kind === "course" ? <div className="grid gap-4 rounded-md border border-black/10 bg-black/[0.015] p-4">
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Login page"><input type="url" value={draft.loginUrl} onChange={event => setDraft(current => current ? { ...current, loginUrl: event.target.value } : current)} className={control} placeholder="https://" /></Field><Field label="Username or email"><input value={draft.username} onChange={event => setDraft(current => current ? { ...current, username: event.target.value } : current)} className={control} /></Field></div>
      <Field label={draft.id ? "New password (leave blank to keep current)" : "Password (optional)"}><input type="password" value={draft.password} onChange={event => setDraft(current => current ? { ...current, password: event.target.value } : current)} className={control} autoComplete="new-password" /></Field>
      <Field label="Password manager link (recommended)"><input type="url" value={draft.passwordManagerUrl} onChange={event => setDraft(current => current ? { ...current, passwordManagerUrl: event.target.value } : current)} className={control} placeholder="https://" /></Field>
      <Field label="Who may reveal it"><div className="flex flex-wrap gap-2">{(["agency-owner", "agency-manager", "agency-staff"] as Role[]).map(item => <label key={item} className="inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-2 text-xs"><input type="checkbox" checked={draft.accessRoles.includes(item)} onChange={() => toggle("accessRoles", item)} />{item.replace("agency-", "")}</label>)}</div></Field>
      <Field label="Access notes"><textarea rows={2} value={draft.credentialNotes} onChange={event => setDraft(current => current ? { ...current, credentialNotes: event.target.value } : current)} className={`${control} py-2`} placeholder="MFA owner, licence limits, usage rules..." /></Field>
    </div> : <><div className="grid gap-4 sm:grid-cols-2"><Field label="Web link"><input type="url" value={draft.url} onChange={event => setDraft(current => current ? { ...current, url: event.target.value } : current)} className={control} placeholder="https://" /></Field><Field label="Local or repository path"><input value={draft.localPath} onChange={event => setDraft(current => current ? { ...current, localPath: event.target.value } : current)} className={control} placeholder="github-templates/modules/forms" /></Field></div>{draft.kind === "component" ? <div className="grid gap-4 rounded-md border border-black/10 bg-black/[0.015] p-4"><Field label="Framework or stack"><input value={draft.framework} onChange={event => setDraft(current => current ? { ...current, framework: event.target.value } : current)} className={control} placeholder="React, Next.js, Tailwind..." /></Field><Field label="Reusable component code"><textarea rows={12} value={draft.codeSnippet} onChange={event => setDraft(current => current ? { ...current, codeSnippet: event.target.value } : current)} className={`${control} py-2 font-mono text-xs leading-5`} placeholder="Paste the complete reusable component here." /></Field></div> : null}</>}
    <Field label="Tags"><input value={draft.tags} onChange={event => setDraft(current => current ? { ...current, tags: event.target.value } : current)} className={control} placeholder="website, luxury, reusable" /></Field>
    {stages.length ? <details className="border-t border-black/10 pt-3"><summary className="cursor-pointer text-sm font-semibold text-black/70">Build-flow stages · {draft.workflowStageIds.length} selected</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{stages.map(stage => <label key={stage.ref} className="flex items-start gap-2 text-xs text-black/60"><input className="mt-0.5" type="checkbox" checked={draft.workflowStageIds.includes(stage.ref) || (stage.workflowId === workflows[0]?.id && draft.workflowStageIds.includes(stage.id))} onChange={() => toggleStage(stage.workflowId, stage.id)} /><span><strong className="block font-medium text-black/70">{stage.name}</strong>{stage.workflowName}</span></label>)}</div></details> : null}
    {sops.length ? <details className="border-t border-black/10 pt-3"><summary className="cursor-pointer text-sm font-semibold text-black/70">Related SOPs · {draft.sopIds.length} selected</summary><div className="mt-3 grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">{sops.map(sop => <label key={sop.id} className="flex items-start gap-2 text-xs text-black/60"><input className="mt-0.5" type="checkbox" checked={draft.sopIds.includes(sop.id)} onChange={() => toggle("sopIds", sop.id)} /><span>{sop.title}<small className="block text-black/35">{sop.category}</small></span></label>)}</div></details> : null}
    <Field label="Visibility"><select value={draft.visibility} onChange={event => setDraft(current => current ? { ...current, visibility: event.target.value as "team" | "private" } : current)} className={control}><option value="team">Team</option><option value="private">Private to me</option></select></Field>
    <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 px-3 text-sm">Cancel</button><button disabled={busy} className={primary}><Check size={15} />{busy ? "Saving..." : "Save resource"}</button></div>
  </form></Modal>;
}

function UploadDialog({ mode, workflows, onClose, onUploaded }: { mode: Mode; workflows: DevelopmentWorkflow[]; onClose: () => void; onUploaded: (resource: PublicResource) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal title="Upload to technical delivery" onClose={onClose}><form className="grid gap-4" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); const response = await fetch("/api/portal/development/upload", { method: "POST", body: new FormData(event.currentTarget) }); const result = await response.json().catch(() => null); setBusy(false); if (!response.ok || !result?.resource) return setError(result?.error ?? "Upload failed."); onUploaded(result.resource); }}>
    <label className="grid min-h-32 cursor-pointer place-items-center rounded-md border border-dashed border-black/20 bg-black/[0.015] text-center"><span><Upload size={22} className="mx-auto text-black/35" /><strong className="mt-2 block text-sm text-black/70">Choose a file</strong><small className="mt-1 block text-black/40">Images, PDF, presentation, document, text, JSON or ZIP · 25 MB</small></span><input required type="file" name="file" className="sr-only" /></label>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Title"><input name="title" className={control} /></Field><Field label="Type"><select name="kind" defaultValue={mode === "vault" ? "knowledge" : "inspiration-pack"} className={control}>{KINDS.filter(item => item.group === mode && item.id !== "credential").map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field></div>
    <Field label="Description"><textarea name="description" rows={3} className={`${control} py-2`} /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Category"><input name="category" className={control} /></Field><Field label="Tags"><input name="tags" className={control} placeholder="comma, separated" /></Field></div>
    <Field label="Build stage"><select name="workflowStageIds" className={control}><option value="">Not tied to a stage</option>{workflows.flatMap(workflow => workflow.stages.map(stage => <option key={`${workflow.id}:${stage.id}`} value={stageRef(workflow.id, stage.id)}>{workflow.name} · {stage.name}</option>))}</select></Field>
    <Field label="Visibility"><select name="visibility" className={control}><option value="team">Team</option><option value="private">Private to me</option></select></Field>
    {error ? <p className="text-sm text-red-700">{error}</p> : null}<div className="flex justify-end"><button disabled={busy} className={primary}><Upload size={15} />{busy ? "Uploading..." : "Upload resource"}</button></div>
  </form></Modal>;
}

function WorkflowDialog({ workflow, busy, onClose, onSave }: { workflow: DevelopmentWorkflow | null; busy: boolean; onClose: () => void; onSave: (input: { id?: string; name: string; description: string; productCategory: string; stageLines: string }) => void }) {
  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [productCategory, setProductCategory] = useState(workflow?.productCategory ?? "");
  const [stageLines, setStageLines] = useState(workflow?.stages.map(stage => `${stage.name}${stage.description ? ` | ${stage.description}` : ""}`).join("\n") ?? "Discover | Research and references\nPlan | Scope and structure\nDesign | Direction and components\nBuild | Implementation\nQuality | SEO, accessibility and device checks\nLaunch | Production and handover\nCare | Monitoring and updates");
  return <Modal title={workflow ? "Edit build flow" : "New build flow"} onClose={onClose}><form className="grid gap-4" onSubmit={event => { event.preventDefault(); onSave({ id: workflow?.id, name, description, productCategory, stageLines }); }}><Field label="Flow name"><input required value={name} onChange={event => setName(event.target.value)} className={control} placeholder="Photography delivery" /></Field><Field label="Used for"><input value={productCategory} onChange={event => setProductCategory(event.target.value)} className={control} placeholder="Photography, websites, branding..." /></Field><Field label="Purpose"><textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} className={`${control} py-2`} /></Field><Field label="Stages · one per line · Name | short description"><textarea required rows={12} value={stageLines} onChange={event => setStageLines(event.target.value)} className={`${control} py-2 font-mono text-xs leading-5`} /></Field><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 px-3 text-sm">Cancel</button><button disabled={busy} className={primary}><Check size={15} />{busy ? "Saving..." : "Save flow"}</button></div></form></Modal>;
}

function Header({ eyebrow, title, detail, actions }: { eyebrow: string; title: string; detail: string; actions: React.ReactNode }) { return <header className="flex flex-wrap items-end justify-between gap-5"><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-wide text-brand">{eyebrow}</p><h1 className="mt-1 text-3xl font-semibold text-black/90">{title}</h1><p className="mt-2 text-sm leading-6 text-black/55">{detail}</p></div><div className="flex flex-wrap gap-2">{actions}</div></header>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Modal keyboard contract: focus enters the dialog, Tab stays inside it,
  // Escape closes it, and focus returns to the control that opened it.
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: onClose });
  return <div className="fixed inset-0 z-[100] grid items-end bg-black/45 sm:items-center sm:p-5"><button className="absolute inset-0" aria-label="Close" onClick={onClose} /><section ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} className="relative mx-auto max-h-[94vh] w-full max-w-2xl overflow-y-auto bg-[#F8F7F3] p-5 shadow-2xl sm:rounded-md sm:p-6"><header className="mb-5 flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-brand">Development</p><h2 className="mt-1 text-xl font-semibold">{title}</h2></div><button onClick={onClose} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white"><X size={16} /></button></header>{children}</section></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-xs font-medium text-black/60">{label}{children}</label>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className="col-span-full grid min-h-52 place-items-center border-y border-dashed border-black/15 px-5 text-center"><div><PackageOpen size={27} className="mx-auto text-black/20" /><p className="mt-3 font-semibold text-black/65">{title}</p><p className="mt-1 max-w-md text-sm text-black/40">{detail}</p></div></div>; }
function Status({ text }: { text: string }) { return <p role="status" className="text-xs font-medium text-black/50">{text}</p>; }
function kindLabel(kind: DevelopmentResourceKind) { return KINDS.find(item => item.id === kind)?.label ?? kind; }
function split(value: string) { return value.split(",").map(item => item.trim()).filter(Boolean); }
function slug(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function stageRef(workflowId: string, stageId: string) { return `${workflowId}:${stageId}`; }
const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/40";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3.5 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/65 hover:bg-black/[0.025]";
