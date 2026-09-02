"use client";

// R008 — Single published blog-post renderer. The host renderer supplies the
// exact tenant/site context and its recursive renderChildren function. Draft
// previews stay inert; a published mount reads only the narrow visitor facade.

import { useEffect, useMemo, useState } from "react";
import { formatUkDate } from "../../lib/safeDate";
import type { BlockRenderProps } from "../blockRegistry";
import type { Block } from "../../types/block";
import { isSafeBlogPostBody } from "../../lib/blogPostBody";

interface PostShape {
  slug: string;
  title: string;
  body: Block[];
  excerpt?: string;
  coverImg?: string;
  tags: string[];
  author?: string;
  publishedAt?: number;
}

interface BlogPostReply {
  ok?: unknown;
  post?: unknown;
  error?: unknown;
}

function parsePost(value: unknown): PostShape | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.slug !== "string" || typeof row.title !== "string") return null;
  if (!isSafeBlogPostBody(row.body) || !Array.isArray(row.tags) || !row.tags.every(tag => typeof tag === "string")) return null;
  if (row.publishedAt !== undefined && (typeof row.publishedAt !== "number" || !Number.isFinite(row.publishedAt))) return null;
  return {
    slug: row.slug,
    title: row.title,
    body: row.body as Block[],
    tags: row.tags,
    ...(typeof row.excerpt === "string" ? { excerpt: row.excerpt } : {}),
    ...(typeof row.coverImg === "string" ? { coverImg: row.coverImg } : {}),
    ...(typeof row.author === "string" ? { author: row.author } : {}),
    ...(typeof row.publishedAt === "number" ? { publishedAt: row.publishedAt } : {}),
  };
}

export default function BlogPostBlock({ block, context, editorMode, renderChildren }: BlockRenderProps) {
  const slugProp = (block.props.slug as string | undefined) ?? "auto";
  const agencyId = context?.agencyId;
  const clientId = context?.clientId;
  const siteId = context?.siteId;
  const publishedWebsite = context?.publishedWebsite === true;

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
    if (editorMode || !publishedWebsite || !agencyId || !clientId || !siteId) {
      setPost(null);
      setError("This post is available on the published page.");
      return;
    }
    if (!slug) {
      setPost(null);
      setError("Choose a blog post slug or publish this block under /blog/[slug].");
      return;
    }

    const controller = new AbortController();
    setPost(null);
    setError(null);
    const params = new URLSearchParams({ agencyId, clientId, siteId, slug });
    fetch(`/api/portal/website-editor/public/blog/posts/by-slug?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async response => {
        let data: BlogPostReply | null = null;
        try { data = await response.json() as BlogPostReply; }
        catch { /* A non-JSON response is a failed visitor read. */ }
        return { response, data };
      })
      .then(({ response, data }) => {
        if (controller.signal.aborted) return;
        const next = response.ok && data?.ok === true ? parsePost(data.post) : null;
        if (!next) {
          setError(typeof data?.error === "string" ? data.error : "Post not found.");
          return;
        }
        setPost(next);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setError("This post could not be loaded. Please try again.");
      });
    return () => controller.abort();
  }, [agencyId, clientId, editorMode, publishedWebsite, siteId, slug]);

  if (error) return <div data-block-type="blog-post" style={{ padding: 24, color: "#fca5a5" }}>{error}</div>;
  if (!post) return <div data-block-type="blog-post" style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>;
  if (!renderChildren) return <div data-block-type="blog-post" style={{ padding: 24, color: "#fca5a5" }}>Post renderer unavailable.</div>;

  const date = post.publishedAt
    ? formatUkDate(post.publishedAt, { year: "numeric", month: "short", day: "numeric" })
    : "";

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
        {renderChildren(post.body)}
      </div>
    </article>
  );
}
