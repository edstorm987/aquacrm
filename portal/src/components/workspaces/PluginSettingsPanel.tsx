"use client";

// The generic settings form for ANY plugin.
//
// It renders whatever the manifest declared in `settings.groups` — the shapes
// come from the server, not from a hand-written form per plugin — and posts
// back to `/api/portal/plugins/settings`. Adding a field to a manifest is
// therefore the whole job; nobody writes a second form.
//
// Secrets are write-only by construction. The server never sends a password
// value, so the input starts empty and says what is already stored underneath
// it; leaving it blank keeps the stored one. There is no "reveal" control,
// because there is nothing on this page to reveal.

import { isSettingUnwired, UNWIRED_SETTING_NOTICE } from "@/lib/plugins/unwiredSettings";
import { useState } from "react";
import { Check, CircleAlert, KeyRound, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { PluginSetupStatus } from "@/lib/plugins/pluginSetupStatus";

export interface PluginSettingsFieldView {
  id: string;
  label: string;
  type: "text" | "password" | "url" | "email" | "number" | "select" | "boolean" | "textarea" | "color";
  helpText?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  value: string | number | boolean | null;
  secret: boolean;
  configured: boolean;
  source: "vault" | "environment" | null;
}

export interface PluginSettingsGroupView {
  id: string;
  label: string;
  description?: string;
  fields: PluginSettingsFieldView[];
}

export interface PluginSettingsView {
  pluginId: string;
  pluginName: string;
  installed: boolean;
  groups: PluginSettingsGroupView[];
  /** Optional so a server mid-deploy that predates it still renders. */
  setup?: PluginSetupStatus;
}

const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/35";

/**
 * `canEdit` is the CALLER's answer to "can this viewer actually save?", and it
 * must match `POST /api/portal/plugins/settings`, which requires an agency
 * owner or manager. A client-scoped page is visible to `client-owner` and
 * `client-staff` too, and rendering them an editable form with an enabled Save
 * whose every submission 403s is a control that cannot do what it offers — so
 * they get the values read-only instead, which is what they saw before this
 * panel was mounted. Defaults to true so agency-only callers are unchanged.
 */
export function PluginSettingsPanel({ initial, clientId, canEdit = true }: {
  initial: PluginSettingsView;
  clientId?: string;
  canEdit?: boolean;
}) {
  const [settings, setSettings] = useState(initial);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const set = (id: string, value: string | boolean) => {
    setDraft(current => ({ ...current, [id]: value }));
    setNote(null);
  };

  async function save() {
    if (!Object.keys(draft).length) {
      setNote({ tone: "ok", text: "Nothing changed." });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/portal/plugins/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pluginId: settings.pluginId, clientId, values: draft }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; settings?: PluginSettingsView };
      if (!response.ok || !result.ok || !result.settings) {
        setNote({ tone: "bad", text: explain(result.error) });
        return;
      }
      setSettings(result.settings);
      setDraft({});
      setNote({ tone: "ok", text: "Saved." });
    } catch {
      setNote({ tone: "bad", text: "The save could not be sent. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  if (!settings.groups.length) return null;

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-base font-semibold text-black/85">{settings.pluginName} settings</h2>
        <p className="mt-1 text-sm text-black/50">
          These are the settings {settings.pluginName} declares. Keys are stored encrypted and are never shown again after saving.
        </p>
        {!settings.installed ? (
          <p className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <TriangleAlert size={14} /> This workspace has no install of {settings.pluginName} yet, so there is nothing to save against.
          </p>
        ) : null}
      </header>

      {/* Finish setup — the plan's item 3, built over the vault rather than over
          `setupAnswers`. It COLLECTS nothing itself: it names what is missing
          and the fields below (already vault-backed, already write-only for
          secrets) remain the only place a value is entered. See
          `lib/plugins/pluginSetupStatus.ts` for why. */}
      <SetupBanner setup={settings.setup} pluginName={settings.pluginName} />

      {settings.groups.map(group => (
        <div key={group.id} className="rounded-md border border-black/10 bg-white">
          <div className="border-b border-black/10 px-4 py-3">
            <h3 className="text-sm font-semibold text-black/80">{group.label}</h3>
            {group.description ? <p className="mt-1 text-xs text-black/45">{group.description}</p> : null}
          </div>
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            {group.fields.map(field => (
              canEdit
                ? <Field key={field.id} field={field} pluginId={settings.pluginId} draft={draft[field.id]} onChange={value => set(field.id, value)} />
                : <ReadOnlyField key={field.id} field={field} />
            ))}
          </div>
        </div>
      ))}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !settings.installed}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save settings
          </button>
          {note ? (
            <span className={`text-sm ${note.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{note.text}</span>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-black/50">
          These are read-only here. Your agency changes {settings.pluginName} settings for this workspace.
        </p>
      )}
    </section>
  );
}

/**
 * What this module still needs before it works.
 *
 * Shown only while something is outstanding — a permanent green "setup
 * complete" panel is chrome nobody reads, and this page already shows each
 * field's own configured state.
 *
 * It is a SIGNPOST, not a second form. Every value is typed into the
 * vault-backed field below, so there is exactly one place a Stripe key can be
 * entered and exactly one place it is stored.
 */
function SetupBanner({ setup, pluginName }: { setup: PluginSetupStatus | undefined; pluginName: string }) {
  if (!setup) return null;
  const { missing, unmapped } = setup;
  if (!missing.length && !unmapped.length) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/70 px-4 py-3">
      {missing.length ? (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <CircleAlert size={15} aria-hidden="true" />
            Finish setting up {pluginName}
          </p>
          <p className="mt-1 text-xs text-amber-900/75">
            {/* The count is over what this page can actually collect, so it can
                always reach "done" by acting on the fields below. */}
            {setup.satisfied} of {setup.required} required {setup.required === 1 ? "value is" : "values are"} in place.
            Fill the rest in below and save.
          </p>
          <ul className="mt-2 space-y-1.5">
            {missing.map(item => (
              <li key={item.fieldId} className="text-xs text-amber-900/85">
                <strong className="font-semibold">{item.label}</strong>
                <span className="text-amber-900/55"> · {item.groupLabel} · needed for {item.stepTitle}</span>
                {item.helpText ? <span className="mt-0.5 block text-amber-900/60">{item.helpText}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* A requirement with no field behind it cannot be finished here. Saying
          so is the point: a checklist item nobody can action is worse than an
          absent one, and this is the manifest bug made visible. */}
      {unmapped.length ? (
        <p className={`text-xs text-amber-900/70 ${missing.length ? "mt-3 border-t border-amber-200 pt-2" : ""}`}>
          {unmapped.length === 1 ? "One value this module requires has" : `${unmapped.length} values this module requires have`}
          {" "}no settings field on this page and cannot be entered here:{" "}
          {unmapped.map(item => item.label).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The same values, with no control that can change them.
 *
 * Mounted for a viewer the settings API will refuse (see `canEdit`). It keeps
 * the "Not connected" notice, because a client reading a field that nothing
 * consumes should learn that here just as the agency does — but a secret's
 * value is never rendered, only its configured state, exactly as the editable
 * field does.
 */
function ReadOnlyField({ field }: { field: PluginSettingsFieldView }) {
  const shown = field.secret
    ? (field.configured ? "Configured" : "Not set")
    : typeof field.value === "boolean"
      ? (field.value ? "On" : "Off")
      : (String(field.value ?? "").trim() || "Not set");
  return (
    <div className="block text-xs font-medium text-black/55">
      <span className="flex flex-wrap items-center gap-2">
        {field.label}
        {field.secret ? <SecretState field={field} /> : null}
      </span>
      <span className="mt-1 block text-sm font-normal text-black/80">{shown}</span>
      {field.helpText ? <span className="mt-1 block text-[11px] font-normal leading-4 text-black/40">{field.helpText}</span> : null}
    </div>
  );
}

function Field({ field, pluginId, draft, onChange }: {
  field: PluginSettingsFieldView;
  pluginId: string;
  draft: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  const described = field.helpText ? `${field.id}-help` : undefined;
  // Swept 2026-08-28: 25 of the 51 declared settings fields are read by nothing.
  // A field like that is the worst kind of mask — it accepts input, saves
  // without error, and shows the value back on reload, so there is no way to
  // tell it from one that works. Say so at the field.
  const unwired = isSettingUnwired(pluginId, field.id);
  const noticeId = unwired ? `${field.id}-unwired` : undefined;
  return (
    <label className="block text-xs font-medium text-black/55">
      <span className="flex flex-wrap items-center gap-2">
        {field.label}
        {field.secret ? <SecretState field={field} /> : null}
        {unwired ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            Not connected
          </span>
        ) : null}
      </span>
      {renderInput(field, draft, onChange, described ?? noticeId)}
      {field.helpText ? <span id={described} className="mt-1 block text-[11px] font-normal leading-4 text-black/40">{field.helpText}</span> : null}
      {unwired ? (
        <span id={noticeId} className="mt-1 block text-[11px] font-normal leading-4 text-amber-800">
          {UNWIRED_SETTING_NOTICE}
        </span>
      ) : null}
    </label>
  );
}

/** What is actually stored — said plainly, because the value cannot be shown. */
function SecretState({ field }: { field: PluginSettingsFieldView }) {
  if (field.source === "vault") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
        <ShieldCheck size={11} /> Saved · leave blank to keep
      </span>
    );
  }
  if (field.source === "environment") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
        <KeyRound size={11} /> Using the deployment&rsquo;s key
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-black/12 bg-black/[0.03] px-1.5 py-0.5 text-[10px] font-semibold text-black/45">
      Not set
    </span>
  );
}

function renderInput(
  field: PluginSettingsFieldView,
  draft: string | boolean | undefined,
  onChange: (value: string | boolean) => void,
  described: string | undefined,
) {
  if (field.type === "boolean") {
    const checked = draft === undefined ? field.value === true : draft === true;
    return (
      <input
        type="checkbox"
        checked={checked}
        aria-describedby={described}
        onChange={event => onChange(event.target.checked)}
        className="mt-2 size-4 accent-black"
      />
    );
  }
  if (field.type === "select") {
    const value = draft === undefined ? String(field.value ?? "") : String(draft);
    return (
      <select value={value} aria-describedby={described} onChange={event => onChange(event.target.value)} className={`${control} mt-1`}>
        {(field.options ?? []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  if (field.type === "textarea") {
    const value = draft === undefined ? String(field.value ?? "") : String(draft);
    return (
      <textarea
        rows={3}
        value={value}
        placeholder={field.placeholder}
        aria-describedby={described}
        onChange={event => onChange(event.target.value)}
        className={`${control} mt-1 py-2`}
      />
    );
  }
  // Secrets start empty every time: the server does not send the stored value,
  // so there is nothing to prefill and blank means "unchanged".
  const value = field.secret
    ? (typeof draft === "string" ? draft : "")
    : (draft === undefined ? String(field.value ?? "") : String(draft));
  return (
    <input
      type={field.type === "password" ? "password" : field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
      value={value}
      placeholder={field.placeholder}
      autoComplete={field.secret ? "new-password" : undefined}
      min={field.type === "number" ? field.min : undefined}
      max={field.type === "number" ? field.max : undefined}
      step={field.type === "number" ? field.step : undefined}
      aria-describedby={described}
      onChange={event => onChange(event.target.value)}
      className={`${control} mt-1`}
    />
  );
}

function explain(error: string | undefined): string {
  if (!error) return "The settings could not be saved.";
  if (error.startsWith("missing_field:")) {
    return `${error.slice("missing_field:".length)} is also required before this connection can be saved.`;
  }
  if (error.startsWith("not_a_number:")) return `${error.slice("not_a_number:".length)} must be a number.`;
  if (error.startsWith("number_below_min:")) return `${error.slice("number_below_min:".length)} is below the minimum allowed value.`;
  if (error.startsWith("number_above_max:")) return `${error.slice("number_above_max:".length)} is above the maximum allowed value.`;
  if (error.startsWith("number_step_mismatch:")) return `${error.slice("number_step_mismatch:".length)} does not match the offered increment.`;
  if (error.startsWith("not_an_option:")) return `${error.slice("not_an_option:".length)} is not one of the offered choices.`;
  if (error.startsWith("no_vault_target:")) {
    return `${error.slice("no_vault_target:".length)} is declared as a secret but the plugin does not say where to store it, so it cannot be saved.`;
  }
  if (error === "plugin_not_installed") return "This workspace has no install of the plugin to save against.";
  if (error === "vault_encryption_unavailable") return "The credential vault has no encryption key configured, so secrets cannot be stored.";
  return error;
}
