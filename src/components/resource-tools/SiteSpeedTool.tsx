"use client";

// T4 R002 — Site speed test. Pure client-side fetch + Performance API.
// Honest "rough estimate from this device" caption — we don't claim
// Lighthouse parity (real PSI integration is post-ship). Results are
// device + network + CORS dependent; we surface those caveats inline.

import { useState } from "react";
import { attemptFetch, bandLabel, normaliseUrl, type Band } from "./shared";

interface RunResult {
  url: string;
  fetched: boolean;
  blockedByCors: boolean;
  status?: number;
  totalMs?: number;
  bytes?: number;
  imageCount?: number;
  scriptCount?: number;
  navigationMs?: number;
  band?: Band;
  notes: string[];
}

function bandFromMs(ms: number): Band {
  if (ms < 800) return "A";
  if (ms < 1500) return "B";
  if (ms < 3000) return "C";
  if (ms < 6000) return "D";
  return "F";
}

async function runTest(rawUrl: string): Promise<RunResult> {
  const url = normaliseUrl(rawUrl);
  if (!url) {
    return {
      url: rawUrl,
      fetched: false,
      blockedByCors: false,
      notes: ["URL didn't parse — try `example.com` or `https://example.com`."],
    };
  }
  const got = await attemptFetch(url);
  const notes: string[] = [
    "Rough estimate from this device + this network. Real cross-region speed numbers come from a server-side scanner (post-ship).",
  ];
  if (got.blockedByCors) {
    notes.push(
      "Browser blocked direct read (CORS). Total bytes + image/script counts unavailable; round-trip time still measured."
    );
  }
  if (!got.text) {
    return {
      url,
      fetched: false,
      blockedByCors: got.blockedByCors,
      status: got.status,
      totalMs: got.ms,
      band: bandFromMs(got.ms),
      notes,
    };
  }
  const html = got.text;
  const imageCount = (html.match(/<img\b/gi) ?? []).length;
  const scriptCount = (html.match(/<script\b/gi) ?? []).length;

  const navEntry = performance
    .getEntriesByType("navigation")
    .find((e): e is PerformanceNavigationTiming => "domContentLoadedEventEnd" in e);
  const navigationMs = navEntry
    ? navEntry.domContentLoadedEventEnd - navEntry.startTime
    : undefined;

  return {
    url,
    fetched: true,
    blockedByCors: false,
    status: got.status,
    totalMs: got.ms,
    bytes: got.bytes,
    imageCount,
    scriptCount,
    navigationMs,
    band: bandFromMs(got.ms),
    notes,
  };
}

export function SiteSpeedTool() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    const r = await runTest(url);
    setResult(r);
    setRunning(false);
  }

  return (
    <div className="mm-tool">
      <form className="mm-tool-form" onSubmit={handleSubmit}>
        <label htmlFor="ss-url">URL to test</label>
        <div className="mm-tool-row">
          <input
            id="ss-url"
            type="text"
            inputMode="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={running}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={running}>
            {running ? "Testing…" : "Run test"}
          </button>
        </div>
        <p className="mm-tool-caption">
          Browser-only timing — your local network + device shape these
          numbers. Use as a directional read, not a verdict.
        </p>
      </form>

      {result && (
        <div className="mm-tool-result">
          <div className="mm-tool-result-head">
            <span className="mm-dev-eyebrow">Result</span>
            <h2>{result.url}</h2>
            {result.band && (
              <p className="mm-tool-band">Band: <strong>{bandLabel(result.band)}</strong></p>
            )}
          </div>
          {result.notes.map((n, i) => (
            <p key={i} className="mm-tool-note">{n}</p>
          ))}
          <ul className="mm-tool-stats">
            <li>
              <span className="mm-tool-stat-label">Round-trip</span>
              <span className="mm-tool-stat-val">
                {result.totalMs !== undefined ? `${Math.round(result.totalMs)} ms` : "—"}
              </span>
            </li>
            <li>
              <span className="mm-tool-stat-label">Total bytes (HTML)</span>
              <span className="mm-tool-stat-val">
                {result.bytes !== undefined ? `${(result.bytes / 1024).toFixed(1)} KB` : "—"}
              </span>
            </li>
            <li>
              <span className="mm-tool-stat-label">&lt;img&gt; tags</span>
              <span className="mm-tool-stat-val">
                {result.imageCount !== undefined ? result.imageCount : "—"}
              </span>
            </li>
            <li>
              <span className="mm-tool-stat-label">&lt;script&gt; tags</span>
              <span className="mm-tool-stat-val">
                {result.scriptCount !== undefined ? result.scriptCount : "—"}
              </span>
            </li>
            <li>
              <span className="mm-tool-stat-label">This page DCL (reference)</span>
              <span className="mm-tool-stat-val">
                {result.navigationMs !== undefined ? `${Math.round(result.navigationMs)} ms` : "—"}
              </span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
