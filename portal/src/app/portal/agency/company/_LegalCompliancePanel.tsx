"use client";

import { Download, Eye, FileUp, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { LegalDocument, LegalDocumentCategory, LegalDocumentStatus } from "@/server/types";

const categories: Array<{ id: LegalDocumentCategory; label: string }> = [
  { id: "contract", label: "Contracts" },
  { id: "insurance", label: "Insurance" },
  { id: "hmrc", label: "HMRC" },
  { id: "letter", label: "Letters" },
  { id: "template", label: "Templates" },
  { id: "policy", label: "Policies" },
  { id: "company", label: "Company records" },
  { id: "other", label: "Other" },
];
const input = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/40";
const DAY = 86_400_000;

export function LegalCompliancePanel({ initialDocuments, canEdit }: { initialDocuments: LegalDocument[]; canEdit: boolean }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [filter, setFilter] = useState<LegalDocumentCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<LegalDocument | null>(null);
  const [status, setStatus] = useState("");
  const now = Date.now();
  const upcoming = documents.filter(item => item.status !== "archived" && item.status !== "expired" && (item.reminderAt ?? item.expiresAt ?? Infinity) <= now + 45 * DAY).length;
  const actionRequired = documents.filter(item => item.status === "action-required" || (item.expiresAt ?? Infinity) < now && item.status !== "archived").length;
  const templates = documents.filter(item => item.category === "template" && item.status !== "archived").length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter(item =>
      (filter === "all" || item.category === filter) &&
      (!q || `${item.title} ${item.counterparty ?? ""} ${item.reference ?? ""} ${item.notes ?? ""} ${item.fileName}`.toLowerCase().includes(q)),
    );
  }, [documents, filter, query]);

  async function remove(document: LegalDocument) {
    if (!window.confirm(`Delete "${document.title}" and its stored file?`)) return;
    const response = await fetch(`/api/portal/company/legal?id=${encodeURIComponent(document.id)}`, { method: "DELETE" });
    if (response.ok) {
      setDocuments(current => current.filter(item => item.id !== document.id));
      setSelected(null);
      setStatus("Document deleted.");
    } else setStatus("Document could not be deleted.");
  }

  return <div className="mt-7 space-y-7">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold text-black/85">Legal &amp; compliance</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-black/45">Contracts, insurance, HMRC correspondence, company letters, policies and reusable document templates in one controlled register.</p>
      </div>
      {canEdit ? <button onClick={() => setUploading(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><FileUp size={16} /> Upload document</button> : null}
    </header>

    <dl className="grid grid-cols-2 border-y border-black/10 lg:grid-cols-4">
      <Metric label="Documents" value={documents.filter(item => item.status !== "archived").length} />
      <Metric label="Needs action" value={actionRequired} tone={actionRequired ? "bad" : undefined} />
      <Metric label="Due within 45 days" value={upcoming} tone={upcoming ? "warn" : undefined} />
      <Metric label="Reusable templates" value={templates} />
    </dl>

    <div className="flex flex-wrap gap-2 border-b border-black/10 pb-4">
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search legal records" className={`${input} min-w-56 flex-1`} />
      <select value={filter} onChange={event => setFilter(event.target.value as LegalDocumentCategory | "all")} className={`${input} sm:w-auto`}>
        <option value="all">All records</option>
        {categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
      </select>
    </div>

    {visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="border-b border-black/10 text-left text-[11px] uppercase tracking-wide text-black/40"><tr><th className="py-3">Document</th><th className="py-3">Type</th><th className="py-3">Counterparty / reference</th><th className="py-3">Deadline</th><th className="py-3">Status</th><th className="py-3 text-right">Actions</th></tr></thead><tbody>{visible.map(document => <tr key={document.id} className="border-b border-black/[0.07]"><td className="py-3 pr-3"><p className="font-medium text-black/80">{document.title}</p><p className="mt-0.5 text-xs text-black/40">{document.fileName} · {fileSize(document.size)}</p></td><td className="py-3 capitalize text-black/55">{categoryLabel(document.category)}</td><td className="py-3 text-black/55">{[document.counterparty, document.reference].filter(Boolean).join(" · ") || "—"}</td><td className="py-3">{deadline(document, now)}</td><td className="py-3"><Status value={effectiveStatus(document, now)} /></td><td className="py-3 text-right"><div className="inline-flex gap-1"><button title="Inspect" aria-label={`Inspect ${document.title}`} onClick={() => setSelected(document)} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45"><Eye size={15} /></button><a title="Open document" aria-label={`Open ${document.title}`} target="_blank" href={`/api/portal/company/legal/content?id=${encodeURIComponent(document.id)}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45"><Download size={15} /></a></div></td></tr>)}</tbody></table></div> : <div className="grid min-h-52 place-items-center border-y border-dashed border-black/15 text-center"><div><ShieldCheck size={28} className="mx-auto text-black/20" /><p className="mt-3 text-sm font-medium text-black/65">No legal records to show</p><p className="mt-1 text-xs text-black/40">Upload your first contract, insurance policy, letter or template.</p></div></div>}
    {status ? <p role="status" className="text-xs font-medium text-black/50">{status}</p> : null}
    {uploading ? <UploadDialog onClose={() => setUploading(false)} onUploaded={document => { setDocuments(current => [document, ...current]); setUploading(false); setStatus("Document uploaded."); }} /> : null}
    {selected ? <DocumentDialog document={selected} canEdit={canEdit} onClose={() => setSelected(null)} onUpdated={document => { setDocuments(current => current.map(item => item.id === document.id ? document : item)); setSelected(document); setStatus("Document updated."); }} onDelete={() => void remove(selected)} /> : null}
  </div>;
}

function UploadDialog({ onClose, onUploaded }: { onClose: () => void; onUploaded: (document: LegalDocument) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal title="Upload legal document" onClose={onClose}><form className="grid gap-4" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); const response = await fetch("/api/portal/company/legal/upload", { method: "POST", body: new FormData(event.currentTarget) }); const result = await response.json().catch(() => null); setBusy(false); if (!response.ok || !result?.ok) return setError(result?.error ?? "Document could not be uploaded."); onUploaded(result.document); }}>
    <Field label="Document"><label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-black/20 bg-black/[0.015] text-center"><FileUp size={20} className="text-black/35" /><span className="mt-2 text-sm font-medium text-black/65">Choose a file</span><span className="mt-1 text-xs text-black/35">PDF, Word, spreadsheet, text or image · 12 MB max</span><input required name="file" type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp" /></label></Field>
    <Field label="Record title"><input name="title" className={input} placeholder="Professional indemnity insurance" /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Type"><select name="category" className={input}>{categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></Field><Field label="Status"><select name="status" className={input}><option value="active">Active</option><option value="draft">Draft</option><option value="action-required">Action required</option><option value="expired">Expired</option><option value="archived">Archived</option></select></Field><Field label="Counterparty"><input name="counterparty" className={input} placeholder="Insurer, client or HMRC" /></Field><Field label="Reference"><input name="reference" className={input} placeholder="Policy or case number" /></Field><Field label="Effective date"><input name="effectiveAt" type="date" className={input} /></Field><Field label="Expiry or deadline"><input name="expiresAt" type="date" className={input} /></Field><Field label="Reminder date"><input name="reminderAt" type="date" className={input} /></Field></div>
    <Field label="Notes"><textarea name="notes" rows={3} className={`${input} py-2`} placeholder="Coverage, obligations, response needed or renewal notes" /></Field>
    {error ? <p className="text-sm text-red-700">{error}</p> : null}<div className="flex justify-end"><button disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"><Plus size={15} />{busy ? "Uploading..." : "Add to register"}</button></div>
  </form></Modal>;
}

