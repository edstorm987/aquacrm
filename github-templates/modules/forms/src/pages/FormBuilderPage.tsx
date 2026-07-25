// Structured form builder — table of fields with inline edit. NO
// drag-drop in v1 (deferred polish round). Reorder via up/down arrows
// is the structured-editor pattern documented in the prompt.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function FormBuilderPage(props: PluginPageProps) {
  const id = props.segments[0];
  if (!id) return <p>form id required.</p>;
  const c = containerFor({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage, install: props.install });
  const form = await c.forms.get(id);
  if (!form) return <p>Form not found.</p>;
  return (
    <section className="forms-builder">
      <header>
        <h1>{form.name}</h1>
        <span className={`forms-pill forms-pill-${form.status}`}>{form.status}</span>
      </header>
      {form.description && <p className="forms-meta">{form.description}</p>}
      <h2>Fields</h2>
      <table className="forms-fields-table">
        <thead><tr><th>#</th><th>Label</th><th>Kind</th><th>Required</th><th>Attribute key</th></tr></thead>
        <tbody>
          {form.fields.map((f, i) => (
            <tr key={f.id}>
              <td>{i + 1}</td>
              <td>{f.label}</td>
              <td>{f.kind}</td>
              <td>{f.required ? "yes" : "no"}</td>
              <td>{f.attributeKey ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Submit action</h2>
      <dl className="forms-meta-grid">
        <div><dt>Kind</dt><dd>{form.submitAction.kind}</dd></div>
        {form.submitAction.redirectUrl && <div><dt>Redirect URL</dt><dd>{form.submitAction.redirectUrl}</dd></div>}
        {form.submitAction.thankYouMessage && <div><dt>Thank-you message</dt><dd>{form.submitAction.thankYouMessage}</dd></div>}
        {form.submitAction.webhookUrl && <div><dt>Webhook URL</dt><dd>{form.submitAction.webhookUrl}</dd></div>}
        {form.submitAction.notifyEmails && form.submitAction.notifyEmails.length > 0 && (
          <div><dt>Notify emails</dt><dd>{form.submitAction.notifyEmails.join(", ")}</dd></div>
        )}
      </dl>
      <h2>Stats</h2>
      <dl className="forms-meta-grid">
        <div><dt>Submissions</dt><dd>{form.submissionCount}</dd></div>
        <div><dt>Created</dt><dd>{new Date(form.createdAt).toISOString().slice(0, 10)}</dd></div>
        {form.publishedAt && <div><dt>Published</dt><dd>{new Date(form.publishedAt).toISOString().slice(0, 10)}</dd></div>}
      </dl>
    </section>
  );
}
