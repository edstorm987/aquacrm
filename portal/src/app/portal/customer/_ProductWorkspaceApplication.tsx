"use client";

import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  CloudUpload,
  Download,
  FileCheck2,
  FileImage,
  FolderPlus,
  ImageIcon,
  MessageSquareText,
  Save,
  Send,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import type { PortalProductSelection, PortalProductMode } from "@/lib/portal/portalProducts";
import type { PortalProductModulePage } from "@/lib/portal/portalProductModules";
import {
  portalWorkspaceIsMedia,
  portalWorkspacePageFields,
  portalWorkspaceProgress,
  type PortalProductWorkspace,
  type PortalWorkspaceAsset,
  type PortalWorkspaceCollection,
  type PortalWorkspaceCollectionStatus,
  type PortalWorkspaceOutputStatus,
} from "@/lib/portal/portalProductWorkspaces";
import type { CustomerFile } from "./_portalData";

export type ProductWorkspaceRole = "agency" | "customer" | "preview";

const CONTROL = "min-h-11 w-full rounded-md border border-black/12 bg-white px-3 text-sm text-[#292621] outline-none transition placeholder:text-black/30 focus:border-[var(--portal-accent)] focus:ring-2 focus:ring-black/10 disabled:bg-black/[0.025] disabled:text-black/45";
const STAGES: Array<{ id: PortalProductMode; label: string }> = [
  { id: "onboarding", label: "Onboarding" },
  { id: "designing", label: "In progress" },
  { id: "developed-launch", label: "Review & delivery" },
  { id: "maintenance", label: "Ongoing care" },
];
const OUTPUT_STATUSES: PortalWorkspaceOutputStatus[] = ["planned", "in-progress", "ready", "approved"];

function formatDate(timestamp?: number): string {
  if (!timestamp) return "Not yet";
  return formatUkDate(timestamp, { day: "numeric", month: "short", year: "numeric" });
}

function statusLabel(value: string): string {
  return value.replaceAll("-", " ");
}