function DocumentDialog({ document, canEdit, onClose, onUpdated, onDelete }: { document: LegalDocument; canEdit: boolean; onClose: () => void; onUpdated: (document: LegalDocument) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  return <Modal title={document.title} onClose={onClose}>{editing ? <form className="grid gap-4" onSubmit={async event => { event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget); const date = (key: string) => Date.parse(String(data.get(key) ?? "")) || 0; const response = await fetch("/api/portal/company/legal", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: document.id, patch: { title: data.get("title"), category: data.get("category"), status: data.get("status"), counterparty: data.get("counterparty"), reference: data.get("reference"), effectiveAt: date("effectiveAt"), expiresAt: date("expiresAt"), reminderAt: date("reminderAt"), notes: data.get("notes") } }) }); const result = await response.json(); setBusy(false); if (result.ok) { onUpdated(result.document); setEditing(false); } }}><Field label="Title"><input name="title" defaultValue={document.title} className={input} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Type"><select name="category" defaultValue={document.category} className={input}>{categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></Field><Field label="Status"><select name="status" defaultValue={document.status} className={input}><option value="active">Active</option><option value="draft">Draft</option><option value="action-required">Action required</option><option value="expired">Expired</option><option value="archived">Archived</option></select></Field><Field label="Counterparty"><input name="counterparty" defaultValue={document.counterparty} className={input} /></Field><Field label="Reference"><input name="reference" defaultValue={document.reference} className={input} /></Field><Field label="Effective date"><input name="effectiveAt" type="date" defaultValue={dateValue(document.effectiveAt)} className={input} /></Field><Field label="Expiry or deadline"><input name="expiresAt" type="date" defaultValue={dateValue(document.expiresAt)} className={input} /></Field><Field label="Reminder date"><input name="reminderAt" type="date" defaultValue={dateValue(document.reminderAt)} className={input} /></Field></div><Field label="Notes"><textarea name="notes" rows={4} defaultValue={document.notes} className={`${input} py-2`} /></Field><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="min-h-10 px-3 text-sm">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white">{busy ? "Saving..." : "Save changes"}</button></div></form> : <>
    <dl className="divide-y divide-black/10 border-y border-black/10"><Row label="Type" value={categoryLabel(document.category)} /><Row label="Status" value={effectiveStatus(document, Date.now()).replace("-", " ")} /><Row label="Counterparty" value={document.counterparty || "Not recorded"} /><Row label="Reference" value={document.reference || "Not recorded"} /><Row label="Effective" value={displayDate(document.effectiveAt)} /><Row label="Expiry / deadline" value={displayDate(document.expiresAt)} /><Row label="Reminder" value={displayDate(document.reminderAt)} /><Row label="File" value={`${document.fileName} · ${fileSize(document.size)}`} /></dl>{document.notes ? <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/65">{document.notes}</p></div> : null}<div className="mt-5 flex flex-wrap justify-between gap-2"><div>{canEdit ? <button onClick={onDelete} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-red-700 hover:bg-red-50"><Trash2 size={15} /> Delete</button> : null}</div><div className="flex gap-2"><a target="_blank" href={`/api/portal/company/legal/content?id=${encodeURIComponent(document.id)}`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 px-3 text-sm font-medium"><Download size={15} /> Open file</a>{canEdit ? <button onClick={() => setEditing(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Pencil size={15} /> Edit record</button> : null}</div></div>
  </>}</Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[95] grid items-end bg-black/40 sm:items-center sm:p-6"><button className="absolute inset-0" aria-label="Close dialog" onClick={onClose} /><section role="dialog" aria-modal="true" aria-label={title} className="relative mx-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl sm:rounded-lg sm:p-6"><header className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Legal register</p><h2 className="mt-1 text-xl font-semibold text-black/85">{title}</h2></div><button onClick={onClose} className="grid size-9 place-items-center rounded-md border border-black/10"><X size={16} /></button></header>{children}</section></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-xs font-medium text-black/55">{label}{children}</label>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[140px_1fr] gap-3 py-3 text-sm"><dt className="text-black/45">{label}</dt><dd className="capitalize text-black/75">{value}</dd></div>; }
