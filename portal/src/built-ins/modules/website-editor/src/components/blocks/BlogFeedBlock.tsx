"use client";

// R008 — Blog feed block. Renders the N most recent published posts
// for the current site as cards or a list. Operator picks layout +
// optional filterTag in the editor; the block fetches at runtime
// against `/api/portal/website-editor/blog/posts?status=published`.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";

interface FeedPost {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  coverImg?: string;
  tags: string[];
  publishedAt?: number;
  author?: string;
}

function readTime(post: FeedPost): string {
  const words = (post.excerpt ?? "").split(/\s+/).filter(Boolean).length;
  // Excerpt-derived estimate; real impl would walk body BlockTree.
  // 250 wpm average reading speed.
  const minutes = Math.max(1, Math.round(words / 250));
  return `${minutes} min read`;
}

export default function BlogFeedBlock({ block }: BlockRenderProps) {
  const count = (block.props.count as number | undefined) ?? 6;
  const layout = (block.props.layout as "grid" | "list" | undefined) ?? "grid";
  const filterTag = block.props.filterTag as string | undefined;
  const siteId = block.props.siteId as string | undefined;
  const linkBase = (block.props.linkBase as string | undefined) ?? "/blog";

  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ status: "published", limit: String(count) });
    if (siteId) params.set("siteId", siteId);
    if (filterTag) params.set("tag", filterTag);
    fetch(`/api/portal/website-editor/blog/posts?${params.toString()}`)
      .then(r => r.json() as Promise<{ ok: boolean; posts?: FeedPost[]; error?: string }>)
      .then(data => {
        if (!data.ok) { setError(data.error ?? "request failed"); return; }
        setPosts(data.posts ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [count, filterTag, siteId]);

  if (error) return <div data-block-type="blog-feed" style={{ padding: 24, color: "#fca5a5" }}>{error}</div>;
  if (!posts) return <div data-block-type="blog-feed" style={{ padding: 24, color: "#94a3b8" }}>Loading posts…</div>;
  if (posts.length === 0) return <div data-block-type="blog-feed" style={{ padding: 24, color: "#94a3b8" }}>No posts yet.</div>;

  const containerStyle: React.CSSProperties = layout === "grid"
    ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24, padding: 24 }
    : { display: "flex", flexDirection: "column", gap: 16, padding: 24 };

  return (
    <div data-block-type="blog-feed" data-layout={layout} style={containerStyle}>
      {posts.map(p => (
        <a
          key={p.id}
          href={`${linkBase}/${p.slug}`}
          style={{
            display: "block",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            overflow: "hidden",
            color: "inherit",
            textDecoration: "none",
            ...(layout === "list" ? { display: "flex", gap: 16 } : {}),
          }}
        >
          {p.coverImg && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={p.coverImg} alt="" style={{
              width: layout === "list" ? 180 : "100%",
              height: layout === "list" ? 120 : 160,
              objectFit: "cover",
              flexShrink: 0,
            }} />
          )}
          <div style={{ padding: 16, flex: 1 }}>
            <h3 style={{ fontSize: 18, margin: "0 0 8px 0" }}>{p.title}</h3>
            {p.excerpt && (
              <p style={{ fontSize: 14, lineHeight: 1.5, color: "#cbd5e1", margin: "0 0 10px 0" }}>
                {p.excerpt}
              </p>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
              {p.tags.slice(0, 3).map(t => (
                <span key={t} style={{
                  background: "rgba(56,189,248,0.12)",
                  color: "#7dd3fc",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}>{t}</span>
              ))}
              <span style={{ color: "#64748b", marginLeft: "auto" }}>{readTime(p)}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
