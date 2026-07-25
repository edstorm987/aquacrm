import type { PluginPageProps } from "../lib/aquaPluginTypes";
import type { ActivityCategory } from "../lib/tenancy";
import { containerFor } from "../server/foundationAdapter";
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  type DateRangePreset,
  type InboxFilter,
} from "../lib/domain";

const VALID_RANGES: DateRangePreset[] = ["today", "week", "month", "all"];

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
function pickArr(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function InboxPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });

  const sp = props.searchParams ?? {};
  const rangeRaw = pickStr(sp.range);
  const range = (VALID_RANGES as string[]).includes(rangeRaw ?? "")
    ? (rangeRaw as DateRangePreset) : "today";
  const cats = pickArr(sp.category)
    .filter(c => (ALL_CATEGORIES as readonly string[]).includes(c)) as ActivityCategory[];
  const clients = pickArr(sp.clientId);
  const unreadOnly = pickStr(sp.unread) === "1";
  const query = pickStr(sp.q);
  const detailId = pickStr(sp.detail);

  const filter: InboxFilter = {
    range,
    categories: cats.length ? cats : undefined,
    clientIds: clients.length ? clients : undefined,
    unreadOnly,
    query,
    limit: 500,
  };

  const result = await c.inbox.list(props.actor, filter);
  const detail = detailId ? result.items.find(i => i.id === detailId) ?? null : null;

  const baseQS = (overrides: Record<string, string | undefined> = {}): string => {
    const params = new URLSearchParams();
    if (range && range !== "today") params.set("range", range);
    for (const cat of cats) params.append("category", cat);
    for (const cid of clients) params.append("clientId", cid);
    if (unreadOnly) params.set("unread", "1");
    if (query) params.set("q", query);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <section className="activity-inbox">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div>
          <h1>Inbox</h1>
          <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
            {result.items.length} events · {result.unreadCount} unread · scanned {result.totalScanned}
          </p>
        </div>
        <form action="/api/portal/activity-inbox/mark-read" method="post">
          <button type="submit">Mark all read</button>
        </form>
      </header>

      <nav aria-label="Filters" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <strong style={{ alignSelf: "center" }}>Range:</strong>
        {VALID_RANGES.map(r => (
          <a key={r} href={baseQS({ range: r === "today" ? undefined : r })}
             aria-current={range === r ? "true" : undefined}
             style={{ padding: "2px 8px", borderRadius: 999, background: range === r ? "rgba(0,0,0,0.1)" : "transparent" }}>
            {r}
          </a>
        ))}
        <a href={baseQS({ unread: unreadOnly ? undefined : "1" })}
           aria-current={unreadOnly ? "true" : undefined}
           style={{ padding: "2px 8px", borderRadius: 999, background: unreadOnly ? "rgba(0,0,0,0.1)" : "transparent" }}>
          Unread only
        </a>
      </nav>

      <nav aria-label="Categories" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {ALL_CATEGORIES.map(cat => {
          const active = cats.includes(cat);
          const next = active ? cats.filter(c => c !== cat) : [...cats, cat];
          const params = new URLSearchParams();
          if (range !== "today") params.set("range", range);
          for (const c of next) params.append("category", c);
          for (const cid of clients) params.append("clientId", cid);
          if (unreadOnly) params.set("unread", "1");
          if (query) params.set("q", query);
          const href = `?${params.toString()}`;
          return (
            <a key={cat} href={href} aria-current={active ? "true" : undefined}
               style={{
                 padding: "2px 8px", borderRadius: 999, fontSize: 12,
                 background: active ? "var(--brand-primary, #333)" : "rgba(0,0,0,0.06)",
                 color: active ? "white" : "inherit",
               }}>
              {CATEGORY_LABELS[cat]}
            </a>
          );
        })}
      </nav>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 1.2fr)", gap: 16 }}>
        <ol aria-label="Activity timeline" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {result.groups.length === 0 && (
            <li style={{ color: "rgba(0,0,0,0.5)" }}>No activity matches these filters.</li>
          )}
          {result.groups.map(group => (
            <li key={`${group.day}-${group.clientId ?? "_agency"}`} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, textTransform: "uppercase", color: "rgba(0,0,0,0.5)", margin: "8px 0" }}>
                {group.day} · {group.clientId ?? "Agency"}
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {group.items.map(item => {
                  const href = baseQS({ detail: item.id });
                  return (
                    <li key={item.id}>
                      <a href={href}
                         aria-current={detailId === item.id ? "true" : undefined}
                         style={{
                           display: "block", padding: "6px 8px", borderRadius: 6,
                           background: detailId === item.id ? "rgba(0,0,0,0.08)" : "transparent",
                           fontWeight: item.read ? 400 : 600,
                         }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, marginRight: 8,
                                       background: item.read ? "transparent" : "var(--brand-primary, #4a6cf7)",
                                       border: item.read ? "1px solid rgba(0,0,0,0.2)" : "none" }} aria-hidden="true" />
                        <span style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", marginRight: 6 }}>
                          [{CATEGORY_LABELS[item.category]}]
                        </span>
                        {item.message}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>

        <aside aria-label="Event detail" style={{ borderLeft: "1px solid rgba(0,0,0,0.08)", paddingLeft: 16 }}>
          {!detail && (
            <p style={{ color: "rgba(0,0,0,0.5)" }}>Select an event from the timeline to see details.</p>
          )}
          {detail && (
            <article>
              <h2 style={{ marginTop: 0 }}>{detail.message}</h2>
              <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", fontSize: 13 }}>
                <dt>Category</dt><dd>{CATEGORY_LABELS[detail.category]}</dd>
                <dt>Action</dt><dd><code>{detail.action}</code></dd>
                <dt>When</dt><dd>{new Date(detail.ts).toISOString()}</dd>
                <dt>Client</dt><dd>{detail.clientId ?? <em>agency</em>}</dd>
                <dt>Actor</dt><dd>{detail.actorEmail ?? detail.actorUserId ?? <em>system</em>}</dd>
                <dt>Read</dt><dd>{detail.read ? "yes" : "no"}</dd>
              </dl>
              {detail.metadata && (
                <details style={{ marginTop: 12 }}>
                  <summary>Payload</summary>
                  <pre style={{ background: "rgba(0,0,0,0.04)", padding: 8, borderRadius: 4, overflow: "auto" }}>
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                </details>
              )}
              {detail.clientId && (
                <p style={{ marginTop: 12 }}>
                  <a href={`/portal/clients/${detail.clientId}`}>Jump to client →</a>
                </p>
              )}
            </article>
          )}
        </aside>
      </div>
    </section>
  );
}
