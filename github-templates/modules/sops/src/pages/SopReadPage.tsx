import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { renderMarkdown } from "../server/markdown";
import { TAG_FAMILY_LABELS } from "../lib/domain";

// Read-only SOP render for staff. v1 has no per-tag perm gating —
// Employee HQ wires `sops.tag.<family>` keys later (see chapter §11).
export default async function SopReadPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });

  const slug = props.segments?.[1];
  const sop = slug ? await c.sops.getBySlug(slug) : null;
  if (!sop) {
    return (
      <section className="sops-read sops-not-found">
        <h1>SOP not found</h1>
        <p><a href="../..">← Back to SOP shelf</a></p>
      </section>
    );
  }

  return (
    <section className="sops-read">
      <header>
        <h1>{sop.title}</h1>
        <p>
          {sop.tags.map(t => (
            <small key={t} className="sops-tag">{TAG_FAMILY_LABELS[t]} </small>
          ))}
          · status: {sop.status}
          · updated {new Date(sop.updatedAt).toISOString().slice(0, 10)}
        </p>
        <p><a href="../..">← Back to SOP shelf</a></p>
      </header>
      <article
        className="sops-rendered"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(sop.body) }}
      />
    </section>
  );
}
