import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

// ExportPage is the operator-facing entry. v1 is server-rendered: pick
// a clientId from the URL (?clientId=...), preview the collected state +
// the four available presets. The "Export to repo" button POSTs to
// /api/portal/portal-export/clients/export. Client-side interactivity
// (preset picker dropdown + brand override + diff preview) lands in a
// future polish round — v1 ships the read-only preview + a form-post
// button.

export default async function ExportPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const clientId = typeof props.searchParams.clientId === "string"
    ? props.searchParams.clientId
    : undefined;
  const presetId = typeof props.searchParams.presetId === "string"
    ? props.searchParams.presetId
    : undefined;
  const presets = c.presets.list();

  if (!clientId) {
    return (
      <section className="portal-export-export">
        <header>
          <h1>Export to repo</h1>
          <p>Pick a client to materialize as a per-client Next.js app under <code>clients/&lt;slug&gt;/</code>.</p>
        </header>
        <p className="portal-export-empty">
          Provide <code>?clientId=&lt;clientId&gt;</code> in the URL to begin. Future polish: a client picker + preset selector.
        </p>
        <h2>Available presets</h2>
        <ul className="portal-export-preset-list">
          {presets.map(p => (
            <li key={p.id}><strong>{p.label}</strong> — {p.description}</li>
          ))}
        </ul>
      </section>
    );
  }

  const state = await c.exports.collect(clientId);
  if (!state) {
    return (
      <section className="portal-export-export">
        <header>
          <h1>Export to repo</h1>
        </header>
        <p className="portal-export-empty">Client <code>{clientId}</code> not found in this agency.</p>
      </section>
    );
  }

  const plan = await c.exports.plan(clientId, { presetId, dryRun: true });

  return (
    <section className="portal-export-export">
      <header>
        <h1>Export to repo</h1>
        <p>Materializes <code>{state.client.slug}</code> as a self-contained Next.js app at <code>clients/{state.client.slug}/</code>.</p>
      </header>

      <h2>Collected state</h2>
      <dl className="portal-export-meta-grid">
        <div><dt>Client</dt><dd>{state.client.name} ({state.client.slug})</dd></div>
        <div><dt>Brand primary</dt><dd><span style={{ display: "inline-block", width: 12, height: 12, background: state.client.brand.primaryColor, marginRight: 6, verticalAlign: "middle" }} />{state.client.brand.primaryColor}</dd></div>
        <div><dt>Installed plugins</dt><dd>{state.installedPlugins.length === 0 ? "(none)" : state.installedPlugins.join(", ")}</dd></div>
        <div><dt>Portal variants</dt><dd>{Object.keys(state.portalVariants).length === 0 ? "(none — preset will fill)" : Object.entries(state.portalVariants).map(([r, v]) => `${r}: ${v}`).join(" · ")}</dd></div>
        <div><dt>Custom content keys</dt><dd>{Object.keys(state.customContent).length}</dd></div>
      </dl>

      <h2>Preset</h2>
      <ul className="portal-export-preset-list">
        {presets.map(p => (
          <li key={p.id}>
            <strong>{p.label}</strong> — {p.description}
            <br />
            <a href={`?clientId=${encodeURIComponent(clientId)}&presetId=${encodeURIComponent(p.id)}`}>
              Plan with {p.id} →
            </a>
          </li>
        ))}
      </ul>

      {plan && (
        <>
          <h2>Plan diff</h2>
          <dl className="portal-export-meta-grid">
            <div><dt>Files added</dt><dd>{plan.diff.added.length}</dd></div>
            <div><dt>Files changed (we owned)</dt><dd>{plan.diff.changed.length}</dd></div>
            <div><dt>Files preserved (operator hand-edits)</dt><dd>{plan.diff.preserved.length}</dd></div>
            <div><dt>Files unchanged</dt><dd>{plan.diff.unchanged.length}</dd></div>
          </dl>
          {plan.diff.preserved.length > 0 && (
            <details>
              <summary>Preserved file paths</summary>
              <ul>{plan.diff.preserved.map(p => <li key={p}><code>{p}</code></li>)}</ul>
            </details>
          )}

          <h2>Run</h2>
          <form action="/api/portal/portal-export/clients/export" method="POST">
            <input type="hidden" name="clientId" value={clientId} />
            {presetId && <input type="hidden" name="presetId" value={presetId} />}
            <button type="submit" className="portal-export-button">Export to repo</button>
          </form>
          <p className="portal-export-meta">
            Result is written to <code>04-the-final-portal/clients/{state.client.slug}/</code>.
            Operator hand-edits in already-existing files are preserved.
          </p>
        </>
      )}
    </section>
  );
}
