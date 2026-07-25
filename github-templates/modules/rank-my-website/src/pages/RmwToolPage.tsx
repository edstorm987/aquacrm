import type { PluginPageProps } from "../lib/aquaPluginTypes";

// Public-facing tool surface. Renders the URL input form; on submit
// the page-side script POSTs to /api/portal/rank-my-website/run,
// renders the report, then a second form posts /capture w/ email.
// Server-rendered shell only — the interactive bits are progressively
// enhanced by foundation script (out of scope here).
export default function RmwToolPage(_props: PluginPageProps) {
  return (
    <article style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Rank my website</h1>
        <p style={{ color: "#666", marginTop: 8 }}>
          Honest A-F bands. No fabricated numbers — just what we can actually see from the page.
        </p>
      </header>

      <form data-rmw-form="run" style={{ display: "grid", gap: 12 }}>
        <label>
          Website URL
          <input type="url" name="url" required placeholder="https://your-site.com"
                 style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} />
        </label>
        <button type="submit">Run diagnostic</button>
      </form>

      <section data-rmw-results aria-live="polite" style={{ marginTop: 24 }} />

      <p style={{ color: "#888", fontSize: 13, marginTop: 32 }}>
        We won't share your details. Email is captured only when you ask for the full report drop into Business OS.
      </p>
    </article>
  );
}
