import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function PreSalesBoardPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });
  const calls = await c.calls.list();
  const proposals = await c.proposals.list();
  const upcoming = calls.filter(c => c.outcome === "scheduled" && c.scheduledAt > Date.now());
  const sentProposals = proposals.filter(p => p.status === "sent");

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Pre-sales HQ</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {upcoming.length} upcoming call{upcoming.length === 1 ? "" : "s"} · {sentProposals.length} live proposal{sentProposals.length === 1 ? "" : "s"}
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(200px, 1fr))", gap: 12 }}>
        <a href="calls" style={{ padding: 12, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, textDecoration: "none", color: "inherit" }}>
          <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", textTransform: "uppercase" }}>Discovery calls</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{upcoming.length}</div>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>upcoming</div>
        </a>
        <a href="proposals" style={{ padding: 12, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, textDecoration: "none", color: "inherit" }}>
          <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", textTransform: "uppercase" }}>Proposals sent</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{sentProposals.length}</div>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>awaiting decision</div>
        </a>
        <a href="nurture" style={{ padding: 12, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, textDecoration: "none", color: "inherit" }}>
          <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", textTransform: "uppercase" }}>Nurture loop</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>—</div>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>provide leadIds</div>
        </a>
      </div>

      <p style={{ color: "rgba(0,0,0,0.5)", fontSize: 13, marginTop: 24 }}>
        v1: kanban-board view of leads is rendered by <code>@aqua/plugin-kanban</code> with the
        lead-pipeline template. This page surfaces the per-lead context (calls / proposals / nurture)
        beside it. R+1 wires both into a single split view.
      </p>
    </section>
  );
}
