"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  CircleDot,
  FileUp,
  FolderKanban,
  HeartHandshake,
  Megaphone,
  MessageSquareText,
  MonitorCog,
  PanelTop,
  ReceiptText,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { clientWorkspaceHref } from "@/lib/clientWorkspace";
import { clientProductStageElapsedMs, type ClientProductProcessEntry, type ClientProductStageHistoryEntry } from "@/lib/clientProductProcess";
import { productWorkspaceModuleLabel } from "@/lib/productInternalWorkspace";
import type { AgencyProductWorkspaceModule, AgencyProductWorkspaceStage } from "@/server/types";

export type ClientPlanState = "attention" | "setup" | "active" | "done";

export interface ClientAccountPlanStep {
  id: string;
  number: string;
  label: string;
  title: string;
  detail: string;
  state: ClientPlanState;
  action: string;
  href: string;
  secondaryAction?: string;
  secondaryHref?: string;
}

export interface ClientProductPlanStep {
  id: string;
  title: string;
  instruction?: string;
  stageId?: string;
  module: AgencyProductWorkspaceModule;
  advanced?: boolean;
  sops: Array<{ id: string; title: string }>;
}

export interface ClientProductPlan {
  id: string;
  name: string;
  title: string;
  objective: string;
  accentColor?: string;
  progress: number;
  completedStepIds: string[];
  currentStageId?: string;
  stageHistory: ClientProductStageHistoryEntry[];
  lifecycleStages: AgencyProductWorkspaceStage[];
  quickActions: AgencyProductWorkspaceModule[];
  processSteps: ClientProductPlanStep[];
  advancedModules: AgencyProductWorkspaceModule[];
}

const ACCOUNT_ICONS = {
  relationship: HeartHandshake,
  agreement: ReceiptText,
  delivery: FolderKanban,
  experience: MessageSquareText,
  review: MonitorCog,
} as const;

const MODULE_ICONS: Record<AgencyProductWorkspaceModule, typeof FolderKanban> = {
  relationship: HeartHandshake,
  commercial: ReceiptText,
  delivery: FolderKanban,
  communications: MessageSquareText,
  files: FileUp,
  portal: PanelTop,
  systems: MonitorCog,
  marketing: Megaphone,
  sops: BookOpen,
};

