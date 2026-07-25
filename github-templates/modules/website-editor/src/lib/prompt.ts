"use client";

// Prompt shim. Round-2 shim that falls through to native window.prompt
// until T1 ships a styled prompt host. Callers use the same
// `prompt({ title, defaultValue?, placeholder? })` shape as 02's
// `@/components/admin/PromptHost`.

export interface PromptOpts {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Hint that the value is a multi-line block (textarea). The native
  // window.prompt fallback ignores this; styled hosts can switch to a
  // textarea control.
  multiline?: boolean;
}

export async function prompt(opts: PromptOpts): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const lines = [opts.title];
  if (opts.message) lines.push(opts.message);
  return window.prompt(lines.join("\n"), opts.defaultValue ?? "");
}
