"use client";

import type { PortalFormFieldDefinition, PortalFormFieldValue } from "@/server/types";

export type PortalCustomFieldValues = Record<string, PortalFormFieldValue>;

export function PortalCustomFields({
  fields,
  values,
  onChange,
  disabled = false,
  legend = "Additional details",
}: {
  fields: PortalFormFieldDefinition[];
  values: PortalCustomFieldValues;
  onChange: (values: PortalCustomFieldValues) => void;
  disabled?: boolean;
  legend?: string;
}) {
  const active = fields.filter(field => field.active);
  if (!active.length) return null;
  const sections = [...new Set(active.map(field => field.section || legend))];
  const set = (field: PortalFormFieldDefinition, value: PortalFormFieldValue | undefined) => {
    const next = { ...values };
    if (value === undefined || typeof value === "string" && !value || Array.isArray(value) && !value.length) delete next[field.id];
    else next[field.id] = value;
    onChange(next);
  };

  return (
    <fieldset className="grid gap-4 border-y border-black/10 py-4" data-testid="portal-custom-fields">
      <legend className="px-1 text-[10px] font-semibold uppercase tracking-wide text-black/40">{legend}</legend>
      {sections.map(section => (
        <section key={section} className="grid gap-3 sm:grid-cols-2">
          <h3 className="text-xs font-semibold text-black/60 sm:col-span-2">{section}</h3>
          {active.filter(field => (field.section || legend) === section).map(field => (
            <PortalCustomField key={field.id} field={field} value={values[field.id]} disabled={disabled} onChange={value => set(field, value)} />
          ))}
        </section>
      ))}
    </fieldset>
  );
}

function PortalCustomField({ field, value, disabled, onChange }: {
  field: PortalFormFieldDefinition;
  value?: PortalFormFieldValue;
  disabled: boolean;
  onChange: (value: PortalFormFieldValue | undefined) => void;
}) {
  const label = <span>{field.label}{field.required ? <span aria-hidden="true" className="text-red-600"> *</span> : null}</span>;
  const control = "mt-1 min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/40 disabled:bg-black/[0.03]";
  if (field.type === "checkbox") {
    return (
      <label className="flex min-h-11 items-center gap-3 text-xs font-medium text-black/60">
        <input type="checkbox" name={`custom-${field.id}`} required={field.required} checked={value === true} disabled={disabled} onChange={event => onChange(event.target.checked)} className="size-4 accent-black" />
        {label}
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="text-xs font-medium text-black/60">{label}
        <select required={field.required} name={`custom-${field.id}`} value={typeof value === "string" ? value : ""} disabled={disabled} onChange={event => onChange(event.target.value || undefined)} className={control}>
          <option value="">Choose an option</option>
          {field.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === "multi-select") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <label className="text-xs font-medium text-black/60">{label}
        <select multiple required={field.required} name={`custom-${field.id}`} value={selected} disabled={disabled} onChange={event => onChange([...event.currentTarget.selectedOptions].map(option => option.value))} className={`${control} min-h-24 py-2`}>
          {field.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <span className="mt-1 block text-[10px] font-normal text-black/38">Hold Ctrl or Command to choose more than one.</span>
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="text-xs font-medium text-black/60 sm:col-span-2">{label}
        <textarea required={field.required} name={`custom-${field.id}`} value={typeof value === "string" ? value : ""} disabled={disabled} rows={3} onChange={event => onChange(event.target.value || undefined)} className={`${control} py-2`} />
      </label>
    );
  }
  return (
    <label className="text-xs font-medium text-black/60">{label}
      <input
        required={field.required}
        name={`custom-${field.id}`}
        type={field.type === "number" || field.type === "date" || field.type === "url" || field.type === "email" ? field.type : "text"}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        onChange={event => onChange(event.target.value || undefined)}
        className={control}
      />
    </label>
  );
}