function Metric({ label, value, tone }: { label: string; value: number; tone?: "bad" | "warn" }) { return <div className="py-4"><dt className="text-xs font-medium text-black/45">{label}</dt><dd className={`mt-1 text-2xl font-semibold ${tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-black/85"}`}>{value}</dd></div>; }
function Status({ value }: { value: LegalDocumentStatus }) { const style = value === "action-required" || value === "expired" ? "bg-red-50 text-red-700" : value === "active" ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.05] text-black/50"; return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${style}`}>{value.replace("-", " ")}</span>; }
function effectiveStatus(document: LegalDocument, now: number): LegalDocumentStatus { return document.status !== "archived" && document.expiresAt && document.expiresAt < now ? "expired" : document.status; }
function deadline(document: LegalDocument, now: number) { const value = document.reminderAt ?? document.expiresAt; if (!value) return <span className="text-black/35">None set</span>; const days = Math.ceil((value - now) / DAY); return <span className={days < 0 ? "font-medium text-red-700" : days <= 45 ? "font-medium text-amber-700" : "text-black/55"}>{new Date(value).toLocaleDateString("en-GB")} · {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}</span>; }
function categoryLabel(value: LegalDocumentCategory) { return categories.find(category => category.id === value)?.label ?? value; }
function displayDate(value?: number) { return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Not set"; }
function dateValue(value?: number) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
function fileSize(bytes: number) { return bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`; }
