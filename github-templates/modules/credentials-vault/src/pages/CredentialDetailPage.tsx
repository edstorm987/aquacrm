import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { CREDENTIAL_TYPES, CREDENTIAL_TYPE_LABELS } from "../lib/domain";

export default async function CredentialDetailPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });

  const idFromSegment = props.segments[1]; // segments: ["edit", ":id"] | ["new"]
  const isNew = props.segments[0] === "new";
  const existing = idFromSegment ? await c.vault.get(props.actor, idFromSegment) : null;
  const apiBase = "/api/portal/credentials-vault";
  const action = isNew ? `${apiBase}/create` : `${apiBase}/update?id=${idFromSegment}`;
  const method = isNew ? "post" : "patch";

  return (
    <section className="vault-detail">
      <header style={{ marginBottom: 16 }}>
        <a href="../">← All credentials</a>
        <h1>{isNew ? "New credential" : existing?.label ?? "Edit credential"}</h1>
      </header>

      <form action={action} method={method} style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <label>
          Label
          <input name="label" required defaultValue={existing?.label ?? ""} style={{ width: "100%" }} />
        </label>
        <label>
          Type
          <select name="type" defaultValue={existing?.type ?? "login"}>
            {CREDENTIAL_TYPES.map(t => (
              <option key={t} value={t}>{CREDENTIAL_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label>
          URL
          <input name="url" type="url" defaultValue={existing?.url ?? ""} style={{ width: "100%" }} />
        </label>
        <label>
          Username
          <input name="username" defaultValue={existing?.username ?? ""} style={{ width: "100%" }} />
        </label>
        <label>
          Password / secret
          <input name="password" type="password" placeholder={isNew ? "" : "(unchanged — leave blank)"} style={{ width: "100%" }} />
        </label>
        <label>
          Notes
          <textarea name="notes" rows={4} defaultValue={existing?.notes ?? ""} style={{ width: "100%" }} />
        </label>
        <label>
          Shared with (comma-separated user ids)
          <input name="sharedWith" defaultValue={existing?.sharedWith.join(", ") ?? ""} style={{ width: "100%" }} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit">{isNew ? "Create" : "Save"}</button>
          {!isNew && existing && (
            <form action={`${apiBase}/archive?id=${existing.id}`} method="delete" style={{ display: "inline" }}>
              <button type="submit" style={{ color: "#a00" }}>Archive</button>
            </form>
          )}
        </div>
      </form>

      {existing?.hasSecret && (
        <div style={{ marginTop: 24 }}>
          <h2>Reveal password</h2>
          <p style={{ color: "rgba(0,0,0,0.6)" }}>
            Reveals are rate-limited (10/min) and write a <code>credential.viewed</code> event to the activity log.
          </p>
          <form action={`${apiBase}/view?id=${existing.id}`} method="post">
            <button type="submit">Reveal password</button>
          </form>
        </div>
      )}
    </section>
  );
}
