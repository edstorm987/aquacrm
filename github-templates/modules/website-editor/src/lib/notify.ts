"use client";

// Toast notification shim. Round-2 shim that uses the dev console
// until T1's foundation toaster lands; callers use the same call
// shape as 02's `@/components/admin/Toaster`:
//   notify({ tone, title, message }) — tone "ok" | "error" | "warn" | "info"
// or the simpler `notify("Saved")` form.

export type NotifyTone = "ok" | "error" | "warn" | "info";

export interface NotifyOpts {
  title?: string;
  message?: string;
  tone?: NotifyTone;
  durationMs?: number;
}

export function notify(opts: NotifyOpts | string): void {
  const message = typeof opts === "string" ? opts : opts.message ?? opts.title ?? "";
  const title = typeof opts === "string" ? "" : opts.title ?? "";
  const tone = typeof opts === "string" ? "info" : opts.tone ?? "info";
  if (typeof window === "undefined") return;
  const line = title && message ? `${title} — ${message}` : title || message;
  if (tone === "error" || tone === "warn") {
    console.warn(`[website-editor:${tone}]`, line);
  } else {
    console.info(`[website-editor:${tone}]`, line);
  }
}
