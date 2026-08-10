"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Code2,
  ExternalLink,
  FileStack,
  GitBranch,
  Globe2,
  Laptop,
  Layers3,
  Monitor,
  PencilRuler,
  Plus,
  RadioTower,
  RefreshCw,
  Save,
  Smartphone,
  Tablet,
  Trash2,
  Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  FunnelFormat,
  FunnelStep,
  FunnelStepKind,
  MarketingAsset,
  MarketingAssetStatus,
} from "@/built-ins/modules/agency-marketing/src/lib/domain";

export interface FunnelCompanyOption {
  id: string;
  name: string;
  slug: string;
  colour: string;
}

export interface FunnelProjectOption {
  id: string;
  name: string;
  brand: string;
  previewUrl: string;
  publicUrl: string;
  repositoryUrl: string;
  sourcePath: string;
}

type WorkspaceView = "builder" | "preview" | "connections" | "results";
type PreviewDevice = "desktop" | "tablet" | "mobile";
type PreviewEnvironment = "preview" | "live";

type FunnelDraft = {
  id?: string;
  name: string;
  companyIds: string[];
  status: MarketingAssetStatus;
  format: FunnelFormat;
  objective: string;
  owner: string;
  primaryGoal: string;
  primaryCta: string;
  previewUrl: string;
  productionUrl: string;
  editorUrl: string;
  repositoryUrl: string;
  localPath: string;
  developmentProjectId: string;
  conversionEvent: string;
  telemetrySiteKey: string;
  telemetryPropertyId: string;
  budget: string;
  spend: string;
  leads: string;
  conversions: string;
  notes: string;
  steps: FunnelStep[];
};

const DEFAULT_STEPS: FunnelStep[] = [
  { id: "step_landing", name: "Landing page", path: "/", kind: "landing", headline: "", ctaLabel: "Get started" },
  { id: "step_action", name: "Capture details", path: "/details", kind: "form", headline: "", ctaLabel: "Continue" },
  { id: "step_thanks", name: "Thank you", path: "/thank-you", kind: "thank-you", headline: "", ctaLabel: "" },
];

const EMPTY_DRAFT: FunnelDraft = {
  name: "",
  companyIds: [],
  status: "draft",
  format: "multi-step",
  objective: "",
  owner: "Ed",
  primaryGoal: "",
  primaryCta: "Get started",
  previewUrl: "",
  productionUrl: "",
  editorUrl: "",
  repositoryUrl: "",
  localPath: "",
  developmentProjectId: "",
  conversionEvent: "funnel_complete",
  telemetrySiteKey: "",
  telemetryPropertyId: "",
  budget: "",
  spend: "",
  leads: "0",
  conversions: "0",
  notes: "",
  steps: DEFAULT_STEPS,
};

