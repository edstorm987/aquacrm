"use client";
// In-app markdown renderer for Dev Docs (Phase 2) — the STABLE entry point.
// Imported by the agency Dev Docs viewer and the Dev Team Library viewer; the
// exported name and props are part of that contract, so they don't change.
//
// The renderer itself (react-markdown + remark-gfm, ~large) lives in
// `_DocMarkdownBody` and is pulled in with `next/dynamic` so it lands in its own
// chunk rather than the initial JS of every docs route. Markdown only renders
// once a user opens a specific doc, so the parser downloads at that moment.
// `ssr: false` is safe here (this is a Client Component, and the docs body is
// not SEO/first-paint content); the rendered markup is byte-for-byte the same
// once the chunk arrives.
//
// Security posture is unchanged and deliberate: no `rehype-raw`, no
// `dangerouslySetInnerHTML` — react-markdown escapes raw HTML by default.

import dynamic from "next/dynamic";

const DocMarkdownBody = dynamic(
  () => import("./_DocMarkdownBody").then(m => m.DocMarkdownBody),
  {
    ssr: false,
    loading: () => (
      <p className="my-3 text-sm text-black/40" role="status" aria-live="polite">
        Loading…
      </p>
    ),
  },
);

export function DocMarkdown({ content }: { content: string }) {
  return <DocMarkdownBody content={content} />;
}
