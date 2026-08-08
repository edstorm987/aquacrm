"use client";

import {
  Check,
  ExternalLink,
  Eye,
  FileSignature,
  FileText,
  History,
  Library,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ClientContract, ClientContractTemplate } from "@/lib/clientContracts";

const CONTROL = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/35 focus:ring-2 focus:ring-black/5";

interface ContractDraft {
  contractId?: string;
  title: string;
  summary: string;
  body: string;
  documentUrl: string;
  documentName: string;
  templateId: string;
  amendmentNote: string;
  saveAsTemplate: boolean;
}

interface TemplateDraft {
  id?: string;
  title: string;
  summary: string;
  body: string;
}

const EMPTY_CONTRACT: ContractDraft = {
  title: "",
  summary: "",
  body: "",
  documentUrl: "",
  documentName: "",
  templateId: "",
  amendmentNote: "",
  saveAsTemplate: false,
};

const EMPTY_TEMPLATE: TemplateDraft = { title: "", summary: "", body: "" };

function formatShortDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function EditorModal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-lg bg-[#f7f7f5] shadow-2xl sm:max-h-[92dvh] sm:rounded-lg">
        <header className="flex shrink-0 items-center justify-between border-b border-black/10 bg-white px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold text-black/85">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 text-black/55 hover:bg-black/[0.04]" title="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ContractsPanel({
  clientId,
  initialContracts,
  initialTemplates,
}: {
  clientId: string;
  initialContracts: ClientContract[];
  initialTemplates: ClientContractTemplate[];
}) {
  const [contracts, setContracts] = useState(initialContracts);
  const [templates, setTemplates] = useState(initialTemplates);
  const [editor, setEditor] = useState<ContractDraft | null>(null);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [templateEditor, setTemplateEditor] = useState<TemplateDraft | null>(null);
  const [inspection, setInspection] = useState<ClientContract | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function openBlankContract() {
    setUploadFile(null);
    setEditor({ ...EMPTY_CONTRACT });
  }

  function openFromTemplate(template: ClientContractTemplate) {
    setUploadFile(null);
    setEditor({
      ...EMPTY_CONTRACT,
      title: template.title,
      summary: template.summary ?? "",
      body: template.body,
      templateId: template.id,
    });
    setTemplateLibraryOpen(false);
  }

  function openAmendment(contract: ClientContract) {
    setUploadFile(null);
    setEditor({
      ...EMPTY_CONTRACT,
      contractId: contract.id,
      title: contract.title,
      summary: contract.summary ?? "",
      body: contract.body ?? "",
      documentUrl: contract.documentUrl ?? "",
      documentName: contract.documentName ?? "",
      templateId: contract.templateId ?? "",
    });
  }

  async function uploadContractFile(): Promise<{ url: string; name: string } | null> {
    if (!uploadFile) return null;
    const form = new FormData();
    form.set("clientId", clientId);
    form.set("category", "contract");
    form.set("file", uploadFile);
    const response = await fetch("/api/tenants/client-files/upload", { method: "POST", body: form });
    const payload = await response.json() as { ok: boolean; error?: string; file?: { url: string; name: string } };
    if (!response.ok || !payload.ok || !payload.file) throw new Error(payload.error || "Contract upload failed.");
    return payload.file;
  }

  async function saveContract() {
    if (!editor?.title.trim()) {
      setNotice("Give the contract a clear title.");
      return;
    }
    if (!editor.body.trim() && !editor.documentUrl.trim() && !uploadFile) {
      setNotice("Write the terms or attach the contract document.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const uploaded = await uploadContractFile();
      const response = await fetch("/api/tenants/client-contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          action: editor.contractId ? "update" : "create",
          contractId: editor.contractId,
          title: editor.title,
          summary: editor.summary,
          body: editor.body,
          documentUrl: uploaded?.url ?? editor.documentUrl,
          documentName: uploaded?.name ?? editor.documentName,
          templateId: editor.templateId,
          amendmentNote: editor.amendmentNote,
        }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; contracts?: ClientContract[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Contract could not be saved.");
      setContracts(payload.contracts ?? contracts);

      if (editor.saveAsTemplate && editor.body.trim()) {
        const templateResponse = await fetch("/api/portal/contracts/templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "create", title: editor.title, summary: editor.summary, body: editor.body }),
        });
        const templatePayload = await templateResponse.json() as { ok: boolean; error?: string; templates?: ClientContractTemplate[] };
        if (!templateResponse.ok || !templatePayload.ok) throw new Error(templatePayload.error || "Contract saved, but its template could not be created.");
        setTemplates(templatePayload.templates ?? templates);
      }

      setEditor(null);
      setUploadFile(null);
      setNotice(editor.contractId ? "Amendment saved as a new draft version." : "Contract draft created.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Contract could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "send" | "accept" | "delete", contract: ClientContract) {
    if (action === "delete" && !window.confirm(`Delete the draft “${contract.title}”?`)) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/client-contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, action, contractId: contract.id }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; contracts?: ClientContract[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Contract update failed.");
      setContracts(payload.contracts ?? contracts);
      setNotice(action === "send" ? "Contract sent to the customer portal." : action === "accept" ? "Acceptance recorded." : "Draft deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Contract update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!templateEditor?.title.trim() || !templateEditor.body.trim()) {
      setNotice("Template title and terms are required.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/portal/contracts/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: templateEditor.id ? "update" : "create",
          id: templateEditor.id,
          title: templateEditor.title,
          summary: templateEditor.summary,
          body: templateEditor.body,
        }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; templates?: ClientContractTemplate[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Template could not be saved.");
      setTemplates(payload.templates ?? templates);
      setTemplateEditor(null);
      setNotice("Template saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Template could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(template: ClientContractTemplate) {
    if (template.source === "product" || !window.confirm(`Delete the template “${template.title}”?`)) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/portal/contracts/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", id: template.id }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; templates?: ClientContractTemplate[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Template could not be deleted.");
      const productTemplates = templates.filter(item => item.source === "product");
      setTemplates([...(payload.templates ?? []), ...productTemplates]);
      setNotice("Template deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Template could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-black/10 bg-white" data-testid="client-contracts-panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 p-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-black/40">Client record</p>
          <h2 className="mt-1 text-sm font-medium text-black/85">Contracts</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTemplateLibraryOpen(true)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/15 px-3 text-xs font-medium hover:bg-black/[0.03]">
            <Library size={14} aria-hidden="true" /> Templates
          </button>
          <button type="button" onClick={openBlankContract} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-medium text-white hover:bg-black/85">
            <Plus size={14} aria-hidden="true" /> New contract
          </button>
        </div>
      </header>

      {contracts.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <FileSignature size={22} className="mx-auto text-black/25" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-black/70">No contracts yet.</p>
          <p className="mt-1 text-xs text-black/45">Write one, upload a document, or start from a reusable template.</p>
          <button type="button" onClick={openBlankContract} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md border border-black/15 px-3 text-xs font-medium">
            <Plus size={13} aria-hidden="true" /> Create first contract
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-black/8">
          {contracts.map(contract => (
            <li key={contract.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-black/85">{contract.title}</p>
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/55">{contract.status}</span>
                  <span className="text-[10px] text-black/40">Version {contract.version ?? 1}</span>
                </div>
                {contract.summary && <p className="mt-2 max-w-3xl text-xs leading-5 text-black/50">{contract.summary}</p>}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-black/40">
                  <span>{contract.body ? "Written terms" : "Document only"}</span>
                  {contract.documentName && <span>{contract.documentName}</span>}
                  {(contract.revisions?.length ?? 0) > 0 && <span>{contract.revisions!.length} previous version{contract.revisions!.length === 1 ? "" : "s"}</span>}
                </div>
                {contract.acceptedAt && <p className="mt-2 text-[11px] text-emerald-700">Accepted by {contract.acceptedBy} on {formatShortDate(contract.acceptedAt)}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setInspection(contract)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/15 px-3 text-xs font-medium">
                  <Eye size={13} aria-hidden="true" /> Inspect
                </button>
                <button type="button" onClick={() => openAmendment(contract)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/15 px-3 text-xs font-medium">
                  <Pencil size={13} aria-hidden="true" /> Amend
                </button>
                {contract.documentUrl && <a href={contract.documentUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/15 px-3 text-xs font-medium">Document <ExternalLink size={12} aria-hidden="true" /></a>}
                {contract.status === "draft" && (
                  <>
                    <button type="button" onClick={() => void act("delete", contract)} disabled={busy} title="Delete draft" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/15 text-black/55 disabled:opacity-45"><Trash2 size={14} aria-hidden="true" /></button>
                    <button type="button" onClick={() => void act("send", contract)} disabled={busy || (!contract.body && !contract.documentUrl)} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-medium text-white disabled:opacity-45"><Send size={13} aria-hidden="true" /> Send</button>
                  </>
                )}
                {contract.status === "sent" && <button type="button" onClick={() => void act("accept", contract)} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/15 px-3 text-xs font-medium disabled:opacity-45"><Check size={13} aria-hidden="true" /> Mark accepted</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {notice && <p aria-live="polite" className="border-t border-black/10 px-4 py-3 text-xs text-black/55">{notice}</p>}

      {editor && (
        <EditorModal title={editor.contractId ? "Amend contract" : "New contract"} onClose={() => !busy && setEditor(null)}>
          <form onSubmit={event => { event.preventDefault(); void saveContract(); }} className="grid gap-5 p-4 sm:p-6">
            {editor.contractId && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                Saving creates a new draft version. The previous wording remains in the contract history, and the amended version must be sent and accepted again.
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium text-black/65">Contract title
                <input value={editor.title} onChange={event => setEditor(value => value && ({ ...value, title: event.target.value }))} className={CONTROL} placeholder="Website design agreement" autoFocus />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-black/65">Short summary
                <input value={editor.summary} onChange={event => setEditor(value => value && ({ ...value, summary: event.target.value }))} className={CONTROL} placeholder="Plain-English scope and purpose" />
              </label>
            </div>
            <label className="grid gap-1.5 text-xs font-medium text-black/65">Contract terms
              <textarea value={editor.body} onChange={event => setEditor(value => value && ({ ...value, body: event.target.value }))} className={`${CONTROL} min-h-[20rem] resize-y py-3 font-mono text-[13px] leading-6`} placeholder="Write or paste the full contract terms here..." />
              <span className="font-normal text-black/40">These terms are shown directly in the customer portal.</span>
            </label>
            <div className="grid gap-4 border-t border-black/10 pt-5 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium text-black/65">Upload contract document
                <input type="file" onChange={event => setUploadFile(event.target.files?.[0] ?? null)} accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp" className="min-h-11 cursor-pointer rounded-md border border-black/15 bg-white px-2 py-1.5 text-xs file:mr-3 file:rounded file:border-0 file:bg-black/[0.05] file:px-3 file:py-1.5 file:text-xs" />
                <span className="font-normal text-black/40">Private PDF, document, text or image up to 12 MB.</span>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-black/65">Or attach a document link
                <input type="url" value={editor.documentUrl} onChange={event => setEditor(value => value && ({ ...value, documentUrl: event.target.value, documentName: event.target.value ? value.documentName : "" }))} className={CONTROL} placeholder="https://" />
                {editor.documentName && <span className="truncate font-normal text-black/40">Current: {editor.documentName}</span>}
              </label>
            </div>
            {editor.contractId && <label className="grid gap-1.5 text-xs font-medium text-black/65">Amendment note
              <input value={editor.amendmentNote} onChange={event => setEditor(value => value && ({ ...value, amendmentNote: event.target.value }))} className={CONTROL} placeholder="What changed and why?" />
            </label>}
            <label className="flex items-start gap-3 rounded-md border border-black/10 bg-white px-4 py-3 text-xs text-black/60">
              <input type="checkbox" checked={editor.saveAsTemplate} onChange={event => setEditor(value => value && ({ ...value, saveAsTemplate: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-black" />
              <span><strong className="block font-medium text-black/75">Save the written terms as a reusable template</strong>Use the same starting point for another client later.</span>
            </label>
            <div className="flex flex-wrap justify-end gap-2 border-t border-black/10 pt-4">
              <button type="button" onClick={() => setEditor(null)} disabled={busy} className="min-h-10 rounded-md border border-black/15 px-4 text-xs font-medium">Cancel</button>
              <button type="submit" disabled={busy || !editor.title.trim() || (!editor.body.trim() && !editor.documentUrl.trim() && !uploadFile)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-medium text-white disabled:opacity-45"><Save size={14} aria-hidden="true" /> {busy ? "Saving..." : editor.contractId ? "Save new version" : "Save draft"}</button>
            </div>
          </form>
        </EditorModal>
      )}

      {templateLibraryOpen && (
        <EditorModal title="Contract templates" onClose={() => setTemplateLibraryOpen(false)}>
          <div className="p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-sm leading-6 text-black/50">Reusable wording lives here. Product contracts appear automatically from the product library.</p>
              <button type="button" onClick={() => setTemplateEditor({ ...EMPTY_TEMPLATE })} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-medium text-white"><Plus size={13} aria-hidden="true" /> New template</button>
            </div>
            {templates.length === 0 ? (
              <p className="mt-8 rounded-md border border-dashed border-black/15 px-5 py-10 text-center text-sm text-black/45">No contract templates yet.</p>
            ) : (
              <ul className="mt-5 divide-y divide-black/10 border-y border-black/10">
                {templates.map(template => (
                  <li key={template.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-black/80">{template.title}</p>{template.source === "product" && <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] uppercase text-black/45">Product</span>}</div>
                      {template.summary && <p className="mt-1 line-clamp-2 text-xs leading-5 text-black/45">{template.summary}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {template.source !== "product" && <button type="button" onClick={() => setTemplateEditor({ id: template.id, title: template.title, summary: template.summary ?? "", body: template.body })} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/15" title="Edit template"><Pencil size={13} aria-hidden="true" /></button>}
                      {template.source !== "product" && <button type="button" onClick={() => void deleteTemplate(template)} disabled={busy} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/15 text-red-700" title="Delete template"><Trash2 size={13} aria-hidden="true" /></button>}
                      <button type="button" onClick={() => openFromTemplate(template)} className="min-h-9 rounded-md bg-black px-3 text-xs font-medium text-white">Use template</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </EditorModal>
      )}

      {templateEditor && (
        <EditorModal title={templateEditor.id ? "Edit contract template" : "New contract template"} onClose={() => !busy && setTemplateEditor(null)}>
          <form onSubmit={event => { event.preventDefault(); void saveTemplate(); }} className="grid gap-4 p-4 sm:p-6">
            <label className="grid gap-1.5 text-xs font-medium text-black/65">Template title<input value={templateEditor.title} onChange={event => setTemplateEditor(value => value && ({ ...value, title: event.target.value }))} className={CONTROL} autoFocus /></label>
            <label className="grid gap-1.5 text-xs font-medium text-black/65">Summary<input value={templateEditor.summary} onChange={event => setTemplateEditor(value => value && ({ ...value, summary: event.target.value }))} className={CONTROL} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-black/65">Terms<textarea value={templateEditor.body} onChange={event => setTemplateEditor(value => value && ({ ...value, body: event.target.value }))} className={`${CONTROL} min-h-[24rem] resize-y py-3 font-mono text-[13px] leading-6`} /></label>
            <div className="flex justify-end gap-2 border-t border-black/10 pt-4"><button type="button" onClick={() => setTemplateEditor(null)} className="min-h-10 rounded-md border border-black/15 px-4 text-xs font-medium">Cancel</button><button type="submit" disabled={busy || !templateEditor.title.trim() || !templateEditor.body.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-medium text-white disabled:opacity-45"><Save size={14} aria-hidden="true" /> {busy ? "Saving..." : "Save template"}</button></div>
          </form>
        </EditorModal>
      )}

      {inspection && (
        <EditorModal title="Contract record" onClose={() => setInspection(null)}>
          <div className="grid gap-6 p-4 sm:p-6">
            <div>
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-semibold text-black/85">{inspection.title}</h3><span className="rounded-full bg-black/[0.05] px-2 py-1 text-[10px] uppercase text-black/50">{inspection.status}</span><span className="text-xs text-black/40">Version {inspection.version ?? 1}</span></div>
              {inspection.summary && <p className="mt-3 max-w-2xl text-sm leading-6 text-black/50">{inspection.summary}</p>}
            </div>
            {inspection.body ? <div className="rounded-md border border-black/10 bg-white p-5"><p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-black/45"><FileText size={14} aria-hidden="true" /> Current terms</p><div className="whitespace-pre-wrap text-sm leading-7 text-black/70">{inspection.body}</div></div> : null}
            {inspection.documentUrl && <a href={inspection.documentUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md border border-black/15 bg-white px-4 text-xs font-medium"><ExternalLink size={13} aria-hidden="true" /> Open {inspection.documentName || "contract document"}</a>}
            {(inspection.revisions?.length ?? 0) > 0 && <div><p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-black/45"><History size={14} aria-hidden="true" /> Version history</p><div className="divide-y divide-black/10 border-y border-black/10">{[...(inspection.revisions ?? [])].reverse().map(revision => <details key={`${revision.version}-${revision.createdAt}`} className="group py-3"><summary className="cursor-pointer list-none text-sm font-medium text-black/70">Version {revision.version} · {revision.title}<span className="ml-2 text-xs font-normal text-black/40">saved {formatShortDate(revision.createdAt)}</span></summary>{revision.note && <p className="mt-2 text-xs text-black/50">Change note: {revision.note}</p>}{revision.body && <div className="mt-3 whitespace-pre-wrap rounded-md bg-white p-4 text-xs leading-6 text-black/60">{revision.body}</div>}{revision.documentUrl && <a href={revision.documentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium underline">Open previous document <ExternalLink size={11} /></a>}</details>)}</div></div>}
          </div>
        </EditorModal>
      )}
    </section>
  );
}
