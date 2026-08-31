"use client";

import { ArrowUpRight, Database, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import { useId, useRef, useState } from "react";

import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

export type CommandDeckPopupTone = "critical" | "warning" | "clear" | "neutral";

export type CommandDeckPopupRow = {
  label: string;
  value: string;
  tone?: CommandDeckPopupTone;
};

export type CommandDeckInspectorTarget = {
  tab?: "records" | "sources" | "kpis" | "checks" | "incidents" | "evidence";
  query?: string;
  domain?: string;
  status?: string;
  scope?: string;
  lens?: string;
};

export function CommandDeckPopup({
  children,
  triggerClassName,
  triggerStyle,
  triggerLabel,
  eyebrow = "Command detail",
  title,
  value,
  tone = "neutral",
  detail,
  rows = [],
  target,
  actionLabel = "Inspect full evidence",
}: {
  children: ReactNode;
  triggerClassName: string;
  triggerStyle?: CSSProperties;
  triggerLabel: string;
  eyebrow?: string;
  title: string;
  value?: string;
  tone?: CommandDeckPopupTone;
  detail: string;
  rows?: CommandDeckPopupRow[];
  target?: CommandDeckInspectorTarget;
  actionLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  // Modal keyboard contract: initial focus on the close button, Tab trapped
  // inside the popup, Escape dismisses, focus returns to the trigger.
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, open, { onEscape: close, initialFocus: closeRef });

  function inspect() {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("aqua-radar-inspector:open", { detail: target ?? {} }));
  }

  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={triggerClassName} style={triggerStyle} aria-label={triggerLabel} aria-haspopup="dialog" aria-expanded={open}>
      {children}
    </button>
    {open && typeof document !== "undefined" ? createPortal(
      <div className="mm-command-detail-backdrop fixed inset-0 z-[120] flex items-end justify-center p-3 pb-20 sm:items-center sm:p-6" role="presentation">
        <button type="button" className="mm-command-detail-scrim absolute inset-0 cursor-default bg-[#01070b]/55 backdrop-blur-[2px]" aria-label="Close command detail" onClick={close} />
        <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={headingId} className="mm-command-detail-dialog relative max-h-[calc(100dvh-6rem)] w-full max-w-[430px] overflow-y-auto overscroll-contain rounded-lg border border-[#62e8ff]/35 bg-[#031018] text-white shadow-[0_28px_90px_rgba(0,0,0,.48),0_0_0_1px_rgba(98,232,255,.08)]">
          <div className="flex items-start justify-between gap-4 border-b border-[#62e8ff]/18 bg-[#020b11] px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[8px] font-semibold uppercase text-[#76dff1]/55">{eyebrow}</p>
              <h2 id={headingId} className="mt-1 text-base font-semibold text-white">{title}</h2>
            </div>
            <button ref={closeRef} type="button" onClick={close} title="Close" aria-label="Close command detail" className="grid size-8 shrink-0 place-items-center border border-white/15 text-white/55 hover:border-[#62e8ff]/45 hover:bg-[#62e8ff]/10 hover:text-white">
              <X size={15} />
            </button>
          </div>

          <div className="px-4 py-4">
            {value ? <div className="flex items-end justify-between gap-4 border-b border-[#62e8ff]/14 pb-4">
              <strong className={`text-3xl font-semibold tabular-nums ${popupToneClass(tone)}`}>{value}</strong>
              <span className={`border px-2 py-1 text-[8px] font-semibold uppercase ${popupBadgeClass(tone)}`}>{popupToneLabel(tone)}</span>
            </div> : null}
            <p className={`${value ? "mt-4" : ""} text-sm leading-6 text-[#b9d6db]/72`}>{detail}</p>

            {rows.length ? <dl className="mt-4 grid grid-cols-2 border border-[#62e8ff]/14 bg-[#020b11]/70">
              {rows.map((row, index) => <div key={`${row.label}:${index}`} className={`min-w-0 px-3 py-3 ${index % 2 === 0 ? "border-r" : ""} ${index < rows.length - 2 ? "border-b" : ""} border-[#62e8ff]/12`}>
                <dt className="truncate text-[8px] font-semibold uppercase text-[#8ec9d5]/42">{row.label}</dt>
                <dd className={`mt-1 truncate text-sm font-semibold tabular-nums ${popupToneClass(row.tone ?? "neutral")}`}>{row.value}</dd>
              </div>)}
            </dl> : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#62e8ff]/18 bg-[#020b11]/85 px-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-[8px] font-semibold uppercase text-[#68f5d0]/65"><Database size={11} /> Live Radar evidence</span>
            {target ? <button type="button" onClick={inspect} className="inline-flex min-h-9 items-center gap-2 border border-[#e5c479]/35 bg-[#e5c479]/10 px-3 text-[9px] font-semibold uppercase text-[#f0d9a6] hover:bg-[#e5c479]/16 hover:text-white">
              {actionLabel} <ArrowUpRight size={13} />
            </button> : null}
          </div>
        </section>
      </div>,
      document.body,
    ) : null}
  </>;
}

function popupToneClass(tone: CommandDeckPopupTone): string {
  if (tone === "critical") return "text-red-300";
  if (tone === "warning") return "text-amber-300";
  if (tone === "clear") return "text-[#68f5d0]";
  return "text-white/82";
}

function popupBadgeClass(tone: CommandDeckPopupTone): string {
  if (tone === "critical") return "border-red-300/30 bg-red-400/10 text-red-300";
  if (tone === "warning") return "border-amber-300/30 bg-amber-400/10 text-amber-300";
  if (tone === "clear") return "border-[#68f5d0]/30 bg-[#68f5d0]/10 text-[#68f5d0]";
  return "border-[#62e8ff]/25 bg-[#62e8ff]/[0.06] text-[#8ec9d5]";
}

function popupToneLabel(tone: CommandDeckPopupTone): string {
  if (tone === "critical") return "Action required";
  if (tone === "warning") return "On watch";
  if (tone === "clear") return "In bounds";
  return "Live readout";
}
