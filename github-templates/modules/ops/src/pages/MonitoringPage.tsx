// Admin dashboard for @aqua/plugin-ops.
//
// Server-rendered. Pulls a snapshot via MonitoringService and
// renders four panels: uptime / error rate / slow routes / costs.
// V1 falls back to fixture rows when provider creds aren't
// configured — `live: false` rows are visually de-emphasised so
// operators can tell at a glance which figures are real.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { MonitoringService } from "../server/monitoringService";
import {
  deltaPct,
  formatLatency,
  formatMoney,
  formatUptime,
  type CostRow,
  type ErrorRateRow,
  type MonitoringSnapshot,
  type SlowRouteRow,
  type UptimeRow,
} from "../lib/monitoring";

export default async function MonitoringPage(props: PluginPageProps): Promise<React.JSX.Element> {
  const installConfig: { stripeSecretKey?: string; postmarkServerToken?: string } = {};
  const cfg = (props.install?.config ?? {}) as Record<string, unknown>;
  if (typeof cfg["stripeSecretKey"] === "string") installConfig.stripeSecretKey = cfg["stripeSecretKey"];
  if (typeof cfg["postmarkServerToken"] === "string") installConfig.postmarkServerToken = cfg["postmarkServerToken"];

  const service = new MonitoringService({ storage: props.storage, installConfig });
  const snapshot = await service.snapshot();

  return (
    <main id="main-content" style={{ padding: 24, display: "grid", gap: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h1 style={{ margin: 0 }}>Production health</h1>
          <p style={{ margin: "4px 0 0", color: "#666" }}>
            Uptime, error rate, slow routes, and cost snapshot. Last refreshed{" "}
            <time dateTime={new Date(snapshot.generatedAt).toISOString()}>
              {new Date(snapshot.generatedAt).toLocaleString()}
            </time>
            .
          </p>
        </div>
        <form action="/api/portal/ops/healthcheck" method="post">
          <button type="submit" style={{ padding: "8px 14px", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
            Run healthcheck
          </button>
        </form>
      </header>

      <UptimePanel rows={snapshot.uptime} />
      <ErrorRatePanel rows={snapshot.errorRate} />
      <SlowRoutesPanel rows={snapshot.slowRoutes} />
      <CostPanel rows={snapshot.costs} />

      <FollowUpsCard snapshot={snapshot} />
    </main>
  );
}

// ─── Uptime ─────────────────────────────────────────────────────────────

function UptimePanel({ rows }: { rows: UptimeRow[] }): React.JSX.Element {
  return (
    <section aria-label="Uptime per deployment" style={panelStyle}>
      <h2 style={h2Style}>Uptime (24h)</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Deployment</th>
            <th style={thStyle}>Uptime</th>
            <th style={thStyle}>Last sample</th>
            <th style={thStyle}>Avg latency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.target.id}>
              <td style={tdStyle}>
                <strong>{row.target.label}</strong>
                {row.target.customDomain && (
                  <div style={{ fontSize: 12, color: "#666" }}>{row.target.customDomain}</div>
                )}
              </td>
              <td style={tdStyle}>{formatUptime(row.uptime24h)}</td>
              <td style={tdStyle}>
                {row.lastSample ? (
                  <>
                    <span aria-label={row.lastSample.ok ? "ok" : "down"} style={{ color: row.lastSample.ok ? "#0a7d2c" : "#b00020" }}>
                      ●
                    </span>{" "}
                    {row.lastSample.ok ? `HTTP ${row.lastSample.status ?? 200}` : row.lastSample.error ?? "down"}
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {new Date(row.lastSample.ts).toLocaleString()}
                    </div>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td style={tdStyle}>{formatLatency(row.avgLatencyMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─── Error rate ─────────────────────────────────────────────────────────

function ErrorRatePanel({ rows }: { rows: ErrorRateRow[] }): React.JSX.Element {
  const sentryConfigured = rows.some((r) => r.topIssues !== null && r.topIssues.length > 0);
  return (
    <section aria-label="Error rate" style={panelStyle}>
      <h2 style={h2Style}>Errors (Sentry)</h2>
      {!sentryConfigured && (
        <p style={noticeStyle}>
          Showing fixture data — set SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT env to surface live counts.
        </p>
      )}
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Deployment</th>
            <th style={thStyle}>Per minute</th>
            <th style={thStyle}>24h total</th>
            <th style={thStyle}>Top issues</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.target.id}>
              <td style={tdStyle}>{row.target.label}</td>
              <td style={tdStyle}>{row.perMinute === null ? "—" : row.perMinute.toFixed(2)}</td>
              <td style={tdStyle}>{row.total24h ?? "—"}</td>
              <td style={tdStyle}>
                {row.topIssues && row.topIssues.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {row.topIssues.map((iss) => (
                      <li key={iss.id} style={{ fontSize: 13 }}>
                        <code>{iss.id}</code> — {iss.title} <span style={{ color: "#666" }}>({iss.count})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─── Slow routes ────────────────────────────────────────────────────────

function SlowRoutesPanel({ rows }: { rows: SlowRouteRow[] }): React.JSX.Element {
  return (
    <section aria-label="Slow routes" style={panelStyle}>
      <h2 style={h2Style}>Slow routes (p95)</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Path</th>
            <th style={thStyle}>p95</th>
            <th style={thStyle}>Samples</th>
            <th style={thStyle}>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.path}>
              <td style={tdStyle}><code>{row.path}</code></td>
              <td style={tdStyle}>{formatLatency(row.p95Ms)}</td>
              <td style={tdStyle}>{row.samples}</td>
              <td style={tdStyle}>{row.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─── Costs ──────────────────────────────────────────────────────────────

function CostPanel({ rows }: { rows: CostRow[] }): React.JSX.Element {
  return (
    <section aria-label="Cost snapshot" style={panelStyle}>
      <h2 style={h2Style}>Cost snapshot (MTD)</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Provider</th>
            <th style={thStyle}>Month-to-date</th>
            <th style={thStyle}>Last month</th>
            <th style={thStyle}>Δ</th>
            <th style={thStyle}>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const delta = deltaPct(row.mtdCents, row.prevMonthCents);
            return (
              <tr key={row.provider} style={row.live ? undefined : { color: "#666" }}>
                <td style={tdStyle}>{row.label}</td>
                <td style={tdStyle}>{formatMoney(row.mtdCents, row.currency)}</td>
                <td style={tdStyle}>{formatMoney(row.prevMonthCents, row.currency)}</td>
                <td style={tdStyle}>
                  {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
                </td>
                <td style={tdStyle}>{row.live ? "live" : "fixture"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ─── R4 follow-up card ──────────────────────────────────────────────────

function FollowUpsCard({ snapshot }: { snapshot: MonitoringSnapshot }): React.JSX.Element {
  const fixtureCount = snapshot.costs.filter((c) => !c.live).length
    + snapshot.slowRoutes.filter((r) => r.source === "fixture").length;
  return (
    <aside style={{ ...panelStyle, background: "#fafafa", borderStyle: "dashed" }}>
      <h2 style={h2Style}>R4 follow-ups</h2>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>Wire SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT — flips error-rate rows from fixture to live.</li>
        <li>Toggle Vercel Analytics on the project + set VERCEL_TOKEN — flips slow-routes rows from fixture to live.</li>
        <li>Set per-install <code>stripeSecretKey</code> and <code>postmarkServerToken</code> — flips cost rows.</li>
        <li>Wire the hourly healthcheck cron (foundation pending — see <code>vercel.json</code> crons block).</li>
      </ul>
      <p style={{ marginTop: 12, fontSize: 12, color: "#666" }}>{fixtureCount} fixture row(s) currently shown.</p>
    </aside>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  padding: 16,
  background: "white",
};
const h2Style: React.CSSProperties = { margin: "0 0 12px", fontSize: 16 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #e0e0e0", fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "8px 6px", borderBottom: "1px solid #f0f0f0", verticalAlign: "top" };
const noticeStyle: React.CSSProperties = { margin: "0 0 12px", padding: "8px 12px", background: "#fff8e1", border: "1px solid #ffd54f", borderRadius: 6, fontSize: 13 };
