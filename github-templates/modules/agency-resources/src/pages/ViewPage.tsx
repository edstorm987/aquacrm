import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { KIND_LABELS } from "../lib/domain";
import type { Role } from "../lib/tenancy";

const VALID_ROLES = new Set<Role>([
  "agency-owner", "agency-manager", "agency-staff", "freelancer",
]);

export default async function ViewPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });

  const role = ((props.install?.config?.role as Role | undefined) && VALID_ROLES.has(props.install.config.role as Role))
    ? (props.install.config.role as Role) : "agency-owner";
  const actor = { userId: props.actor, role };

  const slug = props.segments[1];
  if (!slug) return <p>Resource slug required.</p>;
  const resource = await c.resources.getBySlug(actor, slug);
  if (!resource) return <p>Not found.</p>;

  const apiBase = "/api/portal/agency-resources";

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <a href="../">← Library</a>
        <h1 style={{ marginTop: 8 }}>{resource.title}</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {KIND_LABELS[resource.kind]} · {resource.viewCount} view{resource.viewCount === 1 ? "" : "s"}
          {resource.tags.length > 0 && ` · tags: ${resource.tags.join(", ")}`}
        </p>
        <form action={`${apiBase}/view?id=${resource.id}`} method="post" style={{ display: "inline-block", marginTop: 8 }}>
          <button type="submit">Mark viewed</button>
        </form>
        {" "}<a href={`../edit/${resource.id}`}>Edit →</a>
      </header>

      <article style={{ maxWidth: 720, fontFamily: "ui-sans-serif, system-ui", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {resource.body || <em style={{ color: "rgba(0,0,0,0.4)" }}>(no body yet)</em>}
      </article>
    </section>
  );
}
