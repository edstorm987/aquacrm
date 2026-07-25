import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function SubmissionsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage, install: props.install });
  const [submissions, forms] = await Promise.all([c.submissions.list(), c.forms.list()]);
  const formById = new Map(forms.map(f => [f.id, f]));
  return (
    <section className="forms-submissions">
      <header><h1>Submissions</h1><p>{submissions.length} total.</p></header>
      <ul className="forms-grid">
        {submissions.map(s => {
          const form = formById.get(s.formId);
          const fieldList = form?.fields ?? [];
          return (
            <li key={s.id}>
              <article>
                <header>
                  <h3>{form?.name ?? s.formId}</h3>
                  <span className={`forms-pill forms-pill-sub-${s.status}`}>{s.status}</span>
                </header>
                <p className="forms-meta">{new Date(s.meta.submittedAt).toISOString()}</p>
                <dl className="forms-meta-grid">
                  {fieldList.filter(f => f.kind !== "hidden").map(f => {
                    const v = s.values[f.id];
                    if (v === undefined) return null;
                    const display = Array.isArray(v) ? v.join(", ") : v;
                    return <div key={f.id}><dt>{f.label}</dt><dd>{display}</dd></div>;
                  })}
                </dl>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
