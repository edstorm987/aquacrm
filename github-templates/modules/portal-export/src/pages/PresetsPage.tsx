import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function PresetsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const presets = c.presets.list();
  return (
    <section className="portal-export-presets">
      <header>
        <h1>Preset portals</h1>
        <p>{presets.length} v1 starter templates. Read-only — pick one in Export.</p>
      </header>
      <ul className="portal-export-preset-list">
        {presets.map(p => (
          <li key={p.id}>
            <h2 style={{ borderLeft: `4px solid ${p.icon ?? "#ccc"}`, paddingLeft: "0.5rem" }}>{p.label}</h2>
            <p>{p.description}</p>
            <dl className="portal-export-meta-grid">
              <div><dt>Plugins</dt><dd>{p.installedPlugins.join(", ")}</dd></div>
              <div><dt>Variants</dt><dd>{Object.entries(p.portalVariants).map(([r, v]) => `${r}: ${v}`).join(" · ")}</dd></div>
              <div><dt>Pages</dt><dd>{p.starterContent.pages.length}</dd></div>
              <div><dt>Recommended phase</dt><dd>{p.recommendedPhase}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
