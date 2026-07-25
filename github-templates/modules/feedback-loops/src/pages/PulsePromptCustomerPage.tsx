import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";

// Customer-side pulse prompt — surfaces the most recent outstanding
// pulse for the viewing customer (or a "no open pulses" empty state).
// Slider 1-10 + comment textarea. POST to /api/portal/feedback-loops/pulses/respond?id=<id>
export default async function PulsePromptCustomerPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage });
  if (!c) return <section style={{ padding: 16 }}><p>No pulse available.</p></section>;
  const outstanding = (await c.pulses.list({ responded: false }));
  const next = outstanding[0];

  if (!next) {
    return (
      <section style={{ padding: 16 }} data-block="pulse-prompt" data-state="empty">
        <p style={{ color: "#888" }}>No pulses are waiting for a response right now.</p>
      </section>
    );
  }

  return (
    <section style={{ padding: 16, display: "grid", gap: 12 }} data-block="pulse-prompt" data-pulse-id={next.id}>
      <h2 style={{ margin: 0 }}>How are we doing?</h2>
      <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
        Score 1-10 — 10 means everything's brilliant, 1 means we need to talk.
      </p>
      <form data-pulse-form={next.id} style={{ display: "grid", gap: 8 }}>
        <input type="range" name="score" min={1} max={10} step={1} defaultValue={8} aria-label="Pulse score" />
        <textarea name="comment" rows={3} placeholder="Anything to add? (optional)" />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}
