import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";

export default async function Ga4SettingsPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, storage: props.storage });
  if (!c) return <section style={{ padding: 24 }}><p>Foundation not registered.</p></section>;
  const cfg = await c.ga4.getConfig();
  const last = cfg.lastFetchedAt ? new Date(cfg.lastFetchedAt).toISOString() : "—";

  return (
    <section style={{ padding: 24, display: "grid", gap: 16, fontFamily: "system-ui, sans-serif" }}>
      <header>
        <h1 style={{ margin: 0 }}>GA4 connector</h1>
        <small style={{ color: "#666" }}>Read-only — `runReport` for the founder dashboard touchpoints tile.</small>
      </header>

      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", margin: 0 }}>
        <dt>Property id</dt><dd data-property-id={cfg.propertyId ?? ""}><code>{cfg.propertyId ?? "(not set)"}</code></dd>
        <dt>Service account</dt><dd>{cfg.serviceAccountPresent ? "in vault" : "not configured"}</dd>
        <dt>Default lookback</dt><dd>{cfg.defaultDays} days</dd>
        <dt>Cache TTL</dt><dd>{Math.round(cfg.cacheTtlMs / 1000)}s</dd>
        <dt>Last fetched</dt><dd>{last}</dd>
        <dt>Last error</dt><dd style={{ color: cfg.lastError ? "#a33" : "#888" }}>{cfg.lastError ?? "—"}</dd>
      </dl>

      <form data-ga4-config-form style={{ display: "grid", gap: 8, padding: 12, border: "1px solid #eee", borderRadius: 4 }}>
        <h2 style={{ margin: 0, fontSize: 14, textTransform: "uppercase", color: "#666" }}>Update config</h2>
        <label>Property id<input name="propertyId" defaultValue={cfg.propertyId ?? ""} placeholder="e.g. 123456789" style={{ display: "block", width: "100%" }} /></label>
        <label>Default lookback (days)<input name="defaultDays" type="number" defaultValue={cfg.defaultDays} min={1} max={365} style={{ display: "block", width: "100%" }} /></label>
        <button type="submit">Save</button>
      </form>

      <form data-ga4-sa-form style={{ display: "grid", gap: 8, padding: 12, border: "1px dashed #ccc", borderRadius: 4 }}>
        <h2 style={{ margin: 0, fontSize: 14, textTransform: "uppercase", color: "#666" }}>Service-account JSON</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
          Paste the GA4 service-account JSON. Stored in credentials-vault — never round-trips through API responses.
        </p>
        <textarea name="json" rows={6} placeholder='{"type":"service_account","client_email":"…","private_key":"…"}' />
        <button type="submit">Save service account</button>
      </form>

      <form data-ga4-test-form>
        <button type="submit">Test connection</button>
      </form>
    </section>
  );
}