function downloadUrl(url: string): string {
  if (!url.startsWith("/api/tenants/client-files/content?")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

function isImage(file?: CustomerFile): boolean {
  return Boolean(file?.contentType?.startsWith("image/") || file?.name.match(/\.(jpe?g|png|webp|heic|heif)$/i));
}

function statusStyle(status: string): string {
  if (status === "approved" || status === "delivered") return "bg-emerald-50 text-emerald-800";
  if (status === "changes-requested") return "bg-amber-50 text-amber-800";
  if (status === "review" || status === "ready") return "bg-blue-50 text-blue-800";
  return "bg-black/[0.045] text-black/50";
}

export function ProductWorkspaceApplication({
  clientId,
  product,
  page,
  initialWorkspace,
  initialFiles,
  role,
  providerName,
}: {
  clientId: string;
  product: PortalProductSelection;
  page: PortalProductModulePage;
  initialWorkspace: PortalProductWorkspace;
  initialFiles: CustomerFile[];
  role: ProductWorkspaceRole;
  providerName: string;
}) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [files, setFiles] = useState(initialFiles);
  const [fields, setFields] = useState(initialWorkspace.pages[page.id]?.fields ?? {});
  const [updateMessage, setUpdateMessage] = useState("");
  const [decisionTitle, setDecisionTitle] = useState(`Approve ${page.navLabel}`);
  const [decisionDetail, setDecisionDetail] = useState("");
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [assetNotes, setAssetNotes] = useState<Record<string, string>>({});
  const [collectionTitle, setCollectionTitle] = useState("");
  const [selectionLimit, setSelectionLimit] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const readOnly = role === "preview";
  const management = role === "agency";
  const pageState = workspace.pages[page.id];
  const fieldDefinitions = useMemo(() => portalWorkspacePageFields(product, page), [product, page]);
  const pageCollections = workspace.collections.filter(collection => collection.pageId === page.id);
  const pageDecisions = workspace.decisions.filter(decision => decision.pageId === page.id);
  const pageUpdates = workspace.updates.filter(update => update.pageId === page.id);
  const media = portalWorkspaceIsMedia(product);
  const progress = portalWorkspaceProgress(workspace);

  async function mutate(action: string, payload: Record<string, unknown> = {}, success?: string) {
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/product-workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, productId: product.id, action, pageId: page.id, ...payload }),
      });
      const result = await response.json() as { ok: boolean; error?: string; workspace?: PortalProductWorkspace };
      if (!response.ok || !result.ok || !result.workspace) throw new Error(result.error || "The workspace could not be updated.");
      setWorkspace(result.workspace);
      setFields(result.workspace.pages[page.id]?.fields ?? {});
      setNotice(success ?? "Saved to the shared workspace.");
      router.refresh();
      return result.workspace;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The workspace could not be updated.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function uploadFiles(collection: PortalWorkspaceCollection, selectedFiles: FileList | null) {
    if (!selectedFiles?.length || readOnly || !management) return;
    setBusy(`upload-${collection.id}`);
    setNotice(null);
    try {
      let nextWorkspace = workspace;
      const nextFiles = [...files];
      for (const file of Array.from(selectedFiles).slice(0, 30)) {
        const form = new FormData();
        form.set("clientId", clientId);
        form.set("category", collection.status === "review" ? "preview" : "deliverable");
        form.set("productId", product.id);
        form.set("workspacePageId", page.id);
        form.set("collectionId", collection.id);
        form.set("customerVisible", collection.status !== "draft" && collection.status !== "archived" ? "true" : "false");
        form.set("file", file);
        const upload = await fetch("/api/tenants/client-files/upload", { method: "POST", body: form });
        const uploaded = await upload.json() as { ok: boolean; error?: string; file?: CustomerFile };
        if (!upload.ok || !uploaded.ok || !uploaded.file) throw new Error(uploaded.error || `Could not upload ${file.name}.`);
        nextFiles.unshift(uploaded.file);
        const attach = await fetch("/api/tenants/product-workspaces", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            productId: product.id,
            pageId: page.id,
            action: "attach-file",
            collectionId: collection.id,
            fileId: uploaded.file.id,
            title: uploaded.file.name,
          }),
        });
        const attached = await attach.json() as { ok: boolean; error?: string; workspace?: PortalProductWorkspace };
        if (!attach.ok || !attached.ok || !attached.workspace) throw new Error(attached.error || `Could not add ${file.name} to the collection.`);
        nextWorkspace = attached.workspace;
      }
      setFiles(nextFiles);
      setWorkspace(nextWorkspace);
      setNotice(`${selectedFiles.length} ${selectedFiles.length === 1 ? "file" : "files"} added to ${collection.title}.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The files could not be uploaded.");
    } finally {
      setBusy(null);
    }
  }

  async function addUpdate() {
    if (!updateMessage.trim()) return;
    const result = await mutate("add-update", { message: updateMessage }, "Update shared.");
    if (result) setUpdateMessage("");
  }

  async function requestDecision() {
    if (!decisionTitle.trim()) return;
    const result = await mutate("request-decision", { title: decisionTitle, detail: decisionDetail }, "Decision sent to the customer.");
    if (result) {
      setDecisionTitle(`Approve ${page.navLabel}`);
      setDecisionDetail("");
    }
  }

  async function createCollection() {
    if (!collectionTitle.trim()) return;
    const result = await mutate("create-collection", {
      title: collectionTitle,
      selectionLimit: selectionLimit ? Number(selectionLimit) : undefined,
    }, "Collection created.");
    if (result) {
      setCollectionTitle("");
      setSelectionLimit("");
    }
  }

  const completedChecks = pageState?.checklist.filter(item => item.complete).length ?? 0;

  return (
    <section className="mt-5 overflow-hidden rounded-md border border-black/10 bg-[var(--portal-surface)]">
      <div className="border-b border-black/10 bg-[#f7f5f0] px-5 py-5 sm:px-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-black/10 bg-white text-[var(--portal-accent)]"><ShieldCheck size={17} aria-hidden="true" /></span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-black/38">Live product workspace</p>
              <h2 className="mt-1 font-serif text-2xl">{page.navLabel}</h2>
              <p className="mt-1 text-xs leading-5 text-black/45">Briefs, work, decisions and delivery stay attached to this product.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-40">
              <div className="flex justify-between text-[9px] uppercase tracking-[0.12em] text-black/35"><span>Workspace progress</span><span>{progress}%</span></div>
              <div className="mt-2 h-1 bg-black/8"><div className="h-1 bg-[var(--portal-accent)]" style={{ width: `${progress}%` }} /></div>
            </div>
            {management ? (
              <label className="grid gap-1 text-[9px] uppercase tracking-[0.12em] text-black/38">
                Portal experience
                <select
                  value={workspace.stage}
                  disabled={busy !== null}
                  onChange={event => void mutate("set-stage", { stage: event.target.value }, `${product.name} portal experience updated.`)}
                  className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-xs normal-case tracking-normal text-black/65"
                >
                  {STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
                </select>
              </label>
            ) : (
              <span className="rounded-full border border-black/10 bg-white px-3 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-black/48">{STAGES.find(stage => stage.id === workspace.stage)?.label}</span>
            )}
          </div>
        </div>
        {readOnly ? <p className="mt-4 border-t border-black/8 pt-3 text-xs text-black/40">This template preview is read-only. Open a client portal from Fulfilment to manage its live product data.</p> : null}
      </div>

      <div className="grid xl:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)]">
        <div className="border-b border-black/10 p-5 sm:p-7 xl:border-b-0 xl:border-r">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[10px] uppercase tracking-[0.16em] text-black/38">Working checklist</p><h3 className="mt-2 font-serif text-xl">{page.checklistTitle}</h3></div>
            <span className="text-xs tabular-nums text-black/38">{completedChecks}/{pageState?.checklist.length ?? 0}</span>
          </div>
          <ul className="mt-5 divide-y divide-black/8 border-y border-black/10">
            {pageState?.checklist.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={readOnly || busy !== null}
                  onClick={() => void mutate("toggle-check", { itemId: item.id, complete: !item.complete }, item.complete ? "Checklist item reopened." : "Checklist item completed.")}
                  className="flex min-h-14 w-full items-center gap-3 py-3 text-left disabled:cursor-default"
                >
                  {item.complete ? <CheckCircle2 size={18} className="shrink-0 text-emerald-700" /> : <Circle size={18} className="shrink-0 text-black/22" />}
                  <span className={`flex-1 text-sm ${item.complete ? "text-black/40 line-through" : "text-black/67"}`}>{item.label}</span>
                  {item.completedByActor ? <span className="text-[9px] uppercase tracking-[0.08em] text-black/30">{item.completedByActor}</span> : null}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-7">
            <p className="text-[10px] uppercase tracking-[0.16em] text-black/38">Delivery register</p>
            <div className="mt-3 divide-y divide-black/8 border-y border-black/10">
              {pageState?.outputs.map(output => (
                <div key={output.id} className="flex min-h-14 items-center justify-between gap-3 py-3">
                  <div><p className="text-sm text-black/65">{output.label}</p>{output.updatedAt ? <p className="mt-1 text-[10px] text-black/34">Updated {formatDate(output.updatedAt)}</p> : null}</div>
                  {management ? (
                    <select
                      value={output.status}
                      disabled={busy !== null}
                      onChange={event => void mutate("set-output-status", { itemId: output.id, status: event.target.value }, "Delivery status updated.")}
                      className="min-h-9 rounded-md border border-black/10 bg-white px-2 text-[10px] capitalize text-black/55"
                    >
                      {OUTPUT_STATUSES.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
                    </select>
                  ) : <span className={`rounded-full px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.08em] ${statusStyle(output.status)}`}>{statusLabel(output.status)}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <form
          onSubmit={event => { event.preventDefault(); void mutate("save-fields", { fields }, "Project record saved."); }}
          className="p-5 sm:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] uppercase tracking-[0.16em] text-black/38">Structured project record</p><h3 className="mt-2 font-serif text-xl">{product.name} brief</h3><p className="mt-2 text-xs leading-5 text-black/45">This record remains specific to {page.navLabel.toLowerCase()} and can be refined throughout the project.</p></div>
            <FileCheck2 size={18} className="shrink-0 text-[var(--portal-accent)]" aria-hidden="true" />
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {fieldDefinitions.map(field => (
              <label key={field.id} className="grid gap-2 text-xs font-medium text-black/55">
                {field.label}
                <textarea
                  value={fields[field.id] ?? ""}
                  disabled={readOnly}
                  onChange={event => setFields(current => ({ ...current, [field.id]: event.target.value }))}
                  className={`${CONTROL} min-h-28 resize-y py-3 leading-6`}
                  placeholder={field.placeholder}
                />
              </label>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/8 pt-4">
            <p className="text-xs text-black/38">Shared with both the delivery team and customer.</p>
            <button type="submit" disabled={readOnly || busy !== null} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#1b1a18] px-4 text-xs font-medium text-white disabled:opacity-45"><Save size={14} />Save record</button>
          </div>
        </form>
      </div>

      <WorkspaceCollections
        clientId={clientId}
        product={product}
        page={page}
        collections={pageCollections}
        files={files}
        media={media}
        role={role}
        busy={busy}
        assetNotes={assetNotes}
        setAssetNotes={setAssetNotes}
        mutate={mutate}
        uploadFiles={uploadFiles}
        collectionTitle={collectionTitle}
        setCollectionTitle={setCollectionTitle}
        selectionLimit={selectionLimit}
        setSelectionLimit={setSelectionLimit}
        createCollection={createCollection}
      />

      <div className="grid border-t border-black/10 xl:grid-cols-2">
        <div className="border-b border-black/10 p-5 sm:p-7 xl:border-b-0 xl:border-r">
          <p className="text-[10px] uppercase tracking-[0.16em] text-black/38">Decision record</p>
          <h3 className="mt-2 font-serif text-xl">Clear approvals</h3>
          <div className="mt-5 space-y-3">
            {pageDecisions.length ? pageDecisions.map(decision => (
              <div key={decision.id} className="rounded-md border border-black/10 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-black/70">{decision.title}</p><span className={`rounded-full px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.08em] ${statusStyle(decision.status)}`}>{statusLabel(decision.status)}</span></div>
                {decision.detail ? <p className="mt-2 text-xs leading-5 text-black/45">{decision.detail}</p> : null}
                {decision.responseNote ? <p className="mt-3 border-t border-black/8 pt-3 text-xs leading-5 text-black/55">Customer response: {decision.responseNote}</p> : null}
                {role === "customer" && decision.status === "pending" ? (
                  <div className="mt-4">
                    <textarea value={decisionNotes[decision.id] ?? ""} onChange={event => setDecisionNotes(current => ({ ...current, [decision.id]: event.target.value }))} className={`${CONTROL} min-h-20 resize-y py-2`} placeholder="Optional decision note" />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" disabled={busy !== null} onClick={() => void mutate("respond-decision", { decisionId: decision.id, status: "changes-requested", responseNote: decisionNotes[decision.id] }, "Changes sent to the delivery team.")} className="min-h-9 rounded-md border border-black/10 px-3 text-xs text-black/55">Request changes</button>
                      <button type="button" disabled={busy !== null} onClick={() => void mutate("respond-decision", { decisionId: decision.id, status: "approved", responseNote: decisionNotes[decision.id] }, "Decision approved.")} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#1b1a18] px-3 text-xs text-white"><Check size={13} />Approve</button>
                    </div>
                  </div>
                ) : null}
              </div>
            )) : <p className="rounded-md border border-dashed border-black/12 px-4 py-8 text-center text-sm text-black/38">No decisions have been requested for this workspace yet.</p>}
          </div>
          {management ? (
            <div className="mt-5 grid gap-3 border-t border-black/10 pt-5">
              <input value={decisionTitle} onChange={event => setDecisionTitle(event.target.value)} className={CONTROL} placeholder="Decision title" />
              <textarea value={decisionDetail} onChange={event => setDecisionDetail(event.target.value)} className={`${CONTROL} min-h-24 resize-y py-3`} placeholder="Explain exactly what the customer is approving." />
              <button type="button" disabled={busy !== null || !decisionTitle.trim()} onClick={() => void requestDecision()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--portal-accent)] bg-white px-4 text-xs font-medium text-[var(--portal-accent)] disabled:opacity-45"><Send size={13} />Request customer decision</button>
            </div>
          ) : null}
        </div>

        <div className="p-5 sm:p-7">
          <p className="text-[10px] uppercase tracking-[0.16em] text-black/38">Shared updates</p>
          <h3 className="mt-2 font-serif text-xl">Conversation and progress</h3>
          <div className="mt-5 max-h-80 space-y-3 overflow-y-auto pr-1">
            {pageUpdates.length ? pageUpdates.map(update => (
              <div key={update.id} className={`rounded-md border p-4 ${update.actor === "customer" ? "border-[var(--portal-accent)]/25 bg-[#fbf8f0]" : "border-black/10 bg-white"}`}>
                <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-medium uppercase tracking-[0.1em] text-black/40">{update.actor === "customer" ? "Customer" : providerName}</p><span className="text-[10px] text-black/30">{formatDate(update.createdAt)}</span></div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/62">{update.message}</p>
              </div>
            )) : <p className="rounded-md border border-dashed border-black/12 px-4 py-8 text-center text-sm text-black/38">The shared update history will build here.</p>}
          </div>
          <div className="mt-5 border-t border-black/10 pt-5">
            <textarea value={updateMessage} disabled={readOnly} onChange={event => setUpdateMessage(event.target.value)} className={`${CONTROL} min-h-24 resize-y py-3`} placeholder={management ? "Share progress, a question, or what happens next..." : "Add context, feedback, or a question..."} />
            <div className="mt-2 flex justify-end"><button type="button" disabled={readOnly || busy !== null || !updateMessage.trim()} onClick={() => void addUpdate()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#1b1a18] px-4 text-xs font-medium text-white disabled:opacity-45"><MessageSquareText size={14} />Share update</button></div>
          </div>
        </div>
      </div>
      {notice ? <p role="status" className="border-t border-black/10 bg-[#f7f5f0] px-5 py-3 text-xs text-black/55 sm:px-7">{notice}</p> : null}
    </section>
  );
}

function WorkspaceCollections({
  product,
  collections,
  files,
  media,
  role,
  busy,
  assetNotes,
  setAssetNotes,
  mutate,
  uploadFiles,
  collectionTitle,
  setCollectionTitle,
  selectionLimit,
  setSelectionLimit,
  createCollection,
}: {
  clientId: string;
  product: PortalProductSelection;
  page: PortalProductModulePage;
  collections: PortalWorkspaceCollection[];
  files: CustomerFile[];
  media: boolean;
  role: ProductWorkspaceRole;
  busy: string | null;
  assetNotes: Record<string, string>;
  setAssetNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  mutate: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<PortalProductWorkspace | null>;
  uploadFiles: (collection: PortalWorkspaceCollection, selectedFiles: FileList | null) => Promise<void>;
  collectionTitle: string;
  setCollectionTitle: (value: string) => void;
  selectionLimit: string;
  setSelectionLimit: (value: string) => void;
  createCollection: () => Promise<void>;
}) {
  const management = role === "agency";
  const readOnly = role === "preview";
  const fileById = new Map(files.map(file => [file.id, file]));

  return (
    <div className="border-t border-black/10 p-5 sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-[10px] uppercase tracking-[0.16em] text-black/38">{media ? "Private proofing" : "Product files"}</p><h3 className="mt-2 font-serif text-2xl">{media ? `${product.name} galleries` : `${product.name} delivery collections`}</h3><p className="mt-2 max-w-2xl text-xs leading-5 text-black/45">{media ? "Review photographs, choose favourites, leave precise notes and approve the finished collection." : "Keep working previews and finished deliverables organised inside the product they belong to."}</p></div>
        {management ? <div className="flex flex-wrap items-end gap-2"><input value={collectionTitle} onChange={event => setCollectionTitle(event.target.value)} className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-xs" placeholder={media ? "New gallery name" : "New collection name"} />{media ? <input value={selectionLimit} onChange={event => setSelectionLimit(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className="min-h-10 w-32 rounded-md border border-black/12 bg-white px-3 text-xs" placeholder="Selection limit" /> : null}<button type="button" disabled={busy !== null || !collectionTitle.trim()} onClick={() => void createCollection()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-medium disabled:opacity-45"><FolderPlus size={14} />Create</button></div> : null}
      </div>

      <div className="mt-6 space-y-5">
        {collections.length ? collections.map(collection => {
          const selectedCount = collection.assets.filter(asset => asset.selected).length;
          return (
            <section key={collection.id} className="overflow-hidden rounded-md border border-black/10 bg-white">
              <div className="flex flex-col justify-between gap-4 border-b border-black/10 bg-[#faf9f6] px-5 py-4 sm:flex-row sm:items-center">
                <div><div className="flex flex-wrap items-center gap-2"><h4 className="font-medium text-black/72">{collection.title}</h4><span className={`rounded-full px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.08em] ${statusStyle(collection.status)}`}>{statusLabel(collection.status)}</span></div>{collection.description ? <p className="mt-1 text-xs text-black/42">{collection.description}</p> : null}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {media ? <span className="text-xs text-black/40">{selectedCount}{collection.selectionLimit ? ` / ${collection.selectionLimit}` : ""} selected</span> : <span className="text-xs text-black/40">{collection.assets.length} files</span>}
                  {management ? (
                    <>
                      {media ? <input defaultValue={collection.selectionLimit ?? ""} disabled={busy !== null} inputMode="numeric" aria-label={`Selection limit for ${collection.title}`} onBlur={event => void mutate("update-collection", { collectionId: collection.id, selectionLimit: Number(event.target.value) }, "Selection limit updated.")} className="min-h-9 w-24 rounded-md border border-black/10 bg-white px-2 text-[10px] text-black/55" placeholder="No limit" /> : null}
                      <button type="button" disabled={busy !== null} aria-pressed={collection.downloadsEnabled} onClick={() => void mutate("update-collection", { collectionId: collection.id, downloadsEnabled: !collection.downloadsEnabled }, collection.downloadsEnabled ? "Customer downloads disabled." : "Customer downloads enabled.")} className={`min-h-9 rounded-md border px-3 text-[10px] font-medium ${collection.downloadsEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-black/10 bg-white text-black/48"}`}>{collection.downloadsEnabled ? "Downloads on" : "Downloads off"}</button>
                      {media ? <button type="button" disabled={busy !== null} aria-pressed={collection.watermarkEnabled} onClick={() => void mutate("update-collection", { collectionId: collection.id, watermarkEnabled: !collection.watermarkEnabled }, collection.watermarkEnabled ? "Proof watermark disabled." : "Proof watermark enabled.")} className={`min-h-9 rounded-md border px-3 text-[10px] font-medium ${collection.watermarkEnabled ? "border-blue-200 bg-blue-50 text-blue-800" : "border-black/10 bg-white text-black/48"}`}>{collection.watermarkEnabled ? "Watermark on" : "Watermark off"}</button> : null}
                      {media && collection.watermarkEnabled ? <input defaultValue={collection.watermarkLabel ?? "PRIVATE CLIENT PROOF"} disabled={busy !== null} maxLength={80} aria-label={`Watermark label for ${collection.title}`} onBlur={event => void mutate("update-collection", { collectionId: collection.id, watermarkLabel: event.target.value }, "Watermark label updated.")} className="min-h-9 w-44 rounded-md border border-black/10 bg-white px-2 text-[10px] text-black/55" /> : null}
                      <select value={collection.status} disabled={busy !== null} onChange={event => void mutate("set-collection-status", { collectionId: collection.id, status: event.target.value }, "Collection status updated.")} className="min-h-9 rounded-md border border-black/10 bg-white px-2 text-[10px] capitalize text-black/55">
                        <option value="draft">Draft</option><option value="review">Client review</option><option value="changes-requested">Changes requested</option><option value="approved">Approved</option><option value="delivered">Delivered</option><option value="archived">Archived</option>
                      </select>
                    </>
                  ) : null}
                  {role === "customer" && (collection.status === "review" || collection.status === "changes-requested") ? <><button type="button" disabled={busy !== null} onClick={() => void mutate("set-collection-status", { collectionId: collection.id, status: "changes-requested" }, "Collection changes requested.")} className="min-h-9 rounded-md border border-black/10 px-3 text-xs text-black/55">Request changes</button><button type="button" disabled={busy !== null} onClick={() => void mutate("set-collection-status", { collectionId: collection.id, status: "approved" }, "Collection approved.")} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#1b1a18] px-3 text-xs text-white"><Check size={13} />Approve collection</button></> : null}
                </div>
              </div>

              {collection.assets.length ? (
                media ? (
                  <div className="grid gap-px bg-black/8 sm:grid-cols-2 xl:grid-cols-3">
                    {collection.assets.map(asset => <MediaAsset key={asset.id} asset={asset} file={fileById.get(asset.fileId)} collection={collection} role={role} busy={busy} note={assetNotes[asset.id] ?? asset.customerComment ?? ""} setNote={value => setAssetNotes(current => ({ ...current, [asset.id]: value }))} mutate={mutate} />)}
                  </div>
                ) : (
                  <ul className="divide-y divide-black/8">
                    {collection.assets.map(asset => {
                      const file = fileById.get(asset.fileId);
                      return <li key={asset.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-black/[0.04] text-[var(--portal-accent)]"><FileImage size={17} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-black/67">{asset.title}</p><p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-black/35">{statusLabel(asset.status)} · Added {formatDate(asset.addedAt)}</p></div>{file && (management || collection.downloadsEnabled) ? <a href={downloadUrl(file.url)} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-xs font-medium text-black/55"><Download size={13} />Download</a> : null}{management ? <button type="button" disabled={busy !== null} onClick={() => void mutate("remove-asset", { collectionId: collection.id, assetId: asset.id }, "File removed from this collection.")} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/38" title="Remove from collection"><X size={14} /></button> : null}</li>;
                    })}
                  </ul>
                )
              ) : <div className="px-5 py-12 text-center"><ImageIcon className="mx-auto text-black/18" /><p className="mt-3 text-sm font-medium text-black/55">This collection is ready for its first files.</p><p className="mt-1 text-xs text-black/38">Uploads remain private to this client and delivery team.</p></div>}

              {management ? (
                <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 border-t border-black/10 bg-[#faf9f6] px-4 text-xs font-medium text-black/58">
                  <CloudUpload size={15} className="text-[var(--portal-accent)]" />
                  {busy === `upload-${collection.id}` ? "Uploading and securing files..." : media ? "Upload photographs or media" : "Upload delivery files"}
                  <input type="file" multiple disabled={busy !== null} accept={media ? ".jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.zip" : ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.csv,.txt,.mp4,.zip"} className="sr-only" onChange={event => { void uploadFiles(collection, event.target.files); event.currentTarget.value = ""; }} />
                </label>
              ) : null}
            </section>
          );
        }) : <p className="rounded-md border border-dashed border-black/12 px-5 py-12 text-center text-sm text-black/38">No delivery collection has been created for this page.</p>}
      </div>
      {readOnly ? <p className="mt-4 text-xs text-black/38">Uploads, selections and approvals become active in a live client portal.</p> : null}
    </div>
  );
}

