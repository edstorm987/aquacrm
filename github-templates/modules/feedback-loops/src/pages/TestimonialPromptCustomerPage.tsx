import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";

// Customer-side testimonial prompt — surfaces the most recent pending
// testimonial request for the viewing customer (or empty state).
// Single textarea + reply button. POST to /api/portal/feedback-loops/testimonials/reply?id=<id>
export default async function TestimonialPromptCustomerPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage });
  if (!c) return <section style={{ padding: 16 }}><p>No testimonial requests.</p></section>;
  const pending = (await c.testimonials.list({ status: "pending" }));
  const next = pending[0];

  if (!next) {
    return (
      <section style={{ padding: 16 }} data-block="testimonial-prompt" data-state="empty">
        <p style={{ color: "#888" }}>No testimonial requests are open right now.</p>
      </section>
    );
  }

  return (
    <section style={{ padding: 16, display: "grid", gap: 12 }} data-block="testimonial-prompt" data-testimonial-id={next.id}>
      <h2 style={{ margin: 0 }}>Share your story</h2>
      <p style={{ color: "#666", fontSize: 14, margin: 0 }}>{next.prompt}</p>
      <form data-testimonial-form={next.id} style={{ display: "grid", gap: 8 }}>
        <textarea name="reply" rows={5} required placeholder="Write a sentence or two — we'll only publish with your approval." />
        <button type="submit">Reply</button>
      </form>
    </section>
  );
}
