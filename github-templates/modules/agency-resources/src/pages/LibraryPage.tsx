import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { KIND_LABELS, RESOURCE_KINDS, type TeamResourceKind } from "../lib/domain";
import type { Role } from "../lib/tenancy";

const VALID_ROLES = new Set<Role>([
  "agency-owner", "agency-manager", "agency-staff", "freelancer",
]);

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function LibraryPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });

  const role = ((props.install?.config?.role as Role | undefined) && VALID_ROLES.has(props.install.config.role as Role))
    ? (props.install.config.role as Role) : "agency-owner";
  const actor = { userId: props.actor, role };

  const sp = props.searchParams ?? {};
  const kindRaw = pickStr(sp.kind);
  const kind = (RESOURCE_KINDS as readonly string[]).includes(kindRaw ?? "")
    ? (kindRaw as TeamResourceKind) : undefined;
  const query = pickStr(sp.q);

  const items = await c.resources.list(actor, { kind, query });
  const apiBase = "/api/portal/agency-resources";

  return (
    <section>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div>
          <h1>Team library</h1>
          <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
            {items.length} resource{items.length === 1 ? "" : "s"}{kind ? ` in ${KIND_LABELS[kind]}` : ""}
          </p>
        </div>
        <a href="new" style={{ padding: "6px 12px", background: "var(--brand-primary, #4a6cf7)", color: "white", borderRadius: 6, textDecoration: "none" }}>
          + New resource
        </a>
      </header>

      <nav aria-label="Kind filter" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        <a href="?" aria-current={!kind ? "true" : undefined}
           style={{ padding: "2px 8px", borderRadius: 999, background: !kind ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.04)" }}>
          All kinds
        </a>
        {RESOURCE_KINDS.map(k => (
          <a key={k} href={`?kind=${k}`} aria-current={kind === k ? "true" : undefined}
             style={{ padding: "2px 8px", borderRadius: 999, background: kind === k ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.04)" }}>
            {KIND_LABELS[k]}
          </a>
        ))}
      </nav>

      <form method="get" style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {kind && <input type="hidden" name="kind" value={kind} />}
        <input name="q" defaultValue={query ?? ""} placeholder="Search title / body / tags…" style={{ flex: 1 }} />
        <button type="submit">Search</button>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Title</th>
            <th style={{ padding: 6 }}>Kind</th>
            <th style={{ padding: 6 }}>Tags</th>
            <th style={{ padding: 6 }}>Views</th>
            <th style={{ padding: 6 }}>Updated</th>
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No resources yet.</td></tr>
          )}
          {items.map(r => (
            <tr key={r.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", opacity: r.archived ? 0.5 : 1 }}>
              <td style={{ padding: 6 }}><a href={`view/${r.slug}`}>{r.title}</a></td>
              <td style={{ padding: 6 }}>{KIND_LABELS[r.kind]}</td>
              <td style={{ padding: 6, fontSize: 12, color: "rgba(0,0,0,0.6)" }}>{r.tags.join(", ")}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{r.viewCount}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{new Date(r.updatedAt).toISOString().slice(0, 10)}</td>
              <td style={{ padding: 6 }}><a href={`edit/${r.id}`}>Edit</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 24, fontSize: 13 }}>
        <a href={`${apiBase}/export`}>Download all as JSON →</a>
      </p>
    </section>
  );
}
