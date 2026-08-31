"use client";

// Donation button — pre-set amounts + custom amount input.
// Routes through ecommerce's Stripe checkout at
// `/api/portal/ecommerce/stripe/checkout`.
//
// ── Why there is no "Make this monthly" checkbox ─────────────────────────
//
// There was one, and ticking it changed nothing that could bill anybody
// monthly. It set a `recurring: true` flag in the checkout body, and the word
// "recurring" appears NOWHERE in the ecommerce module. The only other trace was
// cosmetic: the line item read "Donation (monthly)" and the button read
// "Donate monthly now". So a donor who ticked it was told they had set up a
// monthly gift and would never be charged again — a promise of a durable
// result that never happened.
//
// Monthly giving needs a Stripe Price object plus subscription mode in the
// checkout handler. Until that exists the control is not offered to visitors.
// `props.allowRecurring` is kept: it still governs the row, which now carries
// an editor-only note so the person building the page learns why their toggle
// shows nothing rather than assuming the block is broken.
//
// ── The request below does not match the handler it is sent to ───────────
//
// Corrected 2026-08-31 after actually reading `stripeCheckoutHandler`. An
// earlier note here said it "reads `lineItems` and creates a one-off Checkout
// Session". It does not. It calls `parseCheckoutRequest`
// (`src/built-ins/modules/ecommerce/src/server/checkout.ts`), which enforces a
// STRICT allowlist — version, operationId, items, giftCardPurchase,
// discountCode, customerEmail, endCustomerUserId, referralCodeId,
// shippingCountry, successPath, cancelPath — and throws
// `Unknown checkout field: lineItems.` on the first key it does not know.
// Every field this block sends is unknown to it, and all three it requires
// (`version: 1`, an 8-120 character `operationId`, and `items` of
// `{ productId, variantId?, quantity }`) are absent. The call therefore cannot
// succeed for anybody, signed in or not.
//
// Closing that is backend work, not a copy fix: a donation has no `productId`,
// so it needs either a donation line-item shape in the checkout contract or a
// per-client donation product. It is recorded against `donation-button` in
// `blockBackends.ts`. What IS fixed here is the part that misled on its own
// terms — the failure used to be swallowed (`if (url) …` and nothing else), so
// a donor pressed "Donate now", watched the button flick back to its resting
// label, and was given no reason to think the donation had not happened.

import { useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function DonationButtonBlock({ block, editorMode }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Support our work";
  const subheading = (block.props.subheading as string | undefined) ?? "Every donation goes directly to the cause.";
  const currency = (block.props.currency as string | undefined) ?? "GBP";
  const amountsRaw = (block.props.amounts as string | undefined) ?? "5,10,25,50,100";
  const amounts = amountsRaw.split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
  const allowCustom = (block.props.allowCustom as boolean | undefined) ?? true;
  const allowRecurring = (block.props.allowRecurring as boolean | undefined) ?? true;

  const [picked, setPicked] = useState<number | "custom">(amounts[1] ?? amounts[0] ?? 10);
  const [custom, setCustom] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "";

  async function donate() {
    setBusy(true);
    setError(null);
    try {
      const amount = picked === "custom" ? Number(custom) : picked;
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Enter an amount greater than zero.");
        return;
      }
      // Route through ecommerce's Stripe checkout with a single line-item
      // priced in cents. One-off only — the handler has no subscription mode,
      // so nothing here may describe the charge as repeating.
      const amountCents = Math.round(amount * 100);
      const res = await fetch("/api/portal/ecommerce/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lineItems: [{ name: "Donation", quantity: 1, priceCents: amountCents }],
          successUrl: `${window.location.origin}/order-confirmed?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: window.location.href,
          amountCents,
          description: "Donation",
          mode: "donation",
        }),
      });
      const data = await res.json().catch(() => null);
      const url = (data?.url ?? data?.redirectUrl) as string | undefined;
      if (res.ok && url) {
        window.location.href = url;
        return;
      }
      // No redirect means no donation was started. Saying nothing leaves the
      // donor looking at a button that reset itself, which is indistinguishable
      // from a click that missed — and they may well believe they have given.
      const reason = typeof data?.error === "string" ? data.error : null;
      setError(
        reason
          ? `Couldn't start the donation: ${reason}`
          : "Couldn't start the donation — nothing has been charged. Please try again or contact the site owner.",
      );
    } catch {
      setError("Couldn't reach the payment service — nothing has been charged.");
    } finally { setBusy(false); }
  }

  return (
    <section data-block-type="donation-button" style={{ padding: "48px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 28, fontWeight: 700, marginBottom: 6 }}>{heading}</h2>
        {subheading && <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 24 }}>{subheading}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
          {amounts.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => setPicked(a)}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid",
                borderColor: picked === a ? "var(--brand-accent, #ff6b35)" : "rgba(255,255,255,0.15)",
                background: picked === a ? "var(--brand-accent, #ff6b35)" : "rgba(255,255,255,0.04)",
                color: picked === a ? "#fff" : "inherit",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              {symbol}{a}
            </button>
          ))}
          {allowCustom && (
            <button
              type="button"
              onClick={() => setPicked("custom")}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid",
                borderColor: picked === "custom" ? "var(--brand-accent, #ff6b35)" : "rgba(255,255,255,0.15)",
                background: picked === "custom" ? "var(--brand-accent, #ff6b35)" : "rgba(255,255,255,0.04)",
                color: picked === "custom" ? "#fff" : "inherit",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Other
            </button>
          )}
        </div>

        {allowCustom && picked === "custom" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", maxWidth: 200, margin: "0 auto 16px" }}>
            <span aria-hidden style={{ fontSize: 16 }}>{symbol}</span>
            {/* The placeholder is a hint — the currency lives in the name so a
                screen reader hears which unit it is typing. */}
            <input
              type="number"
              min={1}
              value={custom}
              onChange={e => setCustom(e.target.value)}
              aria-label={`Custom donation amount in ${currency}`}
              placeholder="Amount"
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.04)",
                color: "inherit",
                fontSize: 14,
              }}
            />
          </div>
        )}

        {allowRecurring && editorMode && (
          <p style={{ margin: "0 auto 16px", maxWidth: 360, fontSize: 12, opacity: 0.6 }}>
            Monthly giving isn&apos;t connected yet, so the monthly option is not
            shown to visitors — this block takes one-off donations.
          </p>
        )}

        <button
          type="button"
          onClick={donate}
          disabled={busy || (picked === "custom" && !Number(custom))}
          style={{
            display: "block",
            width: "100%",
            padding: "12px 20px",
            borderRadius: 10,
            background: "var(--brand-accent, #ff6b35)",
            color: "#fff",
            fontSize: 14, fontWeight: 600,
            border: "none",
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Redirecting…" : "Donate now"}
        </button>

        {error && (
          <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "#fca5a5" }}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
