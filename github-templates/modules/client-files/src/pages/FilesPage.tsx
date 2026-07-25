import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { CATEGORY_LABELS, FILE_CATEGORIES, type FileCategory } from "../lib/domain";

const AGENCY_ROLES = new Set([
  "agency-owner", "agency-manager", "agency-staff", "freelancer",
]);

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default async function FilesPage(props: PluginPageProps) {
  if (!props.clientId) return <p>Client-files is client-scoped.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });

  const role = (props.install?.config?.role as string | undefined) ?? "agency-owner";
  const isAgency = AGENCY_ROLES.has(role);
  const actor = { userId: props.actor, isAgency };

  const sp = props.searchParams ?? {};
  const catRaw = pickStr(sp.category);
  const category = (FILE_CATEGORIES as readonly string[]).includes(catRaw ?? "")
    ? (catRaw as FileCategory) : undefined;

  const counts = await c.files.categoryCounts(actor);
  const files = await c.files.list(actor, { category });
  const apiBase = "/api/portal/client-files";

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Client files</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {files.length} files{category ? ` in ${CATEGORY_LABELS[category]}` : ""}
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
        <a href="?" aria-current={!category ? "true" : undefined}
           style={{
             padding: 10, borderRadius: 6, textDecoration: "none",
             background: !category ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.04)",
             color: "inherit",
           }}>
          <div style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", textTransform: "uppercase" }}>All</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{counts.reduce((s, c) => s + c.count, 0)}</div>
        </a>
        {counts.map(c => (
          <a key={c.category} href={`?category=${c.category}`}
             aria-current={category === c.category ? "true" : undefined}
             style={{
               padding: 10, borderRadius: 6, textDecoration: "none",
               background: category === c.category ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.04)",
               color: "inherit",
             }}>
            <div style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", textTransform: "uppercase" }}>
              {CATEGORY_LABELS[c.category]}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>
              {c.count} <span style={{ fontSize: 11, color: "rgba(0,0,0,0.5)" }}>· {fmtBytes(c.totalBytes)}</span>
            </div>
          </a>
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Name</th>
            <th style={{ padding: 6 }}>Category</th>
            <th style={{ padding: 6 }}>Size</th>
            <th style={{ padding: 6 }}>Uploaded</th>
            {isAgency && <th style={{ padding: 6 }}>Visible to client</th>}
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {files.length === 0 && (
            <tr><td colSpan={isAgency ? 6 : 5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>
              No files yet.
            </td></tr>
          )}
          {files.map(f => (
            <tr key={f.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6 }}>
                <div style={{ fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)" }}>{f.mimeType} · {f.storage}</div>
              </td>
              <td style={{ padding: 6, fontSize: 13 }}>{CATEGORY_LABELS[f.category]}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{fmtBytes(f.sizeBytes)}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{new Date(f.uploadedAt).toISOString().slice(0, 10)}</td>
              {isAgency && <td style={{ padding: 6, fontSize: 13 }}>{f.visibleToClient ? "✓" : "—"}</td>}
              <td style={{ padding: 6 }}>
                <form action={`${apiBase}/share-link?id=${f.id}`} method="post" style={{ display: "inline" }}>
                  <button type="submit">{f.shareLinkToken ? "Rotate link" : "Share link"}</button>
                </form>
                {isAgency && (
                  <form action={`${apiBase}/delete?id=${f.id}`} method="delete" style={{ display: "inline", marginLeft: 4 }}>
                    <button type="submit" style={{ color: "#a00" }}>Delete</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isAgency && (
        <>
          <h2>Upload reference</h2>
          <p style={{ color: "rgba(0,0,0,0.6)", fontSize: 13 }}>
            v1: paste an external storage reference (S3 key / FS path). Inline
            base64 uploads &lt;2MB go through <code>POST {apiBase}/upload</code>.
          </p>
          <form action={`${apiBase}/upload`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
            <label>Name<input name="name" required /></label>
            <label>Category
              <select name="category" defaultValue="misc">
                {FILE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>
            <label>MIME type<input name="mimeType" defaultValue="application/octet-stream" /></label>
            <label>External storage ref<input name="external.storageRef" /></label>
            <label>Size (bytes)<input name="external.sizeBytes" type="number" min={0} /></label>
            <label><input type="checkbox" name="visibleToClient" /> Visible to client</label>
            <button type="submit">Add reference</button>
          </form>
        </>
      )}
    </section>
  );
}
