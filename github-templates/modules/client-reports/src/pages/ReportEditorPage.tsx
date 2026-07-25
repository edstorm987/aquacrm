import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";

export default async function ReportEditorPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage });
  if (!c) return <section style={{ padding: 24 }}><p>No reports available.</p></section>;
  const id = typeof props.searchParams.id === "string" ? props.searchParams.id : undefined;
  if (!id) return <section style={{ padding: 24 }}><p>Specify ?id=&lt;reportId&gt;.</p></section>;
  const report = await c.reports.get(id);
  if (!report) return <section style={{ padding: 24 }}><p>Report not found.</p></section>;

  return (
    <section style={{ padding: 24, display: "grid", gap: 16 }} data-report-editor={report.id}>
      <header style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>{report.title}</h1>
        <small>{report.status} · phase {report.phaseId}</small>
      </header>

      <form data-report-form={report.id} style={{ display: "grid", gap: 12 }}>
        <label>
          Title
          <input name="title" defaultValue={report.title} style={{ display: "block", width: "100%" }} />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" name="sharedWithCustomer" defaultChecked={report.sharedWithCustomer} />
          Share with customer once published
        </label>

        {report.sections.map(s => (
          <fieldset key={s.id} data-section-id={s.id} data-section-kind={s.kind}
                    style={{ border: "1px solid #eee", padding: 12, borderRadius: 4, display: "grid", gap: 8 }}>
            <legend style={{ padding: "0 6px" }}>{s.title} <small style={{ color: "#888" }}>({s.kind})</small></legend>
            <textarea name={`section-${s.id}-body`} defaultValue={s.body} rows={6} style={{ width: "100%" }} />
            {s.kind === "metrics" && s.data && (
              <div style={{ background: "#fafafa", padding: 8, borderRadius: 4, fontSize: 13 }}>
                <em>Connector:</em> {s.data.connector ?? "(none)"} ·{" "}
                <em>Rows:</em> {s.data.rows.length}
                {s.data.rows.length === 0 && (
                  <p style={{ margin: "6px 0 0", color: "#888" }}>{s.data.placeholder ?? "Connect a metrics source to populate."}</p>
                )}
              </div>
            )}
          </fieldset>
        ))}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" data-action="save">Save</button>
          {report.status === "draft" && <button type="button" data-action="publish">Publish</button>}
          {report.status === "published" && <button type="button" data-action="mark-sent">Mark as sent</button>}
        </div>
      </form>
    </section>
  );
}
