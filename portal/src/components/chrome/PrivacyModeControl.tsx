"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "milesymedia-privacy-mode";
const HOLD_MS = 900;
type PrivacyCategory = "identity" | "contact" | "money" | "account";

const PRIVATE_FIELD_PATTERN = /\b(?:name|email|phone|mobile|address|postcode|bank|account|sort[\s_-]*code|iban|swift|card|payment|salary|revenue|income|expense|amount|price|cost|budget|tax|total|balance|invoice)\b/i;
const MONEY_PATTERN = /(?:£|\$|€)\s?-?\d[\d,.]*|\b-?\d[\d,.]*\s?(?:gbp|usd|eur)\b/i;
const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const ID_PATTERN = /\b(?:cli|usr|inv|exp|lead|prospect|proj|pay|sub)_[a-z0-9_-]+\b/i;
const ACCOUNT_PATTERN = /\b(?:iban|swift|sort code|account number|card number|routing number)\b/i;

export function PrivacyModeControl({
  canEnterShowcase,
  showcaseMode = false,
  sensitiveTerms = [],
}: {
  canEnterShowcase: boolean;
  showcaseMode?: boolean;
  sensitiveTerms?: string[];
}) {
  const [privateMode, setPrivateMode] = useState(false);
  const [holding, setHolding] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  useEffect(() => {
    const active = window.sessionStorage.getItem(STORAGE_KEY) === "on";
    setPrivateMode(active);
    document.documentElement.toggleAttribute("data-privacy-mode", active);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    const clearMarks = () => {
      document.querySelectorAll("[data-privacy-value]").forEach(element => element.removeAttribute("data-privacy-value"));
    };
    if (!privateMode) {
      clearMarks();
      return;
    }

    const terms = [...new Set(sensitiveTerms
      .map(term => term.trim().toLowerCase())
      .filter(term => term.length >= 3))];
    const categoryForValue = (value: string): PrivacyCategory | null => {
      const clean = value.replace(/\s+/g, " ").trim();
      const lower = clean.toLowerCase();
      if (!clean || clean.length > 500) return null;
      if (terms.some(term => lower === term || lower.includes(term))) return "identity";
      if (EMAIL_PATTERN.test(clean)) return "contact";
      if (MONEY_PATTERN.test(clean)) return "money";
      if (ACCOUNT_PATTERN.test(clean) || ID_PATTERN.test(clean)) return "account";
      if (looksLikePhoneNumber(clean)) return "contact";
      if (looksLikePrivateUrl(clean, terms)) return "contact";
      return null;
    };
    const categoryForField = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): PrivacyCategory | null => {
      const descriptor = [
        element.name,
        element.id,
        element.getAttribute("aria-label"),
        element.getAttribute("placeholder"),
        element.closest("label")?.textContent,
      ].filter(Boolean).join(" ");
      if (!PRIVATE_FIELD_PATTERN.test(descriptor)) return categoryForValue(element.value);
      if (/\b(?:revenue|income|expense|amount|price|cost|budget|tax|total|balance|invoice|salary|payment)\b/i.test(descriptor)) return "money";
      if (/\b(?:bank|account|sort[\s_-]*code|iban|swift|card)\b/i.test(descriptor)) return "account";
      if (/\b(?:email|phone|mobile|address|postcode)\b/i.test(descriptor)) return "contact";
      return "identity";
    };
    let frame = 0;
    const scan = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const elements = document.querySelectorAll<HTMLElement>(
          ".mm-portal-root main *, .mm-private-sidebar *, .mm-private-chrome *",
        );
        for (const element of elements) {
          if (element.closest(".mm-privacy-control")) continue;
          if (element.closest("[data-privacy-visible]")) continue;
          if (element.matches("input, textarea, select")) {
            const field = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            const category = field.value ? categoryForField(field) : null;
            if (category) element.setAttribute("data-privacy-value", category);
            else element.removeAttribute("data-privacy-value");
            continue;
          }
          if (element.children.length > 0) continue;
          const value = element.textContent ?? "";
          const category = categoryForValue(value);
          if (category) element.setAttribute("data-privacy-value", category);
          else element.removeAttribute("data-privacy-value");
        }
      });
    };
    scan();
    const observer = new MutationObserver(scan);
    document.querySelectorAll(".mm-portal-root").forEach(root => observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    }));
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      clearMarks();
    };
  }, [privateMode, sensitiveTerms]);

  function applyPrivacy(active: boolean) {
    setPrivateMode(active);
    document.documentElement.toggleAttribute("data-privacy-mode", active);
    window.sessionStorage.setItem(STORAGE_KEY, active ? "on" : "off");
  }

  function cancelHold() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }

  function startHold() {
    if (!canEnterShowcase || showcaseMode || busy || timer.current) return;
    longPressTriggered.current = false;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      longPressTriggered.current = true;
      setHolding(false);
      void enterShowcase();
    }, HOLD_MS);
  }

  async function enterShowcase() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/showcase-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "enter" }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; redirect?: string } | null;
      if (!response.ok || !result?.ok) throw new Error("Showcase Mode could not be opened.");
      applyPrivacy(false);
      window.location.assign(result.redirect || "/portal/agency");
    } catch {
      setBusy(false);
    }
  }

  function handleClick() {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (!busy) applyPrivacy(!privateMode);
  }

  const title = showcaseMode
    ? privateMode ? "Show sensitive information" : "Hide sensitive information"
    : canEnterShowcase
      ? `${privateMode ? "Show" : "Hide"} sensitive information. Hold for Showcase Mode.`
      : `${privateMode ? "Show" : "Hide"} sensitive information`;

  return (
    <div className="mm-privacy-control relative z-[70]">
      <button
        type="button"
        aria-label={title}
        aria-pressed={privateMode}
        title={title}
        disabled={busy}
        onClick={handleClick}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        onKeyDown={event => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) startHold();
        }}
        onKeyUp={event => {
          if (event.key === " " || event.key === "Enter") cancelHold();
        }}
        onContextMenu={event => event.preventDefault()}
        className={[
          "relative inline-flex min-h-9 items-center gap-2 overflow-hidden rounded-md border px-2.5 text-xs font-semibold shadow-sm transition",
          privateMode
            ? "border-[#D4B888]/70 bg-[#171009] text-[#F7EFE2]"
            : "border-black/10 bg-white text-black/60 hover:border-black/25",
          busy ? "cursor-wait opacity-70" : "",
        ].join(" ")}
      >
        {privateMode ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
        {privateMode ? <span className="hidden sm:inline">Privacy on</span> : null}
        {holding ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-[privacy-hold_900ms_linear_forwards] bg-[#D4B888]" /> : null}
      </button>
    </div>
  );
}

function looksLikePhoneNumber(value: string): boolean {
  if (/%/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  return /^\s*(?:\+?\d[\d\s().-]{5,}\d)\s*$/.test(value);
}

function looksLikePrivateUrl(value: string, terms: string[]): boolean {
  if (!/(?:https?:\/\/|www\.)/i.test(value)) return false;
  const lower = value.toLowerCase();
  return terms.some(term => lower.includes(term))
    || /[?&](?:token|key|secret|code|email)=/i.test(value);
}
