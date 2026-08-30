"use client";

import { Check, CreditCard, ExternalLink, FilePenLine, Landmark, Mail, Plus, ReceiptText, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { addBusinessCalendarDays, dateInputValue, formatUkDate } from "@/lib/shared/formatDateTime";

type Party = {
  kind: "lead" | "contact";
  id: string;
  name?: string;
  company?: string;
  email: string;
};
type Line = { description: string; quantity: number; unitCents: number };
type DeliveryStatus = "queued" | "delivered" | "failed";
type Payment = {
  id: string;
  amountCents: number;
  method: string;
  reference?: string;
  paidAt: number;
  receiptSentAt?: number;
  receiptDeliveryStatus?: DeliveryStatus;
  receiptError?: string;
};
type ProductTemplate = {
  id: string;
  name: string;
  active: boolean;
  pricing: "fixed" | "from" | "recurring" | "custom";
  priceCents?: number;
  billingInterval?: "month" | "quarter" | "year";
  depositPercent?: number;
  taxRatePercent?: number;
  paymentTermsDays?: number;
  billingNotes?: string;
  contractTitle?: string;
  contractBody?: string;
};
type Pack = {
  id: string;
  publicToken: string;
  invoiceNumber: string;
  invoiceStatus: string;
  agreementStatus: string;
  lineItems: Line[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: "gbp" | "usd" | "eur";
  dueAt: number;
  billingCadence: "one-off" | "monthly" | "quarterly" | "annual" | "installments";
  installmentCount?: number;
  serviceLevel: string;
  agreementTitle: string;
  agreementBody: string;
  notes?: string;
  signedDocumentName?: string;
  signedDocumentDataUrl?: string;
  payments: Payment[];
  stripeCheckoutUrl?: string;
  emailMessageId?: string;
  deliveryStatus?: DeliveryStatus;
  deliveryError?: string;
  deliveryAttemptedAt?: number;
  sentAt?: number;
};

const API = "/api/portal/leads-pipeline";
const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/35";
const defaultAgreement = `Milesymedia will provide the services listed in this proposal with reasonable skill and care.

The client will provide timely access, content, feedback, and approvals required to complete the work.

Payment is due according to the invoice and payment schedule. Work may pause while an invoice is overdue.

Changes outside the agreed scope will be quoted separately before work begins.

Both parties will keep confidential information private. Ownership of final approved deliverables transfers when the related invoices are paid in full.

Either party may end the engagement in writing. Completed work and committed third-party costs remain payable.`;

export function CommercialPackModal({ party, onClose }: { party: Party; onClose: () => void }) {
  const signedRef = useRef<HTMLInputElement>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [products, setProducts] = useState<ProductTemplate[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [serviceLevel, setServiceLevel] = useState("Custom Milesymedia service");
  const [lines, setLines] = useState<Line[]>([{ description: "Service deposit", quantity: 1, unitCents: 0 }]);
  const [taxRate, setTaxRate] = useState("0");
  const [dueAt, setDueAt] = useState(() => addBusinessCalendarDays(7));
  const [cadence, setCadence] = useState<Pack["billingCadence"]>("one-off");
  const [installments, setInstallments] = useState("2");
  const [agreementTitle, setAgreementTitle] = useState("Service level agreement");
  const [agreementBody, setAgreementBody] = useState(defaultAgreement);
  const [notes, setNotes] = useState("");
  const [signedName, setSignedName] = useState("");
  const [signedData, setSignedData] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank-transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // A notice about an unconfirmed or refused delivery must not wear the success
  // banner's colour, so every notice carries the tone of the outcome it reports.
  const [noticeTone, setNoticeTone] = useState<"ok" | "warn">("ok");
  const [error, setError] = useState<string | null>(null);

  function showNotice(text: string | null, tone: "ok" | "warn" = "ok") {
    setNotice(text);
    setNoticeTone(tone);
  }

  useEffect(() => {
    void (async () => {
      const [response, productsResponse] = await Promise.all([
        fetch(`${API}/commercial?partyKind=${party.kind}&partyId=${encodeURIComponent(party.id)}`),
        fetch("/api/portal/products"),
      ]);
      const result = await response.json() as { ok?: boolean; pack?: Pack | null; stripeConfigured?: boolean; error?: string };
      const productsResult = await productsResponse.json().catch(() => null) as { products?: ProductTemplate[] } | null;
      if (productsResponse.ok) setProducts((productsResult?.products ?? []).filter(product => product.active));
      if (!response.ok || !result.ok) {
        setError(result.error ?? "Could not load commercial records.");
        return;
      }
      setStripeConfigured(Boolean(result.stripeConfigured));
      if (!result.pack) return;
      const value = result.pack;
      setPack(value);
      setServiceLevel(value.serviceLevel);
      setLines(value.lineItems);
      setTaxRate(value.subtotalCents ? String(Math.round(value.taxCents / value.subtotalCents * 10000) / 100) : "0");
      setDueAt(dateInputValue(value.dueAt));
      setCadence(value.billingCadence);
      setInstallments(String(value.installmentCount ?? 2));
      setAgreementTitle(value.agreementTitle);
      setAgreementBody(value.agreementBody);
      setNotes(value.notes ?? "");
      setSignedName(value.signedDocumentName ?? "");
      setSignedData(value.signedDocumentDataUrl ?? "");
    })();
  }, [party.id, party.kind]);

  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0);
  const taxCents = Math.round(subtotal * Number(taxRate || 0) / 100);
  const total = subtotal + taxCents;
  const paid = pack?.payments.reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0;
  const balance = Math.max(0, (pack?.totalCents ?? total) - paid);

  function applyProduct(productId: string) {
    setSelectedProductId(productId);
    const product = products.find(item => item.id === productId);
    if (!product) return;
    setServiceLevel(product.name);
    const deposit = product.depositPercent && product.depositPercent > 0 && product.depositPercent < 100
      ? product.depositPercent
      : undefined;
    const unitCents = deposit && product.priceCents
      ? Math.round(product.priceCents * deposit / 100)
      : product.priceCents ?? 0;
    setLines([{ description: deposit ? `${product.name} deposit (${deposit}%)` : product.name, quantity: 1, unitCents }]);
    setTaxRate(String(product.taxRatePercent ?? 0));
    setDueAt(addBusinessCalendarDays(product.paymentTermsDays ?? 7));
    setNotes(product.billingNotes ?? "");
    if (product.pricing === "recurring") {
      setCadence(product.billingInterval === "quarter" ? "quarterly" : product.billingInterval === "year" ? "annual" : "monthly");
    } else {
      setCadence("one-off");
    }
    setAgreementTitle(product.contractTitle || `${product.name} agreement`);
    setAgreementBody(product.contractBody || "");
    showNotice(product.contractBody ? `${product.name} and its contract are ready to review.` : `${product.name} added. This product does not have a contract template yet.`);
  }

  async function save(): Promise<Pack | null> {
    setBusy("save");
    setError(null);
    showNotice(null);
    try {
      const response = await fetch(`${API}/commercial`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          partyKind: party.kind,
          partyId: party.id,
          recipientName: party.name,
          recipientEmail: party.email,
          lineItems: lines,
          taxCents,
          currency: "gbp",
          dueAt: Date.parse(dueAt),
          billingCadence: cadence,
          installmentCount: cadence === "installments" ? Number(installments) : undefined,
          serviceLevel,
          agreementTitle,
          agreementBody,
          notes,
          signedDocumentName: signedName || undefined,
          signedDocumentDataUrl: signedData || undefined,
        }),
      });
      const result = await response.json() as { ok?: boolean; pack?: Pack; error?: string };
      if (!response.ok || !result.ok || !result.pack) {
        setError(result.error ?? "Could not save invoice and agreement.");
        return null;
      }
      setPack(result.pack);
      showNotice("Invoice and agreement saved.");
      return result.pack;
    } finally {
      setBusy("");
    }
  }

  async function action(path: string, success: string | ((pack: Pack | undefined) => { text: string; tone: "ok" | "warn" })) {
    const current = await save();
    if (!current) return;
    setBusy(path);
    setError(null);
    showNotice(null);
    try {
      const response = await fetch(`${API}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ partyKind: party.kind, partyId: party.id }),
      });
      const result = await response.json() as { ok?: boolean; pack?: Pack; checkoutUrl?: string; error?: string };
      // A refused delivery still returns the pack so the retained error and retry
      // handle can be shown; adopt it before reporting the failure.
      if (result.pack) setPack(result.pack);
      if (!response.ok || !result.ok) {
        setError(result.error ?? "Action failed.");
        return;
      }
      if (typeof success === "function") {
        const outcome = success(result.pack);
        showNotice(outcome.text, outcome.tone);
      } else {
        showNotice(success);
      }
    } finally {
      setBusy("");
    }
  }

  async function recordPayment() {
    if (!pack) {
      setError("Save the invoice before recording payment.");
      return;
    }
    if (!paymentReference.trim()) {
      setError("Add a bank, receipt, cash-book, or provider reference so a retry cannot duplicate this payment.");
      return;
    }
    setBusy("payment");
    setError(null);
    try {
      const response = await fetch(`${API}/commercial/payment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          partyKind: party.kind,
          partyId: party.id,
          amountCents: Math.round(Number(paymentAmount) * 100),
          method: paymentMethod,
          reference: paymentReference,
        }),
      });
      const result = await response.json() as { ok?: boolean; pack?: Pack; error?: string };
      if (!response.ok || !result.ok || !result.pack) {
        setError(result.error ?? "Could not record payment.");
        return;
      }
      setPack(result.pack);
      const recorded = result.pack.payments.find(payment =>
        (payment.reference ?? "").trim().toLowerCase() === paymentReference.trim().toLowerCase());
      setPaymentAmount("");
      setPaymentReference("");
      showNotice(recorded?.receiptDeliveryStatus === "failed"
        ? `Payment recorded in the opportunity trail. The receipt email was refused: ${recorded.receiptError ?? "the provider refused delivery."} Record the payment again with the same reference to retry the receipt.`
        : recorded?.receiptSentAt
          ? "Payment recorded and the receipt was delivered by email."
          : "Payment recorded in the opportunity trail. The receipt email is not confirmed delivered yet — record the payment again with the same reference to retry it.",
        recorded?.receiptSentAt ? "ok" : "warn");
    } finally {
      setBusy("");
    }
  }

  async function readSigned(file?: File) {
    if (!file) return;
    if (file.size > 1_500_000) {
      setError("Signed document must be under 1.5 MB.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setSignedName(file.name);
    setSignedData(dataUrl);
    showNotice("Signed copy attached. Save to keep it.");
  }

  return (
    <div className="fixed inset-0 z-[80] grid items-end bg-black/40 sm:items-center sm:p-6">
      <button type="button" aria-label="Close commercial pack" className="absolute inset-0" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="commercial-heading" className="relative mx-auto max-h-[94vh] w-full max-w-6xl overflow-y-auto bg-white shadow-2xl sm:rounded-lg">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-black/10 bg-white px-5 py-4 sm:px-6">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Meeting action</p><h2 id="commercial-heading" className="mt-1 text-xl font-semibold">Invoice & agreement</h2><p className="mt-1 text-sm text-black/50">{party.name || party.company || party.email}</p></div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-md border border-black/10" aria-label="Close"><X size={17} /></button>
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,.75fr)]">
          <div className="space-y-8 p-5 sm:p-6">
            <section>
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Invoice</h3><p className="mt-1 text-sm text-black/45">Edit this during the call and save it without creating a client.</p></div>{pack ? <span className="text-xs font-medium text-black/45">{pack.invoiceNumber}</span> : null}</div>
              <label className="mt-4 grid gap-1 text-xs font-medium text-black/55">Choose product<select className={control} value={selectedProductId} onChange={event => applyProduct(event.target.value)}><option value="">Custom invoice</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}{product.contractBody ? "" : " · no contract"}</option>)}</select></label>
              <label className="mt-4 grid gap-1 text-xs font-medium text-black/55">Service or plan<input className={control} value={serviceLevel} onChange={event => setServiceLevel(event.target.value)} /></label>
              <div className="mt-4 space-y-3">{lines.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_130px_36px] sm:items-end"><label className="grid gap-1 text-xs font-medium text-black/55">Description<input className={control} value={line.description} onChange={event => setLines(current => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} /></label><label className="grid gap-1 text-xs font-medium text-black/55">Qty<input className={control} type="number" min="1" value={line.quantity} onChange={event => setLines(current => current.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))} /></label><label className="grid gap-1 text-xs font-medium text-black/55">Unit (£)<input className={control} type="number" min="0" step="0.01" value={(line.unitCents / 100).toFixed(2)} onChange={event => setLines(current => current.map((item, i) => i === index ? { ...item, unitCents: Math.round(Number(event.target.value) * 100) } : item))} /></label><button type="button" disabled={lines.length === 1} onClick={() => setLines(current => current.filter((_, i) => i !== index))} className="grid size-9 place-items-center rounded-md border border-black/10 disabled:opacity-25" aria-label={`Remove line ${index + 1}`}><X size={14} /></button></div>)}</div>
              <button type="button" onClick={() => setLines(current => [...current, { description: "", quantity: 1, unitCents: 0 }])} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-black/60"><Plus size={14} /> Add line</button>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1 text-xs font-medium text-black/55">Tax rate %<input className={control} type="number" min="0" step="0.01" value={taxRate} onChange={event => setTaxRate(event.target.value)} /></label><label className="grid gap-1 text-xs font-medium text-black/55">Due date<input className={control} type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label><label className="grid gap-1 text-xs font-medium text-black/55">Billing<select className={control} value={cadence} onChange={event => setCadence(event.target.value as Pack["billingCadence"])}><option value="one-off">One-off</option><option value="monthly">Monthly recurring</option><option value="quarterly">Quarterly recurring</option><option value="annual">Annual recurring</option><option value="installments">Payment plan</option></select></label>{cadence === "installments" ? <label className="grid gap-1 text-xs font-medium text-black/55">Payments<input className={control} type="number" min="2" value={installments} onChange={event => setInstallments(event.target.value)} /></label> : null}</div>
              <dl className="ml-auto mt-5 max-w-xs divide-y divide-black/10 text-sm"><div className="flex justify-between py-2"><dt>Subtotal</dt><dd>{gbp(subtotal)}</dd></div><div className="flex justify-between py-2"><dt>Tax</dt><dd>{gbp(taxCents)}</dd></div><div className="flex justify-between border-b-2 border-black py-3 text-base font-semibold"><dt>Total</dt><dd>{gbp(total)}</dd></div></dl>
            </section>

            <section className="border-t border-black/10 pt-7">
              <h3 className="font-semibold">Service agreement</h3>
              <div className="mt-4 grid gap-4"><label className="grid gap-1 text-xs font-medium text-black/55">Title<input className={control} value={agreementTitle} onChange={event => setAgreementTitle(event.target.value)} /></label><label className="grid gap-1 text-xs font-medium text-black/55">Terms<textarea rows={12} className={`${control} py-3 leading-6`} value={agreementBody} onChange={event => setAgreementBody(event.target.value)} /></label><label className="grid gap-1 text-xs font-medium text-black/55">Extra note<textarea rows={3} className={`${control} py-2`} value={notes} onChange={event => setNotes(event.target.value)} /></label></div>
              <input ref={signedRef} hidden type="file" accept=".pdf,image/png,image/jpeg,image/webp" onChange={event => void readSigned(event.target.files?.[0])} />
              <button type="button" onClick={() => signedRef.current?.click()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 px-3 text-sm font-medium"><Upload size={16} /> {signedName ? "Replace signed copy" : "Upload signed copy"}</button>
              {signedName ? <p className="mt-2 text-xs text-black/50">{signedName}</p> : null}
            </section>
          </div>

          <aside className="border-t border-black/10 bg-black/[0.02] p-5 lg:border-l lg:border-t-0 sm:p-6">
            <h3 className="font-semibold">Ready to progress?</h3>
            <div className="mt-4 space-y-2">
              <Gap ok={Boolean(pack)} label="Invoice saved" />
              <Gap ok={Boolean(pack?.agreementBody)} label="Agreement attached" />
              <Gap ok={pack?.deliveryStatus
                ? pack.deliveryStatus === "delivered"
                : pack?.invoiceStatus === "sent" || pack?.invoiceStatus === "accepted" || pack?.invoiceStatus === "paid"} label="Invoice emailed" />
              <Gap ok={pack?.agreementStatus === "accepted" || Boolean(pack?.signedDocumentDataUrl)} label="Agreement signed" />
              <Gap ok={paid > 0} label="Payment recorded" />
            </div>
            <button type="button" onClick={() => void save()} disabled={Boolean(busy)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"><FilePenLine size={16} /> {busy === "save" ? "Saving..." : "Save draft"}</button>
            {pack ? <a href={`/proposal/${pack.publicToken}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-4 text-sm font-semibold"><ExternalLink size={16} /> Preview / download copy</a> : null}
            <button type="button" onClick={() => void action("commercial/send", sent => sent?.deliveryStatus === "delivered"
              ? { text: "Invoice and agreement delivered by email.", tone: "ok" }
              : { text: "Invoice and agreement handed to the email provider. Delivery is not confirmed yet, so neither document is marked sent — retry the email if the client does not receive it.", tone: "warn" })} disabled={Boolean(busy)} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-4 text-sm font-semibold disabled:opacity-50"><Mail size={16} /> {busy === "commercial/send" ? "Sending..." : pack?.deliveryStatus === "failed" || pack?.deliveryStatus === "queued" ? "Retry invoice & agreement email" : pack?.deliveryStatus === "delivered" ? "Resend invoice & agreement" : "Send invoice & agreement"}</button>
            {pack?.deliveryStatus === "failed"
              ? <p role="status" className="mt-2 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">Email delivery failed{pack.deliveryAttemptedAt ? ` on ${formatUkDate(pack.deliveryAttemptedAt, { dateStyle: "medium" })}` : ""}: {pack.deliveryError ?? "the provider refused delivery."} The invoice and agreement stay unsent — retry the email above.{pack.emailMessageId ? ` Provider message ${pack.emailMessageId}.` : ""}</p>
              : pack?.deliveryStatus === "queued"
                ? <p role="status" className="mt-2 border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Queued with the email provider{pack.deliveryAttemptedAt ? ` on ${formatUkDate(pack.deliveryAttemptedAt, { dateStyle: "medium" })}` : ""} · delivery not confirmed, so neither document is marked sent. Retry if the client does not receive it.</p>
                : pack?.deliveryStatus === "delivered" && pack.sentAt
                  ? <p className="mt-2 px-3 py-1 text-xs leading-5 text-black/50">Delivered {formatUkDate(pack.sentAt, { dateStyle: "medium" })}.</p>
                  : null}
            <div className="mt-6 border-t border-black/10 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-black/40">Card payments</p>
              {stripeConfigured ? <button type="button" onClick={() => void action("commercial/stripe-checkout", "Secure Stripe payment page created.")} disabled={Boolean(busy)} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium"><CreditCard size={16} /> {pack?.stripeCheckoutUrl ? "Refresh Stripe payment page" : "Create Stripe payment page"}</button> : <p className="mt-2 text-xs leading-5 text-red-700">Stripe is not connected. Add the server key before offering card payment.</p>}
              {pack?.stripeCheckoutUrl ? <a href={pack.stripeCheckoutUrl} target="_blank" rel="noreferrer" className="mt-2 block text-center text-xs font-medium underline">Open payment page</a> : null}
            </div>
            <div className="mt-6 border-t border-black/10 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-black/40">Record bank, cash or other payment</p>
              <div className="mt-3 grid gap-2"><input className={control} type="number" min="0.01" step="0.01" placeholder={`Amount (£) · balance ${gbp(balance)}`} value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} /><select className={control} value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)}><option value="bank-transfer">Bank transfer</option><option value="cash">Cash</option><option value="stripe">Stripe</option><option value="other">Other</option></select><input className={control} aria-label="Payment reference" required placeholder="Reference or receipt number · required" value={paymentReference} onChange={event => setPaymentReference(event.target.value)} /><button type="button" onClick={() => void recordPayment()} disabled={busy === "payment" || Number(paymentAmount) <= 0 || !paymentReference.trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-medium disabled:opacity-40"><Landmark size={16} /> {busy === "payment" ? "Recording..." : "Record payment"}</button></div>
            </div>
            {pack?.payments.length ? <div className="mt-6 border-t border-black/10 pt-5"><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Payment trail</p><ul className="mt-3 space-y-2">{pack.payments.map(payment => <li key={payment.id} className="text-xs"><span className="flex justify-between gap-3"><span className="capitalize text-black/55">{payment.method.replace("-", " ")} · {formatUkDate(payment.paidAt, { dateStyle: "medium" })}</span><strong>{gbp(payment.amountCents)}</strong></span>{payment.receiptSentAt ? <span className="mt-0.5 block text-[11px] text-black/45">Receipt delivered {formatUkDate(payment.receiptSentAt, { dateStyle: "medium" })}</span> : payment.receiptDeliveryStatus === "failed" ? <span className="mt-0.5 block text-[11px] text-red-700">Receipt email refused: {payment.receiptError ?? "the provider refused delivery."} Re-record with the same reference to retry.</span> : <span className="mt-0.5 block text-[11px] text-amber-800">Receipt not confirmed delivered. Re-record with the same reference to retry it.</span>}</li>)}</ul></div> : null}
            {notice ? <p className={`mt-5 border-l-2 px-3 py-2 text-sm ${noticeTone === "warn" ? "border-amber-600 bg-amber-50 text-amber-900" : "border-emerald-600 bg-emerald-50 text-emerald-800"}`}>{notice}</p> : null}
            {error ? <p role="alert" className="mt-5 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
          </aside>
        </div>
      </section>
    </div>
  );
}

function Gap({ ok, label }: { ok: boolean; label: string }) {
  return <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{ok ? <Check size={14} /> : <ReceiptText size={14} />}{label}</div>;
}

function gbp(cents: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(cents / 100);
}
