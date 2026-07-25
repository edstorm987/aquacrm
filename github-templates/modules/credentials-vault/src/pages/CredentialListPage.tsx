import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { CREDENTIAL_TYPES, CREDENTIAL_TYPE_LABELS, type CredentialType } from "../lib/domain";

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function CredentialListPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });

  const sp = props.searchParams ?? {};
  const typeRaw = pickStr(sp.type);
  const type = (CREDENTIAL_TYPES as readonly string[]).includes(typeRaw ?? "")
    ? (typeRaw as CredentialType) : undefined;
  const query = pickStr(sp.q);
  const includeArchived = pickStr(sp.archived) === "1";

  const items = await c.vault.list(props.actor, { type, query, includeArchived });

  return (
    <section className="vault-list">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div>
          <h1>Passwords &amp; Access</h1>
          <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>{items.length} credentials in scope</p>
        </div>
        <a href="new" style={{ padding: "6px 12px", background: "var(--brand-primary, #4a6cf7)", color: "white", borderRadius: 6, textDecoration: "none" }}>
          + New credential
        </a>
      </header>

      <nav aria-label="Type filter" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <a href="?" aria-current={!type ? "true" : undefined}
           style={{ padding: "2px 8px", borderRadius: 999, background: !type ? "rgba(0,0,0,0.1)" : "transparent" }}>
          All
        </a>
        {CREDENTIAL_TYPES.map(t => (
          <a key={t} href={`?type=${t}`} aria-current={type === t ? "true" : undefined}
             style={{ padding: "2px 8px", borderRadius: 999, background: type === t ? "rgba(0,0,0,0.1)" : "transparent" }}>
            {CREDENTIAL_TYPE_LABELS[t]}
          </a>
        ))}
      </nav>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Label</th>
            <th style={{ padding: 6 }}>Type</th>
            <th style={{ padding: 6 }}>Username</th>
            <th style={{ padding: 6 }}>Last rotated</th>
            <th style={{ padding: 6 }}>Shared with</th>
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No credentials yet.</td></tr>
          )}
          {items.map(c => (
            <tr key={c.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6 }}><a href={`edit/${c.id}`}>{c.label}</a></td>
              <td style={{ padding: 6 }}>
                <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "rgba(0,0,0,0.06)" }}>
                  {CREDENTIAL_TYPE_LABELS[c.type]}
                </span>
              </td>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 13 }}>{c.username ?? "—"}</td>
              <td style={{ padding: 6, fontSize: 13 }}>
                {c.lastRotated ? new Date(c.lastRotated).toISOString().slice(0, 10) : "—"}
              </td>
              <td style={{ padding: 6, fontSize: 13 }}>{c.sharedWith.length} actor(s)</td>
              <td style={{ padding: 6 }}>
                {c.hasSecret && (
                  <form action={`/api/portal/credentials-vault/view?id=${c.id}`} method="post" style={{ display: "inline" }}>
                    <button type="submit" aria-label={`Reveal password for ${c.label}`}>Copy</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
