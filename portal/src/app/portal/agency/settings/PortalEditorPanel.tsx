"use client";

import { Archive, Check, ChevronRight, ListPlus, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  PortalFormEditorState,
  PortalFormEntity,
  PortalFormFieldDefinition,
  PortalFormFieldType,
} from "@/server/types";

type ContactField = {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "url" | "select" | "multi-select" | "checkbox";
  options: string[];
  formName: string;
  required?: boolean;
};

type ExpenseCategory = {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  status: "active" | "archived";
};

const ENTITIES: Array<{ id: PortalFormEntity; label: string; detail: string }> = [
  { id: "contacts", label: "Contacts", detail: "People, suppliers, staff and client contacts" },
  { id: "expenses", label: "Expenses", detail: "Costs, evidence and internal allocation" },
  { id: "clients", label: "Clients", detail: "Companies, people and account information" },
  { id: "leads", label: "Leads", detail: "Scouting, qualification and sales context" },
  { id: "tasks", label: "Actions", detail: "Work, ownership, reminders and SOPs" },
  { id: "products", label: "Products", detail: "Services, packages and delivery requirements" },
];

const CORE_FIELDS: Record<PortalFormEntity, string[]> = {
  contacts: ["Name", "Email", "Phone", "Contact type", "Tags"],
  expenses: ["Supplier", "Category", "Gross amount", "Tax", "Expense date", "Payment method", "Client", "Evidence"],
  clients: ["Client type", "Name", "Primary contact", "Status", "Niche"],
  leads: ["Name", "Company", "Source", "Stage", "Contact details"],
  tasks: ["Task", "Status", "Due date", "Assignee", "Priority", "SOP"],
  products: ["Name", "Category", "Billing", "Contract", "Portal requirement", "Status"],
};

const FIELD_TYPES: Array<{ value: PortalFormFieldType; label: string }> = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "url", label: "Website link" },
  { value: "email", label: "Email" },
  { value: "select", label: "One option" },
  { value: "multi-select", label: "Multiple options" },
  { value: "checkbox", label: "Yes or no" },
];

const inputClass = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/40";
const emptyDraft = { id: "", label: "", type: "text" as PortalFormFieldType, section: "Extra details", options: "", required: false };

