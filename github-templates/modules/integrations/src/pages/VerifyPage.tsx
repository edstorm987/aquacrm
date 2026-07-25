import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function VerifyPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, clientId: props.clientId,
    storage: props.storage, install: props.install,
  });
  const id = pickStr(props.searchParams?.id);
  const integration = id ? await c.integrations.get(id) : null;
  if (!integration) return <section><h1>Verify</h1><p>Integration not found.</p></section>;
  return (
    <section>
      <h1>Verify: {integration.label}</h1>
      <p>
        Status: <strong>{integration.status}</strong>
        {integration.lastVerifiedAt && <> · last attempt {new Date(integration.lastVerifiedAt).toISOString().slice(0, 16).replace("T", " ")}</>}
      </p>
      {integration.lastError && (
        <div style={{ padding: 12, background: "rgba(200,60,60,0.10)", borderRadius: 6, marginTop: 8 }}>
          <strong>Last error:</strong> {integration.lastError}
        </div>
      )}
      <p style={{ marginTop: 16, fontSize: 13, color: "rgba(0,0,0,0.55)" }}>
        Manual verify only in v1 — real verifiers per kind arrive in T6.
        POST <code>/api/portal/integrations/verify?id={integration.id}</code> with{" "}
        <code>{`{ "ok": true }`}</code> or <code>{`{ "ok": false, "message": "..." }`}</code> to record the result.
      </p>
    </section>
  );
}
