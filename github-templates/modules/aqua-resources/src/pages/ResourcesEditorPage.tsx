import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { ALL_PHASES, PHASE_LABELS, RESOURCE_KINDS, type AquaPhase } from "../lib/domain";

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function ResourcesEditorPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });
  const sp = props.searchParams ?? {};
  const phaseRaw = pickStr(sp.phase);
  const phase = (ALL_PHASES as readonly string[]).includes(phaseRaw ?? "")
    ? (phaseRaw as AquaPhase) : undefined;
  const collections = phase
    ? await c.resources.resourcesForPhase(phase)
    : await c.resources.list();
  const apiBase = "/api/portal/aqua-resources";

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Aqua resources</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {collections.length} collection{collections.length === 1 ? "" : "s"}
          {phase ? ` filtered to ${PHASE_LABELS[phase]}` : ""}
        </p>
        <p style={{ marginTop: 8 }}>
          <form action={`${apiBase}/collections/seed`} method="post" style={{ display: "inline" }}>
            <button type="submit">Seed defaults</button>
          </form>
        </p>
      </header>

      <nav aria-label="Phase filter" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <a href="?" aria-current={!phase ? "true" : undefined}
           style={{ padding: "2px 8px", borderRadius: 999, background: !phase ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.04)" }}>
          All phases
        </a>
        {ALL_PHASES.map(p => (
          <a key={p} href={`?phase=${p}`} aria-current={phase === p ? "true" : undefined}
             style={{ padding: "2px 8px", borderRadius: 999, background: phase === p ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.04)" }}>
            {PHASE_LABELS[p]}
          </a>
        ))}
      </nav>

      {collections.length === 0 && (
        <p style={{ color: "rgba(0,0,0,0.5)" }}>No collections in scope. Seed defaults or add one below.</p>
      )}
      {collections.map(c => (
        <article key={c.id} style={{ marginBottom: 24, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, padding: 12 }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <h2 style={{ margin: 0 }}>{c.name} {c.builtIn && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(0,0,0,0.08)" }}>Built-in</span>}</h2>
              {c.description && <p style={{ margin: "4px 0", color: "rgba(0,0,0,0.6)", fontSize: 13 }}>{c.description}</p>}
              <p style={{ margin: 0, fontSize: 11, color: "rgba(0,0,0,0.5)" }}>
                Phase scope: {c.phaseScope.length === 0 ? "all phases" : c.phaseScope.map(p => PHASE_LABELS[p]).join(", ")}
              </p>
            </div>
            {!c.builtIn && (
              <form action={`${apiBase}/collections/delete?id=${c.id}`} method="delete" style={{ display: "inline" }}>
                <button type="submit" style={{ color: "#a00" }}>Delete</button>
              </form>
            )}
          </header>

          <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
            {c.items.length === 0 && <li style={{ color: "rgba(0,0,0,0.5)" }}>No items.</li>}
            {c.items.map(it => (
              <li key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <div>
                  <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "rgba(0,0,0,0.06)", marginRight: 6 }}>{it.kind}</span>
                  <a href={it.ref}>{it.title}</a>
                </div>
                <form action={`${apiBase}/items/remove?collectionId=${c.id}&itemId=${it.id}`} method="delete" style={{ display: "inline" }}>
                  <button type="submit" style={{ color: "#a00" }}>×</button>
                </form>
              </li>
            ))}
          </ul>

          <details style={{ marginTop: 12 }}>
            <summary>Add item</summary>
            <form action={`${apiBase}/items/add?collectionId=${c.id}`} method="post" style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <label>Kind
                <select name="kind" defaultValue="link">
                  {RESOURCE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label>Title<input name="title" required /></label>
              <label>Ref (URL / SOP slug)<input name="ref" required /></label>
              <button type="submit">Add</button>
            </form>
          </details>
        </article>
      ))}

      <h2>New collection</h2>
      <form action={`${apiBase}/collections/create`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>Name<input name="name" required /></label>
        <label>Description<textarea name="description" rows={2} /></label>
        <button type="submit">Create</button>
      </form>
    </section>
  );
}
