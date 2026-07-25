"use client";

// FormRenderBlock — public form renderer driven by T2's
// `@aqua/plugin-forms`. Fetches a published form definition by id from
// `GET /api/portal/forms/public/form/:formId` and renders the fields
// per their kind (text, email, phone, textarea, select, multiselect,
// radio, checkbox, number, date, hidden). On submit, POSTs values to
// `/api/portal/forms/public/submit/:formId` and either renders a
// thank-you message or follows the configured redirect URL.
//
// **Round-5 status**: real fetches against forms plugin's public
// endpoints. When the forms plugin isn't installed (404), renders a
// soft "Form unavailable" placeholder. Editor mode renders a
// structural preview without fetching.

import { useEffect, useMemo, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

type FieldKind =
  | "text" | "email" | "phone" | "textarea"
  | "select" | "multiselect" | "radio" | "checkbox"
  | "number" | "date" | "hidden";

interface FormField {
  id: string;
  kind: FieldKind;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  defaultValue?: string;
  options?: { value: string; label: string }[];
}

interface SubmitAction {
  kind: "store-only" | "redirect" | "thank-you" | "external-webhook";
  redirectUrl?: string;
  thankYouMessage?: string;
}

interface FormDefinition {
  id: string;
  name: string;
  description?: string;
  fields: FormField[];
  submitAction: SubmitAction;
}

export default function FormRenderBlock({ block, editorMode }: BlockRenderProps) {
  const formId = (block.props.formId as string | undefined) ?? "";
  const submitLabel = (block.props.submitLabel as string | undefined) ?? "Send";

  const [form, setForm] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pluginMissing, setPluginMissing] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (editorMode || !formId) { setLoading(false); return; }
    let cancelled = false;
    void fetch(`/api/portal/forms/public/form/${encodeURIComponent(formId)}`, { cache: "no-store" })
      .then(async r => {
        if (r.status === 404) { setPluginMissing(true); return null; }
        if (!r.ok) { setError("Couldn't load form."); return null; }
        return r.json() as Promise<{ form?: FormDefinition }>;
      })
      .then(data => {
        if (cancelled || !data?.form) return;
        setForm(data.form);
        const seed: Record<string, unknown> = {};
        for (const f of data.form.fields) {
          if (f.defaultValue !== undefined) seed[f.id] = f.defaultValue;
          else if (f.kind === "checkbox") seed[f.id] = false;
          else if (f.kind === "multiselect") seed[f.id] = [];
        }
        setValues(seed);
      })
      .catch(() => { if (!cancelled) setError("Network error."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [editorMode, formId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || editorMode) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/portal/forms/public/submit/${encodeURIComponent(form.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data?.error ?? "Submission failed.");
        return;
      }
      const action = form.submitAction;
      if (action.kind === "redirect" && action.redirectUrl) {
        window.location.href = action.redirectUrl;
        return;
      }
      setSubmitted(action.thankYouMessage ?? "Thanks — we'll be in touch.");
    } catch (e2) {
      setSubmitError(e2 instanceof Error ? e2.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  const visibleFields = useMemo(() => form?.fields.filter(f => f.kind !== "hidden") ?? [], [form]);

  const containerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    margin: "0 auto",
    padding: "32px 24px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    ...blockStylesToCss(block.styles),
  };

  if (editorMode) {
    return (
      <section data-block-type="form-render" style={containerStyle}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--brand-accent, #ff6b35)", margin: "0 0 8px" }}>
          Form
        </p>
        <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>
          {formId
            ? "Live form renders here when published. Set the formId prop to a published form."
            : "Set the formId prop to a published form id."}
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section data-block-type="form-render" aria-label="Form" style={containerStyle}>
        <div role="status" aria-live="polite" aria-busy="true" style={{ display: "grid", gap: 12, position: "relative" }}>
          <span style={{ position: "absolute", left: -9999, width: 1, height: 1 }}>Loading form</span>
          <div style={{ height: 24, width: "60%", background: "rgba(255,255,255,0.05)", borderRadius: 6, animation: "aqua-pulse 1.6s ease-in-out infinite" }} aria-hidden />
          <div style={{ height: 44, background: "rgba(255,255,255,0.05)", borderRadius: 10, animation: "aqua-pulse 1.6s ease-in-out infinite" }} aria-hidden />
          <div style={{ height: 44, background: "rgba(255,255,255,0.05)", borderRadius: 10, animation: "aqua-pulse 1.6s ease-in-out infinite" }} aria-hidden />
        </div>
      </section>
    );
  }

  if (!formId) {
    return (
      <section data-block-type="form-render" style={containerStyle}>
        <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>No form configured.</p>
      </section>
    );
  }

  if (pluginMissing) {
    return (
      <section data-block-type="form-render" style={containerStyle}>
        <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>This form is unavailable right now.</p>
      </section>
    );
  }

  if (error || !form) {
    return (
      <section data-block-type="form-render" aria-label="Form" style={containerStyle}>
        <div role="alert" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <p style={{ fontSize: 13, color: "#fca5a5", margin: 0 }}>{error ?? "Form not found."}</p>
          {error && (
            <button
              type="button"
              onClick={() => { setError(null); setLoading(true); /* re-trigger fetch via formId-effect */ window.location.reload(); }}
              style={{ minHeight: 36, padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "inherit", cursor: "pointer" }}
            >
              Retry
            </button>
          )}
        </div>
      </section>
    );
  }

  if (submitted) {
    return (
      <section
        data-block-type="form-render"
        style={{
          ...containerStyle,
          background: "rgba(34,197,94,0.06)",
          border: "1px solid rgba(34,197,94,0.2)",
        }}
      >
        <p style={{ fontSize: 14, margin: 0 }}>{submitted}</p>
      </section>
    );
  }

  return (
    <form data-block-type="form-render" aria-label={form.name} style={containerStyle} onSubmit={handleSubmit}>
      <p style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>{form.name}</p>
      {form.description && <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 16px" }}>{form.description}</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {visibleFields.map(field => (
          <FormFieldInput key={field.id} field={field} value={values[field.id]} onChange={v => setValues(prev => ({ ...prev, [field.id]: v }))} />
        ))}
      </div>

      {submitError && <p role="alert" style={{ fontSize: 12, color: "#fca5a5", marginTop: 12 }}>{submitError}</p>}

      <button
        type="submit"
        disabled={submitting}
        style={{
          marginTop: 16,
          width: "100%",
          minHeight: 44,
          padding: "12px 20px",
          borderRadius: 10,
          border: "none",
          background: "var(--brand-accent, #ff6b35)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: submitting ? "wait" : "pointer",
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}

function FormFieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const required = field.required;
  const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream";
  const baseInputStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 44,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "inherit",
    fontSize: 14,
  };

  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, marginBottom: 6, opacity: 0.85 }}>
        {field.label}
        {required && <span style={{ color: "#fca5a5", marginLeft: 4 }}>*</span>}
      </span>
      {(() => {
        switch (field.kind) {
          case "textarea":
            return (
              <textarea
                rows={4}
                required={required}
                placeholder={field.placeholder}
                value={typeof value === "string" ? value : ""}
                onChange={e => onChange(e.target.value)}
                style={baseInputStyle}
              />
            );
          case "select":
            return (
              <select
                required={required}
                value={typeof value === "string" ? value : ""}
                onChange={e => onChange(e.target.value)}
                style={baseInputStyle}
              >
                <option value="">{field.placeholder ?? "—"}</option>
                {(field.options ?? []).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            );
          case "multiselect": {
            const selected = Array.isArray(value) ? (value as string[]) : [];
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(field.options ?? []).map(opt => {
                  const active = selected.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onChange(active ? selected.filter(v => v !== opt.value) : [...selected, opt.value])}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: active ? "1px solid var(--brand-accent, #ff6b35)" : "1px solid rgba(255,255,255,0.12)",
                        background: active ? "rgba(255,107,53,0.15)" : "rgba(255,255,255,0.04)",
                        color: "inherit",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            );
          }
          case "radio":
            return (
              <div style={{ display: "grid", gap: 6 }}>
                {(field.options ?? []).map(opt => (
                  <label key={opt.value} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name={field.id}
                      value={opt.value}
                      required={required}
                      checked={value === opt.value}
                      onChange={() => onChange(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            );
          case "checkbox":
            return (
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={e => onChange(e.target.checked)}
                />
                {field.placeholder ?? field.label}
              </label>
            );
          case "number":
            return (
              <input
                type="number"
                required={required}
                placeholder={field.placeholder}
                value={typeof value === "string" || typeof value === "number" ? value : ""}
                onChange={e => onChange(e.target.value)}
                style={baseInputStyle}
              />
            );
          case "date":
            return (
              <input
                type="date"
                required={required}
                value={typeof value === "string" ? value : ""}
                onChange={e => onChange(e.target.value)}
                style={baseInputStyle}
              />
            );
          case "email":
            return (
              <input
                type="email"
                required={required}
                placeholder={field.placeholder}
                value={typeof value === "string" ? value : ""}
                onChange={e => onChange(e.target.value)}
                style={baseInputStyle}
              />
            );
          case "phone":
            return (
              <input
                type="tel"
                required={required}
                placeholder={field.placeholder}
                value={typeof value === "string" ? value : ""}
                onChange={e => onChange(e.target.value)}
                style={baseInputStyle}
              />
            );
          case "hidden":
            return null;
          default:
            return (
              <input
                type="text"
                required={required}
                placeholder={field.placeholder}
                value={typeof value === "string" ? value : ""}
                onChange={e => onChange(e.target.value)}
                style={baseInputStyle}
              />
            );
        }
      })()}
      {field.helpText && (
        <span style={{ display: "block", fontSize: 11, opacity: 0.55, marginTop: 4 }}>
          {field.helpText}
        </span>
      )}
      {/* tailwind class kept around for environments that consume it */}
      <span style={{ display: "none" }}>{inputCls}</span>
    </label>
  );
}
