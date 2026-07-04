"use client";

// Confirm-dialog shim. The plugin doesn't ship its own modal host
// (T1's foundation does); for now `confirm()` falls through to the
// browser's native confirm. Lifted blocks call this with the same
// `{ title, danger?, confirmLabel?, cancelLabel? }` shape as 02's
// `@/components/admin/ConfirmHost`. When T1's host lands, swap the
// implementation here (single-file change) without touching callers.
//
// Q-ASSUMED: native fallback is acceptable for Round-2 since the
// admin shell isn't yet shipping the styled dialog.

export interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export async function confirm(opts: ConfirmOpts): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const lines = [opts.title];
  if (opts.message) lines.push("", opts.message);
  return window.confirm(lines.join("\n"));
}
