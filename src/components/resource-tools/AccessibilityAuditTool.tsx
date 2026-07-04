"use client";

// T4 R002 — Accessibility audit. Lightweight WCAG-quick-scan signals
// extracted from the live HTML: alt-tag coverage, heading hierarchy,
// landmark presence, contrast on inline-styled text. NOT a full WCAG
// 2.1 AA audit — surface that limit honestly.

import { useState } from "react";
import {
  attemptFetch,
  bandFromCount,
  bandLabel,
  normaliseUrl,
  type Band,
  type CheckResult,
} from "./shared";

interface RunResult {
  url: string;
  fetched: boolean;
  blockedByCors: boolean;
  status?: number;
  band?: Band;
  checks: CheckResult[];
  notes: string[];
}

function relativeLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let v = m[1];
  if (v.length === 3) v = v.split("").map((c) => c + c).join("");
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

async function runAudit(rawUrl: string): Promise<RunResult> {
  const url = normaliseUrl(rawUrl);
  if (!url) {
    return {
      url: rawUrl,
      fetched: false,
      blockedByCors: false,
      checks: [],
      notes: ["URL didn't parse — try `example.com` or `https://example.com`."],
    };
  }
  const got = await attemptFetch(url);
  const notes: string[] = [
    "Static-HTML scan only — JS-rendered content, focus traps, and live dynamic ARIA aren't covered. Treat this as a smoke test, not a full WCAG audit.",
  ];
  if (got.blockedByCors) {
    notes.push(
      "Browser blocked direct read (CORS). Most public sites block client-side scans — server-side scanning lands with rank-my-website (T2 R023)."
    );
  }
  if (!got.text) {
    return {
      url,
      fetched: false,
      blockedByCors: got.blockedByCors,
      status: got.status,
      checks: [],
      notes,
    };
  }
  const html = got.text;

  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imgsWithAlt = imgs.filter((i) => /\balt\s*=/i.test(i)).length;

  const headings = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  let hierarchyOk = true;
  let prev = 0;
  for (const lvl of headings) {
    if (prev && lvl > prev + 1) {
      hierarchyOk = false;
      break;
    }
    prev = lvl;
  }
  const hasH1 = headings.includes(1);

  const hasMain = /<main\b|role=["']main["']/i.test(html);
  const hasNav = /<nav\b|role=["']navigation["']/i.test(html);
  const hasFooter = /<footer\b|role=["']contentinfo["']/i.test(html);

  const langOk = /<html[^>]+\blang\s*=/i.test(html);

  // Contrast: scan inline style="color:#xxx;background:#yyy" pairs.
  const styleAttrs = [...html.matchAll(/style\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  let contrastChecked = 0;
  let contrastFails = 0;
  for (const s of styleAttrs) {
    const colorM = /color\s*:\s*(#[0-9a-f]{3,6})/i.exec(s);
    const bgM = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,6})/i.exec(s);
    if (colorM && bgM) {
      const r = contrastRatio(colorM[1], bgM[1]);
      if (r !== null) {
        contrastChecked += 1;
        if (r < 4.5) contrastFails += 1;
      }
    }
  }

  const checks: CheckResult[] = [
    {
      id: "alt",
      label: "Images have alt attributes",
      pass: imgs.length === 0 || imgsWithAlt === imgs.length,
      detail:
        imgs.length === 0
          ? "no <img> tags on page"
          : `${imgsWithAlt}/${imgs.length} have alt`,
    },
    {
      id: "h1",
      label: "Page has an <h1>",
      pass: hasH1,
      detail: hasH1 ? "present" : "no <h1>",
    },
    {
      id: "hierarchy",
      label: "Heading levels don't skip",
      pass: hierarchyOk,
      detail: hierarchyOk
        ? `${headings.length} headings, in order`
        : "heading level jump (e.g. h2 → h4)",
    },
    {
      id: "lang",
      label: "<html lang> attribute set",
      pass: langOk,
      detail: langOk ? "present" : "missing",
    },
    {
      id: "main",
      label: "<main> landmark",
      pass: hasMain,
      detail: hasMain ? "present" : "missing",
    },
    {
      id: "nav",
      label: "<nav> landmark",
      pass: hasNav,
      detail: hasNav ? "present" : "missing",
    },
    {
      id: "footer",
      label: "<footer>/contentinfo landmark",
      pass: hasFooter,
      detail: hasFooter ? "present" : "missing",
    },
    {
      id: "contrast",
      label: "Inline-styled text contrast ≥ 4.5:1",
      pass: contrastChecked === 0 || contrastFails === 0,
      detail:
        contrastChecked === 0
          ? "no inline color+background pairs found"
          : `${contrastChecked - contrastFails}/${contrastChecked} pass (rest of styles aren't reachable from HTML alone)`,
    },
  ];
  const passes = checks.filter((c) => c.pass).length;
  return {
    url,
    fetched: true,
    blockedByCors: false,
    status: got.status,
    band: bandFromCount(passes, checks.length),
    checks,
    notes,
  };
}

export function AccessibilityAuditTool() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    const r = await runAudit(url);
    setResult(r);
    setRunning(false);
  }

  return (
    <div className="mm-tool">
      <form className="mm-tool-form" onSubmit={handleSubmit}>
        <label htmlFor="a11y-url">URL to audit</label>
        <div className="mm-tool-row">
          <input
            id="a11y-url"
            type="text"
            inputMode="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={running}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={running}>
            {running ? "Scanning…" : "Run scan"}
          </button>
        </div>
        <p className="mm-tool-caption">
          Static HTML smoke test for the most common WCAG misses. Full
          audits (focus, dynamic ARIA, JS-rendered content) need a real
          accessibility pass with assistive tech.
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
          {result.fetched && (
            <ul className="mm-tool-checks">
              {result.checks.map((c) => (
                <li key={c.id} data-pass={c.pass ? "true" : "false"}>
                  <span className="mm-tool-check-mark">{c.pass ? "✓" : "✗"}</span>
                  <span className="mm-tool-check-label">{c.label}</span>
                  <span className="mm-tool-check-detail">{c.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
