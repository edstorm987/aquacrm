"use client";

// Automations — "when this happens on my board, do that".
//
// ── The list of actions is the honest part of this screen ────────────────
//
// Every action offered here is one the runner can genuinely carry out. There
// is no "wait 3 days", no "send an SMS", no "create a task in another tool" —
// not because they would be hard, but because nothing in this module could
// perform them, and a rule sitting in a list looking armed while doing nothing
// is worse than a feature that is plainly absent.
//
// `send-email` is here because it is real: it emits a cross-plugin event that
// the email-sender plugin subscribes to. The one thing it depends on — that
// the agency has email-sender installed — is stated on screen rather than
// discovered when no mail arrives.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  FeatureDisabledError,
  createAutomation,
  deleteAutomation,
  fetchAutomations,
  fetchBoard,
  fetchPipelines,
  updateAutomation,
} from "../lib/journeyClient";
import type {
  Automation,
  AutomationAction,
  AutomationTrigger,
  Pipeline,
  PipelineStage,
} from "../lib/journey";

type ActionType = AutomationAction["type"];

const ACTION_LABEL: Record<ActionType, string> = {
  "add-tag": "Add a tag",
  "remove-tag": "Remove a tag",
  "set-contact-status": "Change their status",
  "move-to-stage": "Move to another stage",
  "log-note": "Write a note on their timeline",
  "send-email": "Send them an email",
};

