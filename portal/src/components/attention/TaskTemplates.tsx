"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import { CLAIMABLE_FAMILIES, fillTemplateTitle } from "@/lib/tasks/taskTemplates";
import type { AgencyTask, AgencyTaskPriority, AgencyTaskTemplateStep, SopDocument } from "@/server/types";

/**
 * Picking a saved sequence instead of retyping it.
 *
 * Onboarding a client is the same seven steps every time. The cost of retyping
 * them is not the typing — it is the step that gets forgotten on the eighth
 * client because nobody wrote it down.
 *
 * Built-in and agency-written templates appear in one list. Splitting them
 * would make the operator answer a question they do not care about ("whose
 * template is this?") before the one they do ("which job is this?").
 */

export interface TaskTemplateView {
  id: string;
  name: string;
  summary?: string;
  taskTitle: string;
  notes?: string;
  priority?: AgencyTaskPriority;
  steps: AgencyTaskTemplateStep[];
  appliesTo?: string[];
  builtIn: boolean;
  category?: string;
}

function familyLabels(prefixes: string[] | undefined): string[] {
  return (prefixes ?? [])
    .map(prefix => CLAIMABLE_FAMILIES.find(family => family.prefix === prefix)?.label)
    .filter((label): label is string => Boolean(label));
}