export function FunnelsWorkspace({
  assets,
  companies = [],
  projects = [],
  defaultCompanyIds = [],
}: {
  assets: MarketingAsset[];
  companies?: FunnelCompanyOption[];
  projects?: FunnelProjectOption[];
  defaultCompanyIds?: string[];
}) {
  const router = useRouter();
  const [records, setRecords] = useState(assets);
  const [draft, setDraft] = useState<FunnelDraft | null>(() => assets[0] ? assetToDraft(assets[0]) : null);
  const [view, setView] = useState<WorkspaceView>("builder");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [previewEnvironment, setPreviewEnvironment] = useState<PreviewEnvironment>("preview");
  const [activeStepId, setActiveStepId] = useState<string>(() => assets[0]?.funnel?.steps[0]?.id ?? "");
  const [previewKey, setPreviewKey] = useState(0);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setRecords(assets);
    setDraft(current => {
      if (!current?.id) return current;
      const refreshed = assets.find(asset => asset.id === current.id);
      return refreshed ? assetToDraft(refreshed) : current;
    });
  }, [assets]);

  const activeStep = draft?.steps.find(step => step.id === activeStepId) ?? draft?.steps[0];
  const previewBase = draft
    ? previewEnvironment === "preview"
      ? draft.previewUrl || draft.productionUrl
      : draft.productionUrl || draft.previewUrl
    : "";
  const previewUrl = previewBase && activeStep ? joinUrl(previewBase, activeStep.path) : previewBase;
  const linkedProject = projects.find(project => project.id === draft?.developmentProjectId);
  const activeCount = records.filter(asset => asset.status === "active").length;
  const totalConversions = records.reduce((sum, asset) => sum + asset.conversions, 0);
  const linkedCount = records.filter(asset => Boolean(asset.funnel?.repositoryUrl || asset.funnel?.developmentProjectId)).length;
  const conversionRate = records.reduce((sum, asset) => sum + asset.leads, 0)
    ? Math.round((totalConversions / records.reduce((sum, asset) => sum + asset.leads, 0)) * 100)
    : 0;

  function startNew() {
    setDraft({ ...EMPTY_DRAFT, companyIds: [...defaultCompanyIds], steps: DEFAULT_STEPS.map(step => ({ ...step, id: createId("step") })) });
    setActiveStepId("");
    setView("builder");
    setNotice("");
    setError("");
  }

  function openAsset(asset: MarketingAsset) {
    const next = assetToDraft(asset);
    setDraft(next);
    setActiveStepId(next.steps[0]?.id ?? "");
    setView("builder");
    setNotice("");
    setError("");
  }

  function updateDraft(patch: Partial<FunnelDraft>) {
    setDraft(current => current ? { ...current, ...patch } : current);
  }

  function updateStep(id: string, patch: Partial<FunnelStep>) {
    setDraft(current => current ? {
      ...current,
      steps: current.steps.map(step => step.id === id ? { ...step, ...patch } : step),
    } : current);
  }

  function addStep() {
    const id = createId("step");
    const step: FunnelStep = {
      id,
      name: "New step",
      path: draft?.format === "one-page" ? "#new-section" : "/new-step",
      kind: "custom",
      headline: "",
      ctaLabel: "Continue",
    };
    setDraft(current => current ? { ...current, steps: [...current.steps, step] } : current);
    setActiveStepId(id);
  }

  function removeStep(id: string) {
    setDraft(current => current ? { ...current, steps: current.steps.filter(step => step.id !== id) } : current);
    if (activeStepId === id) setActiveStepId("");
  }

  function moveStep(index: number, direction: -1 | 1) {
    setDraft(current => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.steps.length) return current;
      const steps = [...current.steps];
      const [step] = steps.splice(index, 1);
      if (!step) return current;
      steps.splice(target, 0, step);
      return { ...current, steps };
    });
  }

  function connectProject(projectId: string) {
    const project = projects.find(item => item.id === projectId);
    updateDraft(project ? {
      developmentProjectId: project.id,
      previewUrl: project.previewUrl,
      productionUrl: project.publicUrl,
      editorUrl: projectEditorUrl(project),
      repositoryUrl: project.repositoryUrl,
      localPath: project.sourcePath,
    } : { developmentProjectId: "" });
  }

  async function save() {
    if (!draft?.name.trim()) {
      setError("Give this funnel a name before saving.");
      return;
    }
    setBusy("save");
    setError("");
    setNotice("");
    const payload = {
      name: draft.name,
      companyIds: draft.companyIds,
      status: draft.status,
      platform: formatLabel(draft.format),
      url: draft.productionUrl,
      objective: draft.objective,
      owner: draft.owner,
      budgetCents: moneyToCents(draft.budget),
      spendCents: moneyToCents(draft.spend),
      leads: countValue(draft.leads),
      conversions: countValue(draft.conversions),
      notes: draft.notes,
      funnel: {
        format: draft.format,
        previewUrl: draft.previewUrl,
        productionUrl: draft.productionUrl,
        editorUrl: draft.editorUrl,
        repositoryUrl: draft.repositoryUrl,
        localPath: draft.localPath,
        developmentProjectId: draft.developmentProjectId,
        primaryGoal: draft.primaryGoal,
        primaryCta: draft.primaryCta,
        conversionEvent: draft.conversionEvent,
        telemetrySiteKey: draft.telemetrySiteKey,
        telemetryPropertyId: draft.telemetryPropertyId,
        steps: draft.steps,
      },
    };
    try {
      const response = await fetch("/api/portal/agency-marketing/assets", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft.id ? { id: draft.id, patch: payload } : { ...payload, kind: "funnel" }),
      });
      const data = await response.json() as { ok?: boolean; error?: string; asset?: MarketingAsset };
      if (!response.ok || !data.ok || !data.asset) throw new Error(data.error ?? "Could not save this funnel.");
      setRecords(current => draft.id
        ? current.map(asset => asset.id === data.asset?.id ? data.asset : asset)
        : [data.asset!, ...current]);
      setDraft(assetToDraft(data.asset));
      setActiveStepId(data.asset.funnel?.steps[0]?.id ?? "");
      setNotice("Funnel saved.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this funnel.");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!draft?.id || !window.confirm(`Delete "${draft.name}" from Funnels?`)) return;
    setBusy("delete");
    setError("");
    try {
      const response = await fetch(`/api/portal/agency-marketing/assets?id=${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not delete this funnel.");
      const next = records.filter(asset => asset.id !== draft.id);
      setRecords(next);
      setDraft(next[0] ? assetToDraft(next[0]) : null);
      setActiveStepId(next[0]?.funnel?.steps[0]?.id ?? "");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this funnel.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Conversion journeys</p>
          <h2 className="mt-1 text-2xl font-semibold text-black/88">Funnels</h2>
          <p className="mt-2 text-sm leading-6 text-black/52">Build the route, inspect every breakpoint, connect the repository and track the action that turns attention into a lead, meeting or sale.</p>
        </div>
        <button type="button" onClick={startNew} className={primary}><Plus size={16} />New funnel</button>
      </header>

      <div className="grid grid-cols-2 border-y border-black/10 lg:grid-cols-4">
        <Metric label="Funnels" value={String(records.length)} icon={<Workflow size={15} />} />
        <Metric label="Active" value={String(activeCount)} icon={<Globe2 size={15} />} />
        <Metric label="Repo linked" value={String(linkedCount)} icon={<GitBranch size={15} />} />
        <Metric label="Conversion" value={`${conversionRate}%`} icon={<BarChart3 size={15} />} />
      </div>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="grid min-h-[720px] overflow-hidden border border-black/12 bg-white shadow-sm lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-black/10 bg-[#f7f8f7] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <div><p className="text-xs font-semibold text-black/72">Your funnels</p><p className="mt-0.5 text-[11px] text-black/40">{records.length} saved</p></div>
            <button type="button" onClick={startNew} aria-label="Create funnel" title="Create funnel" className={iconButton}><Plus size={15} /></button>
          </div>
          <div className="flex gap-2 overflow-x-auto p-2 lg:block lg:max-h-[660px] lg:space-y-1 lg:overflow-y-auto">
            {records.map(asset => {
              const selected = draft?.id === asset.id;
              return (
                <button key={asset.id} type="button" onClick={() => openAsset(asset)} className={`min-w-[220px] rounded-md border p-3 text-left transition lg:min-w-0 lg:w-full ${selected ? "border-brand/35 bg-white shadow-sm" : "border-transparent hover:border-black/10 hover:bg-white/70"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <strong className="truncate text-sm text-black/78">{asset.name}</strong>
                    <span className={`size-2 shrink-0 rounded-full ${asset.status === "active" ? "bg-emerald-500" : asset.status === "paused" ? "bg-amber-500" : "bg-black/20"}`} />
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-black/43">{formatLabel(asset.funnel?.format ?? "one-page")}  -  {asset.funnel?.steps.length ?? 0} steps</span>
                  <span className="mt-2 flex items-center gap-3 text-[10px] text-black/42"><span>{asset.leads} leads</span><span>{asset.conversions} conversions</span></span>
                </button>
              );
            })}
            {!records.length ? <div className="px-3 py-8 text-center text-xs leading-5 text-black/40">No funnels yet. Create one and connect its build when ready.</div> : null}
          </div>
        </aside>

        {!draft ? (
          <div className="grid place-items-center p-8 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid size-12 place-items-center rounded-md bg-brand/10 text-brand"><Workflow size={22} /></span>
              <h3 className="mt-4 text-lg font-semibold text-black/80">Build the first conversion route</h3>
              <p className="mt-2 text-sm leading-6 text-black/48">Start simple. One page is enough, or add steps and pages as the journey becomes clearer.</p>
              <button type="button" onClick={startNew} className={`${primary} mt-5`}><Plus size={16} />New funnel</button>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <header className="border-b border-black/10 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[220px] flex-1">
                  <label className="sr-only" htmlFor="funnel-name">Funnel name</label>
                  <input id="funnel-name" value={draft.name} onChange={event => updateDraft({ name: event.target.value })} placeholder="Funnel name" className="w-full border-0 bg-transparent p-0 text-lg font-semibold text-black/85 outline-none placeholder:text-black/25" />
                  <p className="mt-1 text-xs text-black/42">{linkedProject ? `Linked to ${linkedProject.name}` : "Not linked to a Development project yet"}</p>
                </div>
                {draft.editorUrl || linkedProject ? <Link href={draft.editorUrl || projectEditorUrl(linkedProject!)} className={secondary}><PencilRuler size={15} />Editor</Link> : null}
                {draft.repositoryUrl ? <a href={draft.repositoryUrl} target="_blank" rel="noreferrer" className={secondary}><GitBranch size={15} />Repo</a> : null}
                {previewUrl ? <a href={previewUrl} target="_blank" rel="noreferrer" className={secondary}><ExternalLink size={15} />Open</a> : null}
                <select value={draft.status} onChange={event => updateDraft({ status: event.target.value as MarketingAssetStatus })} aria-label="Funnel status" className={control}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="complete">Complete</option>
                  <option value="archived">Archived</option>
                </select>
                {draft.id ? <button type="button" onClick={() => void remove()} disabled={busy === "delete"} aria-label="Delete funnel" title="Delete funnel" className={dangerIcon}><Trash2 size={15} /></button> : null}
                <button type="button" onClick={() => void save()} disabled={busy === "save"} className={primary}>{busy === "save" ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}{busy === "save" ? "Saving" : "Save"}</button>
              </div>
              {notice ? <p role="status" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check size={13} />{notice}</p> : null}
            </header>

            <nav aria-label="Funnel workspace" className="flex gap-1 overflow-x-auto border-b border-black/10 bg-black/[0.015] px-3 py-2 sm:px-5">
              <ViewButton active={view === "builder"} icon={<Layers3 size={14} />} label="Builder" onClick={() => setView("builder")} />
              <ViewButton active={view === "preview"} icon={<Monitor size={14} />} label="Preview" onClick={() => setView("preview")} />
              <ViewButton active={view === "connections"} icon={<GitBranch size={14} />} label="Connections" onClick={() => setView("connections")} />
              <ViewButton active={view === "results"} icon={<BarChart3 size={14} />} label="Results" onClick={() => setView("results")} />
            </nav>

            <div className="p-4 sm:p-5">
              {view === "builder" ? (
                <BuilderView
                  draft={draft}
                  companies={companies}
                  activeStepId={activeStep?.id ?? ""}
                  onDraft={updateDraft}
                  onSelectStep={setActiveStepId}
                  onStep={updateStep}
                  onAddStep={addStep}
                  onRemoveStep={removeStep}
                  onMoveStep={moveStep}
                />
              ) : view === "preview" ? (
                <PreviewView
                  draft={draft}
                  previewUrl={previewUrl}
                  activeStepId={activeStep?.id ?? ""}
                  previewDevice={previewDevice}
                  previewEnvironment={previewEnvironment}
                  previewKey={previewKey}
                  onSelectStep={setActiveStepId}
                  onDevice={setPreviewDevice}
                  onEnvironment={setPreviewEnvironment}
                  onRefresh={() => setPreviewKey(value => value + 1)}
                />
              ) : view === "connections" ? (
                <ConnectionsView draft={draft} projects={projects} linkedProject={linkedProject} onDraft={updateDraft} onConnectProject={connectProject} />
              ) : (
                <ResultsView draft={draft} onDraft={updateDraft} />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function BuilderView({
  draft,
  companies,
  activeStepId,
  onDraft,
  onSelectStep,
  onStep,
  onAddStep,
  onRemoveStep,
  onMoveStep,
}: {
  draft: FunnelDraft;
  companies: FunnelCompanyOption[];
  activeStepId: string;
  onDraft: (patch: Partial<FunnelDraft>) => void;
  onSelectStep: (id: string) => void;
  onStep: (id: string, patch: Partial<FunnelStep>) => void;
  onAddStep: () => void;
  onRemoveStep: (id: string) => void;
  onMoveStep: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <div className="space-y-7">
      <section>
        <SectionHeading icon={<Workflow size={16} />} title="Journey" detail="Define what this funnel is and the result it should create." />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SelectField label="Format" value={draft.format} onChange={value => onDraft({ format: value as FunnelFormat })} options={[
            { value: "one-page", label: "One page" },
            { value: "multi-step", label: "Multi-step" },
            { value: "multi-page", label: "Multi-page" },
          ]} />
          <Field label="Owner" value={draft.owner} onChange={value => onDraft({ owner: value })} placeholder="Ed" />
          <Field label="Primary goal" value={draft.primaryGoal} onChange={value => onDraft({ primaryGoal: value })} placeholder="Book a qualified meeting" />
          <Field label="Main call to action" value={draft.primaryCta} onChange={value => onDraft({ primaryCta: value })} placeholder="Book a systems check" />
        </div>
        <label className="mt-4 block text-xs font-medium text-black/58">Objective<textarea rows={3} value={draft.objective} onChange={event => onDraft({ objective: event.target.value })} placeholder="What should this journey help the visitor do?" className={`${control} mt-1 w-full py-2`} /></label>
        <div className="mt-4"><BrandAssignment companyIds={draft.companyIds} companies={companies} onChange={companyIds => onDraft({ companyIds })} /></div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeading icon={<FileStack size={16} />} title="Steps and pages" detail="Keep it one page, or arrange every screen in the order visitors see it." />
          <button type="button" onClick={onAddStep} className={secondary}><Plus size={15} />Add step</button>
        </div>
        <div className="mt-4 space-y-2">
          {draft.steps.map((step, index) => {
            const selected = step.id === activeStepId;
            return (
              <article key={step.id} className={"rounded-md border transition " + (selected ? "border-brand/35 bg-brand/[0.035]" : "border-black/10 bg-white")}>
                <div className="flex items-center gap-2 px-2 py-2">
                  <button type="button" onClick={() => onSelectStep(step.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded px-1 py-1 text-left">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-black text-xs font-semibold text-white">{index + 1}</span>
                    <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-black/75">{step.name}</strong><span className="mt-0.5 block truncate text-[11px] text-black/40">{step.path} - {stepKindLabel(step.kind)}</span></span>
                  </button>
                  <span className="flex shrink-0 items-center gap-1">
                    <SmallIcon label="Move up" disabled={index === 0} onClick={() => onMoveStep(index, -1)}><ArrowUp size={13} /></SmallIcon>
                    <SmallIcon label="Move down" disabled={index === draft.steps.length - 1} onClick={() => onMoveStep(index, 1)}><ArrowDown size={13} /></SmallIcon>
                    <SmallIcon label="Delete step" disabled={draft.steps.length === 1} onClick={() => onRemoveStep(step.id)}><Trash2 size={13} /></SmallIcon>
                  </span>
                </div>
                {selected ? (
                  <div className="grid gap-4 border-t border-black/8 px-3 py-4 sm:grid-cols-2">
                    <Field label="Step name" value={step.name} onChange={value => onStep(step.id, { name: value })} />
                    <SelectField label="Purpose" value={step.kind} onChange={value => onStep(step.id, { kind: value as FunnelStepKind })} options={STEP_OPTIONS} />
                    <Field label={draft.format === "one-page" ? "Section anchor" : "Path"} value={step.path} onChange={value => onStep(step.id, { path: value })} placeholder={draft.format === "one-page" ? "#details" : "/details"} />
                    <Field label="Button label" value={step.ctaLabel ?? ""} onChange={value => onStep(step.id, { ctaLabel: value })} placeholder="Continue" />
                    <div className="sm:col-span-2"><Field label="Headline or purpose note" value={step.headline ?? ""} onChange={value => onStep(step.id, { headline: value })} placeholder="The promise or instruction visitors see here" /></div>
                  </div>
                ) : null}
              </article>
            );
          })}
          {!draft.steps.length ? <button type="button" onClick={onAddStep} className="w-full border border-dashed border-black/15 py-10 text-sm text-black/45">Add the first step</button> : null}
        </div>
      </section>
    </div>
  );
}

function PreviewView({
  draft,
  previewUrl,
  activeStepId,
  previewDevice,
  previewEnvironment,
  previewKey,
  onSelectStep,
  onDevice,
  onEnvironment,
  onRefresh,
}: {
  draft: FunnelDraft;
  previewUrl: string;
  activeStepId: string;
  previewDevice: PreviewDevice;
  previewEnvironment: PreviewEnvironment;
  previewKey: number;
  onSelectStep: (id: string) => void;
  onDevice: (device: PreviewDevice) => void;
  onEnvironment: (environment: PreviewEnvironment) => void;
  onRefresh: () => void;
}) {
  const frameWidth = previewDevice === "mobile" ? 390 : previewDevice === "tablet" ? 820 : 1440;
  const frameHeight = previewDevice === "mobile" ? 740 : previewDevice === "tablet" ? 900 : 860;
  const scale = previewDevice === "desktop" ? 0.72 : previewDevice === "tablet" ? 0.76 : 0.82;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-black/10 bg-black/[0.025] p-1">
          <ToolbarButton active={previewEnvironment === "preview"} label="Preview" onClick={() => onEnvironment("preview")} />
          <ToolbarButton active={previewEnvironment === "live"} label="Live" onClick={() => onEnvironment("live")} />
        </div>
        <div className="inline-flex rounded-md border border-black/10 bg-black/[0.025] p-1">
          <DeviceButton active={previewDevice === "desktop"} label="Desktop" icon={<Laptop size={14} />} onClick={() => onDevice("desktop")} />
          <DeviceButton active={previewDevice === "tablet"} label="Tablet" icon={<Tablet size={14} />} onClick={() => onDevice("tablet")} />
          <DeviceButton active={previewDevice === "mobile"} label="Mobile" icon={<Smartphone size={14} />} onClick={() => onDevice("mobile")} />
        </div>
        <select value={activeStepId} onChange={event => onSelectStep(event.target.value)} aria-label="Preview funnel step" className={`${control} min-w-[170px]`}>
          {draft.steps.map((step, index) => <option key={step.id} value={step.id}>{index + 1}. {step.name}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={onRefresh} aria-label="Refresh preview" title="Refresh preview" className={iconButton}><RefreshCw size={14} /></button>
          {previewUrl ? <a href={previewUrl} target="_blank" rel="noreferrer" aria-label="Open preview in new tab" title="Open preview in new tab" className={iconButton}><ExternalLink size={14} /></a> : null}
        </div>
      </div>

      <section className="overflow-hidden rounded-md border border-black/12 bg-[#d9dcda]">
        <header className="flex min-h-11 items-center gap-3 border-b border-black/10 bg-[#f5f5f2] px-3">
          <div className="flex gap-1.5"><span className="size-2.5 rounded-full bg-red-400" /><span className="size-2.5 rounded-full bg-amber-400" /><span className="size-2.5 rounded-full bg-emerald-400" /></div>
          <div className="min-w-0 flex-1 truncate rounded bg-white px-3 py-1.5 font-mono text-[10px] text-black/42">{previewUrl || "Connect a preview URL to inspect the real funnel."}</div>
        </header>
        <div className="h-[650px] overflow-auto p-4 sm:p-6">
          {previewUrl ? (
            <div className="mx-auto" style={{ width: frameWidth * scale, height: frameHeight * scale }}>
              <iframe
                key={`${previewUrl}:${previewKey}`}
                title={`${draft.name} funnel preview`}
                src={previewUrl}
                className="origin-top-left border-0 bg-white shadow-[0_18px_55px_rgba(0,0,0,0.16)]"
                style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})` }}
              />
            </div>
          ) : (
            <FunnelWireframe draft={draft} activeStepId={activeStepId} />
          )}
        </div>
      </section>
      <p className="text-xs leading-5 text-black/42">The preview uses the connected build. Use Builder for the journey structure and Development Explorer for visual source edits, diagnostics and repository work.</p>
    </div>
  );
}

function ConnectionsView({
  draft,
  projects,
  linkedProject,
  onDraft,
  onConnectProject,
}: {
  draft: FunnelDraft;
  projects: FunnelProjectOption[];
  linkedProject?: FunnelProjectOption;
  onDraft: (patch: Partial<FunnelDraft>) => void;
  onConnectProject: (projectId: string) => void;
}) {
  const tagSnippet = draft.telemetrySiteKey && draft.telemetryPropertyId
    ? `<script src="https://aqua-crm.com/aqua-tag.js" data-site-key="${draft.telemetrySiteKey}" data-property="${draft.telemetryPropertyId}" defer></script>`
    : "";
  return (
    <div className="space-y-7">
      <section>
        <SectionHeading icon={<Code2 size={16} />} title="Development project" detail="Link an existing project to fill its environments, repository and source path." />
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <SelectField label="Linked project" value={draft.developmentProjectId} onChange={onConnectProject} options={[
            { value: "", label: "No linked project" },
            ...projects.map(project => ({ value: project.id, label: `${project.brand}  -  ${project.name}` })),
          ]} />
          {linkedProject ? <Link href={`/portal/agency/development/projects/${linkedProject.id}`} className={primary}><PencilRuler size={15} />Open full editor</Link> : <Link href="/portal/agency/development" className={secondary}><Layers3 size={15} />Development</Link>}
        </div>
        {linkedProject ? (
          <div className="mt-3 grid gap-2 rounded-md border border-black/10 bg-black/[0.018] p-3 sm:grid-cols-3">
            <ConnectionPill label="Project explorer" href={`/portal/agency/development/projects/${linkedProject.id}`} />
            <ConnectionPill label="Repository" href={draft.repositoryUrl || linkedProject.repositoryUrl} external />
            <ConnectionPill label="Local preview" href={draft.previewUrl || linkedProject.previewUrl} external />
          </div>
        ) : null}
      </section>

      <section>
        <SectionHeading icon={<Globe2 size={16} />} title="Environments" detail="The preview stays private or local. The live URL is the public conversion route." />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Preview or staging URL" value={draft.previewUrl} onChange={value => onDraft({ previewUrl: value })} placeholder="http://localhost:3000/funnel" />
          <Field label="Production URL" value={draft.productionUrl} onChange={value => onDraft({ productionUrl: value })} placeholder="https://example.com/start" />
          <Field label="Editor route" value={draft.editorUrl} onChange={value => onDraft({ editorUrl: value })} placeholder="/portal/agency/development/projects/..." />
          <Field label="GitHub repository" value={draft.repositoryUrl} onChange={value => onDraft({ repositoryUrl: value })} placeholder="https://github.com/..." />
          <Field label="Local source folder" value={draft.localPath} onChange={value => onDraft({ localPath: value })} placeholder="/Users/.../project" />
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {draft.editorUrl ? <Link href={draft.editorUrl} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">Open editor route <ExternalLink size={12} /></Link> : null}
          {draft.repositoryUrl ? <a href={draft.repositoryUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">Open repository <ExternalLink size={12} /></a> : null}
          {draft.productionUrl ? <a href={draft.productionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">Open live funnel <ExternalLink size={12} /></a> : null}
        </div>
      </section>

      <section>
        <SectionHeading icon={<RadioTower size={16} />} title="Aqua tag and conversion" detail="Name the approved event that counts as success. The tag remains consent-aware on the connected site." />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Conversion event" value={draft.conversionEvent} onChange={value => onDraft({ conversionEvent: value })} placeholder="funnel_complete" />
          <Field label="Site key" value={draft.telemetrySiteKey} onChange={value => onDraft({ telemetrySiteKey: value })} placeholder="aqua_public_site_v1" />
          <Field label="Property ID" value={draft.telemetryPropertyId} onChange={value => onDraft({ telemetryPropertyId: value })} placeholder="summer-offer" />
        </div>
        {tagSnippet ? <code className="mt-4 block overflow-x-auto rounded-md border border-black/10 bg-black/[0.025] p-3 text-[10px] leading-5 text-black/55">{tagSnippet}</code> : null}
      </section>
    </div>
  );
}

function ResultsView({ draft, onDraft }: { draft: FunnelDraft; onDraft: (patch: Partial<FunnelDraft>) => void }) {
  const leads = countValue(draft.leads);
  const conversions = countValue(draft.conversions);
  const rate = leads ? Math.round((conversions / leads) * 100) : 0;
  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 border-y border-black/10 lg:grid-cols-4">
        <Metric label="Spend" value={formatMoney(moneyToCents(draft.spend))} icon={<BarChart3 size={15} />} />
        <Metric label="Leads" value={String(leads)} icon={<Workflow size={15} />} />
        <Metric label="Conversions" value={String(conversions)} icon={<Check size={15} />} />
        <Metric label="Rate" value={`${rate}%`} icon={<RadioTower size={15} />} />
      </div>
      <section>
        <SectionHeading icon={<BarChart3 size={16} />} title="Commercial result" detail="Manual figures remain editable until the connected tag or ad platform supplies them." />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Budget (GBP)" type="number" value={draft.budget} onChange={value => onDraft({ budget: value })} />
          <Field label="Spend (GBP)" type="number" value={draft.spend} onChange={value => onDraft({ spend: value })} />
          <Field label="Leads" type="number" value={draft.leads} onChange={value => onDraft({ leads: value })} />
          <Field label="Conversions" type="number" value={draft.conversions} onChange={value => onDraft({ conversions: value })} />
        </div>
      </section>
      <label className="block text-xs font-medium text-black/58">Working notes<textarea rows={6} value={draft.notes} onChange={event => onDraft({ notes: event.target.value })} placeholder="Decisions, tests, blockers and the next change..." className={`${control} mt-1 w-full py-2`} /></label>
    </div>
  );
}

function FunnelWireframe({ draft, activeStepId }: { draft: FunnelDraft; activeStepId: string }) {
  const step = draft.steps.find(item => item.id === activeStepId) ?? draft.steps[0];
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-md bg-white shadow-[0_18px_55px_rgba(0,0,0,0.14)]">
      <div className="border-b border-black/8 px-5 py-4"><strong className="text-sm text-black/78">{draft.name || "Untitled funnel"}</strong><span className="ml-2 text-[10px] uppercase text-black/35">{formatLabel(draft.format)}</span></div>
      <div className="grid min-h-[480px] place-items-center px-6 py-12 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand">{Math.max(1, draft.steps.findIndex(item => item.id === step?.id) + 1)}</span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand">{step ? stepKindLabel(step.kind) : "Step"}</p>
          <h3 className="mt-2 text-3xl font-semibold text-black/86">{step?.headline || step?.name || "Shape this step"}</h3>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-black/48">{draft.objective || "Add the objective and connect a preview build when it is ready."}</p>
          {step?.ctaLabel || draft.primaryCta ? <span className="mt-6 inline-flex min-h-11 items-center rounded-md bg-black px-5 text-sm font-semibold text-white">{step?.ctaLabel || draft.primaryCta}</span> : null}
        </div>
      </div>
      <div className="flex gap-1 border-t border-black/8 px-4 py-3">{draft.steps.map(item => <span key={item.id} className={`h-1 flex-1 rounded-full ${item.id === step?.id ? "bg-brand" : "bg-black/10"}`} />)}</div>
    </div>
  );
}

function BrandAssignment({ companyIds, companies, onChange }: { companyIds: string[]; companies: FunnelCompanyOption[]; onChange: (ids: string[]) => void }) {
  return (
    <fieldset className="rounded-md border border-black/10 bg-black/[0.02] p-3">
      <legend className="px-1 text-xs font-semibold text-black/65">Brand ownership</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange([])} aria-pressed={!companyIds.length} className={`min-h-9 rounded-md border px-3 text-xs font-medium ${!companyIds.length ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/55"}`}>Group / shared</button>
        {companies.map(company => {
          const selected = companyIds.includes(company.id);
          return <button key={company.id} type="button" onClick={() => onChange(selected ? companyIds.filter(id => id !== company.id) : [...companyIds, company.id])} aria-pressed={selected} className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium ${selected ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/55"}`}><span className="size-2 rounded-full" style={{ backgroundColor: company.colour }} />{company.name}</button>;
        })}
      </div>
    </fieldset>
  );
}

function SectionHeading({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-brand/10 text-brand">{icon}</span><div><h3 className="text-sm font-semibold text-black/78">{title}</h3><p className="mt-1 text-xs leading-5 text-black/43">{detail}</p></div></div>;
}

function ConnectionPill({ label, href, external = false }: { label: string; href: string; external?: boolean }) {
  if (!href) return null;
  const classes = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]";
  return external
    ? <a href={href} target="_blank" rel="noreferrer" className={classes}>{label}<ExternalLink size={12} /></a>
    : <Link href={href} className={classes}>{label}<ExternalLink size={12} /></Link>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="flex items-center gap-3 border-b border-r border-black/10 px-3 py-4 even:border-r-0 lg:border-b-0 lg:even:border-r lg:last:border-r-0"><span className="text-brand">{icon}</span><div><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-black/76">{value}</p></div></div>;
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="text-xs font-medium text-black/58">{label}<input type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={`${control} mt-1 w-full`} /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="text-xs font-medium text-black/58">{label}<select value={value} onChange={event => onChange(event.target.value)} className={`${control} mt-1 w-full`}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function ViewButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${active ? "bg-white text-black shadow-sm" : "text-black/48 hover:text-black/75"}`}>{icon}{label}</button>;
}

function ToolbarButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`min-h-8 rounded px-3 text-xs font-semibold ${active ? "bg-white text-black shadow-sm" : "text-black/45"}`}>{label}</button>;
}

function DeviceButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active} className={`grid size-8 place-items-center rounded ${active ? "bg-white text-black shadow-sm" : "text-black/42"}`}>{icon}</button>;
}

function SmallIcon({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} aria-label={label} title={label} className="grid size-8 place-items-center rounded text-black/40 hover:bg-black/[0.04] hover:text-black/70 disabled:opacity-20">{children}</button>;
}

const STEP_OPTIONS: Array<{ value: FunnelStepKind; label: string }> = [
  { value: "landing", label: "Landing" },
  { value: "form", label: "Form" },
  { value: "booking", label: "Booking" },
  { value: "checkout", label: "Checkout" },
  { value: "thank-you", label: "Thank you" },
  { value: "custom", label: "Custom" },
];

function assetToDraft(asset: MarketingAsset): FunnelDraft {
  const funnel = asset.funnel;
  return {
    id: asset.id,
    name: asset.name,
    companyIds: asset.companyIds ?? [],
    status: asset.status,
    format: funnel?.format ?? "one-page",
    objective: asset.objective ?? "",
    owner: asset.owner ?? "",
    primaryGoal: funnel?.primaryGoal ?? "",
    primaryCta: funnel?.primaryCta ?? "",
    previewUrl: funnel?.previewUrl ?? "",
    productionUrl: funnel?.productionUrl ?? asset.url ?? "",
    editorUrl: funnel?.editorUrl ?? (funnel?.developmentProjectId ? `/portal/agency/development/projects/${funnel.developmentProjectId}` : ""),
    repositoryUrl: funnel?.repositoryUrl ?? "",
    localPath: funnel?.localPath ?? "",
    developmentProjectId: funnel?.developmentProjectId ?? "",
    conversionEvent: funnel?.conversionEvent ?? "funnel_complete",
    telemetrySiteKey: funnel?.telemetrySiteKey ?? "",
    telemetryPropertyId: funnel?.telemetryPropertyId ?? "",
    budget: centsToInput(asset.budgetCents),
    spend: centsToInput(asset.spendCents),
    leads: String(asset.leads),
    conversions: String(asset.conversions),
    notes: asset.notes ?? "",
    steps: funnel?.steps.length ? funnel.steps.map(step => ({ ...step })) : DEFAULT_STEPS.map((step, index) => ({ ...step, id: "legacy_step_" + (index + 1) })),
  };
}

function projectEditorUrl(project: FunnelProjectOption): string {
  return `/portal/agency/development/projects/${project.id}`;
}

function joinUrl(base: string, path: string): string {
  if (!path || path === "/") return base;
  if (path.startsWith("#")) return `${base.replace(/#.*$/, "")}${path}`;
  try { return new URL(path, base.endsWith("/") ? base : `${base}/`).toString(); }
  catch { return base; }
}

function formatLabel(value: FunnelFormat): string {
  return value === "one-page" ? "One page" : value === "multi-step" ? "Multi-step" : "Multi-page";
}

function stepKindLabel(value: FunnelStepKind): string {
  return STEP_OPTIONS.find(option => option.value === value)?.label ?? "Custom";
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function moneyToCents(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function countValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function centsToInput(value: number): string {
  return value ? (value / 100).toFixed(2).replace(/\.00$/, "") : "";
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value / 100);
}

const control = "min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm text-black/72 outline-none focus:border-brand";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-black/65 hover:bg-black/[0.03]";
const iconButton = "grid size-10 place-items-center rounded-md border border-black/10 bg-white text-black/52 hover:bg-black/[0.03]";
const dangerIcon = "grid size-10 place-items-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50";
