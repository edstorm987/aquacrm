"use client";

// ConfirmDialog — focus-trapped, brand-styled confirmation modal that
// replaces the 29 native `confirm(...)` calls scattered across the
// plugins. Pair with `useConfirm()` for an imperative API that mirrors
// the native one but renders our UI.

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // When true, the confirm button gets the destructive (red) treatment.
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open,
    title,
    body,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive = true,
    onConfirm,
    onCancel,
  } = props;

  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    // Focus the confirm button by default so an Enter press confirms.
    confirmBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aqua-confirm-title"
        aria-describedby={body ? "aqua-confirm-body" : undefined}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="aqua-confirm-title" className="text-base font-semibold text-black/90">
          {title}
        </h3>
        {body && (
          <p id="aqua-confirm-body" className="mt-2 text-sm text-black/70">
            {body}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black/80 hover:bg-black/5"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={[
              "rounded-md px-4 py-2 text-sm font-medium text-white",
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-[var(--brand-primary)] hover:opacity-90",
            ].join(" ")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
