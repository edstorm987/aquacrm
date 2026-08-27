"use client";

import { useState } from "react";
import { Save } from "lucide-react";

import { PortalCustomFields, type PortalCustomFieldValues } from "@/components/forms/PortalCustomFields";
import type { PortalFormFieldDefinition } from "@/server/types";

export function ClientCustomFieldsSettings({ clientId, fields, initialValues }: {
  clientId: string;
  fields: PortalFormFieldDefinition[];
  initialValues: PortalCustomFieldValues;
}) {
  const [values, setValues] = useState(initialValues);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  if (!fields.some(field => field.active)) return null;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/tenants/client-custom-fields", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, customFields: values }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; customFields?: PortalCustomFieldValues } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Client details could not be saved.");
      setValues(result.customFields ?? values);
      setStatus("Client details saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Client details could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-black/85">Additional client details</h2>
        <p className="mt-1 text-xs leading-5 text-black/45">Fields configured in Portal Editor. Required values are checked again by the server.</p>
      </div>
      <div className="mt-4">
        <PortalCustomFields fields={fields} values={values} onChange={setValues} legend="Client custom fields" />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className={`text-xs ${status.includes("saved") ? "text-emerald-700" : "text-red-700"}`}>{status}</p>
        <button disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-50">
          <Save size={14} />{busy ? "Saving..." : "Save details"}
        </button>
      </div>
    </form>
  );
}
