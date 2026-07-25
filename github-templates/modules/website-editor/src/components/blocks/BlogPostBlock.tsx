"use client";

// R008 — Single blog post renderer. Reads the slug from the
// `slug` prop (or the URL path `/blog/<slug>` when `slug` is
// "auto") and fetches the post body BlockTree via
// `/blog/posts/by-slug`.
//
// Body is rendered via the host site's BlockRenderer — but since
// the storefront block-renderer is itself the consumer of this
// block, we lean on the recursive renderer the website-editor
// already exposes (`renderBlocks`) by re-emitting the body via a
// nested `<RenderTree>` import. To keep this file self-contained
// and compile cleanly in plugin scope (where we don't import the
// storefront's `BlockRenderer`), we render the body as
// `<BlockRenderer>` only when one is injected via the
// optional global `__aquaRenderBlocks` (set by the host page).
// Otherwise we fall back to a JSON dump fenced as a debug
// block — host pages always inject the renderer in production.

import { useEffect, useMemo, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import type { Block } from "../../types/block";

interface PostShape {
  id: string;
  slug: string;
  title: string;
  body: Block[];
  excerpt?: string;
  coverImg?: string;
  tags: string[];
  author?: string;
  publishedAt?: number;
}

declare global {
  interface Window {
    __aquaRenderBlocks?: (blocks: Block[]) => React.ReactNode;
  }
}

export default function BlogPostBlock({ block }: BlockRenderProps) {
  const slugProp = (block.props.slug as string | undefined) ?? "auto";
  const siteId = block.props.siteId as string | undefined;

  const slug = useMemo(() => {
    if (slugProp !== "auto") return slugProp;
    if (typeof window === "undefined") return "";
    const path = window.location.pathname.replace(/\/$/, "");
    const last = path.split("/").pop() ?? "";
    return last;
  }, [slugProp]);

  const [post, setPost] = useState<PostShape | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) { setError("no slug — set `slug` prop or render under /blog/[slug]"); return; }
    const params = new URLSearchParams({ slug });
    if (siteId) params.set("siteId", siteId);
    fetch(`/api/portal/website-editor/blog/posts/by-slug?${params.toString()}`)
      .then(r => r.json() as Promise<{ ok: boolean; post?: PostShape; error?: string }>)
      .then(data => {
        if (!data.ok || !data.post) { setError(data.error ?? "post not found"); return; }
        setPost(data.post);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [slug, siteId]);

  if (error) return <div data-block-type="blog-post" style={{ padding: 24, color: "#fca5a5" }}>{error}</div>;
  if (!post) return <div data-block-type="blog-post" style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>;

  const date = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "";

  const renderTree = typeof window !== "undefined" ? window.__aquaRenderBlocks : undefined;

  return (
    <article data-block-type="blog-post" style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>
      {post.coverImg && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={post.coverImg} alt="" style={{
          width: "100%", borderRadius: 12, marginBottom: 24,
          maxHeight: 420, objectFit: "cover",
        }} />
      )}
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {post.tags.map(t => (
            <span key={t} style={{
              background: "rgba(56,189,248,0.12)", color: "#7dd3fc",
              padding: "2px 8px", borderRadius: 999, fontSize: 11,
            }}>{t}</span>
          ))}
        </div>
        <h1 style={{ fontSize: 36, lineHeight: 1.2, margin: "0 0 8px 0" }}>{post.title}</h1>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          {post.author && <span>{post.author}</span>}
          {post.author && date && <span> · </span>}
          {date && <span>{date}</span>}
        </div>
        {post.excerpt && (
          <p style={{ marginTop: 16, fontSize: 17, lineHeight: 1.5, color: "#cbd5e1" }}>{post.excerpt}</p>
        )}
      </header>
      <div style={{ fontSize: 16, lineHeight: 1.7 }}>
        {renderTree
          ? renderTree(post.body)
          : <pre style={{ fontSize: 11, color: "#64748b", whiteSpace: "pre-wrap" }}>
              {/* Host page must inject window.__aquaRenderBlocks for full render */}
              {JSON.stringify(post.body, null, 2)}
            </pre>}
      </div>
    </article>
  );
}
