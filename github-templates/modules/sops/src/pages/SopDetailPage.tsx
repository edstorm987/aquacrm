import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { renderMarkdown } from "../server/markdown";
import { TAG_FAMILIES, TAG_FAMILY_LABELS } from "../lib/domain";

// Edit / new SOP detail. Split view: textarea left, rendered preview right.
export default async function SopDetailPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });

  const id = props.segments?.[1];
  const sop = id ? await c.sops.get(id) : null;
  const isNew = !sop;
  const title = sop?.title ?? "";
  const body = sop?.body ?? "";
  const tags = sop?.tags ?? [];
  const status = sop?.status ?? "draft";

  return (
    <section className="sops-detail">
      <header>
        <h1>{isNew ? "New SOP" : `Edit — ${title}`}</h1>
        <p><a href="..">← Back to SOP shelf</a></p>
      </header>

      <form
        className="sops-editor"
        method="post"
        action={isNew ? "/api/portal/sops/create" : "/api/portal/sops/update"}
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
      >
        {!isNew && <input type="hidden" name="id" value={sop!.id} />}

        <div className="sops-edit">
          <label>
            Title
            <input type="text" name="title" defaultValue={title} required />
          </label>

          <fieldset>
            <legend>Tag families</legend>
            {TAG_FAMILIES.map(t => (
              <label key={t} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  name="tags"
                  value={t}
                  defaultChecked={tags.includes(t)}
                />
                {" "}{TAG_FAMILY_LABELS[t]}
              </label>
            ))}
          </fieldset>

          <label>
            Status
            <select name="status" defaultValue={status}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <label>
            Body (markdown)
            <textarea name="body" rows={24} defaultValue={body} />
          </label>

          <div className="sops-actions">
            <button type="submit">Save</button>
            {!isNew && (
              <a className="sops-archive" href={`/api/portal/sops/archive?id=${sop!.id}`}>Archive</a>
            )}
          </div>
        </div>

        <aside className="sops-preview">
          <h2>Preview</h2>
          <article
            className="sops-rendered"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
          />
        </aside>
      </form>
    </section>
  );
}