export function TaskTemplateModal({
  sops,
  onClose,
  onCreated,
}: {
  sops: SopDocument[];
  onClose: () => void;
  onCreated: (task: AgencyTask) => void;
}) {
  const [templates, setTemplates] = useState<TaskTemplateView[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [editing, setEditing] = useState<TaskTemplateView | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load(signal?: AbortSignal) {
    setLoadingTemplates(true);
    setLoadError(null);
    try {
      const result = await checkedJsonMutation<{ ok: boolean; templates?: TaskTemplateView[] }>(
        "/api/portal/tasks/templates",
        { method: "GET", cache: "no-store", signal },
        {
          fallback: "Task templates could not be loaded.",
          validate: payload => payload.ok === true && Array.isArray(payload.templates),
        },
      );
      if (!signal?.aborted) setTemplates(result.templates ?? []);
    } catch (nextError) {
      if (!signal?.aborted) {
        setLoadError(mutationErrorMessage(nextError, "Task templates could not be loaded."));
      }
    } finally {
      if (!signal?.aborted) setLoadingTemplates(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return templates ?? [];
    return (templates ?? []).filter(template =>
      `${template.name} ${template.summary ?? ""} ${template.steps.map(step => step.label).join(" ")}`
        .toLowerCase().includes(needle));
  }, [templates, query]);

  const selected = visible.find(template => template.id === selectedId)
    ?? templates?.find(template => template.id === selectedId);

  async function apply() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await checkedJsonMutation<{ ok: boolean; task?: AgencyTask }>("/api/portal/tasks/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply", templateId: selected.id, subject }),
      }, {
        fallback: "The task could not be created.",
        validate: payload => payload.ok === true && Boolean(payload.task),
      });
      onCreated(result.task!);
    } catch (nextError) {
      setError(mutationErrorMessage(nextError, "The task could not be created."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(template: TaskTemplateView) {
    setBusy(true);
    setError(null);
    try {
      await checkedJsonMutation<{ ok: boolean }>("/api/portal/tasks/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", id: template.id }),
      }, {
        fallback: "The task template could not be deleted.",
        validate: payload => payload.ok === true,
      });
      if (selectedId === template.id) setSelectedId(null);
      await load();
    } catch (nextError) {
      setError(mutationErrorMessage(nextError, "The task template could not be deleted."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid items-end bg-black/35 sm:items-center sm:p-6">
      <button className="absolute inset-0" aria-label="Close templates" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-templates-title"
        className="relative mx-auto grid max-h-[100dvh] w-full max-w-3xl gap-4 overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-black/40">Templates</p>
            <h2 id="task-templates-title" className="mt-1 text-xl font-semibold">Start from a job you have done before</h2>
          </div>
          <button type="button" aria-label="Close templates" onClick={onClose} className="grid size-9 place-items-center rounded-md border border-black/10">
            <X size={16} />
          </button>
        </div>

        {editing ? (
          <TemplateBuilder
            template={editing === "new" ? null : editing}
            sops={sops}
            onCancel={() => setEditing(null)}
            onSaved={async () => { setEditing(null); await load(); }}
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-black/30" aria-hidden />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search templates"
                  aria-label="Search templates"
                  className="h-10 w-full rounded-md border border-black/12 pl-8 pr-3 text-sm outline-none focus:border-brand"
                />
              </div>
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-black/15 px-3 text-sm font-semibold text-black/70 hover:bg-black/[0.035]"
              >
                <Plus size={14} aria-hidden />Write one
              </button>
            </div>

            {loadingTemplates ? (
              <p className="flex items-center gap-2 py-6 text-xs text-black/45">
                <LoaderCircle size={13} className="animate-spin" aria-hidden />Loading templates…
              </p>
            ) : null}

            {loadError && !loadingTemplates ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <span>{loadError}</span>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-800"
                >
                  Retry templates
                </button>
              </div>
            ) : null}

            {templates && !visible.length ? (
              <p className="py-6 text-center text-xs text-black/45">
                Nothing matches “{query}”. Write a template and it will be here next time.
              </p>
            ) : null}

            <ul className="grid gap-1.5">
              {visible.map(template => {
                const isSelected = template.id === selectedId;
                return (
                  <li key={template.id} className={`rounded-md border ${isSelected ? "border-black/25 bg-black/[0.02]" : "border-black/10"}`}>
                    <div className="flex items-start gap-2 p-3">
                      <button
                        type="button"
                        onClick={() => setSelectedId(isSelected ? null : template.id)}
                        aria-expanded={isSelected}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm text-black/85">{template.name}</strong>
                          <span className="rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/50">
                            {template.steps.length} step{template.steps.length === 1 ? "" : "s"}
                          </span>
                          {!template.builtIn ? (
                            <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">Yours</span>
                          ) : null}
                          {/* Said in the list, not just in the editor: a
                              template that runs on its own is a different
                              thing from one you have to remember. */}
                          {template.appliesTo?.length ? (
                            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Automatic</span>
                          ) : null}
                        </span>
                        {template.summary ? <span className="mt-1 block text-xs leading-5 text-black/55">{template.summary}</span> : null}
                      </button>
                      {!template.builtIn ? (
                        <>
                          <button type="button" onClick={() => setEditing(template)} aria-label={`Edit ${template.name}`} className="shrink-0 rounded p-1.5 text-black/30 hover:bg-black/5 hover:text-black/70">
                            <Pencil size={13} aria-hidden />
                          </button>
                          <button type="button" disabled={busy} onClick={() => void remove(template)} aria-label={`Delete ${template.name}`} className="shrink-0 rounded p-1.5 text-black/25 hover:bg-red-50 hover:text-red-700 disabled:opacity-40">
                            <Trash2 size={13} aria-hidden />
                          </button>
                        </>
                      ) : null}
                      <ChevronRight size={15} className={`mt-0.5 shrink-0 text-black/25 transition-transform ${isSelected ? "rotate-90" : ""}`} aria-hidden />
                    </div>

                    {isSelected ? (
                      <div className="grid gap-3 border-t border-black/10 p-3">
                        {template.taskTitle.includes("{subject}") ? (
                          <label className="grid gap-1 text-xs font-semibold text-black/55">
                            Who or what is this about?
                            <input
                              value={subject}
                              onChange={event => setSubject(event.target.value)}
                              placeholder="Cedar Dental"
                              autoFocus
                              className="h-10 w-full rounded-md border border-black/12 px-2.5 text-sm font-normal outline-none focus:border-brand"
                            />
                            <span className="font-normal text-black/45">
                              Task title: {fillTemplateTitle(template.taskTitle, subject) || template.name}
                            </span>
                          </label>
                        ) : null}

                        {familyLabels(template.appliesTo).length ? (
                          <p className="rounded-md bg-emerald-50/70 px-2.5 py-2 text-[11px] leading-4 text-emerald-900">
                            Runs on its own when: {familyLabels(template.appliesTo).join(", ").toLowerCase()}.
                          </p>
                        ) : null}

                        <ol className="grid gap-1">
                          {template.steps.map((step, index) => (
                            <li key={index} className="flex gap-2.5 text-xs leading-5 text-black/70">
                              <span aria-hidden className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-black/[0.07] text-[10px] font-semibold text-black/55">{index + 1}</span>
                              <span className="min-w-0">
                                {step.label}
                                {/* Said out loud, because a step with nowhere to go is
                                    the one the operator has to do themselves. */}
                                {step.href ? null : <span className="ml-1.5 text-[10px] uppercase tracking-wide text-black/35">off-system</span>}
                              </span>
                            </li>
                          ))}
                        </ol>

                        {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}

                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void apply()}
                            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            <Plus size={15} aria-hidden />{busy ? "Creating…" : "Create this task"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** Writing a sequence by hand, or editing one already written. */
function TemplateBuilder({
  template,
  sops,
  onCancel,
  onSaved,
}: {
  template: TaskTemplateView | null;
  sops: SopDocument[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [summary, setSummary] = useState(template?.summary ?? "");
  const [taskTitle, setTaskTitle] = useState(template?.taskTitle ?? "");
  const [steps, setSteps] = useState<AgencyTaskTemplateStep[]>(template?.steps.length ? template.steps : [{ label: "" }]);
  const [appliesTo, setAppliesTo] = useState<string[]>(template?.appliesTo ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchStep(index: number, patch: Partial<AgencyTaskTemplateStep>) {
    setSteps(current => current.map((step, position) => position === index ? { ...step, ...patch } : step));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await checkedJsonMutation<{ ok: boolean }>("/api/portal/tasks/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          id: template?.id,
          name,
          summary,
          taskTitle: taskTitle || name,
          steps: steps.filter(step => step.label.trim()),
          appliesTo,
        }),
      }, {
        fallback: "The task template could not be saved.",
        validate: payload => payload.ok === true,
      });
      await onSaved();
    } catch (nextError) {
      setError(mutationErrorMessage(nextError, "The task template could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-xs font-semibold text-black/55">
        What is this template called?
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Onboard a new client"
          autoFocus
          className="h-10 rounded-md border border-black/12 px-2.5 text-sm font-normal outline-none focus:border-brand"
        />
      </label>

      <label className="grid gap-1 text-xs font-semibold text-black/55">
        When would you reach for it?
        <input
          value={summary}
          onChange={event => setSummary(event.target.value)}
          placeholder="Everything between a signed contract and a client who is running"
          className="h-10 rounded-md border border-black/12 px-2.5 text-sm font-normal outline-none focus:border-brand"
        />
      </label>

      <label className="grid gap-1 text-xs font-semibold text-black/55">
        The task title it creates
        <input
          value={taskTitle}
          onChange={event => setTaskTitle(event.target.value)}
          placeholder="Onboard {subject}"
          className="h-10 rounded-md border border-black/12 px-2.5 text-sm font-normal outline-none focus:border-brand"
        />
        <span className="font-normal text-black/45">
          Write <code className="rounded bg-black/[0.06] px-1">{"{subject}"}</code> where the client&rsquo;s name should go and you will be asked for it each time.
        </span>
      </label>

      <fieldset className="grid gap-1.5">
        <legend className="text-xs font-semibold text-black/55">Attach these steps automatically when&hellip;</legend>
        {/* Offered as a list rather than a typed prefix: somebody typing
            "invoice" and meaning `invoice:` would silently claim nothing. */}
        <p className="text-[11px] leading-4 text-black/45">
          Leave everything unticked and the template only runs when you pick it.
        </p>
        <div className="grid max-h-40 gap-0.5 overflow-y-auto rounded-md border border-black/10 p-1.5">
          {CLAIMABLE_FAMILIES.map(family => (
            <label key={family.prefix} className="flex min-h-8 items-center gap-2 rounded px-1.5 text-xs text-black/70 hover:bg-black/[0.03]">
              <input
                type="checkbox"
                checked={appliesTo.includes(family.prefix)}
                onChange={event => setAppliesTo(current => event.target.checked
                  ? [...current, family.prefix]
                  : current.filter(prefix => prefix !== family.prefix))}
              />
              {family.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <p className="text-xs font-semibold text-black/55">The steps, in order</p>
        {steps.map((step, index) => (
          <div key={index} className="grid gap-1.5 rounded-md border border-black/12 p-2.5">
            <div className="flex items-center gap-2">
              <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-black/[0.07] text-[10px] font-semibold text-black/55">{index + 1}</span>
              <input
                value={step.label}
                onChange={event => patchStep(index, { label: event.target.value })}
                placeholder="Create their portal"
                aria-label={`Step ${index + 1}`}
                className="h-9 min-w-0 flex-1 rounded-md border border-black/12 px-2.5 text-xs outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => setSteps(current => current.filter((_, position) => position !== index))}
                aria-label={`Remove step ${index + 1}`}
                className="shrink-0 rounded p-1.5 text-black/25 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 size={13} aria-hidden />
              </button>
            </div>
            <div className="grid gap-1.5 pl-7 sm:grid-cols-2">
              <input
                value={step.href ?? ""}
                onChange={event => patchStep(index, { href: event.target.value })}
                placeholder="Where it happens (optional)"
                aria-label={`Where step ${index + 1} happens`}
                className="h-9 w-full rounded-md border border-black/12 px-2.5 text-xs outline-none focus:border-brand"
              />
              {/* An SOP per step rather than per task: "how do I set up a
                  portal" is a different procedure from "how do I invoice", and
                  one document bolted to the whole job answers neither. */}
              <select
                value={step.sopId ?? ""}
                onChange={event => patchStep(index, { sopId: event.target.value || undefined })}
                aria-label={`SOP for step ${index + 1}`}
                className="h-9 w-full rounded-md border border-black/12 bg-white px-2 text-xs outline-none focus:border-brand"
              >
                <option value="">No SOP</option>
                {sops.map(sop => <option key={sop.id} value={sop.id}>{sop.title}</option>)}
              </select>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSteps(current => [...current, { label: "" }])}
          className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-black/15 px-2.5 text-xs font-semibold text-black/65 hover:bg-black/[0.035]"
        >
          <Plus size={13} aria-hidden />Add a step
        </button>
      </div>

      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="inline-flex min-h-10 items-center rounded-md border border-black/15 px-3 text-sm font-semibold text-black/60">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !name.trim() || !steps.some(step => step.label.trim())}
          onClick={() => void save()}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          <BookOpen size={15} aria-hidden />{busy ? "Saving…" : "Save template"}
        </button>
      </div>
    </div>
  );
}
