import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { TAG_FAMILIES, TAG_FAMILY_LABELS } from "../lib/domain";
import type { SopFilter, TagFamily } from "../lib/domain";

export default async function SopListPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });

  const sp = props.searchParams ?? {};
  const tagParam = typeof sp.tag === "string" ? sp.tag : undefined;
  const statusParam = typeof sp.status === "string" ? sp.status : undefined;
  const queryParam = typeof sp.q === "string" ? sp.q : undefined;
  const tag = (TAG_FAMILIES as string[]).includes(tagParam ?? "")
    ? (tagParam as TagFamily) : undefined;
  const filter: SopFilter = {
    tag,
    status: (statusParam ?? undefined) as SopFilter["status"],
    query: queryParam,
  };
  const sops = await c.sops.list(filter);
  const counts = await c.sops.tagCounts();

  return (
    <section className="sops-list">
      <header>
        <h1>SOPs, Docs &amp; Templates</h1>
        <p>{sops.length} matching · agency-scope</p>
      </header>

      <div className="sops-layout" style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
        <aside className="sops-filters">
          <h2>Tag families</h2>
          <ul>
            <li>
              <a href="?">All families ({TAG_FAMILIES.reduce((sum, t) => sum + (counts[t] ?? 0), 0)})</a>
            </li>
            {TAG_FAMILIES.map(t => (
              <li key={t}>
                <a href={`?tag=${t}`}>{TAG_FAMILY_LABELS[t]} ({counts[t]})</a>
              </li>
            ))}
          </ul>

          <h2>Status</h2>
          <ul>
            <li><a href={`?${tag ? `tag=${tag}&` : ""}status=draft`}>Drafts</a></li>
            <li><a href={`?${tag ? `tag=${tag}&` : ""}status=published`}>Published</a></li>
            <li><a href={`?${tag ? `tag=${tag}&` : ""}status=archived`}>Archived</a></li>
          </ul>

          <h2>Search</h2>
          <form method="get">
            {tag && <input type="hidden" name="tag" value={tag} />}
            <input type="text" name="q" placeholder="Title contains…" defaultValue={queryParam ?? ""} />
            <button type="submit">Filter</button>
          </form>

          <p className="sops-cta">
            <a href="new">+ New SOP</a>
          </p>
        </aside>

        <ul className="sops-rows">
          {sops.length === 0 && <li className="sops-empty">No SOPs match — try clearing filters or seeding placeholders.</li>}
          {sops.map(s => (
            <li key={s.id} className={`sops-row sops-${s.status}`}>
              <a href={`edit/${s.id}`}>
                <strong>{s.title}</strong>
              </a>
              {" "}
              <span className="sops-status">{s.status}</span>
              <ul className="sops-tags" style={{ display: "inline" }}>
                {s.tags.map(t => (
                  <li key={t} style={{ display: "inline" }}>
                    <small>{TAG_FAMILY_LABELS[t]}</small>
                  </li>
                ))}
              </ul>
              <small className="sops-updated"> · updated {new Date(s.updatedAt).toISOString().slice(0, 10)}</small>
              {" · "}
              <a href={`read/${s.slug}`}>read</a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