export function PortalEditorPanel({ canManage }: { canManage: boolean }) {
  const [entity, setEntity] = useState<PortalFormEntity>("contacts");
  const [editor, setEditor] = useState<PortalFormEditorState | null>(null);
  const [contactFields, setContactFields] = useState<ContactField[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("Loading form settings...");

  useEffect(() => {
    const requestedForm = window.location.hash.split("/")[1] as PortalFormEntity | undefined;
    if (requestedForm && ENTITIES.some(item => item.id === requestedForm)) setEntity(requestedForm);
    void Promise.all([
      fetch("/api/portal/settings/portal-editor").then(response => response.json()),
      fetch("/api/portal/leads-pipeline/contact-configuration").then(response => response.json()),
      fetch("/api/portal/agency-finance/categories").then(response => response.json()),
    ]).then(([editorResult, contactResult, categoryResult]) => {
      if (editorResult?.ok) setEditor(editorResult.editor);
      if (contactResult?.ok) setContactFields(contactResult.customFields ?? []);
      if (categoryResult?.ok) setCategories(categoryResult.categories ?? []);
      setStatus("");
    }).catch(() => setStatus("Some form settings could not be loaded."));
  }, []);

  const fields = useMemo<PortalFormFieldDefinition[]>(() => {
    if (entity === "contacts") {
      return contactFields.map(field => ({
        id: field.id,
        label: field.label,
        type: field.type,
        options: field.options,
        section: field.formName,
        required: field.required === true,
        active: true,
        createdAt: 0,
        updatedAt: 0,
      }));
    }
    return editor?.forms[entity] ?? [];
  }, [contactFields, editor, entity]);

  function selectEntity(next: PortalFormEntity) {
    setEntity(next);
    setDraft(emptyDraft);
    setEditing(false);
    setStatus("");
  }

  function editField(field: PortalFormFieldDefinition) {
    setDraft({
      id: field.id,
      label: field.label,
      type: field.type,
      section: field.section,
      options: field.options.join(", "),
      required: field.required,
    });
    setEditing(true);
  }

  async function saveField(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Saving field...");
    const options = draft.options.split(",").map(value => value.trim()).filter(Boolean);
    if (entity === "contacts") {
      const supportedType = draft.type === "textarea" || draft.type === "email" ? "text" : draft.type;
      const response = await fetch("/api/portal/leads-pipeline/contact-configuration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save-field",
          field: {
            id: draft.id || undefined,
            label: draft.label,
            type: supportedType,
            options,
            formName: draft.section,
            required: draft.required,
          },
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) return setStatus(result?.error ?? "Field could not be saved.");
      setContactFields(result.customFields ?? []);
    } else {
      const response = await fetch("/api/portal/settings/portal-editor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity,
          field: {
            id: draft.id || undefined,
            label: draft.label,
            type: draft.type,
            options,
            section: draft.section,
            required: draft.required,
          },
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) return setStatus(result?.error ?? "Field could not be saved.");
      setEditor(result.editor);
    }
    setDraft(emptyDraft);
    setEditing(false);
    setStatus("Field saved.");
  }

  async function deleteField(field: PortalFormFieldDefinition) {
    if (!window.confirm(`Delete "${field.label}"? Existing values will remain stored, but the field will no longer appear on forms.`)) return;
    setStatus("Removing field...");
    const response = entity === "contacts"
      ? await fetch("/api/portal/leads-pipeline/contact-configuration", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "delete-field", fieldId: field.id }),
        })
      : await fetch("/api/portal/settings/portal-editor", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entity, fieldId: field.id }),
        });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) return setStatus(result?.error ?? "Field could not be removed.");
    if (entity === "contacts") setContactFields(result.customFields ?? []);
    else setEditor(result.editor);
    setStatus("Field removed.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-black/40">Forms</p>
        <div className="grid gap-1">
          {ENTITIES.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectEntity(item.id)}
              className={`flex min-h-12 items-center justify-between gap-3 rounded-md px-3 text-left transition ${entity === item.id ? "bg-black text-white" : "text-black/65 hover:bg-black/[0.04]"}`}
            >
              <span>
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className={`mt-0.5 block text-[11px] ${entity === item.id ? "text-white/60" : "text-black/40"}`}>{item.detail}</span>
              </span>
              <ChevronRight size={15} className="shrink-0 opacity-50" />
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 pb-4">
          <div>
            <h3 className="text-lg font-semibold text-black/85">{ENTITIES.find(item => item.id === entity)?.label} form</h3>
            <p className="mt-1 max-w-xl text-sm leading-5 text-black/50">
              {entity === "contacts"
                ? "Contact fields use the Leads Pipeline contact schema shared by contact records, imports and promotions. Changes here update that same schema."
                : "Add the information Milesymedia needs to capture. Group fields into clear sections so the working screen stays simple."}
            </p>
          </div>
          {canManage && !editing ? (
            <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85">
              <Plus size={16} /> Add field
            </button>
          ) : null}
        </header>

        <section className="py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-black/75">Built-in fields</h4>
              <p className="mt-0.5 text-xs text-black/40">Protected because records and reports rely on them.</p>
            </div>
            <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-black/45">{CORE_FIELDS[entity].length} fields</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {CORE_FIELDS[entity].map(field => <span key={field} className="rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-xs text-black/60">{field}</span>)}
          </div>
        </section>

        {editing ? (
          <form onSubmit={saveField} className="mb-5 border-y border-black/10 bg-black/[0.018] py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium text-black/55">Field name
                <input required value={draft.label} onChange={event => setDraft(value => ({ ...value, label: event.target.value }))} className={inputClass} placeholder="Purchase order number" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-black/55">Section
                <input required value={draft.section} onChange={event => setDraft(value => ({ ...value, section: event.target.value }))} className={inputClass} placeholder="Extra details" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-black/55">Field type
                <select value={draft.type} onChange={event => setDraft(value => ({ ...value, type: event.target.value as PortalFormFieldType }))} className={inputClass}>
                  {FIELD_TYPES.filter(item => entity !== "contacts" || item.value !== "textarea" && item.value !== "email").map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              {draft.type === "select" || draft.type === "multi-select" ? (
                <label className="grid gap-1 text-xs font-medium text-black/55">Options
                  <input required value={draft.options} onChange={event => setDraft(value => ({ ...value, options: event.target.value }))} className={inputClass} placeholder="Option one, Option two" />
                </label>
              ) : <div />}
            </div>
            <label className="mt-4 inline-flex items-center gap-2 text-sm text-black/65">
              <input type="checkbox" checked={draft.required} onChange={event => setDraft(value => ({ ...value, required: event.target.checked }))} className="size-4 accent-black" />
              Required before the record can be saved
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => { setEditing(false); setDraft(emptyDraft); }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 px-3 text-sm font-medium"><X size={15} /> Cancel</button>
              <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Check size={15} /> Save field</button>
            </div>
          </form>
        ) : null}

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-black/75">Your fields</h4>
            <span className="text-xs text-black/40">{fields.length} custom {fields.length === 1 ? "field" : "fields"}</span>
          </div>
          {fields.length ? (
            <div className="divide-y divide-black/10 border-y border-black/10">
              {fields.map(field => (
                <div key={field.id} className="flex min-h-16 items-center gap-3 py-3">
                  <ListPlus size={17} className="shrink-0 text-black/35" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-black/75">{field.label}</p>
                    <p className="mt-0.5 text-xs text-black/40">{field.section} · {FIELD_TYPES.find(item => item.value === field.type)?.label ?? field.type}{field.required ? " · Required" : ""}</p>
                  </div>
                  {canManage ? (
                    <div className="flex gap-1">
                      <button type="button" title="Edit field" aria-label={`Edit ${field.label}`} onClick={() => editField(field)} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45 hover:bg-black/[0.04]"><Pencil size={15} /></button>
                      <button type="button" title="Delete field" aria-label={`Delete ${field.label}`} onClick={() => void deleteField(field)} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="border-y border-dashed border-black/15 py-8 text-center">
              <p className="text-sm font-medium text-black/60">No custom fields yet</p>
              <p className="mt-1 text-xs text-black/40">The built-in form remains available as it is.</p>
            </div>
          )}
        </section>

        {entity === "expenses" ? <ExpenseCategoryEditor categories={categories} setCategories={setCategories} canManage={canManage} /> : null}
        {status ? <p role="status" className="mt-4 text-xs font-medium text-black/50">{status}</p> : null}
      </div>
    </div>
  );
}

function ExpenseCategoryEditor({ categories, setCategories, canManage }: {
  categories: ExpenseCategory[];
  setCategories: React.Dispatch<React.SetStateAction<ExpenseCategory[]>>;
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");

  async function createCategory(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Adding category...");
    const response = await fetch("/api/portal/agency-finance/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description: description.trim() || undefined }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) return setStatus(result?.error ?? "Category could not be added.");
    setCategories(current => [...current.filter(category => category.id !== result.category.id), result.category].sort((a, b) => a.name.localeCompare(b.name)));
    setName("");
    setDescription("");
    setStatus("Category added.");
  }

  async function setCategoryStatus(category: ExpenseCategory, next: ExpenseCategory["status"]) {
    setStatus(next === "archived" ? "Archiving category..." : "Restoring category...");
    const response = await fetch("/api/portal/agency-finance/categories", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: category.id, patch: { status: next } }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) return setStatus(result?.error ?? "Category could not be updated.");
    setCategories(current => current.map(item => item.id === category.id ? result.category : item));
    setStatus(next === "archived" ? "Category archived." : "Category restored.");
  }

  return (
    <section className="mt-8 border-t border-black/10 pt-6">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-black/75">Expense categories</h4>
        <p className="mt-1 text-xs leading-5 text-black/45">Create your own categories. Archive old ones without removing their historic expense records.</p>
      </div>
      {canManage ? (
        <form onSubmit={createCategory} className="grid gap-3 rounded-md border border-black/10 bg-black/[0.018] p-3 sm:grid-cols-[1fr_1.5fr_auto]">
          <input required value={name} onChange={event => setName(event.target.value)} className={inputClass} placeholder="Category name" aria-label="Category name" />
          <input value={description} onChange={event => setDescription(event.target.value)} className={inputClass} placeholder="What belongs here? (optional)" aria-label="Category description" />
          <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} /> Add</button>
        </form>
      ) : null}
      <div className="mt-3 divide-y divide-black/10 border-y border-black/10">
        {categories.map(category => (
          <div key={category.id} className="flex min-h-14 items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${category.status === "archived" ? "text-black/35 line-through" : "text-black/70"}`}>{category.name}</p>
              <p className="truncate text-xs text-black/40">{category.description || (category.isDefault ? "Milesymedia default category" : "Custom category")}</p>
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={() => void setCategoryStatus(category, category.status === "active" ? "archived" : "active")}
                className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-2.5 text-xs font-medium text-black/55 hover:bg-black/[0.03]"
              >
                {category.status === "active" ? <Archive size={14} /> : <RotateCcw size={14} />}
                {category.status === "active" ? "Archive" : "Restore"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {status ? <p role="status" className="mt-3 text-xs font-medium text-black/50">{status}</p> : null}
    </section>
  );
}
