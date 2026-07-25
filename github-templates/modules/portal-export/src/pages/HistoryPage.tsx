import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function HistoryPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const records = await c.exports.listHistory();
  return (
    <section className="portal-export-history">
      <header>
        <h1>Export history</h1>
        <p>{records.length} runs across all clients (most recent first).</p>
      </header>
      {records.length === 0 ? (
        <p className="portal-export-empty">No exports yet. Visit Export to materialize a client portal.</p>
      ) : (
        <table className="portal-export-table">
          <thead>
            <tr><th>Started</th><th>Client</th><th>Preset</th><th>Status</th><th>Files written</th><th>Preserved</th></tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                <td>{new Date(r.startedAt).toISOString()}</td>
                <td>{r.clientSlug}</td>
                <td>{r.presetId ?? "—"}</td>
                <td className={`portal-export-status portal-export-status--${r.status}`}>{r.status}</td>
                <td>{r.filesWritten}</td>
                <td>{r.filesPreserved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
