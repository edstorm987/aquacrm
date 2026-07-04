// T4 R002 — shared helpers for the three real resource tools
// (seo-audit, site-speed, accessibility-audit). Honest audit primitives
// only — no fabricated benchmarks, A-F bands not numeric percentages
// (chapter #68 honesty contract).

export type Band = "A" | "B" | "C" | "D" | "F";

export function bandFromCount(passes: number, total: number): Band {
  if (total === 0) return "F";
  const ratio = passes / total;
  if (ratio >= 0.95) return "A";
  if (ratio >= 0.8) return "B";
  if (ratio >= 0.6) return "C";
  if (ratio >= 0.4) return "D";
  return "F";
}

export function bandLabel(b: Band): string {
  switch (b) {
    case "A": return "A — looks healthy";
    case "B": return "B — mostly healthy, a couple of fixes";
    case "C": return "C — meaningful gaps";
    case "D": return "D — most checks failing";
    case "F": return "F — fundamental issues";
  }
}

export function normaliseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    return u.toString();
  } catch {
    return null;
  }
}

export interface FetchAttempt {
  ok: boolean;
  status?: number;
  text?: string;
  ms: number;
  bytes?: number;
  blockedByCors: boolean;
  error?: string;
}

export async function attemptFetch(url: string): Promise<FetchAttempt> {
  const start = performance.now();
  try {
    const res = await fetch(url, { redirect: "follow", mode: "cors" });
    const text = await res.text();
    const ms = performance.now() - start;
    return {
      ok: res.ok,
      status: res.status,
      text,
      ms,
      bytes: text.length,
      blockedByCors: false,
    };
  } catch (e: unknown) {
    const ms = performance.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      ms,
      blockedByCors: /fetch|cors|network/i.test(msg),
      error: msg,
    };
  }
}

export interface CheckResult {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}
