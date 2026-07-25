import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { ALL_VISIBLE_ROLES, KIND_LABELS, RESOURCE_KINDS } from "../lib/domain";
import type { Role } from "../lib/tenancy";

const VALID_ROLES = new Set<Role>([
  "agency-owner", "agency-manager", "agency-staff", "freelancer",
]);

export default async function EditorPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });

  const role = ((props.install?.config?.role as Role | undefined) && VALID_ROLES.has(props.install.config.role as Role))
    ? (props.install.config.role as Role) : "agency-owner";
  const actor = { userId: props.actor, role };

  const idFromSegment = props.segments[1]; // segments: ["edit", ":id"] | ["new"]
  const isNew = props.segments[0] === "new";
  const existing = idFromSegment ? await c.resources.get(actor, idFromSegment) : null;
  const apiBase = "/api/portal/agency-resources";
  const action = isNew ? `${apiBase}/create` : `${apiBase}/update?id=${idFromSegment}`;
  const method = isNew ? "post" : "patch";

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <a href="../">← Library</a>
        <h1>{isNew ? "New resource" : existing?.title ?? "Edit resource"}</h1>
      </header>

      <form action={action} method={method} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <label>
          Title<input name="title" required defaultValue={existing?.title ?? ""} style={{ width: "100%" }} />
        </label>
        <label>
          Kind
          <select name="kind" defaultValue={existing?.kind ?? "sop"}>
            {RESOURCE_KINDS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
        </label>
        <label>
          Tags (comma-separated)
          <input name="tags" defaultValue={existing?.tags.join(", ") ?? ""} style={{ width: "100%" }} />
        </label>
        <fieldset>
          <legend>Visible to roles (none checked = all agency staff)</legend>
          {ALL_VISIBLE_ROLES.map(r => (
            <label key={r} style={{ display: "inline-block", marginRight: 12 }}>
              <input type="checkbox" name="visibleToRoles" value={r}
                     defaultChecked={existing?.visibleToRoles.includes(r) ?? false} /> {r}
            </label>
          ))}
        </fieldset>
        <label>
          Body (markdown)
          <textarea name="body" rows={20} defaultValue={existing?.body ?? ""} style={{ width: "100%", fontFamily: "monospace" }} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit">{isNew ? "Create" : "Save"}</button>
          {!isNew && existing && !existing.archived && (
            <form action={`${apiBase}/update?id=${existing.id}`} method="patch" style={{ display: "inline" }}>
              <input type="hidden" name="archived" value="true" />
              <button type="submit" style={{ color: "#a00" }}>Archive</button>
            </form>
          )}
        </div>
      </form>
    </section>
  );
}
