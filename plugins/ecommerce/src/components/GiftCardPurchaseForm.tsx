"use client";

import { useState } from "react";

import { useCart } from "../context/CartContext";

export interface GiftCardPurchaseFormProps {
  apiBase: string;
  giftCardSku?: string;            // optional product slug to bill against
}

export function GiftCardPurchaseForm({ apiBase, giftCardSku = "gift-card" }: GiftCardPurchaseFormProps) {
  const cart = useCart();
  const [amount, setAmount] = useState(2500);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/giftcards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount,
          recipientName,
          recipientEmail,
          senderName,
          message,
        }),
      });
      const data = await res.json() as { ok: boolean; card?: { code: string }; error?: string };
      if (!data.ok || !data.card) {
        setError(data.error ?? "Could not issue gift card.");
        return;
      }
      cart.addItem({
        id: `gc_${data.card.code}`,
        name: `Gift card — £${(amount / 100).toFixed(2)}`,
        price: amount,
        stockSku: giftCardSku,
      });
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
        <span>Amount (pence)</span>
        <input type="number" value={amount} min={500} step={500} onChange={(e) => setAmount(Number(e.target.value))} disabled={busy} />
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
      <button type="submit" disabled={busy}>{busy ? "Sending…" : `Add £${(amount / 100).toFixed(2)} gift card to cart`}</button>
    </form>
  );
}