export function ClientOperatingPlan({ clientId, accountSteps, products, canManage }: {
  clientId: string;
  accountSteps: ClientAccountPlanStep[];
  products: ClientProductPlan[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [scope, setScope] = useState("account");
  const [processByProduct, setProcessByProduct] = useState<Record<string, ClientProductProcessEntry>>(() => Object.fromEntries(products.map(product => [product.id, { completedStepIds: product.completedStepIds, currentStageId: product.currentStageId, stageHistory: product.stageHistory }])));
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");
  const activeProduct = products.find(product => product.id === scope) ?? null;
  const scopes = [{ id: "account", label: "Account", stageLabel: "Relationship" }, ...products.map(product => {
    const stageId = processByProduct[product.id]?.currentStageId ?? product.currentStageId;
    return { id: product.id, label: product.name, stageLabel: product.lifecycleStages.find(stage => stage.id === stageId)?.label ?? "Set stage" };
  })];

  async function setStepCompletion(productId: string, stepId: string, completed: boolean) {
    const key = `${productId}:${stepId}`;
    setSavingKey(key);
    setMessage("");
    try {
      const response = await fetch("/api/tenants/client-product-process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, productId, stepId, completed }),
      });
      const result = await response.json() as { error?: string; entry?: ClientProductProcessEntry };
      if (!response.ok || !result.entry) throw new Error(result.error || "The process step could not be saved.");
      setProcessByProduct(current => ({ ...current, [productId]: result.entry ?? { completedStepIds: [] } }));
      setMessage(completed ? "Step completed. The next move is ready." : "Step reopened.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The process step could not be saved.");
    } finally {
      setSavingKey("");
    }
  }

  async function setServiceStage(productId: string, stageId: string) {
    const key = `${productId}:stage`;
    setSavingKey(key);
    setMessage("");
    try {
      const response = await fetch("/api/tenants/client-product-process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set-stage", clientId, productId, stageId }),
      });
      const result = await response.json() as { error?: string; entry?: ClientProductProcessEntry };
      if (!response.ok || !result.entry) throw new Error(result.error || "The service stage could not be saved.");
      setProcessByProduct(current => ({ ...current, [productId]: result.entry ?? { completedStepIds: [] } }));
      setMessage("Service stage updated. Its client portal moved with it.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The service stage could not be saved.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-black/[0.08] bg-black/[0.018] px-3 py-2" aria-label="Client operating plan scope">
        {scopes.map(item => <button key={item.id} type="button" onClick={() => setScope(item.id)} aria-pressed={scope === item.id} className={`min-h-11 shrink-0 border-b-2 px-3 text-left text-xs font-semibold transition ${scope === item.id ? "border-[#315b85] bg-white text-[#12385d]" : "border-transparent text-black/45 hover:bg-white/70 hover:text-black/70"}`}><span className="block">{item.label}</span><span className="mt-0.5 block text-[9px] font-medium uppercase opacity-60">{item.stageLabel}</span></button>)}
      </div>

      {activeProduct ? <ProductPlan key={activeProduct.id} clientId={clientId} product={activeProduct} process={processByProduct[activeProduct.id] ?? { completedStepIds: [] }} canManage={canManage} savingKey={savingKey} message={message} onSetCompletion={setStepCompletion} onSetStage={setServiceStage} /> : <AccountPlan steps={accountSteps} />}
    </div>
  );
}

function AccountPlan({ steps }: { steps: ClientAccountPlanStep[] }) {
  return <ol className="mm-client-process-flow">
    {steps.map(step => {
      const Icon = ACCOUNT_ICONS[step.id as keyof typeof ACCOUNT_ICONS] ?? BriefcaseBusiness;
      const state = planState(step.state);
      return <li key={step.id} className={`mm-client-process-step ${state.className}`}>
        <div className="flex items-start justify-between gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-md ${state.icon}`}><Icon size={16} /></span><span className="text-[10px] font-semibold tabular-nums text-black/35">{step.number}</span></div>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">{step.label}</p>
        <h3 className="mt-1 text-sm font-semibold text-black/75">{step.title}</h3>
        <p className="mt-2 flex-1 text-xs leading-5 text-black/48">{step.detail}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Link href={step.href} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#315b85] hover:text-[#12385d]">{step.action} <ArrowRight size={12} /></Link>{step.secondaryHref ? <Link href={step.secondaryHref} className="inline-flex items-center gap-1.5 text-xs font-semibold text-black/48 hover:text-black"><BookOpen size={12} /> {step.secondaryAction}</Link> : null}</div>
        <span className="mt-4 text-[9px] font-semibold uppercase text-black/35">{state.label}</span>
      </li>;
    })}
  </ol>;
}

