"use client";

import { useRef, useState } from "react";

export interface GiftCardPurchaseFormProps {
  apiBase: string;
  denominations?: number[];
}

export function GiftCardPurchaseForm({ apiBase, denominations = [2500, 5000, 10000] }: GiftCardPurchaseFormProps) {
  const [amount, setAmount] = useState(denominations[0] ?? 2500);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);

  async function buy(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const giftCardPurchase = { amount, recipientName, recipientEmail, senderName, message };
      const fingerprint = JSON.stringify(giftCardPurchase);
      if (operation.current?.fingerprint !== fingerprint) {
        operation.current = {
          fingerprint,
          id: globalThis.crypto?.randomUUID?.() ?? `gift-card-checkout-${Date.now()}`,
        };
      }
      const res = await fetch(`${apiBase}/stripe/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: 1,
          operationId: operation.current.id,
          items: [],
          giftCardPurchase,
          customerEmail: recipientEmail,
          successPath: "/order-confirmed?session_id={CHECKOUT_SESSION_ID}",
          cancelPath: typeof window === "undefined" ? "/gift-cards" : `${window.location.pathname}${window.location.search}`,
        }),
      });
      const data = await res.json() as { ok: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) {
        setError(data.error ?? "Could not start gift-card checkout.");
        return;
      }
      if (typeof window !== "undefined") window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ecom-gift-card-form" onSubmit={(e) => { e.preventDefault(); buy(); }}>
      <h2>Send a gift card</h2>
      <label>
        <span>Amount</span>
        <select value={amount} onChange={(e) => setAmount(Number(e.target.value))} disabled={busy}>
          {denominations.map(value => <option key={value} value={value}>£{(value / 100).toFixed(2)}</option>)}
        </select>
      </label>
      <label>
        <span>Recipient name</span>
        <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} disabled={busy} required />
      </label>
      <label>
        <span>Recipient email</span>
        <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} disabled={busy} required />
      </label>
      <label>
        <span>Your name</span>
        <input value={senderName} onChange={(e) => setSenderName(e.target.value)} disabled={busy} />
      </label>
      <label>
        <span>Message (optional)</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} disabled={busy} />
      </label>
      {error && <p className="ecom-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Starting secure checkout…" : `Buy £${(amount / 100).toFixed(2)} gift card`}</button>
    </form>
  );
}
