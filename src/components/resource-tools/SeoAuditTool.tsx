"use client";

// T4 R002 — SEO audit tool. Honest checklist, A-F band only (chapter
// #68). Cross-origin fetches require the target to allow CORS; if
// blocked we surface that fact as the result rather than fabricating.

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

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", mode: "cors" });
    return res.ok;
  } catch {
    return false;
  }
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
  const notes: string[] = [];
  if (got.blockedByCors) {
    notes.push(
      "Browser blocked direct read (CORS). Most public sites block client-side scans — server-side scanning lands with the rank-my-website plugin (T2 R023)."
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
  const lower = html.toLowerCase();

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1].trim() ?? "";
  const titleLen = title.length;

  const metaDescMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  );
  const metaDesc = metaDescMatch?.[1] ?? "";
  const metaLen = metaDesc.length;

  const h1Count = (lower.match(/<h1\b/g) ?? []).length;
  const canonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  const ogTitle = /<meta[^>]+property=["']og:title["']/i.test(html);
  const ogImage = /<meta[^>]+property=["']og:image["']/i.test(html);

  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    origin = url;
  }
  const robotsOk = await reachable(`${origin}/robots.txt`);
  const sitemapOk = await reachable(`${origin}/sitemap.xml`);

  const checks: CheckResult[] = [
    {
      id: "title",
      label: "Title length 30–60 chars",
      pass: titleLen >= 30 && titleLen <= 60,
      detail: titleLen ? `${titleLen} chars: "${title.slice(0, 80)}"` : "no <title> found",
    },
    {
      id: "meta",
      label: "Meta description 70–160 chars",
      pass: metaLen >= 70 && metaLen <= 160,
      detail: metaLen ? `${metaLen} chars` : "no meta description",
    },
    {
      id: "h1",
      label: "Exactly one <h1>",
      pass: h1Count === 1,
      detail: `${h1Count} <h1> tag${h1Count === 1 ? "" : "s"}`,
    },
    {
      id: "canonical",
      label: "Canonical link tag present",
      pass: canonical,
      detail: canonical ? "present" : "missing",
    },
    {
      id: "og",
      label: "OpenGraph title + image",
      pass: ogTitle && ogImage,
      detail: `og:title ${ogTitle ? "✓" : "✗"} · og:image ${ogImage ? "✓" : "✗"}`,
    },
    {
      id: "robots",
      label: "/robots.txt reachable",
      pass: robotsOk,
      detail: robotsOk ? "200 OK" : "not reachable from this browser",
    },
    {
      id: "sitemap",
      label: "/sitemap.xml reachable",
      pass: sitemapOk,
      detail: sitemapOk ? "200 OK" : "not reachable from this browser",
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

export function SeoAuditTool() {
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
        <label htmlFor="seo-url">URL to audit</label>
        <div className="mm-tool-row">
          <input
            id="seo-url"
            type="text"
            inputMode="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={running}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={running}>
            {running ? "Running…" : "Run check"}
          </button>
        </div>
        <p className="mm-tool-caption">
          Honest checks against the live page. We never store the URL or
          fabricate scores — bands only, see chapter on honest reporting.
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
