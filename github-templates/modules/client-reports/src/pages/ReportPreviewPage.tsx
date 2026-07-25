import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";

// Branded print-friendly preview. Real PDF rendering is R+1 — the
// browser's print dialog produces an acceptable artifact in v1.
export default async function ReportPreviewPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage });
  if (!c) return <article style={{ padding: 32 }}><p>Foundation not registered.</p></article>;
  const id = typeof props.searchParams.id === "string" ? props.searchParams.id : undefined;
  if (!id) return <article style={{ padding: 32 }}><p>Specify ?id=&lt;reportId&gt;.</p></article>;
  const report = await c.reports.get(id);
  if (!report) return <article style={{ padding: 32 }}><p>Report not found.</p></article>;

  return (
    <article data-report-preview={report.id}
             style={{ padding: 48, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <header style={{ borderBottom: "1px solid #eee", paddingBottom: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>{report.title}</h1>
        <small style={{ color: "#666" }}>
          Phase {report.phaseId} · {new Date(report.createdAt).toISOString().slice(0, 10)} · {report.status}
        </small>
      </header>

      {report.sections.map(s => (
        <section key={s.id} data-section-id={s.id} style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>{s.title}</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{s.body}</pre>
          {s.kind === "metrics" && s.data && s.data.rows.length > 0 && (
            <table style={{ borderCollapse: "collapse", marginTop: 8, width: "100%" }}>
              <thead>
                <tr><th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 4 }}>Metric</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 4 }}>Value</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 4 }}>Δ</th></tr>
              </thead>
              <tbody>
                {s.data.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: 4 }}>{r.label}{r.provisional ? " *" : ""}</td>
                    <td style={{ padding: 4, textAlign: "right" }}>{r.value}{r.unit ? ` ${r.unit}` : ""}</td>
                    <td style={{ padding: 4, textAlign: "right" }}>{r.delta ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      <footer style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #eee", fontSize: 12, color: "#888" }}>
        * provisional — connector not yet wired (chapter #68 honesty contract).
      </footer>
    </article>
  );
}