function MediaAsset({
  asset,
  file,
  collection,
  role,
  busy,
  note,
  setNote,
  mutate,
}: {
  asset: PortalWorkspaceAsset;
  file?: CustomerFile;
  collection: PortalWorkspaceCollection;
  role: ProductWorkspaceRole;
  busy: string | null;
  note: string;
  setNote: (value: string) => void;
  mutate: (action: string, payload?: Record<string, unknown>, success?: string) => Promise<PortalProductWorkspace | null>;
}) {
  const management = role === "agency";
  const canSelect = role === "customer" && (collection.status === "review" || collection.status === "changes-requested");
  return (
    <article className="min-w-0 bg-white">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#eeece7]">
        {file && isImage(file) ? <img src={file.url} alt={asset.caption || asset.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-black/20"><FileImage size={36} /></div>}
        <div className="absolute left-3 top-3 flex gap-2"><span className={`rounded-full px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.08em] shadow-sm ${statusStyle(asset.status)}`}>{statusLabel(asset.status)}</span></div>
        {(canSelect || asset.selected) ? (
          <button type="button" disabled={!canSelect || busy !== null} onClick={() => void mutate("asset-response", { collectionId: collection.id, assetId: asset.id, selected: !asset.selected, message: note }, asset.selected ? "Selection removed." : "Photograph selected.")} aria-pressed={asset.selected} className={`absolute right-3 top-3 grid size-10 place-items-center rounded-full border shadow-sm ${asset.selected ? "border-[#91713a] bg-[#91713a] text-white" : "border-white/70 bg-white/90 text-black/45"}`} title={asset.selected ? "Remove selection" : "Select photograph"}><Star size={17} fill={asset.selected ? "currentColor" : "none"} /></button>
        ) : null}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-black/70">{asset.title}</p><p className="mt-1 text-[10px] text-black/35">Added {formatDate(asset.addedAt)}</p></div><div className="flex gap-2">{file && (management || collection.downloadsEnabled) ? <a href={downloadUrl(file.url)} target="_blank" rel="noreferrer" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/45" title="Download file"><Download size={14} /></a> : null}{management ? <button type="button" disabled={busy !== null} onClick={() => void mutate("remove-asset", { collectionId: collection.id, assetId: asset.id }, "Photograph removed from this gallery.")} className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/38" title="Remove from gallery"><X size={14} /></button> : null}</div></div>
        {asset.caption ? <p className="mt-3 text-xs leading-5 text-black/45">{asset.caption}</p> : null}
        {role === "customer" ? <div className="mt-3"><textarea value={note} disabled={!canSelect} onChange={event => setNote(event.target.value)} className={`${CONTROL} min-h-20 resize-y py-2 text-xs`} placeholder="Retouching note or feedback" /><button type="button" disabled={!canSelect || busy !== null} onClick={() => void mutate("asset-response", { collectionId: collection.id, assetId: asset.id, selected: asset.selected, message: note }, "Photograph note saved.")} className="mt-2 inline-flex min-h-8 items-center gap-2 text-xs font-medium text-[var(--portal-accent)] disabled:opacity-40"><Save size={12} />Save note</button></div> : null}
        {management ? <div className="mt-3 grid gap-2"><textarea defaultValue={asset.caption ?? ""} disabled={busy !== null} onBlur={event => void mutate("asset-response", { collectionId: collection.id, assetId: asset.id, caption: event.target.value, status: asset.status }, "Photograph caption saved.")} className={`${CONTROL} min-h-16 resize-y py-2 text-xs`} placeholder="Caption or delivery note" /><select value={asset.status} disabled={busy !== null} onChange={event => void mutate("asset-response", { collectionId: collection.id, assetId: asset.id, status: event.target.value }, "Asset status updated.")} className="min-h-9 w-full rounded-md border border-black/10 bg-white px-2 text-xs capitalize text-black/55"><option value="working">Working</option><option value="review">Client review</option><option value="approved">Approved</option><option value="delivered">Delivered</option></select></div> : null}
      </div>
    </article>
  );
}