function ProductPlan({ clientId, product, process, canManage, savingKey, message, onSetCompletion, onSetStage }: {
  clientId: string;
  product: ClientProductPlan;
  process: ClientProductProcessEntry;
  canManage: boolean;
  savingKey: string;
  message: string;
  onSetCompletion: (productId: string, stepId: string, completed: boolean) => Promise<void>;
  onSetStage: (productId: string, stageId: string) => Promise<void>;
}) {
  const currentStageId = product.lifecycleStages.some(stage => stage.id === process.currentStageId) ? process.currentStageId : product.currentStageId ?? product.lifecycleStages[0]?.id;
  const [viewedStageId, setViewedStageId] = useState(currentStageId ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const currentStage = product.lifecycleStages.find(stage => stage.id === currentStageId) ?? product.lifecycleStages[0];
  const viewedStage = product.lifecycleStages.find(stage => stage.id === viewedStageId) ?? product.lifecycleStages[0];
  const standardSteps = product.processSteps.filter(step => !step.advanced && step.stageId === viewedStage?.id);
  const advancedSteps = product.processSteps.filter(step => step.advanced && step.stageId === viewedStage?.id);
  const currentStageSteps = product.processSteps.filter(step => !step.advanced && step.stageId === currentStage?.id);
  const completed = new Set(process.completedStepIds);
  const activeIndex = standardSteps.findIndex(step => !completed.has(step.id));
  const nextStep = currentStageSteps.find(step => !completed.has(step.id));
  const completedCount = product.processSteps.filter(step => completed.has(step.id)).length;
  const currentStageIndex = product.lifecycleStages.findIndex(stage => stage.id === currentStageId);
  const viewedStageIndex = product.lifecycleStages.findIndex(stage => stage.id === viewedStage?.id);
  const nextStage = product.lifecycleStages[currentStageIndex + 1];
  const viewedStageComplete = standardSteps.length > 0 && standardSteps.every(step => completed.has(step.id));
  const currentStageComplete = currentStageSteps.length > 0 && currentStageSteps.every(step => completed.has(step.id));
  const currentStageElapsed = clientProductStageElapsedMs(process, currentStageId);
  const serviceSettingsHref = `${clientWorkspaceHref(clientId, "delivery", { product: product.id })}#service-assignment`;

  return <div>
    <header className="grid gap-4 border-b border-black/[0.08] px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0 border-l-2 pl-4" style={{ borderColor: product.accentColor || "#315b85" }}><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#315b85]">Product operating plan</p><h3 className="mt-1 text-lg font-semibold text-black/80">{product.title}</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-black/48">{product.objective}</p></div>
      <div className="flex items-center gap-3"><div className="text-right"><p className="text-xl font-semibold tabular-nums text-black/76">{completedCount}/{product.processSteps.length}</p><p className="text-[10px] uppercase text-black/35">steps complete · portal {product.progress}%</p></div><Link href={serviceSettingsHref} className="grid size-9 place-items-center border border-black/10 text-black/48 hover:bg-black/[0.03]" title={`Customise ${product.name} for this client`}><Settings2 size={15} /></Link></div>
    </header>

    {message ? <p className="border-b border-black/[0.08] bg-emerald-50/70 px-5 py-2 text-xs font-medium text-emerald-800" role="status">{message}</p> : null}

    <section className="grid gap-px border-b border-black/[0.08] bg-black/[0.08] lg:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]" data-testid="client-service-command">
      <div className="bg-white px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/36">Current service stage</p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h4 className="text-base font-semibold text-black/78">{currentStage?.label ?? "Stage not set"}</h4>{currentStageElapsed !== null ? <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800">In stage {formatElapsed(currentStageElapsed)}</span> : <span className="rounded-full bg-black/[0.045] px-2 py-1 text-[10px] font-semibold text-black/40">Timing starts on next move</span>}</div>
            <p className="mt-1 text-xs leading-5 text-black/45">{currentStage?.description || "Set the stage condition in the product playbook."}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-[#315b85]">{currentStageSteps.filter(step => completed.has(step.id)).length}/{currentStageSteps.length}</span>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden bg-black/[0.07]" aria-label={`${product.name} current stage progress`}>
          <div className="h-full bg-[#315b85]" style={{ width: `${currentStageSteps.length ? Math.round(currentStageSteps.filter(step => completed.has(step.id)).length / currentStageSteps.length * 100) : 0}%` }} />
        </div>
      </div>

      <div className="bg-white px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#315b85]">Next useful move</p>
        {nextStep ? (() => {
          const Icon = MODULE_ICONS[nextStep.module];
          return <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-800"><CircleDot size={15} /></span>
              <div className="min-w-0"><h4 className="text-sm font-semibold text-black/76">{nextStep.title}</h4><p className="mt-1 text-xs leading-5 text-black/45">{nextStep.instruction || "Complete this move and retain the evidence in its linked workspace."}</p></div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Link href={moduleHref(clientId, product.id, nextStep.module)} className="inline-flex min-h-9 items-center gap-2 border border-black/10 px-3 text-xs font-semibold text-black/58 hover:bg-black/[0.03]"><Icon size={13} /> Open {productWorkspaceModuleLabel(nextStep.module)}</Link>
              {canManage ? <button type="button" onClick={() => void onSetCompletion(product.id, nextStep.id, true)} disabled={savingKey === `${product.id}:${nextStep.id}`} className="inline-flex min-h-9 items-center gap-2 bg-[#12385d] px-3 text-xs font-semibold text-white disabled:opacity-45"><Check size={13} />{savingKey === `${product.id}:${nextStep.id}` ? "Saving" : "Complete move"}</button> : null}
            </div>
          </div>;
        })() : currentStageComplete && nextStage ? <div className="mt-3 flex flex-wrap items-center justify-between gap-4"><div><h4 className="text-sm font-semibold text-emerald-800">{currentStage?.label} is complete</h4><p className="mt-1 text-xs text-black/45">The next service stage is {nextStage.label}.</p></div>{canManage ? <button type="button" disabled={savingKey === `${product.id}:stage`} onClick={() => { setViewedStageId(nextStage.id); void onSetStage(product.id, nextStage.id); }} className="inline-flex min-h-9 items-center gap-2 bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-45">Advance service <ArrowRight size={13} /></button> : null}</div> : <div className="mt-3"><h4 className="text-sm font-semibold text-black/68">No everyday move is configured</h4><p className="mt-1 text-xs leading-5 text-black/43">Use Advanced controls to move the stage or add the next step to this product playbook.</p></div>}
      </div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.08] bg-black/[0.018] px-5 py-3">
      <p className="text-xs text-black/43">Keep this view calm; reveal the full client process only when you need to change or investigate it.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAdvancedOpen(value => !value)} aria-expanded={advancedOpen} className="inline-flex min-h-9 items-center gap-2 bg-[#12385d] px-3 text-xs font-semibold text-white"><SlidersHorizontal size={14} /> {advancedOpen ? "Close advanced" : "Advanced controls"}</button>
      </div>
    </div>

    {advancedOpen ? <div data-testid="client-service-advanced">
    <div className="border-b border-black/[0.08] bg-black/[0.018] px-5 py-4">
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={`${product.name} service stages`}>
        {product.lifecycleStages.map((stage, index) => {
          const isCurrent = stage.id === currentStageId;
          const isPast = currentStageIndex >= 0 && index < currentStageIndex;
          const isViewed = stage.id === viewedStage?.id;
          const elapsed = clientProductStageElapsedMs(process, stage.id);
          return <button key={stage.id} type="button" onClick={() => setViewedStageId(stage.id)} aria-pressed={isViewed} className={`min-w-40 flex-1 border px-3 py-3 text-left transition ${isViewed ? "border-sky-300 bg-sky-50" : "border-black/10 bg-white hover:border-black/20"}`}><span className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold uppercase text-black/35">Stage {String(index + 1).padStart(2, "0")}</span><span className={`text-[9px] font-semibold uppercase ${isCurrent ? "text-sky-700" : isPast ? "text-emerald-700" : "text-black/30"}`}>{isCurrent ? "Current" : isPast ? "Passed" : "Later"}</span></span><span className="mt-1 block text-xs font-semibold text-black/68">{stage.label}</span><span className="mt-1 block text-[10px] text-black/38">{elapsed === null ? "No timing evidence" : formatElapsed(elapsed)}</span></button>;
        })}
      </div>
      {viewedStage ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-black/68">{viewedStage.label}</p><p className="mt-1 text-[11px] leading-5 text-black/42">{viewedStage.description || "No exit condition has been set for this stage."}</p></div>{canManage && viewedStage.id !== currentStageId ? <button type="button" disabled={savingKey === `${product.id}:stage`} onClick={() => void onSetStage(product.id, viewedStage.id)} className="inline-flex min-h-9 items-center gap-2 bg-[#12385d] px-3 text-xs font-semibold text-white disabled:opacity-45"><CircleDot size={13} /> Make current stage</button> : canManage && viewedStage.id === currentStageId && viewedStageComplete && nextStage ? <button type="button" disabled={savingKey === `${product.id}:stage`} onClick={() => { setViewedStageId(nextStage.id); void onSetStage(product.id, nextStage.id); }} className="inline-flex min-h-9 items-center gap-2 bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-45">Advance to {nextStage.label} <ArrowRight size={13} /></button> : <span className="text-[10px] font-semibold uppercase text-black/35">{viewedStageIndex === currentStageIndex ? `${standardSteps.filter(step => completed.has(step.id)).length}/${standardSteps.length} stage steps complete` : "Reviewing another stage"}</span>}</div> : null}
    </div>

    {product.quickActions.length ? <div className="grid grid-cols-2 border-b border-black/[0.08] sm:grid-cols-3 lg:grid-cols-6">{product.quickActions.map(module => <ModuleLink key={module} clientId={clientId} productId={product.id} module={module} />)}</div> : null}

    <ol className="divide-y divide-black/[0.08]">
      {standardSteps.map((step, index) => {
        const complete = completed.has(step.id);
        const current = !complete && index === activeIndex;
        const Icon = MODULE_ICONS[step.module];
        return <li key={step.id} className={`grid gap-3 px-5 py-4 md:grid-cols-[2.5rem_minmax(0,1fr)_auto] md:items-center ${current ? "bg-sky-50/55" : "bg-white"}`}>
          <span className={`grid size-9 place-items-center rounded-full text-xs font-semibold ${complete ? "bg-emerald-50 text-emerald-700" : current ? "bg-sky-100 text-sky-800" : "bg-black/[0.045] text-black/38"}`}>{complete ? <Check size={15} /> : current ? <CircleDot size={15} /> : String(index + 1).padStart(2, "0")}</span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-black/72">{step.title}</p>{current ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-sky-800">Current</span> : null}</div><p className="mt-1 text-xs leading-5 text-black/45">{step.instruction || "Complete this step and retain the evidence in the linked workspace."}</p>{step.sops.length ? <div className="mt-2 flex flex-wrap gap-2">{step.sops.map(sop => <Link key={sop.id} href={`${clientWorkspaceHref(clientId, "delivery", { product: product.id, mode: "advanced" })}#client-sop-${encodeURIComponent(sop.id)}`} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#315b85]"><BookOpen size={11} />{sop.title}</Link>)}</div> : null}</div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end"><Link href={moduleHref(clientId, product.id, step.module)} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 border border-black/10 px-3 text-xs font-semibold text-black/58 hover:bg-black/[0.03]"><Icon size={13} /> Open {productWorkspaceModuleLabel(step.module)}</Link>{canManage ? <button type="button" onClick={() => void onSetCompletion(product.id, step.id, !complete)} disabled={savingKey === `${product.id}:${step.id}`} className={`inline-flex min-h-9 items-center gap-2 px-3 text-xs font-semibold disabled:opacity-45 ${complete ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-[#12385d] text-white hover:bg-[#0d2d4b]"}`}><Check size={13} />{savingKey === `${product.id}:${step.id}` ? "Saving" : complete ? "Completed" : "Mark complete"}</button> : null}</div>
        </li>;
      })}
      {standardSteps.length ? null : <li className="px-5 py-7 text-center"><p className="text-sm font-semibold text-black/60">No everyday steps in this stage</p><p className="mt-1 text-xs text-black/40">Move this service when the stage condition is satisfied, or add steps in the product editor.</p></li>}
    </ol>

    {advancedSteps.length || product.advancedModules.length ? <details className="group border-t border-black/[0.08] bg-black/[0.018]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-xs font-semibold text-black/55"><span className="inline-flex items-center gap-2"><SlidersHorizontal size={14} /> Specialist steps and modules</span><span><span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span></span></summary>
      <div className="grid gap-4 border-t border-black/[0.08] px-5 py-4">
        {advancedSteps.length ? <ol className="grid gap-2">{advancedSteps.map((step, index) => {
          const complete = completed.has(step.id);
          return <li key={step.id} className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-black/10 bg-white px-3 py-3"><div><p className="text-[10px] font-semibold uppercase text-black/35">Advanced step {index + 1}</p><p className="mt-1 text-xs font-semibold text-black/65">{step.title}</p><p className="mt-1 text-[11px] text-black/42">{step.instruction}</p></div><div className="flex flex-wrap gap-2"><Link href={moduleHref(clientId, product.id, step.module)} className="inline-flex min-h-9 items-center gap-2 border border-black/10 px-3 text-xs font-semibold text-black/55">Open {productWorkspaceModuleLabel(step.module)} <ArrowRight size={12} /></Link>{canManage ? <button type="button" onClick={() => void onSetCompletion(product.id, step.id, !complete)} disabled={savingKey === `${product.id}:${step.id}`} className={`inline-flex min-h-9 items-center gap-2 px-3 text-xs font-semibold disabled:opacity-45 ${complete ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-black/10 bg-white text-black/55"}`}><Check size={13} />{complete ? "Completed" : "Mark complete"}</button> : null}</div></li>;
        })}</ol> : null}
        {product.advancedModules.length ? <div className="flex flex-wrap gap-2">{product.advancedModules.map(module => <ModuleLink key={module} clientId={clientId} productId={product.id} module={module} compact />)}</div> : null}
      </div>
    </details> : null}
    </div> : null}
  </div>;
}

function formatElapsed(value: number): string {
  const totalMinutes = Math.max(0, Math.floor(value / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor(totalMinutes % 1_440 / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function ModuleLink({ clientId, productId, module, compact = false }: { clientId: string; productId: string; module: AgencyProductWorkspaceModule; compact?: boolean }) {
  const Icon = MODULE_ICONS[module];
  return <Link href={moduleHref(clientId, productId, module)} title={`Open ${productWorkspaceModuleLabel(module)}`} className={compact ? "inline-flex min-h-9 items-center gap-2 border border-black/10 bg-white px-3 text-xs font-semibold text-black/55" : "group flex min-h-14 items-center gap-2 border-r border-black/[0.08] px-3 py-2 text-xs font-semibold text-black/58 hover:bg-sky-50"}><Icon size={14} className="shrink-0 text-[#315b85]" />{productWorkspaceModuleLabel(module)}</Link>;
}

function moduleHref(clientId: string, productId: string, module: AgencyProductWorkspaceModule): string {
  if (module === "commercial") return clientWorkspaceHref(clientId, "finance");
  if (module === "sops") return `${clientWorkspaceHref(clientId, "delivery", { product: productId, mode: "advanced" })}#client-sops`;
  if (module === "delivery") return clientWorkspaceHref(clientId, "delivery", { product: productId, mode: "advanced" });
  return clientWorkspaceHref(clientId, module);
}

function planState(state: ClientPlanState) {
  return state === "attention"
    ? { label: "Attention", className: "mm-client-process-step--attention", icon: "bg-red-50 text-red-700" }
    : state === "setup"
      ? { label: "Set up", className: "mm-client-process-step--setup", icon: "bg-amber-50 text-amber-800" }
      : state === "done"
        ? { label: "Ready", className: "mm-client-process-step--done", icon: "bg-emerald-50 text-emerald-700" }
        : { label: "In progress", className: "mm-client-process-step--active", icon: "bg-sky-50 text-sky-700" };
}
