"use client";

// Storefront discount popup — first-touch newsletter signup that hands
// the visitor a promo code. Lifted from `02/.../components/DiscountPopup.tsx`,
// trimmed to the plugin shape.

import { useEffect, useState } from "react";

export interface DiscountPopupProps {
  code: string;                    // e.g. "ODO10"
  amountLabel: string;             // e.g. "10% off your first order"
  delayMs?: number;
  storageKey?: string;
}

export function DiscountPopup({ code, amountLabel, delayMs = 8000, storageKey = "ecom_discount_popup_seen" }: DiscountPopupProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(storageKey)) return;
    const t = setTimeout(() => setOpen(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs, storageKey]);

  function dismiss(): void {
    try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="ecom-discount-popup" role="dialog" aria-label="Discount offer">
      <button type="button" onClick={dismiss} aria-label="Close" className="ecom-discount-popup-close">×</button>
      <h3>Welcome — {amountLabel}</h3>
      <p>Use code <code>{code}</code> at checkout.</p>
      <button type="button" onClick={() => {
        navigator.clipboard?.writeText(code).catch(() => { /* ignore */ });
        dismiss();
      }}>Copy code</button>
    </div>
  );
}