export default function AutomationsPage() {
  const params = useParams<{ clientId: string }>();
  const clientId = params?.clientId ?? "";

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);

  const load = useCallback(async (wanted?: string) => {
    if (!clientId) return;
    setError(null);
    try {
      const list = await fetchPipelines(clientId);
      setPipelines(list.pipelines);
      const target = wanted ?? list.pipelines.find(p => p.isDefault)?.id ?? list.pipelines[0]?.id;
      if (!target) { setStages([]); setAutomations([]); return; }
      setPipelineId(target);
      const [board, rules] = await Promise.all([
        fetchBoard(clientId, target),
        fetchAutomations(clientId, target),
      ]);
      setStages(board.board?.pipeline.stages ?? []);
      setAutomations(rules.automations);
    } catch (caught) {
      if (caught instanceof FeatureDisabledError) { setDisabled(true); return; }
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await work(); }
    catch (caught) {
      if (caught instanceof FeatureDisabledError) { setDisabled(true); return; }
      setError(caught instanceof Error ? caught.message : String(caught));
    }
    finally { setBusy(false); }
  }, []);

  if (disabled) {
    return (
      <section className="mx-auto max-w-lg p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Automations are not switched on</h1>
        <p className="mt-2 text-sm text-slate-600">
          Automations come with the journey pipelines add-on. Your agency can enable it from the
          CRM&rsquo;s settings.
        </p>
      </section>
    );
  }
  if (loading) return <p className="p-6 text-sm text-slate-500">Loading your automations…</p>;

  return (
    <section className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Automations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Rules that run when someone moves on your board.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pipelines.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Pipeline</span>
              <select
                value={pipelineId}
                onChange={event => void load(event.target.value)}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                {pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
              </select>
            </label>
          )}
          <Link
            href={`/portal/clients/${clientId}/client-crm/pipelines`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to board
          </Link>
          <button
            type="button"
            disabled={stages.length === 0}
            onClick={() => setBuilding(true)}
            className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            New automation
          </button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      {pipelines.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <p className="text-sm text-slate-600">
            Build a pipeline first — an automation runs when someone moves between its stages.
          </p>
          <Link
            href={`/portal/clients/${clientId}/client-crm/pipelines`}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white"
          >
            Go to pipelines
          </Link>
        </div>
      )}

      {building && (
        <AutomationBuilder
          stages={stages}
          busy={busy}
          onCancel={() => setBuilding(false)}
          onCreate={(name, trigger, actions) => run(async () => {
            await createAutomation(clientId, { pipelineId, name, trigger, actions });
            setBuilding(false);
            await load(pipelineId);
          })}
        />
      )}

      {pipelines.length > 0 && automations.length === 0 && !building && (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <h2 className="text-base font-semibold text-slate-900">No automations yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            For example: when someone reaches <em>Won</em>, tag them “customer” and write a note on
            their timeline. Rules run the moment a card lands.
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {automations.map(automation => (
          <li key={automation.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900">{automation.name}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-medium">When</span> {describeTrigger(automation.trigger, stages)}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
                  {automation.actions.map((action, index) => (
                    <li key={index}>
                      <span className="font-medium">Then</span> {describeAction(action, stages)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-400">
                  {automation.runCount === 0
                    ? "Has not run yet"
                    : `Run ${automation.runCount} ${automation.runCount === 1 ? "time" : "times"}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await updateAutomation(clientId, automation.id, { enabled: !automation.enabled });
                    await load(pipelineId);
                  })}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${
                    automation.enabled
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-300 text-slate-600"
                  }`}
                >
                  {automation.enabled ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await deleteAutomation(clientId, automation.id);
                    await load(pipelineId);
                  })}
                  className="min-h-11 rounded-lg border border-rose-300 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function describeTrigger(trigger: AutomationTrigger, stages: PipelineStage[]): string {
  const name = (id: string) => stages.find(stage => stage.id === id)?.name ?? "a removed stage";
  switch (trigger.type) {
    case "card-created": return "someone is added to this board";
    case "card-entered-stage": return `someone reaches “${name(trigger.stageId)}”`;
    case "card-left-stage": return `someone leaves “${name(trigger.stageId)}”`;
  }
}

function describeAction(action: AutomationAction, stages: PipelineStage[]): string {
  const name = (id: string) => stages.find(stage => stage.id === id)?.name ?? "a removed stage";
  switch (action.type) {
    case "add-tag": return `tag them “${action.tag}”`;
    case "remove-tag": return `remove the tag “${action.tag}”`;
    case "set-contact-status": return `set their status to ${action.status}`;
    case "move-to-stage": return `move them to “${name(action.stageId)}”`;
    case "log-note": return `write “${action.text}” on their timeline`;
    case "send-email": return `email them “${action.subject}”`;
  }
}

function AutomationBuilder(props: {
  stages: PipelineStage[];
  busy: boolean;
  onCancel: () => void;
  onCreate: (name: string, trigger: AutomationTrigger, actions: AutomationAction[]) => void;
}): React.ReactElement {
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<AutomationTrigger["type"]>("card-entered-stage");
  const [triggerStage, setTriggerStage] = useState(props.stages[0]?.id ?? "");
  const [actions, setActions] = useState<AutomationAction[]>([{ type: "add-tag", tag: "" }]);

  const trigger: AutomationTrigger = triggerType === "card-created"
    ? { type: "card-created" }
    : { type: triggerType, stageId: triggerStage };

  const setAction = (index: number, next: AutomationAction) =>
    setActions(current => current.map((action, i) => i === index ? next : action));

  return (
    <div className="rounded-xl border border-slate-300 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">New automation</h2>

      <label className="mt-3 block text-xs font-medium text-slate-700">
        Name it
        <input
          value={name}
          autoFocus
          onChange={event => setName(event.target.value)}
          placeholder="e.g. Tag new bookings"
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
        />
      </label>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">When</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            This happens
            <select
              value={triggerType}
              onChange={event => setTriggerType(event.target.value as AutomationTrigger["type"])}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
            >
              <option value="card-entered-stage">Someone reaches a stage</option>
              <option value="card-left-stage">Someone leaves a stage</option>
              <option value="card-created">Someone is added to the board</option>
            </select>
          </label>
          {triggerType !== "card-created" && (
            <label className="block text-xs font-medium text-slate-700">
              Which stage
              <select
                value={triggerStage}
                onChange={event => setTriggerStage(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
              >
                {props.stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Then</legend>
        <ul className="mt-2 space-y-2">
          {actions.map((action, index) => (
            <li key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start gap-2">
                <label className="min-w-0 flex-1 text-xs font-medium text-slate-700">
                  Do this
                  <select
                    value={action.type}
                    onChange={event => setAction(index, blankAction(event.target.value as ActionType, props.stages))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
                  >
                    {(Object.keys(ACTION_LABEL) as ActionType[]).map(type => (
                      <option key={type} value={type}>{ACTION_LABEL[type]}</option>
                    ))}
                  </select>
                </label>
                {actions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setActions(current => current.filter((_, i) => i !== index))}
                    className="mt-4 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-white"
                  >
                    <span aria-hidden="true">×</span><span className="sr-only">Remove this action</span>
                  </button>
                )}
              </div>
              <ActionFields action={action} stages={props.stages} onChange={next => setAction(index, next)} />
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setActions(current => [...current, { type: "add-tag", tag: "" }])}
          className="mt-2 min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          + Add another action
        </button>
      </fieldset>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={props.busy || !name.trim()}
          onClick={() => props.onCreate(name, trigger, actions)}
          className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Create automation
        </button>
        <button type="button" onClick={props.onCancel} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

function blankAction(type: ActionType, stages: PipelineStage[]): AutomationAction {
  switch (type) {
    case "add-tag": return { type, tag: "" };
    case "remove-tag": return { type, tag: "" };
    case "set-contact-status": return { type, status: "active" };
    case "move-to-stage": return { type, stageId: stages[0]?.id ?? "" };
    case "log-note": return { type, text: "" };
    case "send-email": return { type, subject: "", body: "" };
  }
}

function ActionFields(props: {
  action: AutomationAction;
  stages: PipelineStage[];
  onChange: (next: AutomationAction) => void;
}): React.ReactElement | null {
  const { action } = props;
  switch (action.type) {
    case "add-tag":
    case "remove-tag":
      return (
        <label className="mt-2 block text-xs font-medium text-slate-700">
          Tag
          <input
            value={action.tag}
            onChange={event => props.onChange({ ...action, tag: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
          />
        </label>
      );
    case "set-contact-status":
      return (
        <label className="mt-2 block text-xs font-medium text-slate-700">
          Status
          <select
            value={action.status}
            onChange={event => props.onChange({ ...action, status: event.target.value as "active" | "unsubscribed" })}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
        </label>
      );
    case "move-to-stage":
      return (
        <>
          <label className="mt-2 block text-xs font-medium text-slate-700">
            Stage
            <select
              value={action.stageId}
              onChange={event => props.onChange({ ...action, stageId: event.target.value })}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
            >
              {props.stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </label>
          <p className="mt-1 text-[11px] text-slate-500">
            Moving a card can set off another rule. If two rules move people back and forth, the
            board stops the loop and tells you.
          </p>
        </>
      );
    case "log-note":
      return (
        <label className="mt-2 block text-xs font-medium text-slate-700">
          Note
          <textarea
            value={action.text}
            rows={2}
            onChange={event => props.onChange({ ...action, text: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
      );
    case "send-email":
      return (
        <>
          <label className="mt-2 block text-xs font-medium text-slate-700">
            Subject
            <input
              value={action.subject}
              onChange={event => props.onChange({ ...action, subject: event.target.value })}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
            />
          </label>
          <label className="mt-2 block text-xs font-medium text-slate-700">
            Message
            <textarea
              value={action.body}
              rows={3}
              onChange={event => props.onChange({ ...action, body: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <p className="mt-1 text-[11px] text-slate-500">
            Sent through your agency&rsquo;s email setup. Anyone who has unsubscribed is skipped, and
            you will see that on the board rather than it happening silently.
          </p>
        </>
      );
  }
}
