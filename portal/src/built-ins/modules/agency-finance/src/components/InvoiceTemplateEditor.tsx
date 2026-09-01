"use client";

import { FileImage, RotateCcw, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import type { InvoiceTemplate } from "../lib/domain";
import { isFinanceMutationAck } from "../lib/mutationPayloads";

const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/35";

export function InvoiceTemplateEditor({
  apiBase,
  initialTemplate,
  onClose,
}: {
  apiBase: string;
  initialTemplate: InvoiceTemplate;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [template, setTemplate] = useState(initialTemplate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseTemplate(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 1_500_000) {
      setError("The template image must be under 1.5 MB.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setTemplate(current => ({ ...current, letterheadDataUrl: dataUrl }));
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await checkedJsonMutation<{ ok: boolean }>(`${apiBase}/invoices/template`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          accentColor: template.accentColor,
          documentTitle: template.documentTitle,
          businessDetails: template.businessDetails,
          paymentDetails: template.paymentDetails,
          footerText: template.footerText,
          letterheadDataUrl: template.letterheadDataUrl,
        }),
      }, {
        fallback: "Could not save the invoice template.",
        validate: isFinanceMutationAck,
      });
      window.location.reload();
    } catch (requestError) {
      setError(mutationErrorMessage(requestError, "Could not save the invoice template."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-h-[100dvh] overflow-y-auto sm:max-h-[92dvh] lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <div className="border-b border-black/10 p-5 lg:border-b-0 lg:border-r lg:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="invoice-template-heading" className="text-lg font-semibold text-black/85">Invoice template</h2>
            <p className="mt-1 text-sm leading-6 text-black/50">Upload your letterhead, then place live invoice data over it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" title="Close" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/5"><X size={16} /></button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="grid gap-1 text-xs font-medium text-black/60">Template name<input className={control} value={template.name} onChange={event => setTemplate(current => ({ ...current, name: event.target.value }))} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-black/60">Document label<input className={control} value={template.documentTitle} onChange={event => setTemplate(current => ({ ...current, documentTitle: event.target.value }))} /></label>
            <label className="grid gap-1 text-xs font-medium text-black/60">Accent colour<span className="flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-2"><input type="color" className="size-7 border-0 bg-transparent p-0" value={template.accentColor} onChange={event => setTemplate(current => ({ ...current, accentColor: event.target.value }))} /><span className="font-mono text-xs text-black/55">{template.accentColor}</span></span></label>
          </div>
          <label className="grid gap-1 text-xs font-medium text-black/60">Business details<textarea rows={3} className={`${control} py-2`} placeholder={"Milesymedia\nhello@milesymedia.com"} value={template.businessDetails ?? ""} onChange={event => setTemplate(current => ({ ...current, businessDetails: event.target.value }))} /></label>
          <label className="grid gap-1 text-xs font-medium text-black/60">Payment details<textarea rows={3} className={`${control} py-2`} placeholder={"Bank transfer details or payment instructions"} value={template.paymentDetails ?? ""} onChange={event => setTemplate(current => ({ ...current, paymentDetails: event.target.value }))} /></label>
          <label className="grid gap-1 text-xs font-medium text-black/60">Footer<textarea rows={2} className={`${control} py-2`} placeholder="Thank you for your business." value={template.footerText ?? ""} onChange={event => setTemplate(current => ({ ...current, footerText: event.target.value }))} /></label>

          <div className="border-t border-black/10 pt-4">
            <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void chooseTemplate(event.target.files?.[0])} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium hover:bg-black/[0.03]"><Upload size={16} /> Upload template</button>
              {template.letterheadDataUrl ? <button type="button" onClick={() => setTemplate(current => ({ ...current, letterheadDataUrl: undefined }))} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-black/60 hover:bg-black/[0.03]"><RotateCcw size={15} /> Remove image</button> : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-black/40">Use an A4 portrait PNG, JPEG, or WebP under 1.5 MB. Leave the centre clear for invoice content.</p>
          </div>
        </div>
        {error ? <p role="alert" className="mt-4 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        <button type="button" disabled={busy} onClick={save} className="mt-5 w-full rounded-md bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save template"}</button>
      </div>

      <div className="bg-black/[0.025] p-4 sm:p-6">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-black/45"><FileImage size={14} /> Live preview</p>
        <div className="relative mx-auto aspect-[210/297] max-w-[560px] overflow-hidden bg-white shadow-sm">
          {template.letterheadDataUrl ? <img src={template.letterheadDataUrl} alt="" className="absolute inset-0 size-full object-cover" /> : null}
          <div className="relative z-10 p-[8%] text-[clamp(7px,1.1vw,12px)]">
            <div className="flex items-start justify-between gap-5 border-b-[3px] pb-4" style={{ borderColor: template.accentColor }}>
              <div><p className="font-semibold uppercase text-black/40">{template.documentTitle || "Invoice"}</p><p className="mt-1 text-[2em] font-semibold">INV-2026-0001</p></div>
              <div className="max-w-[45%] whitespace-pre-line text-right"><strong>Milesymedia</strong><p className="mt-1 text-black/45">{template.businessDetails}</p></div>
            </div>
            <div className="my-[7%] grid grid-cols-3 gap-4"><div><p className="uppercase text-black/35">Bill to</p><strong>Client name</strong></div><div><p className="uppercase text-black/35">Issued</p><strong>27 Jul 2026</strong></div><div><p className="uppercase text-black/35">Due</p><strong>10 Aug 2026</strong></div></div>
            <div className="border-y border-black/10 py-3"><div className="grid grid-cols-[1fr_auto] gap-3 font-semibold"><span>Website design and development</span><span>£2,400.00</span></div></div>
            <div className="ml-auto mt-[8%] max-w-[48%] space-y-2"><div className="flex justify-between"><span>Subtotal</span><span>£2,000.00</span></div><div className="flex justify-between"><span>Tax</span><span>£400.00</span></div><div className="flex justify-between border-b-[3px] pb-2 font-semibold" style={{ borderColor: template.accentColor }}><span>Total</span><span>£2,400.00</span></div></div>
            {template.paymentDetails ? <div className="mt-[8%]"><p className="font-semibold uppercase text-black/35">Payment details</p><p className="mt-1 whitespace-pre-line text-black/55">{template.paymentDetails}</p></div> : null}
            {template.footerText ? <p className="absolute bottom-[5%] left-[8%] right-[8%] border-t border-black/10 pt-2 text-center text-black/40">{template.footerText}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
